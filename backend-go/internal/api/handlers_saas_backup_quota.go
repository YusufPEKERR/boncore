package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RegisterSaaSBackupQuotaRoutes mounts R7 Database Backup & Storage Quota routes
func RegisterSaaSBackupQuotaRoutes(group fiber.Router, svc *service.Services) {
	// Base backups directory: <sqliteBaseDir>/data/backups
	backupsDir := filepath.Join(svc.DBManager.GetSqliteBaseDir(), "data", "backups")
	_ = os.MkdirAll(backupsDir, 0755)

	// POST /api/master/tenants/:id/backup - Atomic SQLite WAL-checkpointed backup
	group.Post("/tenants/:id/backup", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("id"))
		if err != nil {
			return err
		}

		tenantDB, tErr := svc.DBManager.GetTenantDB(tenant.Code)
		if tErr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşletme veritabanı açılamadı: "+tErr.Error())
		}

		// Flush WAL journal
		_ = tenantDB.Exec("PRAGMA wal_checkpoint(TRUNCATE);").Error

		ts := time.Now().Format("20060102_150405")
		backupFileName := fmt.Sprintf("%s_backup_%s.bak", tenant.Code, ts)
		backupFilePath := filepath.Join(backupsDir, backupFileName)

		// 1. Attempt atomic SQLite VACUUM INTO
		escapedBackupPath := strings.ReplaceAll(backupFilePath, "\\", "/")
		vacErr := tenantDB.Exec(fmt.Sprintf("VACUUM INTO '%s';", escapedBackupPath)).Error
		if vacErr != nil {
			// Fallback: Copy original tenant db file directly
			srcPath := svc.DBManager.GetTenantDBPath(tenant.Code)
			if cErr := copyFile(srcPath, backupFilePath); cErr != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Yedek dosyası oluşturulamadı: "+cErr.Error())
			}
		}

		// Calculate file size and SHA256 checksum
		fileInfo, sErr := os.Stat(backupFilePath)
		if sErr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Yedek dosyası okunamadı: "+sErr.Error())
		}
		fileSizeBytes := fileInfo.Size()
		fileSizeMB := round2(float64(fileSizeBytes) / (1024 * 1024))

		checksumHex := computeFileSHA256(backupFilePath)

		backupRecord := models.TenantBackup{
			TenantCode:     tenant.Code,
			BackupName:     backupFileName,
			FilePath:       backupFilePath,
			FileSizeBytes:  fileSizeBytes,
			FileSizeMB:     fileSizeMB,
			ChecksumSHA256: &checksumHex,
			BackupType:     "manual",
			Status:         "completed",
			CreatedBy:      "master_admin",
		}

		if err := mdb.Create(&backupRecord).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Yedek kaydı veritabanına yazılamadı: "+err.Error())
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Veritabanı yedeği başarıyla oluşturuldu.",
			"backup":  backupRecord,
		})
	})

	// GET /api/master/tenants/:id/backups - List backups for a tenant
	group.Get("/tenants/:id/backups", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("id"))
		if err != nil {
			return err
		}

		var backups []models.TenantBackup
		if err := mdb.Where("tenant_code = ?", tenant.Code).Order("id desc").Find(&backups).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Yedekler listelenemedi: "+err.Error())
		}
		return c.JSON(backups)
	})

	// GET /api/master/backups/:id/download - Download backup file
	group.Get("/backups/:id/download", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		id := c.Params("id")

		var backup models.TenantBackup
		if err := mdb.Where("id = ? OR backup_name = ?", id, id).First(&backup).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Yedek kaydı bulunamadı: "+id)
		}

		if _, err := os.Stat(backup.FilePath); os.IsNotExist(err) {
			return fiber.NewError(fiber.StatusNotFound, "Yedek dosyası diskte bulunamadı: "+backup.FilePath)
		}

		return c.Download(backup.FilePath, backup.BackupName)
	})

	// POST /api/master/backups/:id/restore - Safely restore tenant database from backup
	group.Post("/backups/:id/restore", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		id := c.Params("id")

		var backup models.TenantBackup
		if err := mdb.Where("id = ? OR backup_name = ?", id, id).First(&backup).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Yedek kaydı bulunamadı: "+id)
		}

		if _, err := os.Stat(backup.FilePath); os.IsNotExist(err) {
			return fiber.NewError(fiber.StatusNotFound, "Geri yüklenecek yedek dosyası diskte mevcut değil: "+backup.FilePath)
		}

		targetDBPath := svc.DBManager.GetTenantDBPath(backup.TenantCode)

		// 1. Take safety pre-restore snapshot
		ts := time.Now().Format("20060102_150405")
		safetyPath := filepath.Join(backupsDir, fmt.Sprintf("%s_prerestore_%s.bak", backup.TenantCode, ts))
		if _, statErr := os.Stat(targetDBPath); statErr == nil {
			_ = copyFile(targetDBPath, safetyPath)
		}

		// 2. Safely close active connection pool
		_ = svc.DBManager.CloseTenantDB(backup.TenantCode)

		// Small delay to ensure Windows file locks are completely released
		time.Sleep(50 * time.Millisecond)

		// Remove existing db-wal and db-shm files to avoid journal corruption
		_ = os.Remove(targetDBPath + "-wal")
		_ = os.Remove(targetDBPath + "-shm")

		// 3. Replace tenant database with backup
		if err := copyFile(backup.FilePath, targetDBPath); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Geri yükleme kopyalama hatası: "+err.Error())
		}

		// 4. Re-open connection
		newDB, reOpenErr := svc.DBManager.GetTenantDB(backup.TenantCode)
		if reOpenErr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Yedekten geri yükleme sonrası veritabanı açılamadı: "+reOpenErr.Error())
		}
		_ = newDB.Exec("PRAGMA journal_mode=WAL;").Error
		_ = newDB.Exec("PRAGMA busy_timeout=5000;").Error
		_ = newDB.Exec("PRAGMA integrity_check;").Error

		// Record restored_at on backup
		now := time.Now()
		backup.RestoredAt = &now
		mdb.Save(&backup)

		// Broadcast DATABASE_RESTORED
		_ = svc.Broadcaster.BroadcastToChannel(backup.TenantCode, "all", "DATABASE_RESTORED", fiber.Map{
			"tenant_code": backup.TenantCode,
			"restored_at": now,
			"message":     "Veritabanı önceki yedeğe geri yüklendi.",
		})

		return c.JSON(fiber.Map{
			"success":         true,
			"message":         "Veritabanı başarıyla yedeğe geri yüklendi.",
			"tenant_code":     backup.TenantCode,
			"backup_id":       backup.ID,
			"backup_name":     backup.BackupName,
			"safety_snapshot": filepath.Base(safetyPath),
			"restored_at":     now,
		})
	})

	// GET /api/master/tenants/:id/quota - Return tenant's disk and DB usage vs allocated quota
	group.Get("/tenants/:id/quota", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		tenant, err := findTenantByIDOrCode(mdb, c.Params("id"))
		if err != nil {
			return err
		}

		// Calculate SQLite footprint (.db + -wal + -shm)
		dbPath := svc.DBManager.GetTenantDBPath(tenant.Code)
		var dbBytes int64 = 0
		if fi, err := os.Stat(dbPath); err == nil {
			dbBytes += fi.Size()
		}
		if fi, err := os.Stat(dbPath + "-wal"); err == nil {
			dbBytes += fi.Size()
		}
		if fi, err := os.Stat(dbPath + "-shm"); err == nil {
			dbBytes += fi.Size()
		}

		// Calculate media size
		mediaDir := filepath.Join(svc.DBManager.GetSqliteBaseDir(), "static", "uploads")
		var mediaBytes int64 = 0
		_ = filepath.Walk(mediaDir, func(path string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() {
				if strings.Contains(path, tenant.Code) {
					mediaBytes += info.Size()
				}
			}
			return nil
		})

		// Resolve plan quota
		allocatedMB := 1024
		switch strings.ToLower(tenant.Plan) {
		case "starter":
			allocatedMB = 500
		case "pro":
			allocatedMB = 2048
		case "enterprise":
			allocatedMB = 10240
		}

		// Check if custom quota exists in tenant_storage_quotas
		var quota models.TenantStorageQuota
		if qErr := mdb.Where("tenant_code = ?", tenant.Code).First(&quota).Error; qErr == nil && quota.AllocatedQuotaMB > 0 {
			allocatedMB = quota.AllocatedQuotaMB
		}

		totalUsedMB := round2(float64(dbBytes+mediaBytes) / (1024 * 1024))
		usagePct := round2((totalUsedMB / float64(allocatedMB)) * 100)
		isExceeded := totalUsedMB > float64(allocatedMB)

		// Upsert quota record
		if quota.ID == 0 {
			quota = models.TenantStorageQuota{
				TenantCode:       tenant.Code,
				AllocatedQuotaMB: allocatedMB,
				UsedDBBytes:      dbBytes,
				UsedMediaBytes:   mediaBytes,
				TotalUsedMB:      totalUsedMB,
				UsagePercentage:  usagePct,
				IsQuotaExceeded:  isExceeded,
			}
			mdb.Create(&quota)
		} else {
			quota.UsedDBBytes = dbBytes
			quota.UsedMediaBytes = mediaBytes
			quota.TotalUsedMB = totalUsedMB
			quota.UsagePercentage = usagePct
			quota.IsQuotaExceeded = isExceeded
			mdb.Save(&quota)
		}

		return c.JSON(fiber.Map{
			"tenant_code":        tenant.Code,
			"tenant_name":        tenant.Name,
			"allocated_quota_mb": allocatedMB,
			"used_db_bytes":      dbBytes,
			"used_db_mb":         round2(float64(dbBytes) / (1024 * 1024)),
			"used_media_bytes":   mediaBytes,
			"used_media_mb":      round2(float64(mediaBytes) / (1024 * 1024)),
			"total_used_mb":      totalUsedMB,
			"usage_percentage":   usagePct,
			"is_quota_exceeded":  isExceeded,
			"last_calculated_at": time.Now(),
		})
	})

	// GET /api/master/storage/summary - Platform-wide storage statistics
	group.Get("/storage/summary", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm

		var tenants []models.RestaurantTenant
		mdb.Find(&tenants)

		var backups []models.TenantBackup
		mdb.Find(&backups)

		var quotas []models.TenantStorageQuota
		mdb.Find(&quotas)

		quotaMap := make(map[string]models.TenantStorageQuota)
		for _, q := range quotas {
			quotaMap[q.TenantCode] = q
		}

		totalPlatformUsedMB := 0.0
		totalAllocatedMB := 0
		topTenants := make([]fiber.Map, 0, len(tenants))

		for _, t := range tenants {
			q, exists := quotaMap[t.Code]
			usedMB := 0.0
			allocMB := 1024
			if exists {
				usedMB = q.TotalUsedMB
				allocMB = q.AllocatedQuotaMB
			} else {
				dbPath := svc.DBManager.GetTenantDBPath(t.Code)
				if fi, err := os.Stat(dbPath); err == nil {
					usedMB = round2(float64(fi.Size()) / (1024 * 1024))
				}
			}
			totalPlatformUsedMB += usedMB
			totalAllocatedMB += allocMB

			topTenants = append(topTenants, fiber.Map{
				"code":             t.Code,
				"name":             t.Name,
				"plan":             t.Plan,
				"total_used_mb":    usedMB,
				"allocated_mb":     allocMB,
				"usage_percentage": round2(safeDiv(usedMB, float64(allocMB)) * 100),
			})
		}

		return c.JSON(fiber.Map{
			"total_tenants":          len(tenants),
			"total_storage_used_mb":  round2(totalPlatformUsedMB),
			"total_allocated_mb":     totalAllocatedMB,
			"total_backups_count":    len(backups),
			"platform_usage_percent": round2(safeDiv(totalPlatformUsedMB, float64(totalAllocatedMB)) * 100),
			"tenants":                topTenants,
		})
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	_ = os.MkdirAll(filepath.Dir(dst), 0755)
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func computeFileSHA256(filePath string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return ""
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return ""
	}
	return hex.EncodeToString(hasher.Sum(nil))
}
