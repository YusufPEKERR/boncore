package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// AutoZReportSettings holds the automated daily Z-Report configuration for a tenant.
type AutoZReportSettings struct {
	Enabled       bool   `json:"enabled"`
	Time          string `json:"time"`
	ForceClose    bool   `json:"force_close"`
	LastRunDate   string `json:"last_run_date"`
	LastRunStatus string `json:"last_run_status"`
}

// SaveSettingVal updates or inserts a key-value record in the tenant's restaurant_settings table.
func SaveSettingVal(db *gorm.DB, key string, val interface{}) {
	b, _ := json.Marshal(val)
	strVal := string(b)
	var row models.RestaurantSetting
	if err := db.Where("key = ?", key).First(&row).Error; err == nil {
		row.Value = strVal
		db.Save(&row)
	} else {
		db.Create(&models.RestaurantSetting{
			Key:   key,
			Value: strVal,
		})
	}
}

// GetAutoZReportSettings retrieves the tenant's automated Z-Report configuration with robust fallbacks.
func GetAutoZReportSettings(db *gorm.DB) AutoZReportSettings {
	settings := AutoZReportSettings{
		Enabled:       false,
		Time:          "04:00",
		ForceClose:    true,
		LastRunDate:   "",
		LastRunStatus: "",
	}

	var rows []models.RestaurantSetting
	if err := db.Where("key IN ?", []string{
		"auto_z_report_enabled",
		"auto_z_report_time",
		"auto_z_report_force_close",
		"auto_z_report_last_run_date",
		"auto_z_report_last_run_status",
	}).Find(&rows).Error; err == nil {
		for _, r := range rows {
			switch r.Key {
			case "auto_z_report_enabled":
				var b bool
				if err := json.Unmarshal([]byte(r.Value), &b); err == nil {
					settings.Enabled = b
				} else {
					clean := strings.Trim(strings.TrimSpace(r.Value), `"`)
					settings.Enabled = (clean == "true" || clean == "1")
				}
			case "auto_z_report_time":
				var s string
				if err := json.Unmarshal([]byte(r.Value), &s); err == nil && strings.TrimSpace(s) != "" {
					settings.Time = s
				} else {
					clean := strings.Trim(strings.TrimSpace(r.Value), `"`)
					if clean != "" {
						settings.Time = clean
					}
				}
			case "auto_z_report_force_close":
				var b bool
				if err := json.Unmarshal([]byte(r.Value), &b); err == nil {
					settings.ForceClose = b
				} else {
					clean := strings.Trim(strings.TrimSpace(r.Value), `"`)
					settings.ForceClose = (clean != "false" && clean != "0")
				}
			case "auto_z_report_last_run_date":
				clean := strings.Trim(strings.TrimSpace(r.Value), `"`)
				settings.LastRunDate = clean
			case "auto_z_report_last_run_status":
				clean := strings.Trim(strings.TrimSpace(r.Value), `"`)
				settings.LastRunStatus = clean
			}
		}
	}
	if settings.Time == "" {
		settings.Time = "04:00"
	}
	return settings
}

// SaveAutoZReportSettings saves the automated Z-Report configuration to the tenant database.
func SaveAutoZReportSettings(db *gorm.DB, s AutoZReportSettings) {
	if s.Time == "" {
		s.Time = "04:00"
	}
	SaveSettingVal(db, "auto_z_report_enabled", s.Enabled)
	SaveSettingVal(db, "auto_z_report_time", s.Time)
	SaveSettingVal(db, "auto_z_report_force_close", s.ForceClose)
	if s.LastRunDate != "" {
		SaveSettingVal(db, "auto_z_report_last_run_date", s.LastRunDate)
	}
	if s.LastRunStatus != "" {
		SaveSettingVal(db, "auto_z_report_last_run_status", s.LastRunStatus)
	}
}

// GetOrCreateActiveRegister retrieves the currently active CashRegister or opens one automatically.
func GetOrCreateActiveRegister(db *gorm.DB) models.CashRegister {
	var reg models.CashRegister
	if err := db.Where("status = ?", "open").Order("id desc").First(&reg).Error; err != nil {
		reg = models.CashRegister{
			OpeningFloat: 1500.0,
			OpenedBy:     "Sistem Otomatik",
			Status:       "open",
		}
		db.Create(&reg)
	}
	return reg
}

// CalculateReportSummary calculates total revenues, payments breakdown, expenses, and voids for the register.
func CalculateReportSummary(db *gorm.DB, reg models.CashRegister) fiber.Map {
	var orders []models.Order
	db.Where("created_at >= ?", reg.OpenedAt).Find(&orders)

	var paidOrders, openOrders, cancelledOrders []models.Order
	for _, o := range orders {
		switch o.Status {
		case "paid":
			paidOrders = append(paidOrders, o)
		case "open":
			openOrders = append(openOrders, o)
		case "cancelled":
			cancelledOrders = append(cancelledOrders, o)
		}
	}

	var payments []models.Payment
	db.Where("created_at >= ?", reg.OpenedAt).Find(&payments)

	methodTotals := map[string]float64{
		"cash":         0.0,
		"credit_card":  0.0,
		"multinet":     0.0,
		"sodexo":       0.0,
		"open_account": 0.0,
	}
	totalTips := 0.0
	for _, p := range payments {
		methodTotals[p.PaymentMethod] = Round2(methodTotals[p.PaymentMethod] + p.Amount)
		totalTips = Round2(totalTips + p.TipAmount)
	}

	var expenses []models.CashExpense
	db.Where("created_at >= ?", reg.OpenedAt).Find(&expenses)
	cashIn := 0.0
	cashOut := 0.0
	expensesList := make([]fiber.Map, 0, len(expenses))
	for _, e := range expenses {
		expType := e.ExpenseType
		if expType == "" {
			expType = "out"
		}
		if expType == "in" {
			cashIn += e.Amount
		} else {
			cashOut += e.Amount
		}
		var cStr interface{}
		if !e.CreatedAt.IsZero() {
			cStr = e.CreatedAt.Format(time.RFC3339)
		}
		expensesList = append(expensesList, fiber.Map{
			"id":           e.ID,
			"category":     e.Category,
			"amount":       e.Amount,
			"type":         expType,
			"expense_type": expType,
			"description":  e.Description,
			"created_by":   e.CreatedBy,
			"created_at":   cStr,
		})
	}
	cashIn = Round2(cashIn)
	cashOut = Round2(cashOut)
	totalExpenses := cashOut

	var voidLogs []models.AuditLog
	db.Where("timestamp >= ? AND action_type IN ?", reg.OpenedAt, []string{"VOID_ITEM", "APPLY_DISCOUNT", "TREAT_ITEMS"}).Find(&voidLogs)

	grossSales := 0.0
	totalDiscounts := 0.0
	totalKuver := 0
	for _, o := range paidOrders {
		grossSales += o.Subtotal
		totalDiscounts += o.DiscountAmount
		totalKuver += o.KuverCount
	}
	netSales := 0.0
	for _, v := range methodTotals {
		netSales += v
	}
	cashExpected := Round2(reg.OpeningFloat + methodTotals["cash"] + cashIn - cashOut)

	openOrdersTotal := 0.0
	for _, o := range openOrders {
		openOrdersTotal += o.GrandTotal
	}
	avgTicket := 0.0
	if len(paidOrders) > 0 {
		avgTicket = Round2(netSales / float64(len(paidOrders)))
	}

	vat1Base := Round2(netSales * 0.05)
	vat1Tax := Round2(vat1Base * 0.01)
	vat10Base := Round2(netSales * 0.80)
	vat10Tax := Round2(vat10Base * 0.10)
	vat20Base := Round2(netSales * 0.15)
	vat20Tax := Round2(vat20Base * 0.20)
	totalTax := Round2(vat1Tax + vat10Tax + vat20Tax)

	revenue := Round2(netSales)
	if revenue == 0 && grossSales > 0 {
		revenue = Round2(grossSales)
	}

	var openedAtStr interface{}
	if !reg.OpenedAt.IsZero() {
		openedAtStr = reg.OpenedAt.Format(time.RFC3339)
	}

	return fiber.Map{
		"id":                     reg.ID,
		"register_id":            reg.ID,
		"status":                 reg.Status,
		"opened_at":              openedAtStr,
		"opened_by":              reg.OpenedBy,
		"opening_float":          reg.OpeningFloat,
		"total_orders":           len(paidOrders),
		"paid_orders_count":      len(paidOrders),
		"open_orders_count":      len(openOrders),
		"open_orders_total":      Round2(openOrdersTotal),
		"cancelled_orders_count": len(cancelledOrders),
		"average_ticket":         avgTicket,
		"total_kuver":            totalKuver,
		"gross_sales":            Round2(grossSales),
		"total_revenue":          revenue,
		"total_discounts":        Round2(totalDiscounts),
		"net_sales":              Round2(netSales),
		"total_tips":             totalTips,
		"payment_breakdown":      methodTotals,
		"vat_summary": fiber.Map{
			"vat_1":       vat1Tax,
			"vat_10":      vat10Tax,
			"vat_20":      vat20Tax,
			"vat_1_base":  vat1Base,
			"vat_10_base": vat10Base,
			"vat_20_base": vat20Base,
			"total_vat":   totalTax,
		},
		"total_expenses":         Round2(totalExpenses),
		"cash_in":                cashIn,
		"cash_out":               cashOut,
		"cash_in_drawer":         cashExpected,
		"void_and_discount_logs": len(voidLogs),
		"expenses_list":          expensesList,
	}
}

// ExecuteZReport performs the complete, immutable financial day-end register closure.
func ExecuteZReport(db *gorm.DB, tenantCode string, closedBy string, forceClose bool, hub ws.EventBroadcaster) (fiber.Map, error) {
	if closedBy == "" {
		closedBy = "Müdür"
	}

	reg := GetOrCreateActiveRegister(db)
	summary := CalculateReportSummary(db, reg)

	var openOrders []models.Order
	db.Preload("Table").Where("status = ?", "open").Find(&openOrders)
	if len(openOrders) > 0 {
		if forceClose {
			nowClosed := time.Now().UTC()
			closedNote := fmt.Sprintf("Z-Raporu sırasında (%s tarafından) otomatik kapatıldı", closedBy)
			for i := range openOrders {
				openOrders[i].Status = "cancelled"
				openOrders[i].Notes = &closedNote
				openOrders[i].ClosedAt = &nowClosed
				db.Save(&openOrders[i])
				if openOrders[i].TableID != nil {
					db.Model(&models.Table{}).Where("id = ?", *openOrders[i].TableID).Updates(map[string]interface{}{
						"status":           "empty",
						"current_order_id": nil,
						"opened_at":        nil,
						"kuver_count":      0,
					})
				}
			}
			summary = CalculateReportSummary(db, reg)
		} else {
			var orderDescriptions []string
			for _, o := range openOrders {
				desc := fmt.Sprintf("#%s", o.OrderNo)
				if o.Table != nil {
					desc += fmt.Sprintf(" (%s Masası)", o.Table.Name)
				} else if o.OrderType == "takeaway" {
					desc += " (Gel-Al / Paket)"
				} else if o.OrderType == "delivery" {
					desc += " (Paket Servis)"
				} else {
					desc += " (Hızlı Satış)"
				}
				desc += fmt.Sprintf(" ₺%.2f", o.GrandTotal)
				orderDescriptions = append(orderDescriptions, desc)
			}
			return nil, fmt.Errorf("Açıkta %d adet adisyon var: %s. Z-Raporu almadan önce adisyonu kapatmalı veya iptal etmelisiniz.", len(openOrders), strings.Join(orderDescriptions, ", "))
		}
	}

	now := time.Now().UTC()
	reg.Status = "closed"
	reg.ClosedAt = &now
	reg.ClosedBy = &closedBy
	pBreakdown := summary["payment_breakdown"].(map[string]float64)
	reg.TotalCash = pBreakdown["cash"]
	reg.TotalCard = pBreakdown["credit_card"]
	reg.TotalMultinet = pBreakdown["multinet"]
	reg.TotalSodexo = pBreakdown["sodexo"]
	reg.TotalDiscounts = summary["total_discounts"].(float64)
	reg.TotalExpenses = summary["total_expenses"].(float64)
	reg.TotalRevenue = summary["net_sales"].(float64)
	zNo := fmt.Sprintf("Z-%s-%04d", now.Format("20060102"), reg.ID)
	reg.ZReportNo = &zNo
	db.Save(&reg)

	newReg := models.CashRegister{
		OpeningFloat: 1500.0,
		OpenedBy:     closedBy,
		Status:       "open",
	}
	db.Create(&newReg)

	db.Create(&models.AuditLog{
		ActionType:   "Z_REPORT_CLOSED",
		OperatorName: closedBy,
		OperatorRole: "manager",
		TargetRef:    &zNo,
		Details:      models.JSONMap(summary),
	})

	summary["report_type"] = "Z-RAPORU (GÜN SONU KESİN KAPANIŞ)"
	summary["closed_at"] = now.Format(time.RFC3339)
	summary["closed_by"] = closedBy
	summary["z_report_no"] = zNo

	if hub != nil {
		_ = hub.BroadcastToChannel(tenantCode, "pos", "Z_REPORT_COMPLETED", summary)
	}
	return summary, nil
}

// AutoZReportScheduler runs in the background and periodically checks if any tenant
// is scheduled to generate an automated day-end Z-Report.
type AutoZReportScheduler struct {
	services *Services
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	running  bool
}

// NewAutoZReportScheduler creates a new scheduler instance.
func NewAutoZReportScheduler(services *Services) *AutoZReportScheduler {
	return &AutoZReportScheduler{
		services: services,
	}
}

// Start launches the background scheduler ticker.
func (s *AutoZReportScheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.running = true
	s.mu.Unlock()

	log.Println("[AutoZReportScheduler] Gün sonu otomatik Z-Raporu arka plan servisi başlatıldı.")

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-s.ctx.Done():
				log.Println("[AutoZReportScheduler] Arka plan servisi durduruldu.")
				return
			case <-ticker.C:
				s.checkAllTenants()
			}
		}
	}()
}

// Stop cleanly terminates the background ticker.
func (s *AutoZReportScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	if s.cancel != nil {
		s.cancel()
	}
	s.running = false
}

// checkAllTenants examines every tenant database and triggers Z-Report if the scheduled time has arrived.
func (s *AutoZReportScheduler) checkAllTenants() {
	if s.services == nil || s.services.DBManager == nil {
		return
	}

	tenantCodes := s.services.DBManager.GetAllTenantCodes()
	loc := time.FixedZone("TRT", 3*3600) // Türkiye Saati (UTC+3)
	now := time.Now().In(loc)
	todayStr := now.Format("2006-01-02")
	currentTimeMin := now.Hour()*60 + now.Minute()

	for _, tenantCode := range tenantCodes {
		db, err := s.services.DBManager.GetTenantDB(tenantCode)
		if err != nil || db == nil {
			continue
		}

		settings := GetAutoZReportSettings(db)
		if !settings.Enabled {
			continue
		}

		// Zaten bugün başarıyla otomatik Z-raporu alınmışsa tekrar çalıştırma
		if settings.LastRunDate == todayStr {
			continue
		}

		parts := strings.Split(strings.TrimSpace(settings.Time), ":")
		if len(parts) < 2 {
			continue
		}
		targetHour, errH := strconv.Atoi(parts[0])
		targetMin, errM := strconv.Atoi(parts[1])
		if errH != nil || errM != nil {
			continue
		}
		targetTimeMin := targetHour*60 + targetMin

		// 30 dakikalık tetikleme penceresi kontrolü (gece yarısı devri de desteklenir)
		diff := (currentTimeMin - targetTimeMin + 1440) % 1440
		if diff >= 0 && diff < 30 {
			log.Printf("[AutoZReportScheduler] '%s' kiracısı için otomatik Z-Raporu zamanı geldi (Hedef: %s, Şu an: %s). Başlatılıyor...", tenantCode, settings.Time, now.Format("15:04:05"))

			summary, err := ExecuteZReport(db, tenantCode, "Otomatik Sistem (Z-Raporu)", settings.ForceClose, s.services.Broadcaster)
			if err != nil {
				errMsg := fmt.Sprintf("Hata: %s - %s", err.Error(), now.Format("15:04:05"))
				log.Printf("[AutoZReportScheduler] '%s' kiracısı otomatik Z-Raporu hatası: %v", tenantCode, err)
				settings.LastRunStatus = errMsg
				SaveAutoZReportSettings(db, settings)
			} else {
				zNo, _ := summary["z_report_no"].(string)
				successMsg := fmt.Sprintf("Başarılı (%s) - %s", zNo, now.Format("15:04:05"))
				log.Printf("[AutoZReportScheduler] '%s' kiracısı otomatik Z-Raporu başarıyla tamamlandı: %s", tenantCode, zNo)
				settings.LastRunDate = todayStr
				settings.LastRunStatus = successMsg
				SaveAutoZReportSettings(db, settings)
			}
		}
	}
}
