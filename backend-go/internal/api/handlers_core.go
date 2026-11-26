package api

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

var loginLimiter = middleware.NewLoginRateLimiter(15, 5*time.Minute)

var allowedTenantStaffRoles = map[string]bool{
	"manager":     true,
	"cashier":     true,
	"waiter":      true,
	"kitchen":     true,
	"chef":        true,
	"courier":     true,
	"call_center": true,
}

func validateTenantStaffRole(rawRole string) (string, error) {
	trimmed := strings.TrimSpace(rawRole)
	if trimmed == "" {
		return "waiter", nil
	}
	low := strings.ToLower(trimmed)
	if low == "master_admin" || low == "superadmin" || low == "master" || low == "technical" {
		return "", fiber.NewError(fiber.StatusBadRequest, "Geçersiz veya izin verilmeyen personel rolü.")
	}
	if allowedTenantStaffRoles[low] {
		if low == "chef" {
			return "kitchen", nil
		}
		return low, nil
	}
	return "", fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Geçersiz personel rolü: %s", trimmed))
}

func getTenantDB(c *fiber.Ctx, svc *service.Services) (*gorm.DB, string, error) {
	tenantCode := middleware.GetTenantCode(c)
	db, err := svc.DBManager.GetTenantDB(tenantCode)
	if err != nil || db == nil {
		if errors.Is(err, repository.ErrTenantNotFound) {
			return nil, tenantCode, fiber.NewError(fiber.StatusNotFound, "Belirtilen işletme bulunamadı.")
		}
		return nil, tenantCode, fiber.NewError(fiber.StatusServiceUnavailable, "Veritabanı bağlantısı kurulamadı.")
	}
	return db, tenantCode, nil
}

func requirePermission(c *fiber.Ctx, svc *service.Services, db *gorm.DB, operatorName string, permIDs []string, defaultVal bool, errDetail string) error {
	claims := middleware.GetUserClaims(c)
	if claims == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Bu işlem için oturum açmanız gerekmektedir.")
	}
	roleKey := svc.Permissions.NormalizeRoleKey(claims.Role)
	if roleKey == "" && claims.Role != "" {
		roleKey = strings.ToLower(strings.TrimSpace(claims.Role))
	}
	if roleKey == "manager" || roleKey == "master_admin" || roleKey == "superadmin" {
		return nil
	}
	if roleKey == "" {
		return fiber.NewError(fiber.StatusForbidden, errDetail)
	}
	if !svc.Permissions.CheckRolePermission(db, roleKey, permIDs, defaultVal) {
		return fiber.NewError(fiber.StatusForbidden, errDetail)
	}
	return nil
}

func findActiveStaffByPIN(svc *service.Services, db *gorm.DB, pin string, rolesFilter []string) (models.StaffUser, bool) {
	var user models.StaffUser
	cleanPin := strings.TrimSpace(pin)
	if cleanPin == "" || db == nil {
		return user, false
	}
	lookupHash := middleware.HashPinLookup(svc.Config, cleanPin)
	if lookupHash != "" {
		q := db.Where("pin_lookup_hash = ? AND is_active = ?", lookupHash, true)
		if len(rolesFilter) > 0 {
			q = q.Where("LOWER(role) IN ?", rolesFilter)
		}
		if err := q.First(&user).Error; err == nil {
			if user.PinHash != nil && middleware.VerifyPassword(cleanPin, user.PinHash) {
				return user, true
			}
		}
	}
	var legacy models.StaffUser
	qLegacy := db.Where("pin_code = ? AND is_active = ?", cleanPin, true)
	if len(rolesFilter) > 0 {
		qLegacy = qLegacy.Where("LOWER(role) IN ?", rolesFilter)
	}
	if err := qLegacy.First(&legacy).Error; err == nil {
		if legacy.PinHash != nil && *legacy.PinHash != "" {
			if middleware.VerifyPassword(cleanPin, legacy.PinHash) {
				return legacy, true
			}
			return legacy, false
		}
		return legacy, true
	}
	return user, false
}

func verifyCancelAuthorization(c *fiber.Ctx, svc *service.Services, db *gorm.DB, operatorName string, managerPIN *string) bool {
	if claims := middleware.GetUserClaims(c); claims != nil {
		roleKey := svc.Permissions.NormalizeRoleKey(claims.Role)
		if roleKey == "manager" || roleKey == "master_admin" || roleKey == "superadmin" {
			return true
		}
		if roleKey != "" && svc.Permissions.CheckRolePermission(db, roleKey, []string{"order_cancel", "order_remove_item"}, false) {
			return true
		}
	}
	if managerPIN != nil && strings.TrimSpace(*managerPIN) != "" {
		pin := strings.TrimSpace(*managerPIN)
		if svc.Config.ManagerOverridePIN != "" && pin == svc.Config.ManagerOverridePIN {
			return true
		}
		_, ok := findActiveStaffByPIN(svc, db, pin, []string{"manager", "admin", "superadmin", "müdür", "mudur", "yönetici", "yonetici"})
		return ok
	}
	return false
}

func serializeStaffUser(u models.StaffUser, includePIN bool) fiber.Map {
	var lastLogin interface{}
	if u.LastLoginAt != nil {
		lastLogin = u.LastLoginAt.Format("02.01.2006 15:04")
	}
	createdStr := ""
	if !u.CreatedAt.IsZero() {
		createdStr = u.CreatedAt.Format("02.01.2006")
	}
	hasPin := (u.PinHash != nil && *u.PinHash != "") || (strings.TrimSpace(u.PinCode) != "" && !strings.HasPrefix(u.PinCode, "nopin:"))
	m := fiber.Map{
		"id":             u.ID,
		"name":           u.Name,
		"username":       u.Username,
		"role":           u.Role,
		"is_active":      u.IsActive,
		"last_login_at":  lastLogin,
		"created_at":     createdStr,
		"pin_configured": hasPin,
	}
	if includePIN && !repository.IsHashedPinSentinel(u.PinCode) {
		m["pin_code"] = u.PinCode
	}
	return m
}

// ============================================================================
// 1. AUTH & STAFF ROUTER (/api/auth)
// ============================================================================

func RegisterAuthRoutes(group fiber.Router, svc *service.Services) {
	// POST /api/auth/ws-ticket - Issues a short-lived (60s) WebSocket connection ticket for authenticated users
	group.Post("/ws-ticket", func(c *fiber.Ctx) error {
		claims := middleware.GetUserClaims(c)
		if claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Oturum gereklidir.")
		}
		ticket, exp := middleware.CreateWSTicket(svc.Config, claims)
		return c.JSON(fiber.Map{"ticket": ticket, "expires_at": exp})
	})

	group.Post("/login", func(c *fiber.Ctx) error {
		var payload models.LoginRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz giriş verisi.")
		}
		username := strings.TrimSpace(payload.Username)
		cleanPwd := strings.TrimSpace(payload.Password)
		uLow := strings.ToLower(username)

		rateKey := "login:" + c.IP() + ":" + uLow
		if !loginLimiter.Allow(rateKey) {
			return fiber.NewError(fiber.StatusTooManyRequests, "Çok fazla başarısız giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.")
		}

		// 1. Master Admin check
		if (uLow == "master" || uLow == "superadmin") && cleanPwd != "" && cleanPwd == svc.Config.MasterAdminPassword {
			loginLimiter.Reset(rateKey)
			token, exp := middleware.CreateMasterAccessToken(svc.Config, 999999, payload.Remember)
			return c.JSON(fiber.Map{
				"access_token": token,
				"token_type":   "bearer",
				"expires_at":   exp,
				"user": fiber.Map{
					"id":        999999,
					"name":      "SaaS Platform Yöneticisi",
					"username":  "master",
					"role":      "master_admin",
					"is_master": true,
				},
				"is_master": true,
			})
		}

		// 2. Load tenants from Master DB
		var allTenants []models.RestaurantTenant
		if svc.DBManager.MasterGorm != nil {
			svc.DBManager.MasterGorm.Where("status != ?", "deleted").Find(&allTenants)
		}
		if len(allTenants) == 0 {
			allTenants = []models.RestaurantTenant{
				{ID: 1, Code: svc.Config.DefaultTenantCode, Name: "BonCore Demo İşletme", Plan: "pro", Status: "active"},
			}
		}

		// Optional explicit restaurant header narrows tenant lookup when provided
		reqTenantHint := repository.CleanTenantCode(c.Get("X-Restaurant-Code"), "")

		alnumRe := regexp.MustCompile(`[^a-z0-9]`)
		cleanSlug := alnumRe.ReplaceAllString(uLow, "")

		var targetTenant *models.RestaurantTenant
		var matchedUser *models.StaffUser

		for i := range allTenants {
			t := &allTenants[i]
			tCodeLow := strings.ToLower(strings.TrimSpace(t.Code))
			tNameLow := strings.ToLower(strings.TrimSpace(t.Name))
			tSlug := alnumRe.ReplaceAllString(tCodeLow, "")
			if uLow == tCodeLow || uLow == tSlug || uLow == tNameLow || (cleanSlug != "" && cleanSlug == tSlug) {
				targetTenant = t
				break
			}
		}

		verifyStaffLogin := func(u *models.StaffUser, secret string) bool {
			if u.PasswordHash != nil && *u.PasswordHash != "" {
				return middleware.VerifyPassword(secret, u.PasswordHash)
			}
			if u.PinHash != nil && *u.PinHash != "" {
				return middleware.VerifyPassword(secret, u.PinHash)
			}
			return strings.TrimSpace(u.PinCode) != "" && strings.TrimSpace(u.PinCode) == secret
		}

		// 3. Direct exact staff username lookup (prioritize hinted tenant if provided, never stop on first wrong password across tenants)
		if targetTenant == nil {
			for i := range allTenants {
				cand := &allTenants[i]
				if reqTenantHint != "" && repository.CleanTenantCode(cand.Code, "") != reqTenantHint {
					continue
				}
				tDB, err := svc.DBManager.GetTenantDB(cand.Code)
				if err != nil || tDB == nil {
					continue
				}
				var users []models.StaffUser
				tDB.Where("is_active = ?", true).Find(&users)
				for j := range users {
					u := &users[j]
					uname := ""
					if u.Username != nil {
						uname = strings.ToLower(strings.TrimSpace(*u.Username))
					}
					if uname != "" && uname == uLow && verifyStaffLogin(u, cleanPwd) {
						if strings.EqualFold(cand.Status, "suspended") {
							return fiber.NewError(fiber.StatusForbidden, "İşletme aboneliği askıya alınmıştır.")
						}
						now := time.Now().UTC()
						tDB.Model(u).Update("last_login_at", now)
						u.LastLoginAt = &now
						matchedUser = u
						targetTenant = cand
						break
					}
				}
				if matchedUser != nil {
					break
				}
			}
		}

		// 4. Tenant + Staff Password/PIN lookup
		if targetTenant != nil && matchedUser == nil {
			if strings.EqualFold(targetTenant.Status, "suspended") {
				return fiber.NewError(fiber.StatusForbidden, "İşletme aboneliği askıya alınmıştır.")
			}
			tDB, err := svc.DBManager.GetTenantDB(targetTenant.Code)
			if err == nil && tDB != nil {
				var users []models.StaffUser
				tDB.Where("is_active = ?", true).Find(&users)
				for j := range users {
					u := &users[j]
					if verifyStaffLogin(u, cleanPwd) {
						now := time.Now().UTC()
						tDB.Model(u).Update("last_login_at", now)
						u.LastLoginAt = &now
						matchedUser = u
						break
					}
				}
			}
		}

		if matchedUser == nil || targetTenant == nil {
			loginLimiter.RecordFailure(rateKey)
			return fiber.NewError(fiber.StatusUnauthorized, "Kullanıcı adı, restoran kodu veya parola hatalı.")
		}
		loginLimiter.Reset(rateKey)

		tid := targetTenant.ID
		token, exp := middleware.CreateAccessToken(svc.Config, matchedUser.ID, matchedUser.Role, payload.Remember, targetTenant.Code, &tid)

		c.Cookie(&fiber.Cookie{
			Name:     "boncore_restaurant_code",
			Value:    targetTenant.Code,
			Path:     "/",
			MaxAge:   7 * 24 * 3600,
			SameSite: "Lax",
			HTTPOnly: true,
		})

		return c.JSON(fiber.Map{
			"access_token": token,
			"token_type":   "bearer",
			"expires_at":   exp,
			"user":         serializeStaffUser(*matchedUser, false),
			"restaurant": fiber.Map{
				"id":     targetTenant.ID,
				"name":   targetTenant.Name,
				"code":   targetTenant.Code,
				"plan":   targetTenant.Plan,
				"status": targetTenant.Status,
			},
		})
	})

	group.Post("/login-pin", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		rateKey := "pin:" + c.IP() + ":" + tenantCode
		if !loginLimiter.Allow(rateKey) {
			return fiber.NewError(fiber.StatusTooManyRequests, "Çok fazla hatalı PIN denemesi. Lütfen birkaç dakika sonra tekrar deneyin.")
		}
		var payload models.PinAuthRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz PIN verisi.")
		}
		pin := strings.TrimSpace(payload.PinCode)
		if pin == "" {
			loginLimiter.RecordFailure(rateKey)
			return fiber.NewError(fiber.StatusUnauthorized, "Geçersiz PIN Kodu!")
		}
		user, found := findActiveStaffByPIN(svc, db, pin, nil)
		if !found {
			if svc.Config.ManagerOverridePIN != "" && pin == svc.Config.ManagerOverridePIN {
				loginLimiter.Reset(rateKey)
				token, _ := middleware.CreateAccessToken(svc.Config, 999, "manager", false, tenantCode, nil)
				uname := "admin"
				return c.JSON(models.StaffUserResponse{
					ID:          999,
					Name:        "Yönetici",
					Username:    &uname,
					Role:        "manager",
					IsActive:    true,
					AccessToken: &token,
				})
			}
			loginLimiter.RecordFailure(rateKey)
			return fiber.NewError(fiber.StatusUnauthorized, "Geçersiz PIN Kodu!")
		}
		loginLimiter.Reset(rateKey)
		now := time.Now().UTC()
		db.Model(&user).Update("last_login_at", now)
		token, _ := middleware.CreateAccessToken(svc.Config, user.ID, user.Role, false, tenantCode, user.RestaurantID)
		return c.JSON(models.StaffUserResponse{
			ID:          user.ID,
			Name:        user.Name,
			Username:    user.Username,
			Role:        user.Role,
			IsActive:    user.IsActive,
			AccessToken: &token,
		})
	})

	group.Post("/verify-manager-pin", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if claims := middleware.GetUserClaims(c); claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Bu işlem için oturum açmanız gerekmektedir.")
		}
		var payload models.PinAuthRequest
		if err := c.BodyParser(&payload); err != nil || strings.TrimSpace(payload.PinCode) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Yönetici PIN kodu gereklidir.")
		}
		pin := strings.TrimSpace(payload.PinCode)
		mgr, foundMgr := findActiveStaffByPIN(svc, db, pin, []string{"manager", "admin", "superadmin", "müdür", "mudur", "yönetici", "yonetici"})
		if !foundMgr {
			if svc.Config.ManagerOverridePIN != "" && pin == svc.Config.ManagerOverridePIN {
				return c.JSON(fiber.Map{"valid": true, "manager_name": "Yönetici"})
			}
			return fiber.NewError(fiber.StatusForbidden, "Geçersiz veya yönetici yetkisi olmayan PIN kodu!")
		}
		return c.JSON(fiber.Map{"valid": true, "manager_name": mgr.Name, "manager_id": mgr.ID})
	})

	group.Get("/me", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		claims := middleware.GetUserClaims(c)
		if claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Oturum açmanız gerekiyor.")
		}
		var user models.StaffUser
		if err := db.First(&user, claims.Sub).Error; err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Kullanıcı bulunamadı.")
		}
		return c.JSON(serializeStaffUser(user, false))
	})

	group.Put("/me", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		claims := middleware.GetUserClaims(c)
		if claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Oturum açmanız gerekiyor.")
		}
		var user models.StaffUser
		if err := db.First(&user, claims.Sub).Error; err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Kullanıcı bulunamadı.")
		}
		var payload struct {
			Name     *string `json:"name"`
			Username *string `json:"username"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz profil verisi.")
		}
		if payload.Name != nil {
			trimmed := strings.TrimSpace(*payload.Name)
			if trimmed == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Ad soyad boş olamaz.")
			}
			user.Name = trimmed
		}
		if payload.Username != nil {
			uname := strings.ToLower(strings.TrimSpace(*payload.Username))
			if uname != "" {
				var dup models.StaffUser
				if err := db.Where("LOWER(username) = ? AND id != ?", uname, user.ID).First(&dup).Error; err == nil {
					return fiber.NewError(fiber.StatusConflict, "Bu kullanıcı adı başka bir personel tarafından kullanılıyor.")
				}
				user.Username = &uname
			}
		}
		if err := db.Save(&user).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Profil güncellenemedi.")
		}
		return c.JSON(fiber.Map{"status": "ok", "user": serializeStaffUser(user, false)})
	})

	group.Post("/change-password", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		claims := middleware.GetUserClaims(c)
		if claims == nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Oturum açmanız gerekiyor.")
		}
		var payload models.ChangePasswordRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri.")
		}
		var user models.StaffUser
		if err := db.First(&user, claims.Sub).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kullanıcı bulunamadı.")
		}
		if !middleware.VerifyPassword(payload.CurrentPassword, user.PasswordHash) {
			return fiber.NewError(fiber.StatusBadRequest, "Mevcut parola hatalı.")
		}
		db.Model(&user).Update("password_hash", middleware.HashPassword(payload.NewPassword))
		return c.JSON(fiber.Map{"status": "success", "message": "Parolanız başarıyla güncellendi."})
	})

	group.Get("/staff", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var staff []models.StaffUser
		db.Order("id ASC").Find(&staff)
		claims := middleware.GetUserClaims(c)
		includePIN := false
		if claims != nil {
			rLow := svc.Permissions.NormalizeRoleKey(claims.Role)
			includePIN = rLow == "manager" || claims.Role == "master_admin" || claims.Role == "superadmin"
		}
		out := make([]fiber.Map, 0, len(staff))
		for _, u := range staff {
			out = append(out, serializeStaffUser(u, includePIN))
		}
		return c.JSON(out)
	})

	group.Post("/staff", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_users_manage", "users_manage"}, false, "Yeni personel eklemek için yönetici yetkisi gereklidir."); err != nil {
			return err
		}
		var payload models.StaffUserCreate
		if err := c.BodyParser(&payload); err != nil || strings.TrimSpace(payload.Name) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Personel adı boş bırakılamaz.")
		}
		uname := ""
		if payload.Username != nil {
			uname = strings.TrimSpace(*payload.Username)
		}
		if uname == "" {
			uname = repository.CleanTenantCode(payload.Name, "personel")
		}
		var pwdHash *string
		if payload.Password != nil && strings.TrimSpace(*payload.Password) != "" {
			pwdHash = middleware.HashPassword(strings.TrimSpace(*payload.Password))
		} else if strings.TrimSpace(payload.PinCode) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Şifre veya PIN kodundan en az biri tanımlanmalıdır.")
		}
		active := true
		if payload.IsActive != nil {
			active = *payload.IsActive
		}
		role, rErr := validateTenantStaffRole(payload.Role)
		if rErr != nil {
			return rErr
		}
		newUser := models.StaffUser{
			Name:         strings.TrimSpace(payload.Name),
			Username:     &uname,
			PasswordHash: pwdHash,
			Role:         role,
			IsActive:     active,
		}
		repository.ApplyHashedStaffPin(svc.Config, &newUser, payload.PinCode)
		if err := db.Create(&newUser).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Bu kullanıcı adı veya PIN kodu zaten kullanılıyor.")
		}
		return c.JSON(fiber.Map{"status": "success", "user": serializeStaffUser(newUser, true)})
	})

	group.Put("/staff/:user_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_users_manage", "users_manage"}, false, "Personel bilgilerini güncellemek için yönetici yetkisi gereklidir."); err != nil {
			return err
		}
		userID, _ := strconv.Atoi(c.Params("user_id"))
		var user models.StaffUser
		if err := db.First(&user, userID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Personel bulunamadı.")
		}
		var payload models.StaffUserUpdate
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri.")
		}
		roleLow := strings.ToLower(strings.TrimSpace(user.Role))
		isMgr := roleLow == "manager" || roleLow == "admin" || roleLow == "superadmin" || roleLow == "müdür" || roleLow == "mudur" || roleLow == "yönetici" || roleLow == "yonetici"

		if isMgr {
			if payload.IsActive != nil && !*payload.IsActive {
				return fiber.NewError(fiber.StatusBadRequest, "Yönetici (Müdür) hesabı sistem güvenliği gereği pasife alınamaz!")
			}
			if payload.Role != nil && *payload.Role != "" {
				newRoleLow := strings.ToLower(strings.TrimSpace(*payload.Role))
				newIsMgr := newRoleLow == "manager" || newRoleLow == "admin" || newRoleLow == "superadmin" || newRoleLow == "müdür" || newRoleLow == "mudur" || newRoleLow == "yönetici" || newRoleLow == "yonetici"
				if !newIsMgr {
					return fiber.NewError(fiber.StatusBadRequest, "Yönetici hesabının rolü değiştirilemez!")
				}
			}
		}

		if payload.Name != nil && strings.TrimSpace(*payload.Name) != "" {
			user.Name = strings.TrimSpace(*payload.Name)
		}
		if payload.Username != nil && strings.TrimSpace(*payload.Username) != "" {
			u := strings.TrimSpace(*payload.Username)
			user.Username = &u
		}
		if payload.Password != nil && *payload.Password != "" {
			user.PasswordHash = middleware.HashPassword(*payload.Password)
		}
		if payload.Role != nil && *payload.Role != "" {
			validatedRole, rErr := validateTenantStaffRole(*payload.Role)
			if rErr != nil {
				return rErr
			}
			user.Role = validatedRole
		}
		if payload.PinCode != nil {
			trimmedPin := strings.TrimSpace(*payload.PinCode)
			if trimmedPin != "" && !repository.IsHashedPinSentinel(trimmedPin) && trimmedPin != "••••" && trimmedPin != "Gizli" {
				repository.ApplyHashedStaffPin(svc.Config, &user, trimmedPin)
			}
		}
		if payload.IsActive != nil {
			user.IsActive = *payload.IsActive
		}
		db.Save(&user)
		return c.JSON(fiber.Map{"status": "success", "message": "Personel güncellendi."})
	})

	group.Delete("/staff/:user_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_users_manage", "users_manage"}, false, "Personel silmek için yönetici yetkisi gereklidir."); err != nil {
			return err
		}
		userID, _ := strconv.Atoi(c.Params("user_id"))
		var user models.StaffUser
		if err := db.First(&user, userID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Personel bulunamadı.")
		}

		roleLow := strings.ToLower(strings.TrimSpace(user.Role))
		isMgr := roleLow == "manager" || roleLow == "admin" || roleLow == "superadmin" || roleLow == "müdür" || roleLow == "mudur" || roleLow == "yönetici" || roleLow == "yonetici"
		if isMgr {
			return fiber.NewError(fiber.StatusBadRequest, "Yönetici (Müdür / Admin) hesabı sistem güvenliği gereği hiçbir şekilde silinemez!")
		}

		var activeMgrCount int64
		db.Model(&models.StaffUser{}).Where("LOWER(role) IN ? AND is_active = ?", []string{"manager", "admin", "superadmin", "müdür", "mudur", "yönetici", "yonetici"}, true).Count(&activeMgrCount)
		if activeMgrCount == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Sistemde en az bir aktif yönetici hesabı bulunmalıdır, işlem engellendi!")
		}

		db.Delete(&user)
		return c.JSON(fiber.Map{"status": "success", "message": "Personel silindi."})
	})
}

// ============================================================================
// 2. QR CUSTOMER MENU ROUTER (/api/qr)
// ============================================================================

func parseQRCategoryIDs(raw interface{}) ([]int, bool) {
	if raw == nil {
		return nil, false
	}
	arr, isArr := raw.([]interface{})
	if !isArr {
		if intArr, ok := raw.([]int); ok {
			return intArr, true
		}
		return nil, false
	}
	ids := make([]int, 0, len(arr))
	for _, el := range arr {
		switch v := el.(type) {
		case float64:
			ids = append(ids, int(v))
		case int:
			ids = append(ids, v)
		case int64:
			ids = append(ids, int(v))
		case string:
			if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
				ids = append(ids, n)
			}
		}
	}
	return ids, true
}

func loadQRMenuSettings(db *gorm.DB) (bool, []int, bool) {
	allowTablePayment := true
	var allowedCategoryIDs []int
	hasCustomCategories := false

	if m, ok := loadJSONSettingMap(db, "qr_menu_settings"); ok {
		if v, exists := m["allow_table_payment"].(bool); exists {
			allowTablePayment = v
		}
		if rawCats, exists := m["allowed_category_ids"]; exists && rawCats != nil {
			if parsed, okParse := parseQRCategoryIDs(rawCats); okParse {
				allowedCategoryIDs = parsed
				hasCustomCategories = true
			}
		}
	}
	return allowTablePayment, allowedCategoryIDs, hasCustomCategories
}

func RegisterQRRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/settings", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		allowTablePayment, allowedCategoryIDs, hasCustomCategories := loadQRMenuSettings(db)
		return c.JSON(fiber.Map{
			"allow_table_payment":   allowTablePayment,
			"allowed_category_ids":  allowedCategoryIDs,
			"has_custom_categories": hasCustomCategories,
		})
	})

	group.Put("/settings", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var body map[string]interface{}
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz QR menü ayar verisi.")
		}

		allowTablePayment, allowedCategoryIDs, hasCustomCategories := loadQRMenuSettings(db)
		if v, ok := body["allow_table_payment"].(bool); ok {
			allowTablePayment = v
		}
		if rawCats, exists := body["allowed_category_ids"]; exists {
			if rawCats == nil {
				hasCustomCategories = false
				allowedCategoryIDs = nil
			} else if parsed, okParse := parseQRCategoryIDs(rawCats); okParse {
				hasCustomCategories = true
				allowedCategoryIDs = parsed
			}
		}

		toSave := map[string]interface{}{
			"allow_table_payment":  allowTablePayment,
			"allowed_category_ids": nil,
		}
		if hasCustomCategories {
			toSave["allowed_category_ids"] = allowedCategoryIDs
		}
		saveJSONSettingVal(db, "qr_menu_settings", toSave)

		_ = svc.Broadcaster.BroadcastAll(tenantCode, "QR_SETTINGS_UPDATED", toSave)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", toSave)

		return c.JSON(fiber.Map{
			"status":                "ok",
			"allow_table_payment":   allowTablePayment,
			"allowed_category_ids":  allowedCategoryIDs,
			"has_custom_categories": hasCustomCategories,
		})
	})

	group.Get("/table/:table_id/menu", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var table models.Table
		if err := db.Preload("Orders.Items").First(&table, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
		}

		var activeOrderData interface{}
		for _, o := range table.Orders {
			if o.Status == "open" || o.Status == "bill_requested" {
				items := make([]fiber.Map, 0)
				for _, it := range o.Items {
					if !it.IsVoided {
						items = append(items, fiber.Map{
							"id":           it.ID,
							"product_name": it.ProductName,
							"quantity":     it.Quantity,
							"total_price":  it.TotalPrice,
							"status":       it.Status,
						})
					}
				}
				activeOrderData = fiber.Map{
					"order_id":        o.ID,
					"order_no":        o.OrderNo,
					"status":          o.Status,
					"subtotal":        o.Subtotal,
					"grand_total":     o.GrandTotal,
					"paid_total":      o.PaidTotal,
					"remaining_total": o.RemainingTotal,
					"is_prepaid":      o.RemainingTotal <= 0.01 && o.PaidTotal > 0,
					"notes":           o.Notes,
					"items":           items,
				}
				break
			}
		}

		var categories []models.Category
		db.Preload("Products.Variants").
			Preload("Products.ModifierGroups.Options").
			Preload("Products.Recipes.Ingredient").
			Order("order_index ASC, id ASC").
			Find(&categories)

		var allIngList []models.Ingredient
		db.Find(&allIngList)
		allIngs := make(map[string]*models.Ingredient, len(allIngList))
		for i := range allIngList {
			key := service.NormalizeStockName(allIngList[i].Name)
			allIngs[key] = &allIngList[i]
		}

		allowTablePayment, allowedCategoryIDs, hasCustomCategories := loadQRMenuSettings(db)
		allowedSet := make(map[int]bool, len(allowedCategoryIDs))
		if hasCustomCategories {
			for _, id := range allowedCategoryIDs {
				allowedSet[id] = true
			}
		}

		allCategories := make([]fiber.Map, 0, len(categories))
		menuTree := make([]fiber.Map, 0, len(categories))
		for _, cat := range categories {
			catProducts := cat.Products
			sort.Slice(catProducts, func(i, j int) bool {
				if catProducts[i].OrderIndex != catProducts[j].OrderIndex {
					return catProducts[i].OrderIndex < catProducts[j].OrderIndex
				}
				return catProducts[i].ID < catProducts[j].ID
			})

			prods := make([]fiber.Map, 0)
			for _, p := range catProducts {
				if !p.IsAvailable || p.BasePrice <= 0 {
					continue
				}
				unitLabel := "Adet"
				directIng := allIngs[service.NormalizeStockName(p.Name)]
				if directIng != nil && directIng.Unit != "" && len(p.Recipes) == 0 {
					unitLabel = directIng.Unit
				}
				if unitLabel == "Adet" {
					lowerName := strings.ToLower(strings.TrimSpace(p.Name))
					if strings.Contains(lowerName, "(kg)") || strings.HasSuffix(lowerName, " kg") || strings.Contains(lowerName, "/kg") {
						unitLabel = "Kg"
					}
				}
				calcBOMStock, recipeItems, missingIngredients := service.CalculateBOMStock(p.Name, p.Recipes)
				hasRecipe := len(recipeItems) > 0
				hasStockTracking := false
				var stockVal interface{} = nil
				if hasRecipe {
					hasStockTracking = true
					avail := calcBOMStock
					_, negAware, _, _ := service.GetProductAvailableStock(nil, p)
					if negAware < 0 {
						avail = negAware
					}
					stockVal = avail
				} else if directIng != nil {
					hasStockTracking = true
					stockVal = service.Round3(directIng.CurrentStock)
				} else if p.AllowNegStock {
					hasStockTracking = true
					stockVal = 0.0
				}

				variants := make([]fiber.Map, 0, len(p.Variants))
				for _, v := range p.Variants {
					variants = append(variants, fiber.Map{"id": v.ID, "name": v.Name, "price_delta": v.PriceDelta})
				}
				mgs := make([]fiber.Map, 0, len(p.ModifierGroups))
				for _, mg := range p.ModifierGroups {
					opts := make([]fiber.Map, 0, len(mg.Options))
					for _, opt := range mg.Options {
						opts = append(opts, fiber.Map{"id": opt.ID, "name": opt.Name, "price": opt.Price})
					}
					mgs = append(mgs, fiber.Map{"id": mg.ID, "name": mg.Name, "is_required": mg.IsRequired, "options": opts})
				}
				allergens := p.Allergens
				if allergens == nil {
					allergens = models.StringSlice{}
				}
				prods = append(prods, fiber.Map{
					"id":                   p.ID,
					"name":                 p.Name,
					"description":          p.Description,
					"base_price":           p.BasePrice,
					"unit":                 unitLabel,
					"image_url":            p.ImageURL,
					"calories":             p.Calories,
					"allergens":            allergens,
					"is_vegan":             p.IsVegan,
					"is_spicy":             p.IsSpicy,
					"is_available":         p.IsAvailable,
					"stock_quantity":       stockVal,
					"has_stock_tracking":   hasStockTracking,
					"has_recipe":           hasRecipe,
					"allow_negative_stock": p.AllowNegStock,
					"missing_ingredients":  missingIngredients,
					"variants":             variants,
					"modifier_groups":      mgs,
				})
			}
			if len(prods) > 0 {
				allCategories = append(allCategories, fiber.Map{
					"id":            cat.ID,
					"name":          cat.Name,
					"icon":          cat.Icon,
					"product_count": len(prods),
				})
				if !hasCustomCategories || allowedSet[int(cat.ID)] {
					menuTree = append(menuTree, fiber.Map{
						"id":       cat.ID,
						"name":     cat.Name,
						"icon":     cat.Icon,
						"products": prods,
					})
				}
			}
		}

		return c.JSON(fiber.Map{
			"table_id":       table.ID,
			"table_name":     table.Name,
			"status":         table.Status,
			"active_order":   activeOrderData,
			"menu":           menuTree,
			"all_categories": allCategories,
			"qr_settings": fiber.Map{
				"allow_table_payment":   allowTablePayment,
				"allowed_category_ids":  allowedCategoryIDs,
				"has_custom_categories": hasCustomCategories,
			},
		})
	})

	group.Post("/table/:table_id/order", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var payload models.AddItemsRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz sipariş verisi.")
		}

		var order models.Order
		var table models.Table
		var addedAmount float64
		type pendingStockInfo struct {
			ItemID       int     `json:"item_id"`
			ProductID    int     `json:"product_id"`
			ProductName  string  `json:"product_name"`
			Quantity     float64 `json:"quantity"`
			CurrentStock float64 `json:"current_stock"`
			Message      string  `json:"message"`
		}
		var pendingStockApprovals []pendingStockInfo

		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).Preload("Orders.Items").First(&table, tableID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
			}

			found := false
			for _, o := range table.Orders {
				if o.Status == "open" || o.Status == "bill_requested" {
					order = o
					found = true
					break
				}
			}

			now := time.Now().UTC()
			orderNote := ""
			if payload.Notes != nil {
				orderNote = strings.TrimSpace(*payload.Notes)
			}
			if !found {
				var notesPtr *string
				if orderNote != "" {
					notesPtr = &orderNote
				}
				orderNo := fmt.Sprintf("QR-%s-%d-%04d", now.Format("20060102150405"), table.ID, now.UnixNano()%10000)
				tid := table.ID
				order = models.Order{
					OrderNo:    orderNo,
					TableID:    &tid,
					OrderType:  "qr_order",
					Status:     "open",
					WaiterName: "QR Masadan Sipariş",
					Notes:      notesPtr,
					CreatedAt:  now,
				}
				if err := tx.Create(&order).Error; err != nil {
					return err
				}
				wName := "QR Sipariş"
				table.Status = "occupied"
				table.OpenedAt = &now
				table.CurrentOrderID = &order.ID
				table.WaiterName = &wName
				tx.Save(&table)
			} else if orderNote != "" {
				if order.Notes != nil && strings.TrimSpace(*order.Notes) != "" {
					existingNote := strings.TrimSpace(*order.Notes)
					if !strings.Contains(existingNote, orderNote) {
						combined := existingNote + " | " + orderNote
						order.Notes = &combined
					}
				} else {
					order.Notes = &orderNote
				}
				tx.Save(&order)
			}

			remainingAvailByProd := make(map[int]float64)
			trackingByProd := make(map[int]bool)

			for _, it := range payload.Items {
				var prod models.Product
				if err := tx.Preload("Variants").Preload("ModifierGroups.Options").Preload("Recipes.Ingredient").First(&prod, it.ProductID).Error; err != nil {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Seçilen ürün menüde bulunamadı (ID: %d).", it.ProductID))
				}
				pName := prod.Name
				station := prod.Station
				// Always derive price strictly from database (ignore client-supplied UnitPrice/Modifier Price)
				basePrice := prod.BasePrice
				if it.VariantName != nil && strings.TrimSpace(*it.VariantName) != "" {
					vTarget := strings.TrimSpace(*it.VariantName)
					for _, vr := range prod.Variants {
						if strings.EqualFold(strings.TrimSpace(vr.Name), vTarget) {
							basePrice += vr.PriceDelta
							break
						}
					}
				}
				modPriceLookup := make(map[string]float64)
				for _, mg := range prod.ModifierGroups {
					for _, opt := range mg.Options {
						modPriceLookup[strings.ToLower(strings.TrimSpace(opt.Name))] = opt.Price
					}
				}
				modSum := 0.0
				validatedMods := make([]models.SelectedModifier, 0, len(it.SelectedModifiers))
				for _, m := range it.SelectedModifiers {
					authPrice := modPriceLookup[strings.ToLower(strings.TrimSpace(m.Name))]
					mCopy := m
					mCopy.Price = authPrice
					validatedMods = append(validatedMods, mCopy)
					modSum += authPrice
				}
				it.SelectedModifiers = validatedMods
				qty := it.Quantity
				if qty <= 0 {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("'%s' için geçersiz ürün miktarı.", pName))
				}

				itemStatus := "pending"
				requiresStockConfirm := false
				var availStockAtCheck float64
				if !prod.IsAvailable {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Efendim maalesef %s elimizde kalmadı.", pName))
				}
				tracked, seen := trackingByProd[it.ProductID]
				if !seen {
					t, av, _, _ := service.GetProductAvailableStock(tx, prod)
					tracked = t
					availStockAtCheck = av
					trackingByProd[it.ProductID] = t
					remainingAvailByProd[it.ProductID] = av
				} else {
					availStockAtCheck = remainingAvailByProd[it.ProductID]
				}
				if tracked && (availStockAtCheck <= 0 || availStockAtCheck+1e-9 < qty) {
					if !prod.AllowNegStock {
						return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Efendim maalesef %s elimizde kalmadı.", pName))
					}
					itemStatus = "stock_confirm"
					requiresStockConfirm = true
				} else if tracked {
					remainingAvailByProd[it.ProductID] = service.Round3(availStockAtCheck - qty)
				}

				lineUnit := basePrice + modSum
				lineTotal := service.Round2(lineUnit * qty)
				addedAmount += lineTotal

				itemNoteText := ""
				if it.KitchenNote != nil {
					trimmedItemNote := strings.TrimSpace(*it.KitchenNote)
					if trimmedItemNote != "" && trimmedItemNote != "Masadan QR Sipariş" {
						itemNoteText = trimmedItemNote
					}
				}
				if itemNoteText == "" && orderNote != "" {
					itemNoteText = orderNote
				} else if itemNoteText != "" && orderNote != "" && !strings.Contains(itemNoteText, orderNote) {
					itemNoteText = itemNoteText + " | " + orderNote
				}
				note := "[QR Müşteri Notu]"
				if itemNoteText != "" {
					note = fmt.Sprintf("[QR Müşteri Notu] %s", itemNoteText)
				}
				if requiresStockConfirm {
					if itemNoteText != "" {
						note = fmt.Sprintf("[STOK YOK - ONAY BEKLİYOR] [QR Müşteri Notu] %s", itemNoteText)
					} else {
						note = "[STOK YOK - ONAY BEKLİYOR] [QR Müşteri Notu]"
					}
				}
				oi := models.OrderItem{
					OrderID:           order.ID,
					ProductID:         it.ProductID,
					ProductName:       pName,
					VariantName:       it.VariantName,
					UnitPrice:         lineUnit,
					Quantity:          qty,
					TotalPrice:        lineTotal,
					SelectedModifiers: models.ModifierSlice(it.SelectedModifiers),
					NegativeModifiers: models.StringSlice(it.NegativeModifiers),
					KitchenNote:       &note,
					CourseStage:       1,
					IsHold:            false,
					Status:            itemStatus,
					Station:           station,
					AddedBy:           "QR Müşteri",
					CreatedAt:         now,
				}
				if err := tx.Create(&oi).Error; err != nil {
					return err
				}
				if requiresStockConfirm {
					pendingStockApprovals = append(pendingStockApprovals, pendingStockInfo{
						ItemID:       oi.ID,
						ProductID:    it.ProductID,
						ProductName:  pName,
						Quantity:     qty,
						CurrentStock: availStockAtCheck,
						Message:      fmt.Sprintf("⚠️ %s %s istedi ama stok yok! Devam edilsin mi?", table.Name, pName),
					})
				} else {
					_ = service.DeductOrderIngredients(tx, it.ProductID, qty, order.OrderNo, 2)
				}
			}

			if len(pendingStockApprovals) > 0 {
				names := make([]string, 0, len(pendingStockApprovals))
				for _, pa := range pendingStockApprovals {
					names = append(names, fmt.Sprintf("%s (%gx)", pa.ProductName, pa.Quantity))
				}
				waiterReason := fmt.Sprintf("⚠️ %s (%s) istedi ama stok yok! Devam edilsin mi?", table.Name, strings.Join(names, ", "))
				tx.Model(&table).Update("waiter_call_reason", waiterReason)
			}

			recalculateOrderTotals(tx, &order)
			return tx.Save(&order).Error
		})
		if txErr != nil {
			return txErr
		}

		_ = svc.Broadcaster.BroadcastToChannel(tenantCode, "pos", "QR_ORDER_RECEIVED", fiber.Map{
			"table_name": table.Name,
			"order_no":   order.OrderNo,
			"total":      addedAmount,
		})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KDS_NEW_ORDER", fiber.Map{
			"order_id": order.ID,
			"order_no": order.OrderNo,
		})
		_ = svc.Broadcaster.BroadcastToTable(tenantCode, table.ID, "TABLE_ORDER_UPDATED", fiber.Map{
			"order_id": order.ID,
		})
		if len(pendingStockApprovals) > 0 {
			names := make([]string, 0, len(pendingStockApprovals))
			for _, pa := range pendingStockApprovals {
				names = append(names, fmt.Sprintf("%s (%gx)", pa.ProductName, pa.Quantity))
			}
			alertMsg := fmt.Sprintf("⚠️ %s %s istedi ama stok yok! Devam edilsin mi?", table.Name, strings.Join(names, ", "))
			_ = svc.Broadcaster.BroadcastAll(tenantCode, "OUT_OF_STOCK_ORDER_ALERT", fiber.Map{
				"order_id":   order.ID,
				"order_no":   order.OrderNo,
				"table_id":   table.ID,
				"table_name": table.Name,
				"items":      pendingStockApprovals,
				"message":    alertMsg,
			})
			_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": table.ID})
		}

		respMsg := "Siparişiniz mutfağa iletildi!"
		if len(pendingStockApprovals) > 0 {
			respMsg = "Siparişiniz alındı. Stok onayı için mutfak ve garsona bilgi verildi."
		}
		return c.JSON(fiber.Map{
			"status":                 "success",
			"message":                respMsg,
			"order_id":               order.ID,
			"notes":                  order.Notes,
			"pending_stock_approval": len(pendingStockApprovals) > 0,
			"pending_stock_items":    pendingStockApprovals,
		})
	})
}

// ============================================================================
// 3. TABLES & FLOOR PLAN ROUTER (/api/tables)
// ============================================================================

func RegisterTablesRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/areas", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var areas []models.Area
		db.Preload("Tables.Orders.Items").Order("order_index ASC, id ASC").Find(&areas)

		now := time.Now().UTC()
		output := make([]fiber.Map, 0, len(areas))

		for _, area := range areas {
			tables := area.Tables
			sort.Slice(tables, func(i, j int) bool {
				if tables[i].OrderIndex != tables[j].OrderIndex {
					return tables[i].OrderIndex < tables[j].OrderIndex
				}
				return tables[i].ID < tables[j].ID
			})

			tablesData := make([]fiber.Map, 0, len(tables))
			for _, table := range tables {
				var activeOrder interface{}
				hasTableReady := false
				tableReadySummary := ""

				if (table.Status != "empty" || table.CurrentOrderID != nil) && len(table.Orders) > 0 {
					orders := table.Orders
					sort.Slice(orders, func(i, j int) bool {
						return orders[i].ID > orders[j].ID
					})

					var chosenOrder *models.Order
					for idx := range orders {
						o := &orders[idx]
						if o.Status != "open" && o.Status != "bill_requested" {
							continue
						}
						if table.CurrentOrderID != nil && o.ID == *table.CurrentOrderID {
							chosenOrder = o
							break
						}
						if chosenOrder == nil {
							chosenOrder = o
						}
					}

					hasTableReady = false
					tableReadySummary = ""
					if chosenOrder != nil {
						validItemsCount := 0
						readyItemsCount := 0
						preparingItemsCount := 0
						var readyItemsList []string
						for _, it := range chosenOrder.Items {
							if !it.IsVoided {
								validItemsCount++
								if it.Status == "ready" || it.Status == "hazir" {
									readyItemsCount++
									qStr := fmt.Sprintf("%v", it.Quantity)
									if it.Quantity == float64(int(it.Quantity)) {
										qStr = fmt.Sprintf("%d", int(it.Quantity))
									}
									readyItemsList = append(readyItemsList, fmt.Sprintf("%sx %s", qStr, it.ProductName))
								} else if it.Status == "preparing" || it.Status == "pending" || it.Status == "hold" || it.Status == "" || it.Status == "new" {
									preparingItemsCount++
								}
							}
						}
						tableReadySummary = strings.Join(readyItemsList, ", ")

						if validItemsCount > 0 && preparingItemsCount == 0 && readyItemsCount > 0 {
							hasTableReady = true
						} else {
							hasTableReady = false
						}

						createdISO := ""
						if !chosenOrder.CreatedAt.IsZero() {
							createdISO = chosenOrder.CreatedAt.UTC().Format(time.RFC3339)
						}
						activeOrder = fiber.Map{
							"id":                  chosenOrder.ID,
							"order_no":            chosenOrder.OrderNo,
							"status":              chosenOrder.Status,
							"grand_total":         chosenOrder.GrandTotal,
							"paid_total":          chosenOrder.PaidTotal,
							"remaining_total":     chosenOrder.RemainingTotal,
							"is_prepaid":          chosenOrder.RemainingTotal <= 0.01 && chosenOrder.PaidTotal > 0,
							"notes":               chosenOrder.Notes,
							"subtotal":            chosenOrder.Subtotal,
							"discount_amount":     chosenOrder.DiscountAmount,
							"kuver_count":         chosenOrder.KuverCount,
							"waiter_name":         chosenOrder.WaiterName,
							"items_count":         validItemsCount,
							"has_ready_items":     hasTableReady,
							"ready_items_summary": tableReadySummary,
							"created_at":          createdISO,
						}
					}
				}

				durationMinutes := 0
				var openedAtISO interface{}
				if table.OpenedAt != nil && !table.OpenedAt.IsZero() {
					durationMinutes = int(now.Sub(table.OpenedAt.UTC()).Minutes())
					if durationMinutes < 0 {
						durationMinutes = 0
					}
					openedAtISO = table.OpenedAt.UTC().Format(time.RFC3339)
				}

				tablesData = append(tablesData, fiber.Map{
					"id":                  table.ID,
					"area_id":             table.AreaID,
					"name":                table.Name,
					"shape":               table.Shape,
					"order_index":         table.OrderIndex,
					"x":                   table.X,
					"y":                   table.Y,
					"width":               table.Width,
					"height":              table.Height,
					"seats":               table.Seats,
					"status":              table.Status,
					"opened_at":           openedAtISO,
					"duration_minutes":    durationMinutes,
					"kuver_count":         table.KuverCount,
					"waiter_name":         table.WaiterName,
					"reservation_name":    table.ReservationName,
					"reservation_time":    table.ReservationTime,
					"waiter_call_reason":  table.WaiterCallReason,
					"is_merged_to":        table.IsMergedTo,
					"has_ready_items":     hasTableReady,
					"ready_items_summary": tableReadySummary,
					"active_order":        activeOrder,
				})
			}

			output = append(output, fiber.Map{
				"id":          area.ID,
				"name":        area.Name,
				"order_index": area.OrderIndex,
				"tables":      tablesData,
			})
		}

		return c.JSON(output)
	})

	group.Put("/layout/positions", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var positions []models.TablePositionUpdate
		if err := c.BodyParser(&positions); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz kroki verisi.")
		}
		for _, pos := range positions {
			updates := map[string]interface{}{"x": pos.X, "y": pos.Y}
			if pos.Width != nil {
				updates["width"] = *pos.Width
			}
			if pos.Height != nil {
				updates["height"] = *pos.Height
			}
			if pos.Shape != nil {
				updates["shape"] = *pos.Shape
			}
			if pos.OrderIndex != nil {
				updates["order_index"] = *pos.OrderIndex
			}
			db.Model(&models.Table{}).Where("id = ?", pos.ID).Updates(updates)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "FLOOR_LAYOUT_UPDATED", fiber.Map{"updated_count": len(positions)})
		return c.JSON(fiber.Map{"status": "success", "message": "Kroki yerleşimi güncellendi."})
	})

	// ACID Row-Level Locked Table Move (`POST /api/tables/move`)
	group.Post("/move", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableMoveRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz masa taşıma verisi.")
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_table_move_merge"}, true, "Masa taşıma ve birleştirme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.SourceTableID == payload.TargetTableID {
			return fiber.NewError(fiber.StatusBadRequest, "Aynı masayı kendisine taşıyamazsınız.")
		}

		var srcTable, targetTable models.Table
		txErr := db.Transaction(func(tx *gorm.DB) error {
			// Lock tables in ascending ID order to guarantee zero deadlocks under concurrent moves
			ids := []int{payload.SourceTableID, payload.TargetTableID}
			sort.Ints(ids)
			var lockedTables []models.Table
			if err := repository.WithRowLock(tx).Where("id IN ?", ids).Order("id ASC").Find(&lockedTables).Error; err != nil {
				return err
			}
			for _, t := range lockedTables {
				if t.ID == payload.SourceTableID {
					srcTable = t
				} else if t.ID == payload.TargetTableID {
					targetTable = t
				}
			}
			if srcTable.ID == 0 || targetTable.ID == 0 {
				return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
			}
			if targetTable.Status != "empty" && targetTable.Status != "reserved" {
				return fiber.NewError(fiber.StatusBadRequest, "Hedef masa boş değil! Masa birleştirme özelliğini kullanınız.")
			}

			// Find active open orders on source table
			var activeOrders []models.Order
			if err := tx.Where("table_id = ? AND status IN ?", srcTable.ID, []string{"open", "bill_requested"}).Find(&activeOrders).Error; err != nil {
				return err
			}
			if len(activeOrders) == 0 && srcTable.CurrentOrderID == nil {
				return fiber.NewError(fiber.StatusBadRequest, "Kaynak masada taşınacak aktif açık sipariş bulunmuyor.")
			}

			var activeOrderID *int
			if len(activeOrders) > 0 {
				oID := activeOrders[0].ID
				activeOrderID = &oID
			} else if srcTable.CurrentOrderID != nil {
				activeOrderID = srcTable.CurrentOrderID
			}

			// 1. Move all open/bill_requested orders from source table to target table
			if err := tx.Model(&models.Order{}).Where("table_id = ? AND status IN ?", srcTable.ID, []string{"open", "bill_requested"}).Update("table_id", targetTable.ID).Error; err != nil {
				return err
			}

			// 2. Transfer state to target table without touching associations
			targetStatus := srcTable.Status
			if targetStatus == "empty" {
				targetStatus = "occupied"
			}
			targetUpdates := map[string]interface{}{
				"status":             targetStatus,
				"opened_at":          srcTable.OpenedAt,
				"kuver_count":        srcTable.KuverCount,
				"waiter_name":        srcTable.WaiterName,
				"current_order_id":   activeOrderID,
				"waiter_call_reason": srcTable.WaiterCallReason,
				"reservation_name":   srcTable.ReservationName,
				"reservation_time":   srcTable.ReservationTime,
				"is_merged_to":       nil,
			}
			if err := tx.Model(&models.Table{}).Where("id = ?", targetTable.ID).Updates(targetUpdates).Error; err != nil {
				return err
			}

			// 3. Clear source table without touching associations
			srcUpdates := map[string]interface{}{
				"status":             "empty",
				"opened_at":          nil,
				"kuver_count":        0,
				"waiter_name":        nil,
				"current_order_id":   nil,
				"waiter_call_reason": nil,
				"reservation_name":   nil,
				"reservation_time":   nil,
				"is_merged_to":       nil,
			}
			if err := tx.Model(&models.Table{}).Where("id = ?", srcTable.ID).Updates(srcUpdates).Error; err != nil {
				return err
			}

			ref := fmt.Sprintf("%s -> %s", srcTable.Name, targetTable.Name)
			rc := "MASA_TASIMA"
			rt := fmt.Sprintf("Masa %s, Masa %s'ye taşındı.", srcTable.Name, targetTable.Name)
			tx.Create(&models.AuditLog{
				ActionType:   "TABLE_MOVE",
				OperatorName: payload.OperatorName,
				TargetRef:    &ref,
				ReasonCode:   &rc,
				ReasonText:   &rt,
				Details:      models.JSONMap{"source": srcTable.Name, "target": targetTable.Name},
			})
			return nil
		})
		if txErr != nil {
			return txErr
		}

		_ = svc.Broadcaster.BroadcastAll(tenantCode, "TABLE_MOVED", fiber.Map{"source_id": srcTable.ID, "target_id": targetTable.ID})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"source_id": srcTable.ID, "target_id": targetTable.ID})
		return c.JSON(fiber.Map{"status": "success", "message": fmt.Sprintf("%s masası %s masasına taşındı.", srcTable.Name, targetTable.Name)})
	})

	// ACID Row-Level Locked Table Merge (`POST /api/tables/merge`)
	group.Post("/merge", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableMergeRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz masa birleştirme verisi.")
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_table_move_merge"}, true, "Masa taşıma ve birleştirme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.SourceTableID == payload.TargetTableID {
			return fiber.NewError(fiber.StatusBadRequest, "Aynı masayı kendisiyle birleştiremezsiniz.")
		}

		var srcTable, targetTable models.Table
		txErr := db.Transaction(func(tx *gorm.DB) error {
			ids := []int{payload.SourceTableID, payload.TargetTableID}
			sort.Ints(ids)
			var lockedTables []models.Table
			if err := repository.WithRowLock(tx).Preload("Orders.Items").Where("id IN ?", ids).Order("id ASC").Find(&lockedTables).Error; err != nil {
				return err
			}
			for _, t := range lockedTables {
				if t.ID == payload.SourceTableID {
					srcTable = t
				} else if t.ID == payload.TargetTableID {
					targetTable = t
				}
			}
			if srcTable.ID == 0 || targetTable.ID == 0 {
				return fiber.NewError(fiber.StatusNotFound, "Masalar bulunamadı.")
			}

			var srcOrder, targetOrder *models.Order
			for i := range srcTable.Orders {
				if srcTable.Orders[i].Status == "open" || srcTable.Orders[i].Status == "bill_requested" {
					srcOrder = &srcTable.Orders[i]
					break
				}
			}
			for i := range targetTable.Orders {
				if targetTable.Orders[i].Status == "open" || targetTable.Orders[i].Status == "bill_requested" {
					targetOrder = &targetTable.Orders[i]
					break
				}
			}
			if srcOrder == nil || targetOrder == nil {
				return fiber.NewError(fiber.StatusBadRequest, "Her iki masada da aktif açık adisyon olmalıdır.")
			}

			tx.Model(&models.OrderItem{}).Where("order_id = ?", srcOrder.ID).Update("order_id", targetOrder.ID)
			tx.Model(&models.Payment{}).Where("order_id = ?", srcOrder.ID).Update("order_id", targetOrder.ID)

			targetOrder.DiscountAmount = service.Round2(targetOrder.DiscountAmount + srcOrder.DiscountAmount)
			targetOrder.KuverCount += srcOrder.KuverCount
			targetOrder.KuverTotal = service.Round2(targetOrder.KuverTotal + srcOrder.KuverTotal)
			targetOrder.ServiceCharge = service.Round2(targetOrder.ServiceCharge + srcOrder.ServiceCharge)
			recalculateOrderTotals(tx, targetOrder)
			tx.Save(targetOrder)

			mergeNote := fmt.Sprintf("Masa %s ile birleştirildi.", targetTable.Name)
			nowMerge := time.Now().UTC()
			srcOrder.Status = "cancelled"
			srcOrder.PaidTotal = 0
			srcOrder.RemainingTotal = 0
			srcOrder.ClosedAt = &nowMerge
			srcOrder.Notes = &mergeNote
			tx.Save(srcOrder)

			targetID := targetTable.ID
			tx.Model(&models.Table{}).Where("id = ?", srcTable.ID).Updates(map[string]interface{}{
				"status":           "empty",
				"is_merged_to":     targetID,
				"opened_at":        nil,
				"kuver_count":      0,
				"current_order_id": nil,
			})

			ref := fmt.Sprintf("%s + %s", srcTable.Name, targetTable.Name)
			rc := "MASA_BIRLESTIRME"
			rt := fmt.Sprintf("Masa %s adisyonu Masa %s ile birleştirildi.", srcTable.Name, targetTable.Name)
			tx.Create(&models.AuditLog{
				ActionType:   "TABLE_MERGE",
				OperatorName: payload.OperatorName,
				TargetRef:    &ref,
				ReasonCode:   &rc,
				ReasonText:   &rt,
				Details:      models.JSONMap{"source": srcTable.Name, "target": targetTable.Name, "target_order": targetOrder.OrderNo},
			})
			return nil
		})
		if txErr != nil {
			return txErr
		}

		_ = svc.Broadcaster.BroadcastAll(tenantCode, "TABLE_MERGED", fiber.Map{"source_id": srcTable.ID, "target_id": targetTable.ID})
		return c.JSON(fiber.Map{"status": "success", "message": fmt.Sprintf("%s masası %s ile birleştirildi.", srcTable.Name, targetTable.Name)})
	})

	// ACID Row-Level Locked Item Transfer (`POST /api/tables/transfer-items`)
	group.Post("/transfer-items", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableItemTransferRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ürün aktarım verisi.")
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_transfer_item"}, true, "Ürün aktarma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.SourceTableID == payload.TargetTableID {
			return fiber.NewError(fiber.StatusBadRequest, "Aynı masaya ürün aktarılamaz.")
		}

		var srcTable, targetTable models.Table
		txErr := db.Transaction(func(tx *gorm.DB) error {
			ids := []int{payload.SourceTableID, payload.TargetTableID}
			sort.Ints(ids)
			var lockedTables []models.Table
			if err := repository.WithRowLock(tx).Preload("Orders.Items").Where("id IN ?", ids).Order("id ASC").Find(&lockedTables).Error; err != nil {
				return err
			}
			for _, t := range lockedTables {
				if t.ID == payload.SourceTableID {
					srcTable = t
				} else if t.ID == payload.TargetTableID {
					targetTable = t
				}
			}
			if srcTable.ID == 0 || targetTable.ID == 0 {
				return fiber.NewError(fiber.StatusNotFound, "Masalar bulunamadı.")
			}

			var srcOrder, targetOrder *models.Order
			for i := range srcTable.Orders {
				if srcTable.Orders[i].Status == "open" || srcTable.Orders[i].Status == "bill_requested" {
					srcOrder = &srcTable.Orders[i]
					break
				}
			}
			if srcOrder == nil {
				return fiber.NewError(fiber.StatusBadRequest, "Kaynak masada aktif adisyon yok.")
			}
			for i := range targetTable.Orders {
				if targetTable.Orders[i].Status == "open" || targetTable.Orders[i].Status == "bill_requested" {
					targetOrder = &targetTable.Orders[i]
					break
				}
			}

			now := time.Now().UTC()
			if targetOrder == nil {
				tid := targetTable.ID
				newOrder := models.Order{
					OrderNo:    fmt.Sprintf("ORD-%s-%d-%04d", now.Format("20060102150405"), targetTable.ID, now.UnixNano()%10000),
					TableID:    &tid,
					OrderType:  "dine_in",
					Status:     "open",
					WaiterName: payload.OperatorName,
					CreatedAt:  now,
				}
				if err := tx.Create(&newOrder).Error; err != nil {
					return err
				}
				targetOrder = &newOrder
				targetTable.Status = "occupied"
				targetTable.OpenedAt = &now
				targetTable.CurrentOrderID = &newOrder.ID
				targetTable.WaiterName = &payload.OperatorName
				tx.Save(&targetTable)
			}

			transferredCount := 0
			for _, itemID := range payload.OrderItemIDs {
				var item models.OrderItem
				if err := repository.WithRowLock(tx).Where("id = ? AND order_id = ? AND is_voided = ?", itemID, srcOrder.ID, false).First(&item).Error; err == nil {
					tx.Model(&item).Update("order_id", targetOrder.ID)
					transferredCount++
				}
			}
			if transferredCount == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Aktarılacak geçerli ürün bulunamadı.")
			}

			recalculateOrderTotals(tx, srcOrder)
			recalculateOrderTotals(tx, targetOrder)

			var remValid int64
			tx.Model(&models.OrderItem{}).Where("order_id = ? AND is_voided = ?", srcOrder.ID, false).Count(&remValid)
			if remValid == 0 && srcOrder.Subtotal <= 0.001 {
				if srcOrder.PaidTotal > 0 {
					srcOrder.Status = "paid"
				} else {
					srcOrder.Status = "cancelled"
				}
				srcOrder.RemainingTotal = 0.0
				srcOrder.ClosedAt = &now
				srcTable.Status = "empty"
				srcTable.OpenedAt = nil
				srcTable.KuverCount = 0
				srcTable.WaiterName = nil
				srcTable.CurrentOrderID = nil
				tx.Save(&srcTable)
			}
			tx.Save(srcOrder)
			tx.Save(targetOrder)
			return nil
		})
		if txErr != nil {
			return txErr
		}

		_ = svc.Broadcaster.BroadcastAll(tenantCode, "TABLE_ITEMS_TRANSFERRED", fiber.Map{
			"source_table_id": srcTable.ID,
			"target_table_id": targetTable.ID,
		})
		return c.JSON(fiber.Map{"status": "success", "message": fmt.Sprintf("Ürünler başarıyla %s masasına aktarıldı.", targetTable.Name)})
	})

	group.Post("/:table_id/kuver", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var payload models.TableKuverRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz kuver verisi.")
		}
		if payload.KuverCount < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Kuver kişi sayısı negatif olamaz.")
		}
		if err := requirePermission(c, svc, db, "", []string{"order_add_kuver_service"}, true, "Kuver ücreti düzenleme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		var table models.Table
		if err := db.Preload("Orders").First(&table, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
		}
		unitKuverPrice := loadSettingFloat(db, "kuver_DefaultPrice", svc.Config.DefaultKuverPrice)
		if kp := loadSettingFloat(db, "kuver_price", 0); kp > 0 {
			unitKuverPrice = kp
		}
		table.KuverCount = payload.KuverCount
		db.Save(&table)

		for i := range table.Orders {
			ord := &table.Orders[i]
			if ord.Status == "open" || ord.Status == "bill_requested" {
				ord.KuverCount = payload.KuverCount
				ord.KuverTotal = service.Round2(float64(payload.KuverCount) * unitKuverPrice)
				recalculateOrderTotals(db, ord)
				db.Save(ord)
				break
			}
		}

		_ = svc.Broadcaster.BroadcastAll(tenantCode, "TABLE_UPDATED", fiber.Map{"table_id": tableID, "kuver_count": payload.KuverCount})
		return c.JSON(fiber.Map{"status": "success", "kuver_count": payload.KuverCount})
	})

	group.Post("/:table_id/call-waiter", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var payload models.WaiterCallRequest
		_ = c.BodyParser(&payload)
		if payload.Reason == "" {
			payload.Reason = "Garson Çağrısı"
		}
		var table models.Table
		if err := db.First(&table, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
		}
		table.WaiterCallReason = &payload.Reason
		if payload.Reason == "Hesap İste" {
			table.Status = "bill_requested"
		} else {
			table.Status = "waiter_call"
		}
		db.Save(&table)

		_ = svc.Broadcaster.BroadcastToChannel(tenantCode, "waiter", "WAITER_CALL_ALERT", fiber.Map{
			"table_id":   table.ID,
			"table_name": table.Name,
			"reason":     payload.Reason,
			"timestamp":  time.Now().Format("15:04:05"),
		})
		return c.JSON(fiber.Map{"status": "success", "message": fmt.Sprintf("%s talebiniz garsona iletildi!", payload.Reason)})
	})

	clearWaiterHandler := func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var table models.Table
		if err := db.First(&table, tableID).Error; err == nil {
			table.WaiterCallReason = nil
			if table.Status == "waiter_call" || table.Status == "bill_requested" {
				if table.CurrentOrderID != nil {
					table.Status = "occupied"
				} else {
					table.Status = "empty"
				}
			}
			db.Save(&table)
			_ = svc.Broadcaster.BroadcastAll(tenantCode, "WAITER_CALL_CLEARED", fiber.Map{"table_id": tableID})
		}
		return c.JSON(fiber.Map{"status": "success"})
	}
	group.Post("/:table_id/clear-call", clearWaiterHandler)
	group.Post("/:table_id/clear-waiter-call", clearWaiterHandler)

	group.Post("/:table_id/clear-bill-printed", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var tbl models.Table
		if err := db.First(&tbl, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı")
		}
		if tbl.Status == "bill_printed" {
			tbl.Status = "occupied"
			db.Save(&tbl)
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
				"table_id": tbl.ID,
				"status":   "occupied",
			})
		}
		return c.JSON(fiber.Map{
			"status":     "success",
			"table_id":   tbl.ID,
			"new_status": tbl.Status,
		})
	})

	// Area & Table CRUD
	group.Post("/areas", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.AreaCreate
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz bölge verisi.")
		}
		idx := 0
		if payload.OrderIndex != nil {
			idx = *payload.OrderIndex
		}
		area := models.Area{Name: payload.Name, OrderIndex: idx}
		db.Create(&area)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"area_id": area.ID})
		return c.JSON(fiber.Map{"status": "success", "area": fiber.Map{"id": area.ID, "name": area.Name}})
	})

	group.Put("/areas/reorder", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.AreaReorderRequest
		_ = c.BodyParser(&payload)
		for idx, aid := range payload.AreaIDs {
			db.Model(&models.Area{}).Where("id = ?", aid).Update("order_index", idx)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"reordered": true})
		return c.JSON(fiber.Map{"status": "success", "message": "Bölge sıralaması güncellendi."})
	})

	group.Put("/tables/reorder", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableReorderRequest
		_ = c.BodyParser(&payload)
		for idx, tid := range payload.TableIDs {
			updates := map[string]interface{}{"order_index": idx}
			if payload.AreaID != nil {
				updates["area_id"] = *payload.AreaID
			}
			db.Model(&models.Table{}).Where("id = ?", tid).Updates(updates)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"tables_reordered": true})
		return c.JSON(fiber.Map{"status": "success", "message": "Masa sıralaması güncellendi."})
	})

	group.Put("/areas/:area_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		areaID, _ := strconv.Atoi(c.Params("area_id"))
		var payload models.AreaCreate
		_ = c.BodyParser(&payload)
		var area models.Area
		if err := db.First(&area, areaID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Bölge bulunamadı.")
		}
		area.Name = payload.Name
		if payload.OrderIndex != nil {
			area.OrderIndex = *payload.OrderIndex
		}
		db.Save(&area)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"area_id": areaID})
		return c.JSON(fiber.Map{"status": "success", "message": "Bölge güncellendi."})
	})

	group.Delete("/areas/:area_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_table_area"}, false, "Bölge silme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		areaID, _ := strconv.Atoi(c.Params("area_id"))
		var area models.Area
		if err := db.Preload("Tables").First(&area, areaID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Bölge bulunamadı.")
		}
		txErr := db.Transaction(func(tx *gorm.DB) error {
			for _, t := range area.Tables {
				if t.Status != "empty" && t.Status != "available" {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("'%s' masası aktif/açık durumda. Önce masaları kapatınız.", t.Name))
				}
				var openCnt int64
				tx.Model(&models.Order{}).Where("table_id = ? AND status IN ?", t.ID, []string{"open", "bill_requested"}).Count(&openCnt)
				if openCnt > 0 {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("'%s' masasında kapatılmamış açık adisyon bulunmaktadır.", t.Name))
				}
			}
			for _, t := range area.Tables {
				if err := tx.Model(&models.Order{}).Where("table_id = ?", t.ID).Update("table_id", nil).Error; err != nil {
					return err
				}
				if err := tx.Delete(&t).Error; err != nil {
					return err
				}
			}
			return tx.Delete(&area).Error
		})
		if txErr != nil {
			return txErr
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"deleted_area_id": areaID})
		return c.JSON(fiber.Map{"status": "success", "message": "Bölge silindi."})
	})

	group.Post("/single", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableCreateSchema
		_ = c.BodyParser(&payload)
		seats := 4
		if payload.Seats != nil {
			seats = *payload.Seats
		}
		shape := "square"
		if payload.Shape != nil {
			shape = *payload.Shape
		}
		idx := 0
		if payload.OrderIndex != nil {
			idx = *payload.OrderIndex
		}
		t := models.Table{
			AreaID:     payload.AreaID,
			Name:       payload.Name,
			Seats:      seats,
			Shape:      shape,
			OrderIndex: idx,
			Status:     "empty",
			X:          50.0,
			Y:          50.0,
			Width:      120.0,
			Height:     120.0,
		}
		db.Create(&t)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": t.ID})
		return c.JSON(fiber.Map{"status": "success", "table_id": t.ID})
	})

	group.Put("/single/:table_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var table models.Table
		if err := db.First(&table, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
		}
		var payload models.TableUpdateSchema
		_ = c.BodyParser(&payload)
		if payload.Name != nil && strings.TrimSpace(*payload.Name) != "" {
			table.Name = strings.TrimSpace(*payload.Name)
		}
		if payload.AreaID != nil {
			table.AreaID = *payload.AreaID
		}
		if payload.Seats != nil {
			table.Seats = *payload.Seats
		}
		if payload.Shape != nil {
			table.Shape = *payload.Shape
		}
		if payload.OrderIndex != nil {
			table.OrderIndex = *payload.OrderIndex
		}
		db.Save(&table)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": tableID})
		return c.JSON(fiber.Map{"status": "success", "message": "Masa güncellendi."})
	})

	group.Delete("/single/:table_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"def_table_area"}, false, "Masa silme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		tableID, _ := strconv.Atoi(c.Params("table_id"))
		var table models.Table
		if err := db.First(&table, tableID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı.")
		}
		if table.Status != "empty" && table.Status != "available" {
			return fiber.NewError(fiber.StatusBadRequest, "Masa şu anda aktif/dolu! Önce hesabı kapatınız.")
		}
		var openCnt int64
		db.Model(&models.Order{}).Where("table_id = ? AND status IN ?", tableID, []string{"open", "bill_requested"}).Count(&openCnt)
		if openCnt > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu masaya bağlı açık adisyon bulunmaktadır.")
		}
		db.Model(&models.Order{}).Where("table_id = ?", tableID).Update("table_id", nil)
		db.Delete(&table)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"deleted_table_id": tableID})
		return c.JSON(fiber.Map{"status": "success", "message": "Masa silindi."})
	})

	group.Post("/bulk-create", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.TableBulkCreateSchema
		_ = c.BodyParser(&payload)
		seats := 4
		if payload.Seats > 0 {
			seats = payload.Seats
		}
		shape := payload.Shape
		if shape == "" {
			shape = "square"
		}
		created := 0
		for i := payload.StartNum; i < payload.StartNum+payload.Count; i++ {
			t := models.Table{
				AreaID: payload.AreaID,
				Name:   strings.TrimSpace(fmt.Sprintf("%s%d", payload.Prefix, i)),
				Seats:  seats,
				Shape:  shape,
				Status: "empty",
				X:      50.0 + float64(created%5)*140.0,
				Y:      50.0 + float64(created/5)*140.0,
				Width:  120.0,
				Height: 120.0,
			}
			db.Create(&t)
			created++
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"created_count": created})
		return c.JSON(fiber.Map{"status": "success", "created_count": created})
	})
}

// ============================================================================
// 4. PRODUCTS & CATEGORIES ROUTER (/api/products)
// ============================================================================

func RegisterProductsRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/categories", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		allItems := c.QueryBool("all_items", true)

		var categories []models.Category
		db.Preload("Products.Variants").
			Preload("Products.ModifierGroups.Options").
			Preload("Products.Recipes.Ingredient").
			Order("order_index ASC, id ASC").
			Find(&categories)

		var allIngList []models.Ingredient
		db.Find(&allIngList)
		allIngs := make(map[string]*models.Ingredient, len(allIngList))
		for i := range allIngList {
			key := service.NormalizeStockName(allIngList[i].Name)
			allIngs[key] = &allIngList[i]
		}

		output := make([]fiber.Map, 0, len(categories))
		for _, cat := range categories {
			products := cat.Products
			sort.Slice(products, func(i, j int) bool {
				if products[i].OrderIndex != products[j].OrderIndex {
					return products[i].OrderIndex < products[j].OrderIndex
				}
				return products[i].ID < products[j].ID
			})

			prods := make([]fiber.Map, 0, len(products))
			for _, p := range products {
				if !allItems && !p.IsAvailable {
					continue
				}
				stockQty := 0.0
				unitLabel := "Adet"
				directIng := allIngs[service.NormalizeStockName(p.Name)]
				if directIng != nil && directIng.Unit != "" {
					unitLabel = directIng.Unit
				}

				calcBOMStock, recipeItems, missingIngredients := service.CalculateBOMStock(p.Name, p.Recipes)
				hasRecipe := len(recipeItems) > 0
				if hasRecipe {
					stockQty = calcBOMStock
					unitLabel = "Adet"
					_, negAware, _, _ := service.GetProductAvailableStock(nil, p)
					if negAware < 0 {
						stockQty = negAware
					}
				} else if directIng != nil {
					stockQty = service.Round3(directIng.CurrentStock)
				}

				variants := make([]fiber.Map, 0, len(p.Variants))
				for _, v := range p.Variants {
					variants = append(variants, fiber.Map{
						"id":          v.ID,
						"name":        v.Name,
						"price_delta": v.PriceDelta,
						"is_default":  v.IsDefault,
					})
				}

				mgs := make([]fiber.Map, 0, len(p.ModifierGroups))
				for _, mg := range p.ModifierGroups {
					opts := make([]fiber.Map, 0, len(mg.Options))
					for _, opt := range mg.Options {
						opts = append(opts, fiber.Map{
							"id":    opt.ID,
							"name":  opt.Name,
							"price": opt.Price,
						})
					}
					mgs = append(mgs, fiber.Map{
						"id":            mg.ID,
						"name":          mg.Name,
						"is_required":   mg.IsRequired,
						"min_selection": mg.MinSelection,
						"max_selection": mg.MaxSelection,
						"options":       opts,
					})
				}

				allergens := p.Allergens
				if allergens == nil {
					allergens = models.StringSlice{}
				}
				station := p.Station
				if station == "" {
					station = "kitchen"
				}

				prods = append(prods, fiber.Map{
					"id":                  p.ID,
					"category_id":         p.CategoryID,
					"name":                p.Name,
					"description":         p.Description,
					"base_price":          p.BasePrice,
					"plu_code":            p.PluCode,
					"barcode":             p.Barcode,
					"vat_rate":            p.VatRate,
					"station":             station,
					"order_index":         p.OrderIndex,
					"unit":                unitLabel,
					"stock_quantity":      stockQty,
					"has_recipe":          hasRecipe,
					"recipe_items":        recipeItems,
					"missing_ingredients": missingIngredients,
					"image_url":           p.ImageURL,
					"calories":            p.Calories,
					"allergens":           allergens,
					"is_vegan":             p.IsVegan,
					"is_spicy":             p.IsSpicy,
					"allow_negative_stock": p.AllowNegStock,
					"is_available":         p.IsAvailable,
					"show_in_pos":         p.ShowInPos,
					"variants":            variants,
					"modifier_groups":     mgs,
				})
			}

			output = append(output, fiber.Map{
				"id":             cat.ID,
				"name":           cat.Name,
				"icon":           cat.Icon,
				"color":          cat.Color,
				"order_index":    cat.OrderIndex,
				"target_station": cat.TargetStation,
				"show_in_pos":    cat.ShowInPos,
				"products":       prods,
			})
		}

		return c.JSON(output)
	})

	group.Get("/search", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		q := strings.ReplaceAll(strings.TrimSpace(c.Query("q")), "#", "")
		if q == "" {
			return c.JSON([]fiber.Map{})
		}
		var products []models.Product
		db.Preload("Variants").Preload("ModifierGroups.Options").
			Where("LOWER(name) LIKE ? OR plu_code = ? OR barcode = ?", "%"+strings.ToLower(q)+"%", q, q).
			Find(&products)

		out := make([]fiber.Map, 0, len(products))
		for _, p := range products {
			out = append(out, fiber.Map{
				"id":           p.ID,
				"category_id":  p.CategoryID,
				"name":         p.Name,
				"base_price":   p.BasePrice,
				"plu_code":     p.PluCode,
				"barcode":      p.Barcode,
				"station":      p.Station,
				"is_available": p.IsAvailable,
				"variants":     p.Variants,
			})
		}
		return c.JSON(out)
	})

	group.Post("/categories", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		name := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", payload["name"])))
		icon := "Utensils"
		if v, ok := payload["icon"].(string); ok && v != "" {
			icon = v
		}
		color := "#f97316"
		if v, ok := payload["color"].(string); ok && v != "" {
			color = v
		}
		station := "kitchen"
		if v, ok := payload["target_station"].(string); ok && v != "" {
			station = v
		}
		showInPos := true
		if v, ok := payload["show_in_pos"].(bool); ok {
			showInPos = v
		}
		cat := models.Category{
			Name:          name,
			Icon:          icon,
			Color:         color,
			OrderIndex:    99,
			TargetStation: station,
			ShowInPos:     showInPos,
		}
		db.Create(&cat)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"category_id": cat.ID})
		return c.JSON(fiber.Map{"status": "success", "category_id": cat.ID})
	})

	group.Put("/categories/:cat_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		catID, _ := strconv.Atoi(c.Params("cat_id"))
		var cat models.Category
		if err := db.First(&cat, catID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı.")
		}
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		if v, ok := payload["name"].(string); ok && strings.TrimSpace(v) != "" {
			cat.Name = strings.ToUpper(strings.TrimSpace(v))
		}
		if v, ok := payload["icon"].(string); ok {
			cat.Icon = v
		}
		if v, ok := payload["color"].(string); ok {
			cat.Color = v
		}
		if v, ok := payload["target_station"].(string); ok {
			cat.TargetStation = v
		}
		if v, ok := payload["show_in_pos"].(bool); ok {
			cat.ShowInPos = v
		}
		db.Save(&cat)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"category_id": cat.ID})
		return c.JSON(fiber.Map{"status": "success", "category_id": cat.ID})
	})

	group.Put("/categories-reorder", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			CategoryIDs []int `json:"category_ids"`
		}
		_ = c.BodyParser(&payload)
		for idx, cid := range payload.CategoryIDs {
			db.Model(&models.Category{}).Where("id = ?", cid).Update("order_index", idx)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"reordered": "categories"})
		return c.JSON(fiber.Map{"status": "success"})
	})

	group.Put("/items-reorder", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			ProductIDs []int `json:"product_ids"`
		}
		_ = c.BodyParser(&payload)
		for idx, pid := range payload.ProductIDs {
			db.Model(&models.Product{}).Where("id = ?", pid).Update("order_index", idx)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"reordered": "products"})
		return c.JSON(fiber.Map{"status": "success"})
	})

	group.Delete("/categories/:cat_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"prod_manage_menu"}, false, "Kategori silme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		catID, _ := strconv.Atoi(c.Params("cat_id"))
		var cat models.Category
		if err := db.First(&cat, catID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı.")
		}
		var prodCount int64
		db.Model(&models.Product{}).Where("category_id = ?", catID).Count(&prodCount)
		if prodCount > 0 {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu kategoride %d adet ürün bulunmaktadır. Lütfen önce ürünleri başka kategoriye taşıyın veya silin.", prodCount))
		}
		db.Delete(&cat)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"category_id": catID})
		return c.JSON(fiber.Map{"status": "success", "message": "Kategori başarıyla silindi."})
	})

	group.Post("/items", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload struct {
			CategoryID         int      `json:"category_id"`
			Name               string   `json:"name"`
			Description        *string  `json:"description"`
			BasePrice          float64  `json:"base_price"`
			VatRate            *float64 `json:"vat_rate"`
			PluCode            *string  `json:"plu_code"`
			Barcode            *string  `json:"barcode"`
			Station            string   `json:"station"`
			IsAvailable        *bool    `json:"is_available"`
			ShowInPos          *bool    `json:"show_in_pos"`
			Unit               string   `json:"unit"`
			StockQuantity      float64  `json:"stock_quantity"`
			AllowNegativeStock *bool    `json:"allow_negative_stock"`
		}
		_ = c.BodyParser(&payload)
		station := payload.Station
		if station == "" {
			station = "kitchen"
		}
		avail := true
		if payload.IsAvailable != nil {
			avail = *payload.IsAvailable
		}
		showPos := true
		if payload.ShowInPos != nil {
			showPos = *payload.ShowInPos
		}
		allowNeg := false
		if payload.AllowNegativeStock != nil {
			allowNeg = *payload.AllowNegativeStock
		}
		vatRate := 10.0
		if payload.VatRate != nil && *payload.VatRate >= 0 {
			vatRate = *payload.VatRate
		}
		prod := models.Product{
			CategoryID:    payload.CategoryID,
			Name:          strings.TrimSpace(payload.Name),
			Description:   payload.Description,
			BasePrice:     payload.BasePrice,
			VatRate:       vatRate,
			PluCode:       payload.PluCode,
			Barcode:       payload.Barcode,
			Station:       station,
			IsAvailable:   avail,
			ShowInPos:     showPos,
			AllowNegStock: allowNeg,
		}
		if err := db.Create(&prod).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Ürün oluşturulamadı: %v", err))
		}
		if strings.TrimSpace(prod.Name) != "" {
			var directIng models.Ingredient
			unitStr := strings.TrimSpace(payload.Unit)
			if unitStr == "" {
				unitStr = "Adet"
			}
			if ingID, found := service.FindIngredientIDByName(db, prod.Name); found && db.First(&directIng, ingID).Error == nil {
				directIng.CurrentStock = service.Round3(payload.StockQuantity)
				if payload.Unit != "" {
					directIng.Unit = unitStr
				}
				db.Save(&directIng)
			} else if payload.StockQuantity != 0 || payload.Unit != "" {
				db.Create(&models.Ingredient{
					Name:         strings.TrimSpace(prod.Name),
					Unit:         unitStr,
					CurrentStock: service.Round3(payload.StockQuantity),
					WarehouseID:  2,
				})
			}
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"product_id": prod.ID})
		return c.JSON(fiber.Map{"status": "success", "product_id": prod.ID})
	})

	group.Put("/items/:prod_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		prodID, _ := strconv.Atoi(c.Params("prod_id"))
		var prod models.Product
		if err := db.First(&prod, prodID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı.")
		}
		oldName := prod.Name
		var payload map[string]interface{}
		_ = c.BodyParser(&payload)
		if v, ok := payload["name"].(string); ok {
			prod.Name = strings.TrimSpace(v)
		}
		if v, ok := payload["base_price"].(float64); ok {
			prod.BasePrice = v
		}
		if v, ok := payload["vat_rate"].(float64); ok && v >= 0 {
			prod.VatRate = v
		}
		if v, exists := payload["plu_code"]; exists {
			if s, ok := v.(string); ok {
				tr := strings.TrimSpace(s)
				if tr == "" {
					prod.PluCode = nil
				} else {
					prod.PluCode = &tr
				}
			} else if v == nil {
				prod.PluCode = nil
			}
		}
		if v, exists := payload["barcode"]; exists {
			if s, ok := v.(string); ok {
				tr := strings.TrimSpace(s)
				if tr == "" {
					prod.Barcode = nil
				} else {
					prod.Barcode = &tr
				}
			} else if v == nil {
				prod.Barcode = nil
			}
		}
		if v, exists := payload["description"]; exists {
			if s, ok := v.(string); ok {
				tr := strings.TrimSpace(s)
				if tr == "" {
					prod.Description = nil
				} else {
					prod.Description = &tr
				}
			} else if v == nil {
				prod.Description = nil
			}
		}
		if v, ok := payload["category_id"].(float64); ok {
			prod.CategoryID = int(v)
		}
		if v, ok := payload["station"].(string); ok {
			prod.Station = v
		}
		if v, ok := payload["is_available"].(bool); ok {
			prod.IsAvailable = v
		}
		if v, ok := payload["show_in_pos"].(bool); ok {
			prod.ShowInPos = v
		}
		if v, ok := payload["allow_negative_stock"].(bool); ok {
			prod.AllowNegStock = v
		}
		db.Save(&prod)
		if strings.TrimSpace(prod.Name) != "" {
			stockVal, hasStock := payload["stock_quantity"].(float64)
			unitStr, hasUnit := payload["unit"].(string)
			unitStr = strings.TrimSpace(unitStr)
			var directIng models.Ingredient
			foundIng := false
			if oldName != "" {
				if ingID, found := service.FindIngredientIDByName(db, oldName); found && db.First(&directIng, ingID).Error == nil {
					foundIng = true
				}
			}
			if !foundIng {
				if ingID, found := service.FindIngredientIDByName(db, prod.Name); found && db.First(&directIng, ingID).Error == nil {
					foundIng = true
				}
			}
			if foundIng {
				directIng.Name = strings.TrimSpace(prod.Name)
				if hasStock {
					directIng.CurrentStock = service.Round3(stockVal)
				}
				if hasUnit && unitStr != "" {
					directIng.Unit = unitStr
				}
				db.Save(&directIng)
			} else if hasStock {
				if unitStr == "" {
					unitStr = "Adet"
				}
				db.Create(&models.Ingredient{
					Name:         strings.TrimSpace(prod.Name),
					Unit:         unitStr,
					CurrentStock: service.Round3(stockVal),
					WarehouseID:  2,
				})
			}
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"product_id": prod.ID})
		return c.JSON(fiber.Map{"status": "success", "message": "Ürün ve stok kartı güncellendi."})
	})

	group.Delete("/items/:prod_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		prodID, _ := strconv.Atoi(c.Params("prod_id"))
		var prod models.Product
		if err := db.First(&prod, prodID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı.")
		}
		if db.Dialector.Name() == "sqlite" {
			db.Exec("PRAGMA foreign_keys = OFF;")
			defer db.Exec("PRAGMA foreign_keys = ON;")
		}
		var mgs []models.ModifierGroup
		db.Where("product_id = ?", prodID).Find(&mgs)
		for _, mg := range mgs {
			db.Where("group_id = ?", mg.ID).Delete(&models.ModifierOption{})
		}
		db.Where("product_id = ?", prodID).Delete(&models.ModifierGroup{})
		db.Where("product_id = ?", prodID).Delete(&models.ProductVariant{})
		db.Where("product_id = ?", prodID).Delete(&models.Recipe{})
		if err := db.Delete(&prod).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Ürün silinemedi: %v", err))
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"product_id": prodID})
		return c.JSON(fiber.Map{"status": "deleted", "id": prod.ID, "message": "Ürün ve bağlı reçetesi tamamen silindi."})
	})
}
