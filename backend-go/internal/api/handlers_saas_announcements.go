package api

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RegisterSaaSAnnouncementRoutes mounts R5 Broadcast Announcements routes
func RegisterSaaSAnnouncementRoutes(masterGroup fiber.Router, rootApi fiber.Router, svc *service.Services) {
	// POST /api/master/broadcast - Broadcast announcement to POS clients
	masterGroup.Post("/broadcast", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		var payload struct {
			Title           string     `json:"title"`
			Content         string     `json:"content"`
			Message         string     `json:"message"`
			BannerType      string     `json:"banner_type"`
			TargetType      string     `json:"target_type"`
			TargetTenantIDs string     `json:"target_tenant_ids"`
			TargetPlans     string     `json:"target_plans"`
			ShowAsPopup     bool       `json:"show_as_popup"`
			Dismissible     bool       `json:"dismissible"`
			StartsAt        *time.Time `json:"starts_at"`
			ExpiresAt       *time.Time `json:"expires_at"`
			SentBy          string     `json:"sent_by"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru verisi: "+err.Error())
		}
		if strings.TrimSpace(payload.Content) == "" && strings.TrimSpace(payload.Message) != "" {
			payload.Content = strings.TrimSpace(payload.Message)
		}
		if strings.TrimSpace(payload.Title) == "" || strings.TrimSpace(payload.Content) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Başlık ve içerik alanları zorunludur.")
		}

		if payload.BannerType == "" {
			payload.BannerType = "info"
		}
		if payload.TargetType == "" {
			payload.TargetType = "all"
		}
		if payload.SentBy == "" {
			payload.SentBy = "master_admin"
		}
		if payload.TargetTenantIDs == "" {
			payload.TargetTenantIDs = "[]"
		}
		if payload.TargetPlans == "" {
			payload.TargetPlans = "[]"
		}

		mdb := svc.DBManager.MasterGorm
		announcement := models.BroadcastAnnouncement{
			Title:           strings.TrimSpace(payload.Title),
			Content:         strings.TrimSpace(payload.Content),
			BannerType:      payload.BannerType,
			TargetType:      payload.TargetType,
			TargetTenantIDs: payload.TargetTenantIDs,
			TargetPlans:     payload.TargetPlans,
			ShowAsPopup:     payload.ShowAsPopup,
			Dismissible:     payload.Dismissible,
			IsActive:        true,
			StartsAt:        payload.StartsAt,
			ExpiresAt:       payload.ExpiresAt,
			SentBy:          payload.SentBy,
		}

		if err := mdb.Create(&announcement).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Duyuru kaydedilemedi: "+err.Error())
		}

		// Broadcast WebSocket event ANNOUNCEMENT_BROADCAST via ws.Hub
		wsData := fiber.Map{
			"id":            announcement.ID,
			"title":         announcement.Title,
			"content":       announcement.Content,
			"banner_type":   announcement.BannerType,
			"show_as_popup": announcement.ShowAsPopup,
			"dismissible":   announcement.Dismissible,
			"target_type":   announcement.TargetType,
			"created_at":    announcement.CreatedAt,
			"expires_at":    announcement.ExpiresAt,
		}

		if announcement.TargetType == "all" {
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
		} else if announcement.TargetType == "specific_tenants" {
			var targets []string
			if err := json.Unmarshal([]byte(announcement.TargetTenantIDs), &targets); err == nil && len(targets) > 0 {
				for _, tCode := range targets {
					_ = svc.Broadcaster.BroadcastToChannel(tCode, "all", "ANNOUNCEMENT_BROADCAST", wsData)
				}
			} else {
				_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
			}
		} else {
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success":      true,
			"message":      "Duyuru başarıyla yayınlandı ve POS terminallerine iletildi.",
			"announcement": announcement,
		})
	})

	// GET /api/master/announcements - List announcements for Master Admin
	masterGroup.Get("/announcements", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var list []models.BroadcastAnnouncement
		mdb.Order("id desc").Find(&list)
		return c.JSON(list)
	})

	// PUT /api/master/announcements/:id - Update an existing announcement
	masterGroup.Put("/announcements/:id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru ID")
		}

		var payload struct {
			Title           *string    `json:"title"`
			Content         *string    `json:"content"`
			BannerType      *string    `json:"banner_type"`
			TargetType      *string    `json:"target_type"`
			TargetTenantIDs *string    `json:"target_tenant_ids"`
			TargetPlans     *string    `json:"target_plans"`
			ShowAsPopup     *bool      `json:"show_as_popup"`
			Dismissible     *bool      `json:"dismissible"`
			IsActive        *bool      `json:"is_active"`
			StartsAt        *time.Time `json:"starts_at"`
			ExpiresAt       *time.Time `json:"expires_at"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru verisi: "+err.Error())
		}

		mdb := svc.DBManager.MasterGorm
		var item models.BroadcastAnnouncement
		if err := mdb.First(&item, id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Duyuru bulunamadı.")
		}

		if payload.Title != nil && strings.TrimSpace(*payload.Title) != "" {
			item.Title = strings.TrimSpace(*payload.Title)
		}
		if payload.Content != nil && strings.TrimSpace(*payload.Content) != "" {
			item.Content = strings.TrimSpace(*payload.Content)
		}
		if payload.BannerType != nil && *payload.BannerType != "" {
			item.BannerType = *payload.BannerType
		}
		if payload.TargetType != nil && *payload.TargetType != "" {
			item.TargetType = *payload.TargetType
		}
		if payload.TargetTenantIDs != nil {
			item.TargetTenantIDs = *payload.TargetTenantIDs
		}
		if payload.TargetPlans != nil {
			item.TargetPlans = *payload.TargetPlans
		}
		if payload.ShowAsPopup != nil {
			item.ShowAsPopup = *payload.ShowAsPopup
		}
		if payload.Dismissible != nil {
			item.Dismissible = *payload.Dismissible
		}
		if payload.IsActive != nil {
			item.IsActive = *payload.IsActive
		}
		if payload.StartsAt != nil {
			item.StartsAt = payload.StartsAt
		}
		if payload.ExpiresAt != nil {
			item.ExpiresAt = payload.ExpiresAt
		}

		if err := mdb.Save(&item).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Duyuru güncellenemedi: "+err.Error())
		}

		// If announcement is active, broadcast update to POS terminals
		if item.IsActive {
			wsData := fiber.Map{
				"id":            item.ID,
				"title":         item.Title,
				"content":       item.Content,
				"banner_type":   item.BannerType,
				"show_as_popup": item.ShowAsPopup,
				"dismissible":   item.Dismissible,
				"target_type":   item.TargetType,
				"created_at":    item.CreatedAt,
				"expires_at":    item.ExpiresAt,
			}
			if item.TargetType == "all" {
				_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
				_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_BROADCAST", wsData)
			} else if item.TargetType == "specific_tenants" {
				var targets []string
				if err := json.Unmarshal([]byte(item.TargetTenantIDs), &targets); err == nil && len(targets) > 0 {
					for _, tCode := range targets {
						_ = svc.Broadcaster.BroadcastToChannel(tCode, "all", "ANNOUNCEMENT_BROADCAST", wsData)
						_ = svc.Broadcaster.BroadcastToChannel(tCode, "pos", "ANNOUNCEMENT_BROADCAST", wsData)
					}
				} else {
					_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
					_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_BROADCAST", wsData)
				}
			} else {
				_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
				_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_BROADCAST", wsData)
			}
		}

		return c.JSON(fiber.Map{
			"success":      true,
			"message":      "Duyuru başarıyla güncellendi.",
			"announcement": item,
		})
	})

	// PATCH & POST /api/master/announcements/:id/toggle - Toggle announcement active/inactive status
	toggleHandler := func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru ID")
		}
		mdb := svc.DBManager.MasterGorm
		var item models.BroadcastAnnouncement
		if err := mdb.First(&item, id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Duyuru bulunamadı.")
		}

		item.IsActive = !item.IsActive
		if err := mdb.Save(&item).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Duyuru durumu güncellenemedi: "+err.Error())
		}

		// Broadcast real-time change to POS clients
		if item.IsActive {
			wsData := fiber.Map{
				"id":            item.ID,
				"title":         item.Title,
				"content":       item.Content,
				"banner_type":   item.BannerType,
				"show_as_popup": item.ShowAsPopup,
				"dismissible":   item.Dismissible,
				"target_type":   item.TargetType,
				"created_at":    item.CreatedAt,
				"expires_at":    item.ExpiresAt,
			}
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
			_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_BROADCAST", wsData)
		} else {
			deactData := fiber.Map{
				"id":      item.ID,
				"message": "Duyuru yayından kaldırıldı",
			}
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_DEACTIVATED", deactData)
			_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_DEACTIVATED", deactData)
		}

		statusMsg := "Duyuru yayına alındı (aktif edildi)."
		if !item.IsActive {
			statusMsg = "Duyuru yayından kaldırıldı (devre dışı bırakıldı)."
		}

		return c.JSON(fiber.Map{
			"success":      true,
			"is_active":    item.IsActive,
			"message":      statusMsg,
			"announcement": item,
		})
	}
	masterGroup.Patch("/announcements/:id/toggle", toggleHandler)
	masterGroup.Post("/announcements/:id/toggle", toggleHandler)

	// PUT /api/master/announcements/:id/status - Explicitly set is_active
	masterGroup.Put("/announcements/:id/status", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru ID")
		}
		var payload struct {
			IsActive bool `json:"is_active"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz durum verisi: "+err.Error())
		}

		mdb := svc.DBManager.MasterGorm
		var item models.BroadcastAnnouncement
		if err := mdb.First(&item, id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Duyuru bulunamadı.")
		}

		item.IsActive = payload.IsActive
		if err := mdb.Save(&item).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Duyuru durumu güncellenemedi: "+err.Error())
		}

		if item.IsActive {
			wsData := fiber.Map{
				"id":            item.ID,
				"title":         item.Title,
				"content":       item.Content,
				"banner_type":   item.BannerType,
				"show_as_popup": item.ShowAsPopup,
				"dismissible":   item.Dismissible,
				"target_type":   item.TargetType,
				"created_at":    item.CreatedAt,
				"expires_at":    item.ExpiresAt,
			}
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_BROADCAST", wsData)
			_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_BROADCAST", wsData)
		} else {
			deactData := fiber.Map{
				"id": item.ID,
			}
			_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_DEACTIVATED", deactData)
			_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_DEACTIVATED", deactData)
		}

		return c.JSON(fiber.Map{
			"success":      true,
			"is_active":    item.IsActive,
			"announcement": item,
		})
	})

	// DELETE /api/master/announcements/:id - Delete an announcement
	masterGroup.Delete("/announcements/:id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru ID")
		}
		mdb := svc.DBManager.MasterGorm
		var item models.BroadcastAnnouncement
		if err := mdb.First(&item, id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Duyuru bulunamadı.")
		}

		// Delete receipt logs first
		_ = mdb.Where("announcement_id = ?", id).Delete(&models.AnnouncementReceipt{}).Error
		if err := mdb.Delete(&item).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Duyuru silinemedi: "+err.Error())
		}

		deactData := fiber.Map{
			"id": id,
		}
		_ = svc.Broadcaster.BroadcastToChannel("", "all", "ANNOUNCEMENT_DEACTIVATED", deactData)
		_ = svc.Broadcaster.BroadcastToChannel("", "pos", "ANNOUNCEMENT_DEACTIVATED", deactData)

		return c.JSON(fiber.Map{
			"success": true,
			"message": "Duyuru başarıyla silindi.",
		})
	})

	// GET /api/announcements/active - Return active announcements for POS clients
	rootApi.Get("/announcements/active", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		mdb := svc.DBManager.MasterGorm
		now := time.Now()

		var announcements []models.BroadcastAnnouncement
		mdb.Where("is_active = ?", true).
			Where("starts_at IS NULL OR starts_at <= ?", now).
			Where("expires_at IS NULL OR expires_at > ?", now).
			Order("id desc").
			Find(&announcements)

		// Filter matching target
		var tenant models.RestaurantTenant
		hasTenant := mdb.Where("code = ?", tenantCode).First(&tenant).Error == nil

		matched := make([]models.BroadcastAnnouncement, 0, len(announcements))
		for _, a := range announcements {
			if a.TargetType == "all" {
				matched = append(matched, a)
				continue
			}
			if a.TargetType == "specific_tenants" {
				var targets []string
				matchedTenant := false
				if err := json.Unmarshal([]byte(a.TargetTenantIDs), &targets); err == nil {
					for _, target := range targets {
						if target == tenantCode {
							matchedTenant = true
							break
						}
					}
				} else {
					for _, part := range strings.Split(a.TargetTenantIDs, ",") {
						if strings.TrimSpace(part) == tenantCode {
							matchedTenant = true
							break
						}
					}
				}
				if matchedTenant {
					matched = append(matched, a)
				}
				continue
			}
			if a.TargetType == "plan" && hasTenant {
				if strings.Contains(a.TargetPlans, tenant.Plan) || strings.Contains(a.TargetPlans, tenant.PlanCode) {
					matched = append(matched, a)
					continue
				}
			}
		}

		return c.JSON(matched)
	})

	// POST /api/announcements/:id/dismiss - POS client dismisses announcement
	rootApi.Post("/announcements/:id/dismiss", func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz duyuru ID")
		}
		tenantCode := middleware.GetTenantCode(c)
		userName := "pos_user"
		if claims := middleware.GetUserClaims(c); claims != nil {
			userName = fmt.Sprintf("user_%d", claims.Sub)
		}

		mdb := svc.DBManager.MasterGorm
		receipt := models.AnnouncementReceipt{
			AnnouncementID:  id,
			TenantCode:      tenantCode,
			DismissedAt:     time.Now(),
			DismissedByUser: userName,
		}
		_ = mdb.Create(&receipt)

		return c.JSON(fiber.Map{
			"success": true,
			"message": "Duyuru kapatıldı.",
		})
	})
}
