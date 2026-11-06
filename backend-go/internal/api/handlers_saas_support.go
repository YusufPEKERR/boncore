package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RegisterSaaSSupportRoutes mounts R6 Support & Ticketing Management routes
func RegisterSaaSSupportRoutes(masterGroup fiber.Router, rootApi fiber.Router, svc *service.Services) {
	// Base uploads directory: <sqliteBaseDir>/static/uploads/tickets
	uploadsDir := filepath.Join(svc.DBManager.GetSqliteBaseDir(), "static", "uploads", "tickets")
	_ = os.MkdirAll(uploadsDir, 0755)

	// POST /api/support/tickets - Submit support ticket from POS terminal (accepts multipart/form-data & JSON)
	rootApi.Post("/support/tickets", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		mdb := svc.DBManager.MasterGorm

		var tenant models.RestaurantTenant
		tenantName := tenantCode
		if err := mdb.Where("code = ?", tenantCode).First(&tenant).Error; err == nil && tenant.Name != "" {
			tenantName = tenant.Name
		}

		category := strings.TrimSpace(c.FormValue("category"))
		subject := strings.TrimSpace(c.FormValue("subject"))
		description := strings.TrimSpace(c.FormValue("description"))
		priority := strings.TrimSpace(c.FormValue("priority"))
		submittedByName := strings.TrimSpace(c.FormValue("submitted_by_name"))
		submittedByRole := strings.TrimSpace(c.FormValue("submitted_by_role"))
		deviceInfo := strings.TrimSpace(c.FormValue("device_info"))

		// Also support JSON body if form values are empty
		if subject == "" {
			var jsonPayload struct {
				Category        string `json:"category"`
				Subject         string `json:"subject"`
				Description     string `json:"description"`
				Priority        string `json:"priority"`
				SubmittedByName string `json:"submitted_by_name"`
				SubmittedByRole string `json:"submitted_by_role"`
				DeviceInfo      string `json:"device_info"`
			}
			if err := c.BodyParser(&jsonPayload); err == nil {
				category = jsonPayload.Category
				subject = jsonPayload.Subject
				description = jsonPayload.Description
				priority = jsonPayload.Priority
				submittedByName = jsonPayload.SubmittedByName
				submittedByRole = jsonPayload.SubmittedByRole
				deviceInfo = jsonPayload.DeviceInfo
			}
		}

		if deviceInfo != "" {
			description = description + "\n[Cihaz Bilgisi]: " + deviceInfo
		}

		if subject == "" || description == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Konu (subject) ve açıklama (description) zorunludur.")
		}
		if category == "" {
			category = "other"
		}
		if priority == "" {
			priority = "normal"
		}
		if submittedByName == "" {
			submittedByName = "Kasa Yetkilisi"
		}
		if submittedByRole == "" {
			submittedByRole = "manager"
		}

		// Handle optional screenshot attachment
		var attachmentURL *string
		fileHeader, fErr := c.FormFile("screenshot")
		if fErr == nil && fileHeader != nil {
			randBytes := make([]byte, 8)
			_, _ = rand.Read(randBytes)
			randHex := hex.EncodeToString(randBytes)
			cleanOrigName := filepath.Base(fileHeader.Filename)
			ext := filepath.Ext(cleanOrigName)
			if ext == "" {
				ext = ".png"
			}
			destFilename := fmt.Sprintf("ticket_%s_%s%s", time.Now().Format("20060102150405"), randHex, ext)
			destPath := filepath.Join(uploadsDir, destFilename)

			if sErr := c.SaveFile(fileHeader, destPath); sErr == nil {
				url := "/static/uploads/tickets/" + destFilename
				attachmentURL = &url
			}
		}

		// Generate High-Entropy Ticket Number (e.g. TCK-20260102-A1B2C3)
		randBytes := make([]byte, 3)
		_, _ = rand.Read(randBytes)
		ticketNo := fmt.Sprintf("TCK-%s-%s", time.Now().Format("20060102"), strings.ToUpper(hex.EncodeToString(randBytes)))

		ticket := models.SupportTicket{
			TicketNumber:    ticketNo,
			TenantCode:      tenantCode,
			TenantName:      tenantName,
			SubmittedByName: submittedByName,
			SubmittedByRole: submittedByRole,
			Category:        category,
			Priority:        priority,
			Subject:         subject,
			Description:     description,
			AttachmentURL:   attachmentURL,
			Status:          "new",
		}

		if err := mdb.Create(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Destek talebi oluşturulamadı: "+err.Error())
		}

		// Write initial audit log
		initialAudit := models.SupportTicketAuditLog{
			TicketID:    ticket.ID,
			Action:      "created",
			NewValue:    strPtr("new"),
			PerformedBy: submittedByName,
		}
		mdb.Create(&initialAudit)

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Destek talebiniz başarıyla iletildi.",
			"ticket":  ticket,
		})
	})

	// GET /api/support/tickets - Return current tenant's submitted tickets
	rootApi.Get("/support/tickets", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		mdb := svc.DBManager.MasterGorm
		var tickets []models.SupportTicket
		if err := mdb.Preload("Messages").Where("tenant_code = ?", tenantCode).Order("id desc").Find(&tickets).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Talepler yüklenemedi: "+err.Error())
		}
		return c.JSON(tickets)
	})

	// POST /api/support/tickets/:id/reply - Allow restaurant staff to reply to their ticket
	rootApi.Post("/support/tickets/:id/reply", func(c *fiber.Ctx) error {
		tenantCode := middleware.GetTenantCode(c)
		mdb := svc.DBManager.MasterGorm
		id := c.Params("id")

		var ticket models.SupportTicket
		if err := mdb.Where("(id = ? OR ticket_number = ?) AND tenant_code = ?", id, id, tenantCode).First(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Destek bileti bulunamadı.")
		}

		var payload struct {
			Message    string `json:"message"`
			SenderName string `json:"sender_name"`
		}
		if err := c.BodyParser(&payload); err != nil || strings.TrimSpace(payload.Message) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Mesaj içeriği gereklidir.")
		}

		sName := strings.TrimSpace(payload.SenderName)
		if sName == "" {
			sName = ticket.SubmittedByName
		}
		if sName == "" {
			sName = "Restoran Yetkilisi"
		}

		msg := models.SupportTicketMessage{
			TicketID:   ticket.ID,
			SenderType: "tenant",
			SenderName: sName,
			Message:    strings.TrimSpace(payload.Message),
		}
		if err := mdb.Create(&msg).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mesaj kaydedilemedi: "+err.Error())
		}

		// Reopen if resolved or closed
		if ticket.Status == "resolved" || ticket.Status == "closed" {
			ticket.Status = "in_review"
			mdb.Save(&ticket)
		}

		if svc.WSHub != nil && ticket.TenantCode != "" {
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "pos", "SUPPORT_TICKET_NEW_MESSAGE", fiber.Map{
				"ticket_id":     ticket.ID,
				"ticket_number": ticket.TicketNumber,
				"sender_name":   msg.SenderName,
				"sender_type":   msg.SenderType,
				"message":       msg.Message,
				"created_at":    time.Now().Format(time.RFC3339),
			})
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Cevabınız başarıyla iletildi.",
			"data":    msg,
		})
	})

	// GET /api/master/tickets - List all tickets with status, category, tenant filters
	masterGroup.Get("/tickets", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		query := mdb.Model(&models.SupportTicket{})

		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}
		if category := c.Query("category"); category != "" {
			query = query.Where("category = ?", category)
		}
		if tenantCode := c.Query("tenant_code"); tenantCode != "" {
			query = query.Where("tenant_code = ?", tenantCode)
		}
		if priority := c.Query("priority"); priority != "" {
			query = query.Where("priority = ?", priority)
		}

		var tickets []models.SupportTicket
		if err := query.Order("id desc").Find(&tickets).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Destek biletleri yüklenemedi: "+err.Error())
		}
		return c.JSON(tickets)
	})

	// GET /api/master/tickets/:id - Get ticket details with messages and audit logs
	masterGroup.Get("/tickets/:id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id := c.Params("id")
		mdb := svc.DBManager.MasterGorm

		var ticket models.SupportTicket
		if err := mdb.Where("id = ? OR ticket_number = ?", id, id).First(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Destek bileti bulunamadı: "+id)
		}

		var messages []models.SupportTicketMessage
		mdb.Where("ticket_id = ?", ticket.ID).Order("created_at asc").Find(&messages)

		var logs []models.SupportTicketAuditLog
		mdb.Where("ticket_id = ?", ticket.ID).Order("created_at asc").Find(&logs)

		return c.JSON(fiber.Map{
			"ticket":   ticket,
			"messages": messages,
			"logs":     logs,
		})
	})

	// PUT /api/master/tickets/:id/status - Update ticket lifecycle (new -> in_review -> resolved -> closed)
	masterGroup.Put("/tickets/:id/status", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id := c.Params("id")
		mdb := svc.DBManager.MasterGorm

		var ticket models.SupportTicket
		if err := mdb.Where("id = ? OR ticket_number = ?", id, id).First(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Destek bileti bulunamadı: "+id)
		}

		var payload struct {
			Status          string  `json:"status"`
			AssignedTo      *string `json:"assigned_to"`
			ResolutionNotes *string `json:"resolution_notes"`
			PerformedBy     string  `json:"performed_by"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz durum verisi: "+err.Error())
		}

		oldStatus := ticket.Status
		newStatus := strings.ToLower(strings.TrimSpace(payload.Status))
		if newStatus == "" {
			return fiber.NewError(fiber.StatusBadRequest, "status alanı gereklidir (new, in_review, resolved, closed).")
		}

		performedBy := payload.PerformedBy
		if performedBy == "" {
			performedBy = "Master Admin"
		}

		ticket.Status = newStatus
		if payload.AssignedTo != nil {
			ticket.AssignedTo = payload.AssignedTo
		}
		if payload.ResolutionNotes != nil {
			ticket.ResolutionNotes = payload.ResolutionNotes
		}
		if newStatus == "resolved" || newStatus == "closed" {
			now := time.Now()
			ticket.ResolvedAt = &now
		}

		if err := mdb.Save(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Bilet güncellenemedi: "+err.Error())
		}

		// Record audit log
		audit := models.SupportTicketAuditLog{
			TicketID:    ticket.ID,
			Action:      "status_change",
			OldValue:    &oldStatus,
			NewValue:    &newStatus,
			PerformedBy: performedBy,
		}
		mdb.Create(&audit)

		// Broadcast to tenant via WebSocket
		if svc.WSHub != nil && ticket.TenantCode != "" {
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "pos", "SUPPORT_TICKET_STATUS_CHANGED", fiber.Map{
				"ticket_id":        ticket.ID,
				"ticket_number":    ticket.TicketNumber,
				"subject":          ticket.Subject,
				"status":           ticket.Status,
				"resolution_notes": ticket.ResolutionNotes,
				"updated_at":       time.Now().Format(time.RFC3339),
			})
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "all", "SUPPORT_TICKET_STATUS_CHANGED", fiber.Map{
				"ticket_id":        ticket.ID,
				"ticket_number":    ticket.TicketNumber,
				"subject":          ticket.Subject,
				"status":           ticket.Status,
				"resolution_notes": ticket.ResolutionNotes,
				"updated_at":       time.Now().Format(time.RFC3339),
			})
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("Bilet durumu '%s' olarak güncellendi.", newStatus),
			"ticket":  ticket,
		})
	})

	// POST /api/master/tickets/:id/messages - Add reply message to ticket
	masterGroup.Post("/tickets/:id/messages", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id := c.Params("id")
		mdb := svc.DBManager.MasterGorm

		var ticket models.SupportTicket
		if err := mdb.Where("id = ? OR ticket_number = ?", id, id).First(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Destek bileti bulunamadı: "+id)
		}

		var payload struct {
			Message    string  `json:"message"`
			SenderName string  `json:"sender_name"`
			SenderType string  `json:"sender_type"`
		}
		if err := c.BodyParser(&payload); err != nil || strings.TrimSpace(payload.Message) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Mesaj içeriği gereklidir.")
		}
		if payload.SenderName == "" {
			payload.SenderName = "BonCore Destek Ekibi"
		}
		if payload.SenderType == "" {
			payload.SenderType = "master_admin"
		}

		msg := models.SupportTicketMessage{
			TicketID:   ticket.ID,
			SenderType: payload.SenderType,
			SenderName: payload.SenderName,
			Message:    strings.TrimSpace(payload.Message),
		}
		if err := mdb.Create(&msg).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mesaj kaydedilemedi: "+err.Error())
		}

		// Broadcast to tenant via WebSocket
		if svc.WSHub != nil && ticket.TenantCode != "" {
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "pos", "SUPPORT_TICKET_REPLIED", fiber.Map{
				"ticket_id":     ticket.ID,
				"ticket_number": ticket.TicketNumber,
				"subject":       ticket.Subject,
				"sender_name":   msg.SenderName,
				"sender_type":   msg.SenderType,
				"message":       msg.Message,
				"created_at":    time.Now().Format(time.RFC3339),
			})
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "all", "SUPPORT_TICKET_REPLIED", fiber.Map{
				"ticket_id":     ticket.ID,
				"ticket_number": ticket.TicketNumber,
				"subject":       ticket.Subject,
				"sender_name":   msg.SenderName,
				"sender_type":   msg.SenderType,
				"message":       msg.Message,
				"created_at":    time.Now().Format(time.RFC3339),
			})
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"message": "Cevap başarıyla iletildi.",
			"data":    msg,
		})
	})

	// DELETE /api/master/tickets/:id - Delete ticket and its messages/logs
	masterGroup.Delete("/tickets/:id", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		id := c.Params("id")
		mdb := svc.DBManager.MasterGorm

		var ticket models.SupportTicket
		if err := mdb.Where("id = ? OR ticket_number = ?", id, id).First(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Destek bileti bulunamadı: "+id)
		}

		// Delete associated messages and audit logs
		mdb.Where("ticket_id = ?", ticket.ID).Delete(&models.SupportTicketMessage{})
		mdb.Where("ticket_id = ?", ticket.ID).Delete(&models.SupportTicketAuditLog{})

		// Delete the ticket
		if err := mdb.Delete(&ticket).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Bilet silinemedi: "+err.Error())
		}

		// Broadcast deletion if websocket hub exists
		if svc.WSHub != nil && ticket.TenantCode != "" {
			svc.WSHub.BroadcastToChannel(ticket.TenantCode, "pos", "SUPPORT_TICKET_DELETED", fiber.Map{
				"ticket_id":     ticket.ID,
				"ticket_number": ticket.TicketNumber,
			})
		}

		return c.JSON(fiber.Map{
			"success":   true,
			"message":   fmt.Sprintf("Bilet #%s başarıyla silindi.", ticket.TicketNumber),
			"ticket_id": ticket.ID,
		})
	})

	// POST /api/master/tickets/bulk-delete - Delete multiple tickets at once
	masterGroup.Post("/tickets/bulk-delete", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm

		var payload struct {
			IDs []uint `json:"ids"`
		}
		if err := c.BodyParser(&payload); err != nil || len(payload.IDs) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Silinecek bilet ID listesi gereklidir.")
		}

		mdb.Where("ticket_id IN ?", payload.IDs).Delete(&models.SupportTicketMessage{})
		mdb.Where("ticket_id IN ?", payload.IDs).Delete(&models.SupportTicketAuditLog{})
		if err := mdb.Where("id IN ?", payload.IDs).Delete(&models.SupportTicket{}).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Biletler silinemedi: "+err.Error())
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("%d destek bileti başarıyla silindi.", len(payload.IDs)),
			"count":   len(payload.IDs),
		})
	})
}

func strPtr(s string) *string {
	return &s
}
