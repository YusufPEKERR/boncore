package api

import (
	"errors"
	"fmt"
	"math"
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

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// ensureNotInClosedShift prevents mutating orders, payments, or expenses belonging to a closed Z-Report shift.
func ensureNotInClosedShift(db *gorm.DB, recordTime time.Time) error {
	if db == nil || recordTime.IsZero() {
		return nil
	}
	var lastClosed models.CashRegister
	if err := db.Where("status = ? AND closed_at IS NOT NULL", "closed").Order("closed_at desc").First(&lastClosed).Error; err == nil && lastClosed.ClosedAt != nil {
		if !recordTime.After(*lastClosed.ClosedAt) {
			return fiber.NewError(fiber.StatusConflict, "Kapatılmış Z-Raporu vardiyasına ait kayıtlar değiştirilemez veya silinemez.")
		}
	}
	return nil
}

// resolveAuditOperator derives the audit operator identity from JWT claims whenever authenticated.
func resolveAuditOperator(c *fiber.Ctx, db *gorm.DB, fallbackName, fallbackRole string) (string, string) {
	claims := middleware.GetUserClaims(c)
	if claims != nil {
		if middleware.IsMasterClaims(claims) {
			return "Master Admin", "master_admin"
		}
		if claims.Sub > 0 && db != nil {
			var su models.StaffUser
			if err := db.Select("id, name, username, role").First(&su, claims.Sub).Error; err == nil {
				name := strings.TrimSpace(su.Name)
				if name == "" && su.Username != nil {
					name = strings.TrimSpace(*su.Username)
				}
				role := strings.TrimSpace(su.Role)
				if role == "" {
					role = claims.Role
				}
				if name != "" {
					return name, role
				}
			}
		}
		if strings.TrimSpace(claims.Role) != "" {
			if strings.TrimSpace(fallbackName) != "" {
				return strings.TrimSpace(fallbackName), claims.Role
			}
			return claims.Role, claims.Role
		}
	}
	return fallbackName, fallbackRole
}

func resolveKitchenStationCode(db *gorm.DB, raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" || strings.EqualFold(s, "all") {
		return "all"
	}
	if _, err := strconv.Atoi(s); err == nil {
		groups := loadKitchenGroupsFromSettings(db)
		for _, g := range groups {
			if fmt.Sprintf("%v", g["id"]) == s {
				if code, ok := g["code"].(string); ok && strings.TrimSpace(code) != "" {
					return strings.ToLower(strings.TrimSpace(code))
				}
			}
		}
	}
	return strings.ToLower(s)
}

func resolveServerItemPricing(tx *gorm.DB, itemIn models.OrderItemInput) (models.Product, float64, models.ModifierSlice, float64, error) {
	var prod models.Product
	if itemIn.Quantity <= 0 {
		return prod, 0, nil, 0, fiber.NewError(fiber.StatusBadRequest, "Ürün miktarı sıfırdan büyük olmalıdır.")
	}
	if itemIn.UnitPrice != nil && *itemIn.UnitPrice < 0 {
		return prod, 0, nil, 0, fiber.NewError(fiber.StatusBadRequest, "Ürün birim fiyatı negatif olamaz.")
	}
	if err := tx.Preload("Variants").Preload("ModifierGroups.Options").First(&prod, itemIn.ProductID).Error; err != nil {
		return prod, 0, nil, 0, err
	}

	basePrice := prod.BasePrice
	if prod.BasePrice == 0 && itemIn.UnitPrice != nil {
		basePrice = *itemIn.UnitPrice
	}
	if itemIn.VariantName != nil && strings.TrimSpace(*itemIn.VariantName) != "" {
		vTarget := strings.TrimSpace(*itemIn.VariantName)
		for _, vr := range prod.Variants {
			if strings.EqualFold(strings.TrimSpace(vr.Name), vTarget) {
				basePrice += vr.PriceDelta
				break
			}
		}
	}

	byGroupAndName := make(map[string]float64)
	byName := make(map[string]float64)
	for _, mg := range prod.ModifierGroups {
		gKey := strings.ToLower(strings.TrimSpace(mg.Name))
		for _, opt := range mg.Options {
			oKey := strings.ToLower(strings.TrimSpace(opt.Name))
			byGroupAndName[gKey+"||"+oKey] = opt.Price
			if _, exists := byName[oKey]; !exists {
				byName[oKey] = opt.Price
			}
		}
	}

	modTotal := 0.0
	modsSlice := make(models.ModifierSlice, 0, len(itemIn.SelectedModifiers))
	for _, m := range itemIn.SelectedModifiers {
		gKey := strings.ToLower(strings.TrimSpace(m.Group))
		oKey := strings.ToLower(strings.TrimSpace(m.Name))
		authPrice, ok := byGroupAndName[gKey+"||"+oKey]
		if !ok {
			authPrice = byName[oKey]
		}
		mCopy := m
		mCopy.Price = authPrice
		modsSlice = append(modsSlice, mCopy)
		modTotal += authPrice
	}

	finalUnit := round2(basePrice + modTotal)
	lineTotal := round2(finalUnit * itemIn.Quantity)
	return prod, finalUnit, modsSlice, lineTotal, nil
}

func recalculateOrderTotals(db *gorm.DB, order *models.Order) {
	var items []models.OrderItem
	db.Where("order_id = ?", order.ID).Find(&items)

	subtotal := 0.0
	itemDiscountsTotal := 0.0
	treatTotal := 0.0

	for _, item := range items {
		if item.IsVoided {
			continue
		}
		if item.IsTreat {
			treatTotal += item.TotalPrice
			continue
		}
		subtotal += item.TotalPrice
		itemDiscountsTotal += item.DiscountAmount
	}

	orderDiscountRatio := 0.0
	if netAfterItem := subtotal - itemDiscountsTotal; netAfterItem > 0 && order.DiscountAmount > 0 {
		ratio := order.DiscountAmount / netAfterItem
		if ratio > 1.0 {
			ratio = 1.0
		}
		orderDiscountRatio = ratio
	}
	prodVatMap := service.BuildProductVATMap(db)
	vatBreak := service.CalculateVATBreakdownWithExtras(items, prodVatMap, orderDiscountRatio, order.KuverTotal, order.ServiceCharge)
	taxTotal := vatBreak.TotalTax

	var payments []models.Payment
	db.Where("order_id = ?", order.ID).Find(&payments)
	paidTotal := 0.0
	roundingAdj := 0.0
	for _, p := range payments {
		paidTotal += p.Amount
		roundingAdj += p.RoundingAmount
	}

	totalDiscount := round2(order.DiscountAmount + itemDiscountsTotal)
	order.Subtotal = round2(subtotal)
	order.TreatAmount = round2(treatTotal)
	order.TaxTotal = round2(taxTotal)
	order.GrandTotal = math.Max(0.0, round2(subtotal+order.KuverTotal+order.ServiceCharge-totalDiscount+roundingAdj))
	order.PaidTotal = round2(paidTotal)
	order.RemainingTotal = math.Max(0.0, round2(order.GrandTotal-order.PaidTotal))
}

func getPaymentMethodLabel(m string) string {
	switch m {
	case "cash":
		return "Nakit"
	case "credit_card":
		return "Kredi Kartı"
	case "sodexo":
		return "Sodexo / Multinet"
	case "multinet":
		return "Multinet"
	case "ticket":
		return "Ticket"
	case "meal_card":
		return "Yemek Kartı"
	case "open_account":
		return "Açık Hesap (Cari)"
	case "online":
		return "Online Ödeme"
	default:
		if m == "" {
			return "Nakit"
		}
		return strings.ToUpper(m)
	}
}

func serializeOrder(db *gorm.DB, order *models.Order) fiber.Map {
	var tbl models.Table
	var tableName interface{}
	if order.TableID != nil {
		if err := db.First(&tbl, *order.TableID).Error; err == nil {
			tableName = tbl.Name
		}
	} else {
		if order.OrderType == "takeaway" {
			tableName = "Gel-Al / Hızlı Satış"
		} else if order.OrderType == "online_delivery" {
			tableName = "Paket Servis"
		} else {
			tableName = "Hızlı Satış / Paket"
		}
	}

	var items []models.OrderItem
	db.Where("order_id = ?", order.ID).Order("id asc").Find(&items)
	prodIDs := make([]int, 0, len(items))
	seenProd := make(map[int]bool, len(items))
	for _, it := range items {
		if it.ProductID > 0 && !seenProd[it.ProductID] {
			seenProd[it.ProductID] = true
			prodIDs = append(prodIDs, it.ProductID)
		}
	}
	prodVatMap := service.BuildProductVATMapForIDs(db, prodIDs)

	itemsData := make([]fiber.Map, 0, len(items))
	for _, it := range items {
		pName := it.ProductName
		if pName == "" {
			pName = "Bilinmeyen Ürün"
		}
		station := it.Station
		if station == "" {
			station = "kitchen"
		}
		rawVat, ok := prodVatMap[it.ProductID]
		if !ok {
			rawVat = 10.0
		}
		vatRate := float64(service.NormalizeVATBucket(rawVat))
		mods := it.SelectedModifiers
		if mods == nil {
			mods = models.ModifierSlice{}
		}
		negMods := it.NegativeModifiers
		if negMods == nil {
			negMods = models.StringSlice{}
		}
		addedBy := it.AddedBy
		if addedBy == "" {
			addedBy = order.WaiterName
		}
		var createdStr interface{}
		if !it.CreatedAt.IsZero() {
			createdStr = it.CreatedAt.Format(time.RFC3339)
		}
		itemsData = append(itemsData, fiber.Map{
			"id":                 it.ID,
			"product_id":         it.ProductID,
			"product_name":       pName,
			"station":            station,
			"unit":               "adet",
			"variant_name":       it.VariantName,
			"quantity":           it.Quantity,
			"unit_price":         it.UnitPrice,
			"total_price":        it.TotalPrice,
			"discount_amount":    it.DiscountAmount,
			"discount_rate":      it.DiscountRate,
			"discount_reason":    it.DiscountReason,
			"vat_rate":           vatRate,
			"selected_modifiers": mods,
			"negative_modifiers": negMods,
			"kitchen_note":       it.KitchenNote,
			"course_stage":       it.CourseStage,
			"is_hold":            it.IsHold,
			"status":             it.Status,
			"kds_status":         it.Status,
			"is_paid":            order.Status == "paid",
			"paid_quantity":      0.0,
			"is_void":            it.IsVoided,
			"is_voided":          it.IsVoided,
			"void_reason":        it.VoidReason,
			"is_treat":           it.IsTreat,
			"added_by":           addedBy,
			"created_at":         createdStr,
		})
	}

	var payments []models.Payment
	db.Where("order_id = ?", order.ID).Order("id asc").Find(&payments)
	paymentsData := make([]fiber.Map, 0, len(payments))
	for _, p := range payments {
		var pCreated interface{}
		if !p.CreatedAt.IsZero() {
			pCreated = p.CreatedAt.Format(time.RFC3339)
		}
		paymentsData = append(paymentsData, fiber.Map{
			"id":             p.ID,
			"method":         p.PaymentMethod,
			"payment_method": p.PaymentMethod,
			"label":          getPaymentMethodLabel(p.PaymentMethod),
			"amount":         p.Amount,
			"tip":            p.TipAmount,
			"cashier_name":   p.CashierName,
			"created_at":     pCreated,
		})
	}

	var createdAtStr, closedAtStr interface{}
	if !order.CreatedAt.IsZero() {
		createdAtStr = order.CreatedAt.Format(time.RFC3339)
	}
	if order.ClosedAt != nil && !order.ClosedAt.IsZero() {
		closedAtStr = order.ClosedAt.Format(time.RFC3339)
	}

	return fiber.Map{
		"id":              order.ID,
		"order_id":        order.ID,
		"order_no":        order.OrderNo,
		"order_number":    order.OrderNo,
		"table_id":        order.TableID,
		"table_name":      tableName,
		"order_type":      order.OrderType,
		"status":          order.Status,
		"order_status":    order.Status,
		"waiter_name":     order.WaiterName,
		"cashier_name":    order.CashierName,
		"kuver_count":     order.KuverCount,
		"kuver_total":     order.KuverTotal,
		"subtotal":        order.Subtotal,
		"tax_total":       order.TaxTotal,
		"service_charge":  order.ServiceCharge,
		"discount_amount": order.DiscountAmount,
		"discount_rate":   order.DiscountRate,
		"discount_reason": order.DiscountReason,
		"treat_amount":    order.TreatAmount,
		"treat_reason":    order.TreatReason,
		"grand_total":     order.GrandTotal,
		"paid_total":      order.PaidTotal,
		"remaining_total": order.RemainingTotal,
		"notes":           order.Notes,
		"created_at":      createdAtStr,
		"closed_at":       closedAtStr,
		"items":           itemsData,
		"payments":        paymentsData,
	}
}

// ============================================================================
// 5. ORDERS ROUTER (/api/orders)
// ============================================================================

func RegisterOrdersRoutes(group fiber.Router, svc *service.Services) {
	statsHandler := func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		dateRange := c.Query("date_range")
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")

		trLoc := service.TurkeyLoc()
		startAt, endAt, hasRange := service.ParseTRDateRange(dateRange, startDate, endDate)

		query := db.Model(&models.Order{})
		if hasRange {
			if !startAt.IsZero() {
				query = query.Where("created_at >= ?", startAt)
			}
			if !endAt.IsZero() {
				query = query.Where("created_at < ?", endAt)
			}
		}

		var allOrders []models.Order
		query.Order("created_at desc").Find(&allOrders)

		var paidOrders, openOrders, cancelledOrders []models.Order
		totalRevenue := 0.0
		totalDiscount := 0.0
		orderIDs := make([]int, 0, len(allOrders))
		paidOrderIDs := make([]int, 0)
		tableIDs := map[int]bool{}

		for _, o := range allOrders {
			orderIDs = append(orderIDs, o.ID)
			if o.TableID != nil {
				tableIDs[*o.TableID] = true
			}
			switch o.Status {
			case "paid":
				paidOrders = append(paidOrders, o)
				paidOrderIDs = append(paidOrderIDs, o.ID)
				totalRevenue += o.GrandTotal
				totalDiscount += o.DiscountAmount
			case "open", "bill_requested":
				openOrders = append(openOrders, o)
			case "cancelled":
				cancelledOrders = append(cancelledOrders, o)
			}
		}
		totalRevenue = round2(totalRevenue)
		totalDiscount = round2(totalDiscount)
		avgTicket := 0.0
		if len(paidOrders) > 0 {
			avgTicket = round2(totalRevenue / float64(len(paidOrders)))
		}

		tableMap := map[int]string{}
		if len(tableIDs) > 0 {
			ids := make([]int, 0, len(tableIDs))
			for id := range tableIDs {
				ids = append(ids, id)
			}
			var tbls []models.Table
			db.Where("id IN ?", ids).Find(&tbls)
			for _, t := range tbls {
				tableMap[t.ID] = t.Name
			}
		}

		type payDetail struct {
			Name    string  `json:"name"`
			Amount  float64 `json:"amount"`
			Count   int     `json:"count"`
			Color   string  `json:"color"`
			Percent float64 `json:"percent"`
		}
		paymentMap := map[string]*payDetail{
			"cash":         {Name: "Nakit", Amount: 0, Count: 0, Color: "#10b981"},
			"credit_card":  {Name: "Kredi Kartı", Amount: 0, Count: 0, Color: "#3b82f6"},
			"sodexo":       {Name: "Sodexo / Multinet", Amount: 0, Count: 0, Color: "#8b5cf6"},
			"open_account": {Name: "Açık Hesap (Cari)", Amount: 0, Count: 0, Color: "#f59e0b"},
			"online":       {Name: "Online Tahsilat", Amount: 0, Count: 0, Color: "#ec4899"},
		}
		paymentBreakdownLegacy := map[string]float64{"cash": 0, "credit_card": 0, "multinet": 0, "sodexo": 0, "open_account": 0}

		totalTips := 0.0
		if len(paidOrderIDs) > 0 {
			var payments []models.Payment
			db.Where("order_id IN ?", paidOrderIDs).Find(&payments)
			for _, p := range payments {
				canonical := service.CategorizePaymentMethod(p.PaymentMethod)
				target := service.PaymentBucketGroup(canonical)

				paymentMap[target].Amount = round2(paymentMap[target].Amount + p.Amount)
				paymentMap[target].Count++
				paymentBreakdownLegacy[canonical] = round2(paymentBreakdownLegacy[canonical] + p.Amount)
				totalTips += p.TipAmount
			}
		}
		totalTips = round2(totalTips)

		totalPayAmt := 0.0
		for _, v := range paymentMap {
			totalPayAmt += v.Amount
		}
		if totalPayAmt > 0 {
			for _, v := range paymentMap {
				v.Percent = round2((v.Amount / totalPayAmt) * 100)
			}
		}

		var allItems []models.OrderItem
		if len(orderIDs) > 0 {
			db.Where("order_id IN ?", orderIDs).Find(&allItems)
		}

		prodIDSet := map[int]bool{}
		for _, it := range allItems {
			prodIDSet[it.ProductID] = true
		}
		prodMap := map[int]models.Product{}
		catMap := map[int]models.Category{}
		if len(prodIDSet) > 0 {
			pids := make([]int, 0, len(prodIDSet))
			for id := range prodIDSet {
				pids = append(pids, id)
			}
			var prods []models.Product
			db.Where("id IN ?", pids).Find(&prods)
			for _, p := range prods {
				prodMap[p.ID] = p
			}
			var cats []models.Category
			db.Find(&cats)
			for _, cat := range cats {
				catMap[cat.ID] = cat
			}
		}

		orderStatusMap := map[int]models.Order{}
		for _, o := range allOrders {
			orderStatusMap[o.ID] = o
		}

		type catStat struct {
			Category string  `json:"category"`
			Name     string  `json:"name"`
			Color    string  `json:"color"`
			Quantity float64 `json:"quantity"`
			Count    float64 `json:"count"`
			Revenue  float64 `json:"revenue"`
			Turnover float64 `json:"turnover"`
			Percent  float64 `json:"percent"`
		}
		type prodStat struct {
			ID       int     `json:"id"`
			Name     string  `json:"name"`
			Category string  `json:"category"`
			Quantity float64 `json:"quantity"`
			Revenue  float64 `json:"revenue"`
		}
		catStats := map[string]*catStat{}
		prodStats := map[int]*prodStat{}
		itemsByOrder := map[int][]models.OrderItem{}
		voidItemsList := make([]fiber.Map, 0)
		treatItemsList := make([]fiber.Map, 0)
		itemDiscountByOrder := map[int]float64{}
		voidAmount := 0.0
		voidCount := 0
		treatAmount := 0.0
		treatCount := 0

		for _, it := range allItems {
			itemsByOrder[it.OrderID] = append(itemsByOrder[it.OrderID], it)
			ord := orderStatusMap[it.OrderID]
			prod := prodMap[it.ProductID]
			cat := catMap[prod.CategoryID]
			catName := cat.Name
			if catName == "" {
				catName = "Diğer"
			}
			catColor := cat.Color
			if catColor == "" {
				catColor = "#6366f1"
			}

			tName := "Hızlı Satış"
			if ord.TableID != nil && tableMap[*ord.TableID] != "" {
				tName = tableMap[*ord.TableID]
			}
			itemTime := "--:--"
			if !it.CreatedAt.IsZero() {
				itemTime = it.CreatedAt.In(trLoc).Format("15:04")
			}

			if it.IsVoided {
				voidCount++
				voidAmount += it.TotalPrice
				voidItemsList = append(voidItemsList, fiber.Map{
					"item_id":      it.ID,
					"order_id":     ord.ID,
					"order_no":     ord.OrderNo,
					"table_name":   tName,
					"product_name": it.ProductName,
					"quantity":     it.Quantity,
					"amount":       round2(it.TotalPrice),
					"reason":       it.VoidReason,
					"voided_by":    it.VoidedBy,
					"created_at":   itemTime,
				})
				continue
			}
			if it.IsTreat {
				treatCount++
				treatAmount += it.TotalPrice
				treatItemsList = append(treatItemsList, fiber.Map{
					"item_id":      it.ID,
					"order_id":     ord.ID,
					"order_no":     ord.OrderNo,
					"table_name":   tName,
					"product_name": it.ProductName,
					"quantity":     it.Quantity,
					"amount":       round2(it.TotalPrice),
					"reason":       ord.TreatReason,
					"waiter_name":  ord.WaiterName,
					"created_at":   itemTime,
				})
				continue
			}
			if ord.Status != "cancelled" && it.DiscountAmount > 0 {
				itemDiscountByOrder[it.OrderID] = round2(itemDiscountByOrder[it.OrderID] + it.DiscountAmount)
			}
			if ord.Status == "paid" {
				if _, ok := catStats[catName]; !ok {
					catStats[catName] = &catStat{Category: catName, Name: catName, Color: catColor}
				}
				catStats[catName].Quantity = round2(catStats[catName].Quantity + it.Quantity)
				catStats[catName].Count = catStats[catName].Quantity
				catStats[catName].Revenue = round2(catStats[catName].Revenue + it.TotalPrice)
				catStats[catName].Turnover = catStats[catName].Revenue

				pName := it.ProductName
				if pName == "" {
					pName = prod.Name
				}
				if pName == "" {
					pName = fmt.Sprintf("Ürün #%d", it.ProductID)
				}
				if _, ok := prodStats[it.ProductID]; !ok {
					prodStats[it.ProductID] = &prodStat{ID: it.ProductID, Name: pName, Category: catName}
				}
				prodStats[it.ProductID].Quantity = round2(prodStats[it.ProductID].Quantity + it.Quantity)
				prodStats[it.ProductID].Revenue = round2(prodStats[it.ProductID].Revenue + it.TotalPrice)
			}
		}

		for _, o := range paidOrders {
			totalDiscount += itemDiscountByOrder[o.ID]
		}
		totalDiscount = round2(totalDiscount)

		discountOrdersList := make([]fiber.Map, 0)
		for _, o := range allOrders {
			if o.Status == "cancelled" {
				continue
			}
			totOrdDisc := round2(o.DiscountAmount + itemDiscountByOrder[o.ID])
			if totOrdDisc > 0 {
				tName := "Hızlı Satış"
				if o.TableID != nil && tableMap[*o.TableID] != "" {
					tName = tableMap[*o.TableID]
				}
				discountOrdersList = append(discountOrdersList, fiber.Map{
					"order_id":        o.ID,
					"order_no":        o.OrderNo,
					"table_name":      tName,
					"waiter_name":     o.WaiterName,
					"discount_amount": totOrdDisc,
					"discount_rate":   o.DiscountRate,
					"reason":          o.DiscountReason,
					"grand_total":     o.GrandTotal,
				})
			}
		}

		catList := make([]catStat, 0, len(catStats))
		for _, v := range catStats {
			if totalRevenue > 0 {
				v.Percent = round2((v.Revenue / totalRevenue) * 100)
			}
			catList = append(catList, *v)
		}
		sort.Slice(catList, func(i, j int) bool { return catList[i].Revenue > catList[j].Revenue })

		prodList := make([]prodStat, 0, len(prodStats))
		for _, v := range prodStats {
			prodList = append(prodList, *v)
		}
		sort.Slice(prodList, func(i, j int) bool { return prodList[i].Revenue > prodList[j].Revenue })
		if len(prodList) > 15 {
			prodList = prodList[:15]
		}

		// Hourly slots & 24h buckets
		hourlyBuckets := make([]fiber.Map, 24)
		for h := 0; h < 24; h++ {
			hourlyBuckets[h] = fiber.Map{
				"hour":     fmt.Sprintf("%02d:00", h),
				"orders":   0,
				"revenue":  0.0,
				"turnover": 0.0,
			}
		}

		type slotStat struct {
			TimeRange   string  `json:"time_range"`
			OrdersCount int     `json:"orders_count"`
			Turnover    float64 `json:"turnover"`
			AvgTicket   float64 `json:"avg_ticket"`
			Percent     float64 `json:"percent"`
		}
		hourlySlots := []*slotStat{
			{TimeRange: "00:00 - 08:00"},
			{TimeRange: "08:00 - 10:00"},
			{TimeRange: "10:00 - 12:00"},
			{TimeRange: "12:00 - 14:00"},
			{TimeRange: "14:00 - 16:00"},
			{TimeRange: "16:00 - 18:00"},
			{TimeRange: "18:00 - 20:00"},
			{TimeRange: "20:00 - 22:00"},
			{TimeRange: "22:00 - 00:00"},
		}

		type waiterStat struct {
			Name        string  `json:"name"`
			WaiterName  string  `json:"waiter_name"`
			Orders      int     `json:"orders"`
			OrdersCount int     `json:"orders_count"`
			Revenue     float64 `json:"revenue"`
			TotalSales  float64 `json:"total_sales"`
			AvgTicket   float64 `json:"avg_ticket"`
			AvgBill     float64 `json:"avg_bill"`
			ItemsCount  int     `json:"items_count"`
			TotalKuver  int     `json:"total_kuver"`
			TotalTip    float64 `json:"total_tip"`
			Share       float64 `json:"share"`
			Badge       string  `json:"badge"`
		}
		waiterStats := map[string]*waiterStat{}

		type tblStat struct {
			TableID   int     `json:"table_id"`
			TableName string  `json:"table_name"`
			Orders    int     `json:"orders"`
			Revenue   float64 `json:"revenue"`
		}
		tblStats := map[int]*tblStat{}

		orderTypeStats := map[string]fiber.Map{
			"dine_in":  {"type": "Masa Siparişi", "orders": 0, "revenue": 0.0},
			"takeaway": {"type": "Gel-Al / Paket", "orders": 0, "revenue": 0.0},
			"delivery": {"type": "Kurye Teslimat", "orders": 0, "revenue": 0.0},
		}

		channelCounts := map[string]int{"dine_in": 0, "takeaway": 0, "delivery": 0, "qr_order": 0}
		channelTurnover := map[string]float64{"dine_in": 0, "takeaway": 0, "delivery": 0, "qr_order": 0}
		channelKuver := map[string]int{"dine_in": 0, "takeaway": 0, "delivery": 0, "qr_order": 0}
		channelStaySum := map[string]float64{}
		channelStayCount := map[string]int{}

		weekdayBuckets := make([]float64, 7)
		weekdayOrders := make([]int, 7)
		weekDayNames := []string{"Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"}

		for _, o := range paidOrders {
			if !o.CreatedAt.IsZero() {
				trT := o.CreatedAt.In(trLoc)
				h := trT.Hour()
				hourlyBuckets[h]["orders"] = hourlyBuckets[h]["orders"].(int) + 1
				hourlyBuckets[h]["revenue"] = round2(hourlyBuckets[h]["revenue"].(float64) + o.GrandTotal)
				hourlyBuckets[h]["turnover"] = hourlyBuckets[h]["revenue"]

				slotIdx := 0
				if h >= 8 {
					slotIdx = ((h - 8) / 2) + 1
					if slotIdx > 8 {
						slotIdx = 8
					}
				}
				hourlySlots[slotIdx].OrdersCount++
				hourlySlots[slotIdx].Turnover = round2(hourlySlots[slotIdx].Turnover + o.GrandTotal)

				wd := int(trT.Weekday())
				trWd := (wd + 6) % 7
				weekdayBuckets[trWd] = round2(weekdayBuckets[trWd] + o.GrandTotal)
				weekdayOrders[trWd]++
			}
			wName := o.WaiterName
			if wName == "" {
				wName = "Garson"
			}
			if _, ok := waiterStats[wName]; !ok {
				waiterStats[wName] = &waiterStat{Name: wName, WaiterName: wName}
			}
			waiterStats[wName].Orders++
			waiterStats[wName].OrdersCount++
			waiterStats[wName].Revenue = round2(waiterStats[wName].Revenue + o.GrandTotal)
			waiterStats[wName].TotalSales = waiterStats[wName].Revenue
			waiterStats[wName].TotalKuver += o.KuverCount
			if o.KuverCount == 0 {
				waiterStats[wName].TotalKuver++
			}

			if o.TableID != nil {
				tid := *o.TableID
				tName := tableMap[tid]
				if tName == "" {
					tName = fmt.Sprintf("Masa %d", tid)
				}
				if _, ok := tblStats[tid]; !ok {
					tblStats[tid] = &tblStat{TableID: tid, TableName: tName}
				}
				tblStats[tid].Orders++
				tblStats[tid].Revenue = round2(tblStats[tid].Revenue + o.GrandTotal)
			}

			oType := strings.ToLower(o.OrderType)
			if oType == "" {
				oType = "dine_in"
			}
			chTarget := "dine_in"
			if strings.Contains(oType, "deliv") || strings.Contains(oType, "kurye") {
				chTarget = "delivery"
			} else if strings.Contains(oType, "take") || strings.Contains(oType, "gel") {
				chTarget = "takeaway"
			} else if strings.Contains(oType, "qr") {
				chTarget = "qr_order"
			}
			channelCounts[chTarget]++
			channelTurnover[chTarget] = round2(channelTurnover[chTarget] + o.GrandTotal)
			channelKuver[chTarget] += o.KuverCount
			if o.KuverCount == 0 {
				channelKuver[chTarget]++
			}
			if o.ClosedAt != nil && !o.CreatedAt.IsZero() {
				if durMin := o.ClosedAt.Sub(o.CreatedAt).Minutes(); durMin >= 0 {
					channelStaySum[chTarget] += durMin
					channelStayCount[chTarget]++
				}
			}

			if _, ok := orderTypeStats[chTarget]; ok {
				orderTypeStats[chTarget]["orders"] = orderTypeStats[chTarget]["orders"].(int) + 1
				orderTypeStats[chTarget]["revenue"] = round2(orderTypeStats[chTarget]["revenue"].(float64) + o.GrandTotal)
			}
		}

		for _, s := range hourlySlots {
			if s.OrdersCount > 0 {
				s.AvgTicket = round2(s.Turnover / float64(s.OrdersCount))
			}
			if totalRevenue > 0 {
				s.Percent = round2((s.Turnover / totalRevenue) * 100)
			}
		}

		weeklyTrend := make([]fiber.Map, 7)
		for i := 0; i < 7; i++ {
			weeklyTrend[i] = fiber.Map{
				"day":      weekDayNames[i],
				"turnover": weekdayBuckets[i],
				"orders":   weekdayOrders[i],
			}
		}

		chartHours := make([]fiber.Map, 0, 24)
		for h := 0; h < 24; h++ {
			b := hourlyBuckets[h]
			chartHours = append(chartHours, fiber.Map{
				"hour":     b["hour"],
				"turnover": b["revenue"],
				"orders":   b["orders"],
			})
		}

		waiterList := make([]waiterStat, 0, len(waiterStats))
		for _, w := range waiterStats {
			if w.Orders > 0 {
				w.AvgTicket = round2(w.Revenue / float64(w.Orders))
				w.AvgBill = w.AvgTicket
			}
			if totalRevenue > 0 {
				w.Share = round2((w.Revenue / totalRevenue) * 100)
			}
			waiterList = append(waiterList, *w)
		}
		sort.Slice(waiterList, func(i, j int) bool { return waiterList[i].Revenue > waiterList[j].Revenue })
		badges := []string{"Günün Yıldızı", "En Yüksek Ciro", "Hızlı Servis", "Aktif Personel"}
		for i := range waiterList {
			if i < len(badges) {
				waiterList[i].Badge = badges[i]
			} else {
				waiterList[i].Badge = "Görevde"
			}
		}

		tblList := make([]tblStat, 0, len(tblStats))
		for _, t := range tblStats {
			tblList = append(tblList, *t)
		}
		sort.Slice(tblList, func(i, j int) bool { return tblList[i].Revenue > tblList[j].Revenue })
		if len(tblList) > 10 {
			tblList = tblList[:10]
		}

		limitCount := len(allOrders)
		if limitCount > 20 {
			limitCount = 20
		}
		recentIDs := make([]int, 0, limitCount)
		for i := 0; i < limitCount; i++ {
			recentIDs = append(recentIDs, allOrders[i].ID)
		}
		recentPayMethods := map[int][]string{}
		if len(recentIDs) > 0 {
			var rPays []models.Payment
			db.Where("order_id IN ?", recentIDs).Order("id asc").Find(&rPays)
			for _, p := range rPays {
				recentPayMethods[p.OrderID] = append(recentPayMethods[p.OrderID], p.PaymentMethod)
			}
		}

		recentBills := make([]fiber.Map, 0, limitCount)
		for i := 0; i < limitCount; i++ {
			o := allOrders[i]
			tName := ""
			if o.TableID != nil {
				tName = tableMap[*o.TableID]
			}
			if tName == "" {
				if o.OrderType == "delivery" || o.OrderType == "online_delivery" {
					tName = fmt.Sprintf("Paket #%d", o.ID)
				} else {
					tName = "Hızlı Satış"
				}
			}
			tStr := "--:--"
			if !o.CreatedAt.IsZero() {
				tStr = o.CreatedAt.In(trLoc).Format("15:04")
			}
			stName := "Açık"
			switch o.Status {
			case "paid":
				stName = "Ödendi"
			case "bill_requested":
				stName = "Hesap İstendi"
			case "cancelled":
				stName = "İptal Edildi"
			}
			methods := recentPayMethods[o.ID]
			pmStr := "Açık Masa"
			if o.Status == "cancelled" {
				pmStr = "İptal Edildi"
			} else if len(methods) > 1 {
				pmStr = "Parçalı Ödeme"
			} else if len(methods) == 1 {
				pmStr = getPaymentMethodLabel(methods[0])
			} else if o.Status == "bill_requested" {
				pmStr = "Hesap Bekliyor"
			} else if o.Status == "paid" {
				pmStr = "Tahsil Edildi"
			}
			recentBills = append(recentBills, fiber.Map{
				"id":             o.ID,
				"order_no":       o.OrderNo,
				"table_name":     tName,
				"waiter":         o.WaiterName,
				"time":           tStr,
				"grand_total":    o.GrandTotal,
				"status":         stName,
				"payment_method": pmStr,
			})
		}

		var couriers []models.Courier
		db.Find(&couriers)
		var deliveryOrders []models.DeliveryOrder
		delQuery := db.Preload("Order").Joins("JOIN orders ON orders.id = delivery_orders.order_id")
		if hasRange {
			if !startAt.IsZero() {
				delQuery = delQuery.Where("orders.created_at >= ?", startAt)
			}
			if !endAt.IsZero() {
				delQuery = delQuery.Where("orders.created_at < ?", endAt)
			}
		}
		delQuery.Order("delivery_orders.id desc").Limit(200).Find(&deliveryOrders)

		courierDeliveryCounts := map[int]int{}
		courierDurSum := map[int]float64{}
		courierDurCount := map[int]int{}
		onTheWayCount := 0
		deliveredCount := 0
		cancelledDeliveryCount := 0
		deliveryPlatformTurnover := map[string]float64{}
		deliveryPlatformOrders := map[string]int{}
		deliveryTotalTurnover := 0.0
		deliveryTotalOrders := 0

		for _, do := range deliveryOrders {
			if do.CourierID != nil {
				courierDeliveryCounts[*do.CourierID]++
				if do.DispatchedAt != nil && do.DeliveredAt != nil {
					if dm := do.DeliveredAt.Sub(*do.DispatchedAt).Minutes(); dm >= 0 {
						courierDurSum[*do.CourierID] += dm
						courierDurCount[*do.CourierID]++
					}
				}
			}
			cStat := strings.ToLower(do.CourierStatus)
			ordCancelled := do.Order != nil && do.Order.Status == "cancelled"
			ordPaid := do.Order != nil && do.Order.Status == "paid"
			if ordCancelled || cStat == "cancelled" {
				cancelledDeliveryCount++
				continue
			}
			if cStat == "delivered" || ordPaid {
				deliveredCount++
			} else if cStat == "on_the_way" || cStat == "dispatched" || cStat == "assigned" {
				onTheWayCount++
			}
			amt := 0.0
			if do.Order != nil {
				amt = do.Order.GrandTotal
			}
			pKey := "Telefon / Restoran"
			pLow := strings.ToLower(do.Platform)
			if strings.Contains(pLow, "yemeksepeti") {
				pKey = "Yemeksepeti"
			} else if strings.Contains(pLow, "getir") {
				pKey = "Getir Yemek"
			} else if strings.Contains(pLow, "trendyol") {
				pKey = "Trendyol Yemek"
			} else if strings.Contains(pLow, "migros") {
				pKey = "Migros Yemek"
			}
			deliveryPlatformOrders[pKey]++
			deliveryPlatformTurnover[pKey] = round2(deliveryPlatformTurnover[pKey] + amt)
			deliveryTotalOrders++
			deliveryTotalTurnover = round2(deliveryTotalTurnover + amt)
		}

		courierList := make([]fiber.Map, 0, len(couriers))
		for _, cr := range couriers {
			cStat := "Müsait"
			if !cr.IsActive {
				cStat = "Pasif"
			}
			avgTime := "--"
			if cnt := courierDurCount[cr.ID]; cnt > 0 {
				avgTime = fmt.Sprintf("%d dk", int(math.Round(courierDurSum[cr.ID]/float64(cnt))))
			}
			courierList = append(courierList, fiber.Map{
				"id":               cr.ID,
				"name":             cr.Name,
				"phone":            cr.Phone,
				"plate":            cr.VehiclePlate,
				"is_active":        cr.IsActive,
				"cash_collected":   cr.CashCollected,
				"card_collected":   cr.CardSlipsCollected,
				"deliveries_count": courierDeliveryCounts[cr.ID],
				"avg_time":         avgTime,
				"status":           cStat,
			})
		}

		formatAvgStay := func(ch string) string {
			cnt := channelStayCount[ch]
			if cnt == 0 {
				return "--"
			}
			return fmt.Sprintf("%d dk", int(math.Round(channelStaySum[ch]/float64(cnt))))
		}

		totalChTurnover := channelTurnover["dine_in"] + channelTurnover["delivery"] + channelTurnover["takeaway"] + channelTurnover["qr_order"]
		channelsList := []fiber.Map{
			{
				"id":          "dine_in",
				"name":        "Salon / Masa",
				"description": "Masa içi servis & kuver",
				"orders":      channelCounts["dine_in"],
				"turnover":    channelTurnover["dine_in"],
				"share":       0.0,
				"avg_ticket":  0.0,
				"kuver":       channelKuver["dine_in"],
				"avg_stay":    formatAvgStay("dine_in"),
				"color":       "emerald",
			},
			{
				"id":          "delivery",
				"name":        "Paket Servis (Kurye)",
				"description": "Telefon & Entegrasyonlar",
				"orders":      channelCounts["delivery"],
				"turnover":    channelTurnover["delivery"],
				"share":       0.0,
				"avg_ticket":  0.0,
				"kuver":       channelKuver["delivery"],
				"avg_stay":    formatAvgStay("delivery"),
				"color":       "rose",
			},
			{
				"id":          "takeaway",
				"name":        "Gel-Al (Tezgah)",
				"description": "Müşteri teslimatları",
				"orders":      channelCounts["takeaway"],
				"turnover":    channelTurnover["takeaway"],
				"share":       0.0,
				"avg_ticket":  0.0,
				"kuver":       channelKuver["takeaway"],
				"avg_stay":    formatAvgStay("takeaway"),
				"color":       "amber",
			},
			{
				"id":          "qr_order",
				"name":        "Masadan QR Sipariş",
				"description": "Temassız dijital menü",
				"orders":      channelCounts["qr_order"],
				"turnover":    channelTurnover["qr_order"],
				"share":       0.0,
				"avg_ticket":  0.0,
				"kuver":       channelKuver["qr_order"],
				"avg_stay":    formatAvgStay("qr_order"),
				"color":       "blue",
			},
		}
		for _, ch := range channelsList {
			ordCount := ch["orders"].(int)
			tOver := ch["turnover"].(float64)
			if totalChTurnover > 0 {
				ch["share"] = round2((tOver / totalChTurnover) * 100)
			}
			if ordCount > 0 {
				ch["avg_ticket"] = round2(tOver / float64(ordCount))
			}
		}

		var expenses []models.CashExpense
		expQuery := db.Where("expense_type != ? OR expense_type IS NULL", "in")
		if hasRange {
			if !startAt.IsZero() {
				expQuery = expQuery.Where("created_at >= ?", startAt)
			}
			if !endAt.IsZero() {
				expQuery = expQuery.Where("created_at < ?", endAt)
			}
		}
		expQuery.Find(&expenses)
		totalExpenses := 0.0
		for _, e := range expenses {
			totalExpenses += e.Amount
		}
		totalExpenses = round2(totalExpenses)

		grossSales := round2(totalRevenue + totalDiscount + treatAmount)

		platformDefs := []struct {
			Name  string
			Badge string
		}{
			{"Telefon / Restoran", "bg-slate-700"},
			{"Yemeksepeti", "bg-rose-600"},
			{"Getir Yemek", "bg-purple-600"},
			{"Trendyol Yemek", "bg-orange-500"},
			{"Migros Yemek", "bg-amber-600"},
		}
		deliveryPlatforms := make([]fiber.Map, 0, len(platformDefs))
		for _, pf := range platformDefs {
			pTurn := deliveryPlatformTurnover[pf.Name]
			share := 0.0
			if deliveryTotalTurnover > 0 {
				share = round2((pTurn / deliveryTotalTurnover) * 100)
			}
			deliveryPlatforms = append(deliveryPlatforms, fiber.Map{
				"name":     pf.Name,
				"orders":   deliveryPlatformOrders[pf.Name],
				"turnover": pTurn,
				"share":    share,
				"badge":    pf.Badge,
			})
		}

		deliveryAvgTicket := 0.0
		if deliveryTotalOrders > 0 {
			deliveryAvgTicket = round2(deliveryTotalTurnover / float64(deliveryTotalOrders))
		} else if channelCounts["delivery"] > 0 {
			deliveryAvgTicket = round2(channelTurnover["delivery"] / float64(channelCounts["delivery"]))
		}

		prodVatMap := service.BuildProductVATMap(db)
		vatBreak := service.CalculateOrdersVATBreakdown(paidOrders, itemsByOrder, prodVatMap)

		payDistList := make([]payDetail, 0, len(paymentMap))
		for _, v := range paymentMap {
			payDistList = append(payDistList, *v)
		}

		return c.JSON(fiber.Map{
			"total_turnover":  totalRevenue,
			"total_revenue":   totalRevenue,
			"total_orders":    len(allOrders),
			"average_ticket":  avgTicket,
			"total_discounts": totalDiscount,
			"total_treats":    round2(treatAmount),
			"waiters":         waiterList,

			"daily_turnover": fiber.Map{
				"gross_sales":       grossSales,
				"net_sales":         totalRevenue,
				"total_discounts":   totalDiscount,
				"total_treats":      round2(treatAmount),
				"payment_breakdown": paymentMap,
				"vat_summary": fiber.Map{
					"vat_1":  fiber.Map{"rate": "%1", "base": round2(vatBreak.Vat1Base), "tax": round2(vatBreak.Vat1Tax)},
					"vat_10": fiber.Map{"rate": "%10", "base": round2(vatBreak.Vat10Base), "tax": round2(vatBreak.Vat10Tax)},
					"vat_20": fiber.Map{"rate": "%20", "base": round2(vatBreak.Vat20Base), "tax": round2(vatBreak.Vat20Tax)},
				},
				"hourly_breakdown": hourlySlots,
				"recent_bills":     recentBills,
			},

			"chart_data": fiber.Map{
				"hourly_sales":         chartHours,
				"weekly_trend":         weeklyTrend,
				"category_sales":       catList,
				"payment_distribution": payDistList,
			},

			"delivery": fiber.Map{
				"total_turnover": deliveryTotalTurnover,
				"total_orders":   deliveryTotalOrders,
				"avg_ticket":     deliveryAvgTicket,
				"on_the_way":     onTheWayCount,
				"delivered":      deliveredCount,
				"cancelled":      cancelledDeliveryCount,
				"platforms":      deliveryPlatforms,
				"couriers":       courierList,
				"orders":         deliveryOrders,
			},

			"channels": fiber.Map{
				"channels":       channelsList,
				"total_turnover": round2(totalChTurnover),
			},

			"complimentary": fiber.Map{
				"total_treats":    round2(treatAmount),
				"total_voids":     round2(voidAmount),
				"total_discounts": totalDiscount,
				"treat_items":     treatItemsList,
				"void_items":      voidItemsList,
				"discount_orders": discountOrdersList,
			},

			"kpi": fiber.Map{
				"total_revenue":        totalRevenue,
				"net_profit_after_exp": round2(totalRevenue - totalExpenses),
				"total_expenses":       totalExpenses,
				"total_orders":         len(allOrders),
				"paid_orders_count":    len(paidOrders),
				"open_orders_count":    len(openOrders),
				"cancelled_orders":     len(cancelledOrders),
				"avg_ticket":           avgTicket,
				"total_discount":       totalDiscount,
				"total_tips":           totalTips,
				"void_count":           voidCount,
				"void_amount":          round2(voidAmount),
				"treat_count":          treatCount,
				"treat_amount":         round2(treatAmount),
			},
			"payment_breakdown": paymentBreakdownLegacy,
			"category_sales":    catList,
			"top_products":      prodList,
			"hourly_sales":      hourlyBuckets,
			"waiter_sales":      waiterList,
			"table_sales":       tblList,
			"order_types": []fiber.Map{
				orderTypeStats["dine_in"],
				orderTypeStats["takeaway"],
				orderTypeStats["delivery"],
			},
		})
	}

	group.Get("/analytics/statistics", statsHandler)
	group.Get("/reports/restaurant-statistics", statsHandler)

	group.Get("/reports/product-sales", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")
		dateRange := c.Query("date_range", "all")
		categoryID := c.QueryInt("category_id", 0)
		stationFilter := resolveKitchenStationCode(db, c.Query("station", "all"))
		searchFilter := strings.ToLower(strings.TrimSpace(c.Query("search", "")))

		startAt, endAt, hasRange := service.ParseTRDateRange(dateRange, startDate, endDate)

		query := db.Model(&models.Order{}).Where("status = ?", "paid")
		if hasRange {
			if !startAt.IsZero() {
				query = query.Where("created_at >= ?", startAt)
			}
			if !endAt.IsZero() {
				query = query.Where("created_at < ?", endAt)
			}
		}

		var paidOrders []models.Order
		query.Find(&paidOrders)
		orderIDs := make([]int, 0, len(paidOrders))
		for _, o := range paidOrders {
			orderIDs = append(orderIDs, o.ID)
		}

		var items []models.OrderItem
		if len(orderIDs) > 0 {
			db.Where("order_id IN ? AND is_voided = ?", orderIDs, false).Find(&items)
		}

		var allProds []models.Product
		db.Find(&allProds)
		prodMap := map[int]models.Product{}
		for _, p := range allProds {
			prodMap[p.ID] = p
		}

		var allCats []models.Category
		db.Find(&allCats)
		catMap := map[int]models.Category{}
		categoriesFilter := make([]fiber.Map, 0, len(allCats))
		for _, cat := range allCats {
			catMap[cat.ID] = cat
			categoriesFilter = append(categoriesFilter, fiber.Map{
				"id":   cat.ID,
				"name": cat.Name,
			})
		}

		var recipes []models.Recipe
		db.Find(&recipes)
		var ingredients []models.Ingredient
		db.Find(&ingredients)
		ingMap := map[int]models.Ingredient{}
		for _, ing := range ingredients {
			ingMap[ing.ID] = ing
		}
		unitCosts := map[int]float64{}
		hasRecipeMap := map[int]bool{}
		for _, r := range recipes {
			if ing, ok := ingMap[r.IngredientID]; ok {
				effAmt := r.Amount * (1.0 + r.WastePercentage/100.0)
				unitCosts[r.ProductID] += effAmt * ing.CostPerUnit
				hasRecipeMap[r.ProductID] = true
			}
		}

		type pSale struct {
			ProductID           int     `json:"product_id"`
			ProductName         string  `json:"product_name"`
			Name                string  `json:"name"`
			CategoryID          int     `json:"category_id"`
			CategoryName        string  `json:"category_name"`
			Category            string  `json:"category"`
			CategoryColor       string  `json:"category_color"`
			Station             string  `json:"station"`
			Unit                string  `json:"unit"`
			ImageURL            *string `json:"image_url,omitempty"`
			VatRate             int     `json:"vat_rate"`
			HasRecipe           bool    `json:"has_recipe"`
			UnitPrice           float64 `json:"unit_price"`
			AvgPrice            float64 `json:"avg_price"`
			UnitCost            float64 `json:"unit_cost"`
			Quantity            float64 `json:"quantity"`
			TotalQuantity       float64 `json:"total_quantity"`
			Revenue             float64 `json:"revenue"`
			TotalTurnover       float64 `json:"total_turnover"`
			TotalCost           float64 `json:"total_cost"`
			Profit              float64 `json:"profit"`
			OrdersCount         int     `json:"orders_count"`
			TreatCount          int     `json:"treat_count"`
			ProfitMargin        float64 `json:"profit_margin"`
			ProfitMarginPercent float64 `json:"profit_margin_percent"`
			RevenueShare        float64 `json:"revenue_share"`
			SharePercent        float64 `json:"share_percent"`
		}
		salesMap := map[int]*pSale{}
		totalQty := 0.0
		totalRev := 0.0
		totalCost := 0.0

		for _, it := range items {
			prod := prodMap[it.ProductID]
			pName := it.ProductName
			if pName == "" {
				pName = prod.Name
			}
			if pName == "" {
				pName = fmt.Sprintf("Ürün #%d", it.ProductID)
			}
			cat := catMap[prod.CategoryID]
			catName := cat.Name
			if catName == "" {
				catName = "Diğer"
			}
			catColor := cat.Color
			if catColor == "" {
				catColor = "#6366f1"
			}

			// Category filter
			if categoryID > 0 && prod.CategoryID != categoryID {
				continue
			}

			// Station filter
			stName := strings.ToLower(it.Station)
			if stName == "" {
				stName = strings.ToLower(prod.Station)
			}
			if stName == "" {
				stName = "kitchen"
			}
			if stationFilter != "" && stationFilter != "all" && stName != stationFilter {
				continue
			}

			// Search query filter
			if searchFilter != "" {
				if !strings.Contains(strings.ToLower(pName), searchFilter) && !strings.Contains(strings.ToLower(catName), searchFilter) {
					continue
				}
			}

			uCost := unitCosts[it.ProductID]
			hasRecipe := hasRecipeMap[it.ProductID]
			pUnit := "Porsiyon"

			if _, exists := salesMap[it.ProductID]; !exists {
				salesMap[it.ProductID] = &pSale{
					ProductID:     it.ProductID,
					ProductName:   pName,
					Name:          pName,
					CategoryID:    prod.CategoryID,
					CategoryName:  catName,
					Category:      catName,
					CategoryColor: catColor,
					Station:       stName,
					Unit:          pUnit,
					ImageURL:      prod.ImageURL,
					VatRate:       int(prod.VatRate),
					HasRecipe:     hasRecipe,
					UnitPrice:     it.UnitPrice,
					AvgPrice:      it.UnitPrice,
					UnitCost:      round2(uCost),
				}
			}
			st := salesMap[it.ProductID]
			itemCost := round2(uCost * it.Quantity)

			if it.IsTreat {
				st.TreatCount += int(it.Quantity)
			} else {
				st.Quantity = round2(st.Quantity + it.Quantity)
				st.TotalQuantity = st.Quantity
				st.Revenue = round2(st.Revenue + it.TotalPrice)
				st.TotalTurnover = st.Revenue
				st.TotalCost = round2(st.TotalCost + itemCost)
				st.Profit = round2(st.Revenue - st.TotalCost)
				st.OrdersCount++

				totalQty += it.Quantity
				totalRev += it.TotalPrice
				totalCost += itemCost
			}
		}

		productsList := make([]pSale, 0, len(salesMap))
		catAgg := map[string]*fiber.Map{}
		topByTurnover := "-"
		topByQuantity := "-"
		var maxTurnover, maxQuantity float64

		for _, p := range salesMap {
			if p.Revenue > 0 {
				p.ProfitMargin = round2((p.Profit / p.Revenue) * 100)
				p.ProfitMarginPercent = p.ProfitMargin
			}
			if totalRev > 0 {
				p.RevenueShare = round2((p.Revenue / totalRev) * 100)
				p.SharePercent = p.RevenueShare
			}
			if p.TotalQuantity > 0 {
				p.AvgPrice = round2(p.TotalTurnover / p.TotalQuantity)
			}

			if p.Revenue > maxTurnover {
				maxTurnover = p.Revenue
				topByTurnover = p.ProductName
			}
			if p.TotalQuantity > maxQuantity {
				maxQuantity = p.TotalQuantity
				topByQuantity = p.ProductName
			}

			// Aggregate category
			cName := p.CategoryName
			if _, exists := catAgg[cName]; !exists {
				catAgg[cName] = &fiber.Map{
					"category": cName,
					"turnover": 0.0,
					"quantity": 0.0,
					"share":    0.0,
				}
			}
			cEnt := *catAgg[cName]
			cEnt["turnover"] = round2(cEnt["turnover"].(float64) + p.Revenue)
			cEnt["quantity"] = round2(cEnt["quantity"].(float64) + p.TotalQuantity)

			productsList = append(productsList, *p)
		}
		sort.Slice(productsList, func(i, j int) bool { return productsList[i].Revenue > productsList[j].Revenue })

		catSummaryList := make([]fiber.Map, 0, len(catAgg))
		for _, v := range catAgg {
			cEnt := *v
			if totalRev > 0 {
				cEnt["share"] = round2((cEnt["turnover"].(float64) / totalRev) * 100)
			}
			catSummaryList = append(catSummaryList, cEnt)
		}
		sort.Slice(catSummaryList, func(i, j int) bool {
			return catSummaryList[i]["turnover"].(float64) > catSummaryList[j]["turnover"].(float64)
		})

		return c.JSON(fiber.Map{
			"total_revenue":           round2(totalRev),
			"total_quantity_sold":     round2(totalQty),
			"distinct_products_count": len(productsList),
			"total_orders_analyzed":   len(orderIDs),
			"top_by_turnover":         topByTurnover,
			"top_by_quantity":         topByQuantity,
			"categories_summary":      catSummaryList,
			"categories_filter":       categoriesFilter,
			"items":                   productsList,
			"products":                productsList,
			"summary": fiber.Map{
				"total_products_sold": len(productsList),
				"total_quantity":      round2(totalQty),
				"total_revenue":       round2(totalRev),
				"total_cost":          round2(totalCost),
				"total_profit":        round2(totalRev - totalCost),
			},
		})
	})

	closedBillsHandler := func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		limit := c.QueryInt("limit", 200)
		statusFilter := c.Query("status", "all")
		dateRange := c.Query("date_range", "all")
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")
		search := strings.TrimSpace(c.Query("search"))
		paymentMethod := c.Query("payment_method")

		startAt, endAt, hasRange := service.ParseTRDateRange(dateRange, startDate, endDate)

		query := db.Model(&models.Order{})
		switch statusFilter {
		case "paid":
			query = query.Where("status = ?", "paid")
		case "cancelled":
			query = query.Where("status = ?", "cancelled")
		default:
			query = query.Where("status IN ?", []string{"paid", "cancelled"})
		}

		if hasRange {
			if !startAt.IsZero() {
				query = query.Where("created_at >= ?", startAt)
			}
			if !endAt.IsZero() {
				query = query.Where("created_at < ?", endAt)
			}
		}

		var orders []models.Order
		query.Order("id desc").Limit(limit).Find(&orders)

		closedList := make([]fiber.Map, 0, len(orders))
		totalTurnover := 0.0
		cashTotal := 0.0
		cardTotal := 0.0
		otherTotal := 0.0
		paidCount := 0

		searchLower := strings.ToLower(search)

		for i := range orders {
			sOrder := serializeOrder(db, &orders[i])
			tableNameStr := ""
			if sOrder["table_name"] != nil {
				tableNameStr = fmt.Sprintf("%v", sOrder["table_name"])
			}

			// Payment method filter
			payments, _ := sOrder["payments"].([]fiber.Map)
			if paymentMethod != "" && paymentMethod != "all" {
				hasMethod := false
				for _, p := range payments {
					pMethod, _ := p["method"].(string)
					if pMethod == paymentMethod {
						hasMethod = true
						break
					}
				}
				if !hasMethod {
					continue
				}
			}

			// Search filter
			if searchLower != "" {
				orderNo := strings.ToLower(fmt.Sprintf("%v", sOrder["order_no"]))
				tableName := strings.ToLower(tableNameStr)
				waiterName := strings.ToLower(orders[i].WaiterName)
				cashierName := ""
				if orders[i].CashierName != nil {
					cashierName = strings.ToLower(*orders[i].CashierName)
				}
				notes := ""
				if orders[i].Notes != nil {
					notes = strings.ToLower(*orders[i].Notes)
				}
				haystack := orderNo + " " + tableName + " " + waiterName + " " + cashierName + " " + notes
				match := strings.Contains(haystack, searchLower)
				if !match {
					items, _ := sOrder["items"].([]fiber.Map)
					for _, it := range items {
						pName := strings.ToLower(fmt.Sprintf("%v", it["product_name"]))
						if strings.Contains(pName, searchLower) {
							match = true
							break
						}
					}
				}
				if !match {
					continue
				}
			}

			if orders[i].Status == "paid" {
				paidCount++
				totalTurnover += orders[i].GrandTotal
				for _, p := range payments {
					amt, _ := p["amount"].(float64)
					pMethod, _ := p["method"].(string)
					bucket := service.PaymentBucketGroup(pMethod)
					if bucket == "cash" {
						cashTotal += amt
					} else if bucket == "credit_card" {
						cardTotal += amt
					} else {
						otherTotal += amt
					}
				}
			}

			closedList = append(closedList, sOrder)
		}

		avgTicket := 0.0
		if paidCount > 0 {
			avgTicket = round2(totalTurnover / float64(paidCount))
		}

		return c.JSON(fiber.Map{
			"total_closed_count": len(closedList),
			"paid_orders_count":  paidCount,
			"total_turnover":     round2(totalTurnover),
			"cash_total":         round2(cashTotal),
			"card_total":         round2(cardTotal),
			"other_total":        round2(otherTotal),
			"average_ticket":     avgTicket,
			"orders":             closedList,
		})
	}
	group.Get("/reports/closed-bills", closedBillsHandler)
	group.Get("/closed-bills", closedBillsHandler)

	group.Post("/create", middleware.IdempotencyMiddleware(10*time.Minute), func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CreateOrderRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz sipariş verisi.")
		}
		if payload.OrderType == "" {
			payload.OrderType = "dine_in"
		}
		if payload.WaiterName == "" {
			payload.WaiterName = "Kasiyer"
		}

		if payload.ServiceCharge != nil && *payload.ServiceCharge < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Servis ücreti negatif olamaz.")
		}
		if payload.KuverCount != nil && *payload.KuverCount < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Kuver kişi sayısı negatif olamaz.")
		}

		if payload.TableID != nil {
			var tbl models.Table
			if err := db.First(&tbl, *payload.TableID).Error; err != nil {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
					"status":  "error",
					"message": "Masa bulunamadı",
					"detail":  "Belirtilen masa mevcut değil",
				})
			}
		}

		var createdOrUpdatedOrder models.Order
		isAppendedToExisting := false
		kdsAlerts := make([]fiber.Map, 0)

		err = db.Transaction(func(tx *gorm.DB) error {
			if payload.TableID != nil {
				var tbl models.Table
				if err := repository.WithRowLock(tx).First(&tbl, *payload.TableID).Error; err != nil {
					return fiber.NewError(fiber.StatusNotFound, "Masa bulunamadı: Belirtilen masa mevcut değil")
				}
				if tbl.Status == "bill_printed" {
					if err := requirePermission(c, svc, tx, payload.WaiterName, []string{"table_AfterBillAddProduct"}, true, "Hesap yazdırıldıktan sonra masaya ürün ekleme yetkiniz bulunmamaktadır."); err != nil {
						return err
					}
				}

				var existingOrder models.Order
				if err := repository.WithRowLock(tx).Where("table_id = ? AND status IN ?", *payload.TableID, []string{"open", "bill_requested"}).First(&existingOrder).Error; err == nil {
					isAppendedToExisting = true
					if err := service.ValidateBOMStockForItems(tx, payload.Items); err != nil {
						return err
					}

					for _, itemIn := range payload.Items {
						prod, finalUnit, modsSlice, lineTotal, err := resolveServerItemPricing(tx, itemIn)
						if err != nil {
							if errors.Is(err, gorm.ErrRecordNotFound) {
								continue
							}
							return err
						}
						qty := itemIn.Quantity
						kdsStat := "preparing"
						if itemIn.IsHold {
							kdsStat = "hold"
						}
						courseStage := itemIn.CourseStage
						if courseStage == 0 {
							courseStage = 1
						}
						addedBy := payload.WaiterName
						if itemIn.AddedBy != nil && *itemIn.AddedBy != "" {
							addedBy = *itemIn.AddedBy
						}

						dbItem := models.OrderItem{
							OrderID:           existingOrder.ID,
							ProductID:         prod.ID,
							ProductName:       prod.Name,
							VariantName:       itemIn.VariantName,
							Quantity:          qty,
							UnitPrice:         finalUnit,
							TotalPrice:        lineTotal,
							SelectedModifiers: modsSlice,
							NegativeModifiers: models.StringSlice(itemIn.NegativeModifiers),
							KitchenNote:       itemIn.KitchenNote,
							CourseStage:       courseStage,
							IsHold:            itemIn.IsHold,
							Status:            kdsStat,
							Station:           prod.Station,
							AddedBy:           addedBy,
						}
						if err := tx.Create(&dbItem).Error; err != nil {
							return err
						}
						if err := service.DeductOrderIngredients(tx, prod.ID, qty, existingOrder.OrderNo, 2); err != nil {
							return err
						}
						kdsAlerts = append(kdsAlerts, fiber.Map{
							"item_id":            dbItem.ID,
							"product_name":       prod.Name,
							"variant_name":       itemIn.VariantName,
							"quantity":           qty,
							"station":            prod.Station,
							"selected_modifiers": modsSlice,
							"negative_modifiers": itemIn.NegativeModifiers,
							"kitchen_note":       itemIn.KitchenNote,
							"is_hold":            itemIn.IsHold,
							"course_stage":       courseStage,
						})
					}

					recalculateOrderTotals(tx, &existingOrder)
					if err := tx.Save(&existingOrder).Error; err != nil {
						return err
					}
					if tbl.Status == "bill_printed" {
						tbl.Status = "occupied"
						_ = tx.Save(&tbl).Error
						svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
							"table_id": tbl.ID,
							"status":   "occupied",
						})
					}
					createdOrUpdatedOrder = existingOrder
					return nil
				}
			}

			// Creating a brand-new order
			if payload.TableID != nil {
				if err := requirePermission(c, svc, tx, payload.WaiterName, []string{"table_open"}, true, "Yeni masa/sipariş açma yetkiniz bulunmamaktadır."); err != nil {
					return err
				}
			} else {
				if err := requirePermission(c, svc, tx, payload.WaiterName, []string{"takeaway_open"}, true, "Gel-Al / Paket sipariş açma yetkiniz bulunmamaktadır."); err != nil {
					return err
				}
			}
			if err := service.ValidateBOMStockForItems(tx, payload.Items); err != nil {
				return err
			}

			now := time.Now().UTC()
			orderNo := fmt.Sprintf("ADS-%s-%s", now.In(service.TurkeyLoc()).Format("060102150405"), generateRandomTokenSuffix())

			kuverCount := 0
			if payload.KuverCount != nil && *payload.KuverCount > 0 {
				kuverCount = *payload.KuverCount
			}
			kuverTotal := 0.0
			if kuverCount > 0 && loadSettingBool(tx, "is_kuver_enabled", false) {
				unitKuver := loadSettingFloat(tx, "kuver_DefaultPrice", svc.Config.DefaultKuverPrice)
				if kp := loadSettingFloat(tx, "kuver_price", 0); kp > 0 {
					unitKuver = kp
				}
				if unitKuver > 0 {
					kuverTotal = round2(float64(kuverCount) * unitKuver)
				}
			}
			serviceCharge := 0.0
			if payload.ServiceCharge != nil {
				serviceCharge = *payload.ServiceCharge
			}

			order := models.Order{
				OrderNo:       orderNo,
				TableID:       payload.TableID,
				OrderType:     payload.OrderType,
				Status:        "open",
				WaiterName:    payload.WaiterName,
				KuverCount:    kuverCount,
				KuverTotal:    kuverTotal,
				ServiceCharge: serviceCharge,
				Notes:         payload.Notes,
			}
			if err := tx.Create(&order).Error; err != nil {
				return err
			}

			if payload.TableID != nil {
				var tbl models.Table
				if err := repository.WithRowLock(tx).First(&tbl, *payload.TableID).Error; err == nil {
					tbl.Status = "occupied"
					if tbl.OpenedAt == nil {
						tbl.OpenedAt = &now
					}
					wName := payload.WaiterName
					tbl.WaiterName = &wName
					orderIDVal := order.ID
					tbl.CurrentOrderID = &orderIDVal
					if kuverCount > 0 {
						tbl.KuverCount = kuverCount
					}
					tx.Save(&tbl)
				}
			}

			for _, itemIn := range payload.Items {
				prod, finalUnit, modsSlice, lineTotal, err := resolveServerItemPricing(tx, itemIn)
				if err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						continue
					}
					return err
				}
				qty := itemIn.Quantity
				kdsStat := "preparing"
				if itemIn.IsHold {
					kdsStat = "hold"
				}
				courseStage := itemIn.CourseStage
				if courseStage == 0 {
					courseStage = 1
				}
				addedBy := payload.WaiterName
				if itemIn.AddedBy != nil && *itemIn.AddedBy != "" {
					addedBy = *itemIn.AddedBy
				}

				dbItem := models.OrderItem{
					OrderID:           order.ID,
					ProductID:         prod.ID,
					ProductName:       prod.Name,
					VariantName:       itemIn.VariantName,
					Quantity:          qty,
					UnitPrice:         finalUnit,
					TotalPrice:        lineTotal,
					SelectedModifiers: modsSlice,
					NegativeModifiers: models.StringSlice(itemIn.NegativeModifiers),
					KitchenNote:       itemIn.KitchenNote,
					CourseStage:       courseStage,
					IsHold:            itemIn.IsHold,
					Status:            kdsStat,
					Station:           prod.Station,
					AddedBy:           addedBy,
				}
				if err := tx.Create(&dbItem).Error; err != nil {
					return err
				}
				if err := service.DeductOrderIngredients(tx, prod.ID, qty, order.OrderNo, 2); err != nil {
					return err
				}
				kdsAlerts = append(kdsAlerts, fiber.Map{
					"item_id":            dbItem.ID,
					"product_name":       prod.Name,
					"variant_name":       itemIn.VariantName,
					"quantity":           qty,
					"station":            prod.Station,
					"selected_modifiers": modsSlice,
					"negative_modifiers": itemIn.NegativeModifiers,
					"kitchen_note":       itemIn.KitchenNote,
					"is_hold":            itemIn.IsHold,
					"course_stage":       courseStage,
				})
			}

			recalculateOrderTotals(tx, &order)
			if err := tx.Save(&order).Error; err != nil {
				return err
			}

			tblName := "Hızlı Satış"
			if payload.TableID != nil {
				var t models.Table
				if tx.First(&t, *payload.TableID).Error == nil {
					tblName = t.Name
				}
			}
			openedAtStr := order.CreatedAt.Local().Format("02.01.2006 15:04")
			ref := fmt.Sprintf("%s (#%s)", tblName, order.OrderNo)
			rc := "MASA_ACILDI"
			rt := fmt.Sprintf("Masa %s açıldı. Açılış: %s, Garson: %s", tblName, openedAtStr, order.WaiterName)
			opName, opRole := resolveAuditOperator(c, tx, order.WaiterName, "waiter")
			tx.Create(&models.AuditLog{
				ActionType:   "TABLE_OPENED",
				OperatorName: opName,
				OperatorRole: opRole,
				TargetRef:    &ref,
				ReasonCode:   &rc,
				ReasonText:   &rt,
				Details: models.JSONMap{
					"table_id":    order.TableID,
					"table_name":  tblName,
					"order_id":    order.ID,
					"order_no":    order.OrderNo,
					"opened_at":   openedAtStr,
					"waiter_name": order.WaiterName,
					"grand_total": order.GrandTotal,
				},
			})

			createdOrUpdatedOrder = order
			return nil
		})
		if err != nil {
			return err
		}

		serialized := serializeOrder(db, &createdOrUpdatedOrder)
		if isAppendedToExisting {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
			svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ITEMS_ADDED", fiber.Map{
				"order_id":    createdOrUpdatedOrder.ID,
				"order_no":    createdOrUpdatedOrder.OrderNo,
				"table_name":  serialized["table_name"],
				"waiter_name": payload.WaiterName,
				"items":       kdsAlerts,
			})
			if createdOrUpdatedOrder.TableID != nil {
				svc.WSHub.BroadcastToTable(tenantCode, *createdOrUpdatedOrder.TableID, "TABLE_ORDER_UPDATED", serialized)
			}
		} else {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_CREATED", serialized)
			svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_NEW_ORDER", fiber.Map{
				"order_id":    createdOrUpdatedOrder.ID,
				"order_no":    createdOrUpdatedOrder.OrderNo,
				"table_id":    createdOrUpdatedOrder.TableID,
				"table_name":  serialized["table_name"],
				"waiter_name": createdOrUpdatedOrder.WaiterName,
				"items":       kdsAlerts,
				"created_at":  createdOrUpdatedOrder.CreatedAt.Format(time.RFC3339),
			})
			if createdOrUpdatedOrder.TableID != nil {
				svc.WSHub.BroadcastToTable(tenantCode, *createdOrUpdatedOrder.TableID, "TABLE_ORDER_SYNC", serialized)
			}
		}
		if createdOrUpdatedOrder.TableID != nil {
			_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": createdOrUpdatedOrder.TableID})
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"order_id": createdOrUpdatedOrder.ID})
		serialized["status"] = "success"
		serialized["id"] = createdOrUpdatedOrder.ID
		serialized["order_id"] = createdOrUpdatedOrder.ID
		serialized["order_number"] = createdOrUpdatedOrder.OrderNo
		serialized["order_status"] = createdOrUpdatedOrder.Status
		return c.JSON(serialized)
	})

	group.Post("/hold-fire", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.HoldFireToggleRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek.")
		}
		var items []models.OrderItem
		db.Where("id IN ?", payload.OrderItemIDs).Find(&items)
		for i := range items {
			if payload.Action == "fire" {
				items[i].IsHold = false
				items[i].Status = "preparing"
			} else {
				items[i].IsHold = true
				items[i].Status = "hold"
			}
			db.Save(&items[i])
		}
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_HOLD_FIRE_TOGGLED", fiber.Map{
			"item_ids": payload.OrderItemIDs,
			"action":   payload.Action,
		})
		return c.JSON(fiber.Map{"status": "success", "action": payload.Action, "updated_count": len(items)})
	})

	group.Post("/void-item", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.VoidItemRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz iptal verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Kasiyer"
		}
		if !verifyCancelAuthorization(c, svc, db, payload.OperatorName, payload.ManagerPin) {
			return fiber.NewError(fiber.StatusForbidden, "Ürün iptali (Zayi) yetkiniz bulunmamaktadır veya geçerli bir Yönetici PIN kodu girilmelidir.")
		}

		var order models.Order
		var item models.OrderItem
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&item, payload.OrderItemID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Kalem bulunamadı")
			}
			if err := repository.WithRowLock(tx).First(&order, item.OrderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Sipariş bulunamadı")
			}
			if err := ensureNotInClosedShift(tx, order.CreatedAt); err != nil {
				return err
			}
			if order.Status != "open" && order.Status != "bill_requested" {
				return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyondan ürün iptal edilemez.")
			}
			if item.IsVoided {
				return fiber.NewError(fiber.StatusBadRequest, "Bu kalem zaten iptal edilmiş.")
			}
			item.IsVoided = true
			reason := payload.ReasonCode
			if payload.ReasonText != nil && *payload.ReasonText != "" {
				reason = fmt.Sprintf("%s: %s", payload.ReasonCode, *payload.ReasonText)
			}
			item.VoidReason = &reason
			op := payload.OperatorName
			item.VoidedBy = &op
			wasPendingStock := item.Status == "stock_confirm"
			item.Status = "voided"
			if err := tx.Save(&item).Error; err != nil {
				return err
			}

			// Restore stock for voided item (skip if stock confirmation was never approved)
			if !wasPendingStock {
				_ = service.RestoreOrderIngredients(tx, item.ProductID, item.Quantity, order.OrderNo, 2)
			} else if order.TableID != nil {
				var remainingPending int64
				tx.Model(&models.OrderItem{}).Where("order_id = ? AND is_voided = ? AND status = ?", order.ID, false, "stock_confirm").Count(&remainingPending)
				if remainingPending == 0 {
					var tbl models.Table
					if tx.First(&tbl, *order.TableID).Error == nil && tbl.WaiterCallReason != nil && strings.Contains(*tbl.WaiterCallReason, "stok yok") {
						tx.Model(&tbl).Update("waiter_call_reason", nil)
					}
				}
			}

			recalculateOrderTotals(tx, &order)
			if err := tx.Save(&order).Error; err != nil {
				return err
			}

			ref := order.OrderNo
			rCode := payload.ReasonCode
			opName, opRole := resolveAuditOperator(c, tx, payload.OperatorName, "manager")
			tx.Create(&models.AuditLog{
				ActionType:   "VOID_ITEM",
				OperatorName: opName,
				OperatorRole: opRole,
				TargetRef:    &ref,
				ReasonCode:   &rCode,
				ReasonText:   payload.ReasonText,
				Details: models.JSONMap{
					"order_id":    order.ID,
					"item_id":     item.ID,
					"product_id":  item.ProductID,
					"amount":      item.TotalPrice,
					"reason_code": payload.ReasonCode,
					"reason_text": payload.ReasonText,
				},
			})
			return nil
		})
		if err != nil {
			return err
		}

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ITEM_VOIDED", fiber.Map{
			"order_id": item.OrderID,
			"item_id":  item.ID,
			"reason":   item.VoidReason,
		})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"order_id": order.ID})
		serialized["status"] = "success"
		serialized["order_status"] = order.Status
		return c.JSON(serialized)
	})

	group.Post("/split-equal", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.SplitEqualRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz bölüşüm verisi.")
		}
		var order models.Order
		if err := db.First(&order, payload.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if payload.PersonCount < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "Kişi sayısı en az 1 olmalıdır")
		}
		perPerson := round2(order.RemainingTotal / float64(payload.PersonCount))
		return c.JSON(fiber.Map{
			"order_id":        order.ID,
			"remaining_total": order.RemainingTotal,
			"person_count":    payload.PersonCount,
			"per_person":      perPerson,
		})
	})

	group.Post("/items/:item_id/discount", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		itemID, _ := strconv.Atoi(c.Params("item_id"))
		var payload models.ApplyItemDiscountRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz indirim verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Kasiyer"
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_discount"}, false, "Kalem indirimi uygulama yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		var item models.OrderItem
		if err := db.First(&item, itemID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sipariş kalemi bulunamadı")
		}
		if item.IsVoided || item.IsTreat {
			return fiber.NewError(fiber.StatusBadRequest, "İptal veya ikram kalemine indirim uygulanamaz.")
		}
		var order models.Order
		if err := db.First(&order, item.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyona indirim uygulanamaz.")
		}
		if payload.Value <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "İndirim değeri sıfırdan büyük olmalıdır.")
		}
		if payload.DiscountType == "percentage" && payload.Value > 100 {
			return fiber.NewError(fiber.StatusBadRequest, "Yüzdelik indirim %100'den büyük olamaz.")
		}

		reason := payload.Reason
		item.DiscountReason = &reason
		if payload.DiscountType == "percentage" {
			item.DiscountRate = payload.Value
			item.DiscountAmount = round2(item.TotalPrice * (payload.Value / 100.0))
		} else {
			item.DiscountRate = 0
			item.DiscountAmount = math.Min(item.TotalPrice, round2(payload.Value))
		}
		db.Save(&item)

		recalculateOrderTotals(db, &order)
		ref := order.OrderNo
		opName, opRole := resolveAuditOperator(c, db, payload.OperatorName, "manager")
		db.Create(&models.AuditLog{
			ActionType:   "APPLY_ITEM_DISCOUNT",
			OperatorName: opName,
			OperatorRole: opRole,
			TargetRef:    &ref,
			Details: models.JSONMap{
				"order_id":        order.ID,
				"item_id":         item.ID,
				"type":            payload.DiscountType,
				"value":           payload.Value,
				"discount_amount": item.DiscountAmount,
				"reason":          payload.Reason,
			},
		})
		db.Save(&order)

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Post("/items/:item_id/remove-discount", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var body struct {
			OperatorName string `json:"operator_name"`
		}
		_ = c.BodyParser(&body)
		opName := strings.TrimSpace(body.OperatorName)
		if opName == "" {
			opName = strings.TrimSpace(c.Query("operator_name"))
		}
		if err := requirePermission(c, svc, db, opName, []string{"order_discount"}, false, "Kalem indirimi kaldırma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		itemID, _ := strconv.Atoi(c.Params("item_id"))
		var item models.OrderItem
		if err := db.First(&item, itemID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sipariş kalemi bulunamadı")
		}
		var order models.Order
		if err := db.First(&order, item.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyonda değişiklik yapılamaz.")
		}
		item.DiscountAmount = 0.0
		item.DiscountRate = 0.0
		item.DiscountReason = nil
		db.Save(&item)

		recalculateOrderTotals(db, &order)
		db.Save(&order)
		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Get("/:order_id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		return c.JSON(serializeOrder(db, &order))
	})

	group.Put("/:order_id/notes", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload struct {
			Notes        *string `json:"notes"`
			OperatorName string  `json:"operator_name"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz not verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Garson"
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_add_note"}, true, "Siparişe not ekleme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sipariş bulunamadı")
		}
		cleanNotes := ""
		if payload.Notes != nil {
			cleanNotes = strings.TrimSpace(*payload.Notes)
		}
		if cleanNotes != "" {
			order.Notes = &cleanNotes
		} else {
			order.Notes = nil
		}
		db.Save(&order)
		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Post("/:order_id/add-items", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload models.AddItemsRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ürün ekleme verisi.")
		}
		if payload.WaiterName == "" {
			payload.WaiterName = "Garson"
		}

		var order models.Order
		newItemsAlert := make([]fiber.Map, 0)

		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, orderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
			}
			if order.Status != "open" {
				return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış adisyona ürün eklenemez")
			}
			if err := service.ValidateBOMStockForItems(tx, payload.Items); err != nil {
				return err
			}

			if order.TableID != nil {
				var tbl models.Table
				if err := tx.First(&tbl, *order.TableID).Error; err == nil && tbl.Status == "bill_printed" {
					if err := requirePermission(c, svc, tx, payload.WaiterName, []string{"table_AfterBillAddProduct"}, true, "Hesap yazdırıldıktan sonra masaya ürün ekleme yetkiniz bulunmamaktadır."); err != nil {
						return err
					}
					tbl.Status = "occupied"
					_ = tx.Save(&tbl).Error
					svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
						"table_id": tbl.ID,
						"status":   "occupied",
					})
				}
			}

			for _, itemIn := range payload.Items {
				prod, finalUnit, modsSlice, lineTotal, err := resolveServerItemPricing(tx, itemIn)
				if err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						continue
					}
					return err
				}
				qty := itemIn.Quantity
				kdsStat := "preparing"
				if itemIn.IsHold {
					kdsStat = "hold"
				}
				courseStage := itemIn.CourseStage
				if courseStage == 0 {
					courseStage = 1
				}
				addedBy := payload.WaiterName
				if itemIn.AddedBy != nil && *itemIn.AddedBy != "" {
					addedBy = *itemIn.AddedBy
				}

				dbItem := models.OrderItem{
					OrderID:           order.ID,
					ProductID:         prod.ID,
					ProductName:       prod.Name,
					VariantName:       itemIn.VariantName,
					Quantity:          qty,
					UnitPrice:         finalUnit,
					TotalPrice:        lineTotal,
					SelectedModifiers: modsSlice,
					NegativeModifiers: models.StringSlice(itemIn.NegativeModifiers),
					KitchenNote:       itemIn.KitchenNote,
					CourseStage:       courseStage,
					IsHold:            itemIn.IsHold,
					Status:            kdsStat,
					Station:           prod.Station,
					AddedBy:           addedBy,
				}
				if err := tx.Create(&dbItem).Error; err != nil {
					return err
				}
				if err := service.DeductOrderIngredients(tx, prod.ID, qty, order.OrderNo, 2); err != nil {
					return err
				}
				newItemsAlert = append(newItemsAlert, fiber.Map{
					"item_id":            dbItem.ID,
					"product_name":       prod.Name,
					"variant_name":       itemIn.VariantName,
					"quantity":           qty,
					"station":            prod.Station,
					"selected_modifiers": modsSlice,
					"negative_modifiers": itemIn.NegativeModifiers,
					"kitchen_note":       itemIn.KitchenNote,
					"is_hold":            itemIn.IsHold,
					"course_stage":       courseStage,
				})
			}

			recalculateOrderTotals(tx, &order)
			return tx.Save(&order).Error
		})
		if err != nil {
			return err
		}

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ITEMS_ADDED", fiber.Map{
			"order_id":    order.ID,
			"order_no":    order.OrderNo,
			"table_name":  serialized["table_name"],
			"waiter_name": payload.WaiterName,
			"items":       newItemsAlert,
		})
		if order.TableID != nil {
			svc.WSHub.BroadcastToTable(tenantCode, *order.TableID, "TABLE_ORDER_UPDATED", serialized)
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"order_id": order.ID})
		serialized["status"] = "success"
		serialized["order_status"] = order.Status
		return c.JSON(serialized)
	})

	group.Post("/:order_id/cancel", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload models.CancelOrderRequest
		_ = c.BodyParser(&payload)
		if payload.OperatorName == "" {
			payload.OperatorName = "Yönetici"
		}
		if payload.ReasonCode == "" {
			payload.ReasonCode = "ORDER_CANCEL"
		}
		if payload.ReasonText == "" {
			payload.ReasonText = "Sipariş tamamen iptal edildi"
		}

		if !verifyCancelAuthorization(c, svc, db, payload.OperatorName, payload.ManagerPin) {
			return fiber.NewError(fiber.StatusForbidden, "Sipariş iptali yetkiniz bulunmamaktadır veya geçerli bir Yönetici PIN kodu girilmelidir.")
		}

		var order models.Order
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, orderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Sipariş bulunamadı")
			}
			if err := ensureNotInClosedShift(tx, order.CreatedAt); err != nil {
				return err
			}
			if order.Status == "paid" || order.Status == "cancelled" {
				return fiber.NewError(fiber.StatusBadRequest, "Ödenmiş veya zaten iptal edilmiş adisyon iptal edilemez.")
			}
			var items []models.OrderItem
			tx.Where("order_id = ?", order.ID).Find(&items)
			for i := range items {
				if !items[i].IsVoided {
					wasPendingStock := items[i].Status == "stock_confirm"
					items[i].IsVoided = true
					r := payload.ReasonText
					items[i].VoidReason = &r
					op := payload.OperatorName
					items[i].VoidedBy = &op
					items[i].Status = "voided"
					tx.Save(&items[i])

					// Restore stock for cancelled order items (skip unapproved stock_confirm items)
					if !wasPendingStock {
						_ = service.RestoreOrderIngredients(tx, items[i].ProductID, items[i].Quantity, order.OrderNo, 2)
					}
				}
			}
			order.Status = "cancelled"
			now := time.Now().UTC()
			order.ClosedAt = &now
			recalculateOrderTotals(tx, &order)

			if order.TableID != nil {
				var otherOpen int64
				tx.Model(&models.Order{}).Where("table_id = ? AND status IN ? AND id != ?", *order.TableID, []string{"open", "bill_requested"}, order.ID).Count(&otherOpen)
				if otherOpen == 0 {
					var tbl models.Table
					if err := repository.WithRowLock(tx).First(&tbl, *order.TableID).Error; err == nil {
						tbl.Status = "empty"
						tbl.CurrentOrderID = nil
						tbl.OpenedAt = nil
						tbl.WaiterName = nil
						tbl.KuverCount = 0
						tx.Save(&tbl)
					}
				}
			}

			trLoc := service.TurkeyLoc()
			openedAtStr := ""
			if !order.CreatedAt.IsZero() {
				openedAtStr = order.CreatedAt.In(trLoc).Format("02.01.2006 15:04")
			}
			closedAtStr := now.In(trLoc).Format("02.01.2006 15:04")
			durationMin := 0
			if !order.CreatedAt.IsZero() {
				durationMin = int(time.Since(order.CreatedAt).Minutes())
			}
			tblName := "Hızlı Satış"
			if order.TableID != nil {
				var t models.Table
				if tx.First(&t, *order.TableID).Error == nil {
					tblName = t.Name
				}
			}
			ref := fmt.Sprintf("%s (#%s)", tblName, order.OrderNo)
			rCode := payload.ReasonCode
			rText := fmt.Sprintf("Masa %s siparişi iptal edildi. Açılış: %s, İptal: %s (%d dk). Sebep: %s", tblName, openedAtStr, closedAtStr, durationMin, payload.ReasonText)
			opName, opRole := resolveAuditOperator(c, tx, payload.OperatorName, "manager")
			tx.Create(&models.AuditLog{
				ActionType:   "CANCEL_ORDER",
				OperatorName: opName,
				OperatorRole: opRole,
				TargetRef:    &ref,
				ReasonCode:   &rCode,
				ReasonText:   &rText,
				Details: models.JSONMap{
					"table_id":         order.TableID,
					"table_name":       tblName,
					"order_id":         order.ID,
					"order_no":         order.OrderNo,
					"opened_at":        openedAtStr,
					"closed_at":        closedAtStr,
					"duration_minutes": durationMin,
					"grand_total":      order.GrandTotal,
					"reason_code":      payload.ReasonCode,
					"reason_text":      payload.ReasonText,
				},
			})
			return tx.Save(&order).Error
		})
		if err != nil {
			return err
		}

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		if order.TableID != nil {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
				"table_id": *order.TableID,
				"status":   "empty",
			})
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"order_id": order.ID})
		serialized["status"] = "success"
		serialized["order_status"] = order.Status
		return c.JSON(serialized)
	})

	group.Post("/:order_id/discount", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload models.ApplyDiscountRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz indirim verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Kasiyer"
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_discount"}, false, "İndirim uygulama yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyona indirim uygulanamaz.")
		}
		if payload.Value <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "İndirim değeri sıfırdan büyük olmalıdır.")
		}
		if payload.DiscountType == "percentage" && payload.Value > 100 {
			return fiber.NewError(fiber.StatusBadRequest, "Yüzdelik indirim %100'den büyük olamaz.")
		}
		recalculateOrderTotals(db, &order)
		reason := payload.Reason
		order.DiscountReason = &reason
		if payload.DiscountType == "percentage" {
			order.DiscountRate = payload.Value
			order.DiscountAmount = round2(order.Subtotal * (payload.Value / 100.0))
		} else {
			order.DiscountRate = 0
			order.DiscountAmount = math.Min(order.Subtotal, round2(payload.Value))
		}
		recalculateOrderTotals(db, &order)

		ref := order.OrderNo
		opName, opRole := resolveAuditOperator(c, db, payload.OperatorName, "manager")
		db.Create(&models.AuditLog{
			ActionType:   "APPLY_DISCOUNT",
			OperatorName: opName,
			OperatorRole: opRole,
			TargetRef:    &ref,
			Details: models.JSONMap{
				"order_id":        order.ID,
				"type":            payload.DiscountType,
				"value":           payload.Value,
				"discount_amount": order.DiscountAmount,
				"reason":          payload.Reason,
			},
		})
		db.Save(&order)

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		serialized["status"] = "success"
		serialized["order_status"] = order.Status
		return c.JSON(serialized)
	})

	group.Post("/:order_id/batch-item-discount", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload models.BatchItemDiscountRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz toplu indirim verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Kasiyer"
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_discount"}, false, "Toplu ürün indirimi uygulama yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.Value <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "İndirim değeri sıfırdan büyük olmalıdır.")
		}
		if payload.DiscountType == "percentage" && payload.Value > 100 {
			return fiber.NewError(fiber.StatusBadRequest, "Yüzdelik indirim %100'den büyük olamaz.")
		}

		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyona toplu indirim uygulanamaz.")
		}
		var items []models.OrderItem
		db.Where("order_id = ? AND id IN ?", orderID, payload.ItemIDs).Find(&items)
		for i := range items {
			if items[i].IsVoided || items[i].IsTreat {
				continue
			}
			reason := payload.Reason
			items[i].DiscountReason = &reason
			if payload.DiscountType == "percentage" {
				items[i].DiscountRate = payload.Value
				items[i].DiscountAmount = round2(items[i].TotalPrice * (payload.Value / 100.0))
			} else {
				items[i].DiscountRate = 0
				items[i].DiscountAmount = math.Min(items[i].TotalPrice, round2(payload.Value))
			}
			db.Save(&items[i])
		}
		recalculateOrderTotals(db, &order)
		db.Save(&order)

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Post("/:order_id/service-charge", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var body struct {
			Amount float64 `json:"amount"`
			Note   string  `json:"note"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz servis ücreti verisi.")
		}
		if body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Servis ücreti sıfırdan büyük olmalıdır.")
		}
		var order models.Order
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, orderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
			}
			if err := ensureNotInClosedShift(tx, order.CreatedAt); err != nil {
				return err
			}
			if order.Status != "open" && order.Status != "bill_requested" {
				return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyona servis ücreti eklenemez.")
			}
			order.ServiceCharge = round2(order.ServiceCharge + body.Amount)
			if strings.TrimSpace(body.Note) != "" {
				noteLine := strings.TrimSpace(body.Note)
				if order.Notes != nil && strings.TrimSpace(*order.Notes) != "" {
					joined := *order.Notes + " | " + noteLine
					order.Notes = &joined
				} else {
					order.Notes = &noteLine
				}
			}
			recalculateOrderTotals(tx, &order)
			return tx.Save(&order).Error
		})
		if txErr != nil {
			return txErr
		}
		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Post("/:order_id/remove-all-discounts", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var body struct {
			OperatorName string `json:"operator_name"`
		}
		_ = c.BodyParser(&body)
		opName := strings.TrimSpace(body.OperatorName)
		if opName == "" {
			opName = strings.TrimSpace(c.Query("operator_name"))
		}
		if err := requirePermission(c, svc, db, opName, []string{"order_discount"}, false, "İndirimleri kaldırma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyonda değişiklik yapılamaz.")
		}
		order.DiscountAmount = 0.0
		order.DiscountRate = 0.0
		order.DiscountReason = nil

		var items []models.OrderItem
		db.Where("order_id = ?", orderID).Find(&items)
		for i := range items {
			items[i].DiscountAmount = 0.0
			items[i].DiscountRate = 0.0
			items[i].DiscountReason = nil
			db.Save(&items[i])
		}
		recalculateOrderTotals(db, &order)
		db.Save(&order)

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		return c.JSON(serialized)
	})

	group.Post("/:order_id/treat", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload models.ApplyTreatRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ikram verisi.")
		}
		if payload.OperatorName == "" {
			payload.OperatorName = "Kasiyer"
		}
		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"order_complimentary"}, false, "İkram tanımlama yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}
		if order.Status != "open" && order.Status != "bill_requested" {
			return fiber.NewError(fiber.StatusBadRequest, "Kapatılmış veya iptal edilmiş adisyonda ikram işlemi yapılamaz.")
		}
		var items []models.OrderItem
		db.Where("order_id = ? AND id IN ?", orderID, payload.OrderItemIDs).Find(&items)
		for i := range items {
			items[i].IsTreat = !items[i].IsTreat
			db.Save(&items[i])
		}
		r := payload.Reason
		order.TreatReason = &r
		recalculateOrderTotals(db, &order)
		ref := order.OrderNo
		opName, opRole := resolveAuditOperator(c, db, payload.OperatorName, "manager")
		db.Create(&models.AuditLog{
			ActionType:   "TREAT_ITEMS",
			OperatorName: opName,
			OperatorRole: opRole,
			TargetRef:    &ref,
			Details: models.JSONMap{
				"order_id": order.ID,
				"item_ids": payload.OrderItemIDs,
				"reason":   payload.Reason,
			},
		})
		db.Save(&order)

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		serialized["status"] = "success"
		serialized["order_status"] = order.Status
		return c.JSON(serialized)
	})

	group.Post("/:order_id/reopen", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var payload struct {
			OperatorName  string `json:"operator_name"`
			ClearPayments bool   `json:"clear_payments"`
		}
		payload.ClearPayments = true
		_ = c.BodyParser(&payload)
		if payload.OperatorName == "" {
			payload.OperatorName = "Yönetici"
		}

		if err := requirePermission(c, svc, db, payload.OperatorName, []string{"table_restore_bill"}, false, "Kapalı adisyonu geri yükleme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		var order models.Order
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, orderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
			}
			if err := ensureNotInClosedShift(tx, order.CreatedAt); err != nil {
				return err
			}
			if order.ClosedAt != nil {
				if err := ensureNotInClosedShift(tx, *order.ClosedAt); err != nil {
					return err
				}
			}
			if order.Status == "open" {
				return fiber.NewError(fiber.StatusBadRequest, "Bu adisyon zaten açık durumda")
			}
			if order.TableID != nil {
				var activeOnTable models.Order
				if err := tx.Where("table_id = ? AND status = ? AND id != ?", *order.TableID, "open", order.ID).First(&activeOnTable).Error; err == nil {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu masada şu an başka bir açık adisyon (#%s) bulunuyor. Önce mevcut masayı kapatın veya taşıyın.", activeOnTable.OrderNo))
				}
			}

			var items []models.OrderItem
			tx.Where("order_id = ?", order.ID).Find(&items)
			if order.Status == "cancelled" {
				for i := range items {
					items[i].IsVoided = false
					items[i].VoidReason = nil
					items[i].Status = "ready"
					tx.Save(&items[i])
					if err := service.DeductOrderIngredients(tx, items[i].ProductID, items[i].Quantity, order.OrderNo, 2); err != nil {
						return err
					}
				}
			}
			if payload.ClearPayments {
				tx.Where("order_id = ?", order.ID).Delete(&models.Payment{})
			}

			order.Status = "open"
			order.ClosedAt = nil
			recalculateOrderTotals(tx, &order)

			if order.TableID != nil {
				var tbl models.Table
				if err := repository.WithRowLock(tx).First(&tbl, *order.TableID).Error; err == nil {
					tbl.Status = "occupied"
					orderIDVal := order.ID
					tbl.CurrentOrderID = &orderIDVal
					now := time.Now().UTC()
					tbl.OpenedAt = &now
					wName := order.WaiterName
					tbl.WaiterName = &wName
					tx.Save(&tbl)
				}
			}

			tblName := "Hızlı Satış"
			if order.TableID != nil {
				var t models.Table
				if tx.First(&t, *order.TableID).Error == nil {
					tblName = t.Name
				}
			}
			openedAtStr := ""
			if !order.CreatedAt.IsZero() {
				openedAtStr = order.CreatedAt.Local().Format("02.01.2006 15:04")
			}
			ref := fmt.Sprintf("%s (#%s)", tblName, order.OrderNo)
			rc := "ADISYON_TEKRAR_ACILDI"
			rt := fmt.Sprintf("Masa %s (#%s) adisyonu tekrar aktif edildi. İlk Açılış: %s", tblName, order.OrderNo, openedAtStr)
			opName, opRole := resolveAuditOperator(c, tx, payload.OperatorName, "manager")
			tx.Create(&models.AuditLog{
				ActionType:   "REOPEN_ORDER",
				OperatorName: opName,
				OperatorRole: opRole,
				TargetRef:    &ref,
				ReasonCode:   &rc,
				ReasonText:   &rt,
				Details: models.JSONMap{
					"table_id":       order.TableID,
					"table_name":     tblName,
					"order_id":       order.ID,
					"order_no":       order.OrderNo,
					"opened_at":      openedAtStr,
					"reopened_at":    time.Now().Format("02.01.2006 15:04"),
					"grand_total":    order.GrandTotal,
					"clear_payments": payload.ClearPayments,
				},
			})
			return tx.Save(&order).Error
		})
		if err != nil {
			return err
		}

		serialized := serializeOrder(db, &order)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", serialized)
		if order.TableID != nil {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
				"table_id": *order.TableID,
				"status":   "occupied",
			})
		}
		return c.JSON(serialized)
	})
}

// ============================================================================
// 6. KDS ROUTER (/api/kds)
// ============================================================================

func RegisterKDSRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/orders", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		station := resolveKitchenStationCode(db, c.Query("station"))

		var openOrders []models.Order
		db.Where("status IN ?", []string{"open", "bill_requested"}).Order("created_at asc").Find(&openOrders)
		if len(openOrders) == 0 {
			return c.JSON([]fiber.Map{})
		}

		orderIDs := make([]int, 0, len(openOrders))
		tableIDs := make([]int, 0)
		for _, o := range openOrders {
			orderIDs = append(orderIDs, o.ID)
			if o.TableID != nil {
				tableIDs = append(tableIDs, *o.TableID)
			}
		}

		tableMap := map[int]models.Table{}
		if len(tableIDs) > 0 {
			var tbls []models.Table
			db.Where("id IN ?", tableIDs).Find(&tbls)
			for _, t := range tbls {
				tableMap[t.ID] = t
			}
		}

		var allItems []models.OrderItem
		db.Where("order_id IN ? AND is_voided = ?", orderIDs, false).Order("id asc").Find(&allItems)

		itemsByOrder := map[int][]models.OrderItem{}
		for _, it := range allItems {
			itemsByOrder[it.OrderID] = append(itemsByOrder[it.OrderID], it)
		}

		now := time.Now().UTC()
		result := make([]fiber.Map, 0)

		for _, order := range openOrders {
			items := itemsByOrder[order.ID]
			tableName := "Paket / Gel-Al"
			if order.TableID != nil {
				if tbl, ok := tableMap[*order.TableID]; ok && tbl.Name != "" {
					tableName = tbl.Name
				}
			}

			kdsItems := make([]fiber.Map, 0)
			for _, item := range items {
				if item.Status == "served" {
					continue
				}
				itemStation := item.Station
				if itemStation == "" {
					itemStation = "kitchen"
				}
				if station != "" && station != "all" && strings.ToLower(itemStation) != station {
					continue
				}
				pName := item.ProductName
				if pName == "" {
					pName = "Ürün"
				}
				mods := item.SelectedModifiers
				if mods == nil {
					mods = models.ModifierSlice{}
				}
				negMods := item.NegativeModifiers
				if negMods == nil {
					negMods = models.StringSlice{}
				}
				var createdStr interface{}
				if !item.CreatedAt.IsZero() {
					createdStr = item.CreatedAt.Format(time.RFC3339)
				}
				kdsItems = append(kdsItems, fiber.Map{
					"id":                      item.ID,
					"product_id":              item.ProductID,
					"product_name":            pName,
					"station":                 itemStation,
					"variant_name":            item.VariantName,
					"quantity":                item.Quantity,
					"selected_modifiers":      mods,
					"negative_modifiers":      negMods,
					"kitchen_note":            item.KitchenNote,
					"course_stage":            item.CourseStage,
					"is_hold":                 item.IsHold,
					"status":                  item.Status,
					"kds_status":              item.Status,
					"requires_stock_approval": item.Status == "stock_confirm",
					"created_at":              createdStr,
				})
			}

			if len(kdsItems) == 0 {
				continue
			}

			elapsedSeconds := 0
			var createdStr interface{}
			if !order.CreatedAt.IsZero() {
				elapsedSeconds = int(now.Sub(order.CreatedAt.UTC()).Seconds())
				if elapsedSeconds < 0 {
					elapsedSeconds = 0
				}
				createdStr = order.CreatedAt.Format(time.RFC3339)
			}

			result = append(result, fiber.Map{
				"order_id":        order.ID,
				"order_no":        order.OrderNo,
				"table_id":        order.TableID,
				"table_name":      tableName,
				"order_type":      order.OrderType,
				"waiter_name":     order.WaiterName,
				"notes":           order.Notes,
				"paid_total":      order.PaidTotal,
				"remaining_total": order.RemainingTotal,
				"is_prepaid":      order.RemainingTotal <= 0.01 && order.PaidTotal > 0,
				"elapsed_seconds": elapsedSeconds,
				"created_at":      createdStr,
				"items":           kdsItems,
			})
		}
		return c.JSON(result)
	})

	group.Post("/item/:item_id/progress", func(c *fiber.Ctx) error {
		status := c.Query("status")
		if status == "approve_stock" {
			return handleApproveOutOfStockItem(c, svc)
		}
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		itemID, _ := strconv.Atoi(c.Params("item_id"))

		var item models.OrderItem
		if err := db.First(&item, itemID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kalem bulunamadı")
		}
		var order models.Order
		db.First(&order, item.OrderID)

		var tbl models.Table
		tableName := "Paket"
		if order.TableID != nil {
			if err := db.First(&tbl, *order.TableID).Error; err == nil && tbl.Name != "" {
				tableName = tbl.Name
			}
		}

		if status == "" {
			switch item.Status {
			case "pending", "hold":
				status = "preparing"
			case "preparing":
				status = "ready"
			default:
				status = "served"
			}
		}
		item.Status = status
		if status != "hold" {
			item.IsHold = false
		}
		now := time.Now().UTC()
		if status == "ready" {
			item.ReadyAt = &now
		} else if status == "served" {
			item.ServedAt = &now
		}
		db.Save(&item)

		pName := item.ProductName
		if pName == "" {
			pName = "Ürün"
		}
		qtyStr := fmt.Sprintf("%v", item.Quantity)
		if item.Quantity == float64(int(item.Quantity)) {
			qtyStr = fmt.Sprintf("%d", int(item.Quantity))
		}
		itemSummary := fmt.Sprintf("%sx %s", qtyStr, pName)

		payloadData := fiber.Map{
			"order_id":      order.ID,
			"order_no":      order.OrderNo,
			"table_id":      order.TableID,
			"table_name":    tableName,
			"item_id":       item.ID,
			"product_name":  pName,
			"quantity":      item.Quantity,
			"items_summary": itemSummary,
			"status":        status,
			"kds_status":    status,
			"waiter_name":   order.WaiterName,
			"ready_at":      time.Now().Local().Format("15:04"),
		}
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ITEM_STATUS_CHANGED", payloadData)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "KDS_ITEM_STATUS_CHANGED", payloadData)

		if status == "ready" {
			var orderItems []models.OrderItem
			db.Where("order_id = ? AND is_voided = ?", order.ID, false).Find(&orderItems)
			preparingCount := 0
			readyCount := 0
			var readyList []string
			for _, oi := range orderItems {
				if oi.Status == "ready" || oi.Status == "hazir" {
					readyCount++
					qStr := fmt.Sprintf("%v", oi.Quantity)
					if oi.Quantity == float64(int(oi.Quantity)) {
						qStr = fmt.Sprintf("%d", int(oi.Quantity))
					}
					readyList = append(readyList, fmt.Sprintf("%sx %s", qStr, oi.ProductName))
				} else if oi.Status == "preparing" || oi.Status == "pending" || oi.Status == "hold" || oi.Status == "" || oi.Status == "new" {
					preparingCount++
				}
			}

			// Masaya bildirim ve genel alert SADECE tüm kalemler hazır olduğunda (hazırlanan hiçbir kalem kalmadığında) gönderilsin
			if len(orderItems) > 0 && preparingCount == 0 && readyCount > 0 {
				fullSummary := strings.Join(readyList, ", ")
				readyMsg := fmt.Sprintf("Masa %s: Siparişin tümü servise hazır! (%s)", tableName, fullSummary)
				if order.TableID == nil {
					readyMsg = fmt.Sprintf("Paket Sipariş (#%s) servise hazır! (%s)", order.OrderNo, fullSummary)
				}
				readyAlert := fiber.Map{
					"order_id":      order.ID,
					"order_no":      order.OrderNo,
					"table_id":      order.TableID,
					"table_name":    tableName,
					"item_id":       item.ID,
					"product_name":  pName,
					"quantity":      item.Quantity,
					"items_summary": fullSummary,
					"waiter_name":   order.WaiterName,
					"title":         "Mutfak Siparişi Hazır!",
					"message":       readyMsg,
					"ready_at":      time.Now().Local().Format("15:04"),
				}
				svc.WSHub.BroadcastToChannel(tenantCode, "pos", "KITCHEN_ORDER_READY_ALERT", readyAlert)
				svc.WSHub.BroadcastToChannel(tenantCode, "waiter", "KITCHEN_ORDER_READY_ALERT", readyAlert)
				svc.WSHub.BroadcastToChannel(tenantCode, "all", "KITCHEN_ORDER_READY_ALERT", readyAlert)
			}
			_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": order.TableID})
		}

		return c.JSON(payloadData)
	})

	group.Post("/order/:order_id/ready-all", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var items []models.OrderItem
		db.Where("order_id = ? AND is_voided = ?", orderID, false).Find(&items)
		now := time.Now().UTC()
		var readyNames []string
		for i := range items {
			if items[i].Status == "preparing" || items[i].Status == "pending" {
				items[i].Status = "ready"
				items[i].ReadyAt = &now
				db.Save(&items[i])
			}
			if !items[i].IsVoided {
				qStr := fmt.Sprintf("%v", items[i].Quantity)
				if items[i].Quantity == float64(int(items[i].Quantity)) {
					qStr = fmt.Sprintf("%d", int(items[i].Quantity))
				}
				readyNames = append(readyNames, fmt.Sprintf("%sx %s", qStr, items[i].ProductName))
			}
		}
		var order models.Order
		db.First(&order, orderID)
		tableName := "Paket"
		if order.TableID != nil {
			var tbl models.Table
			if err := db.First(&tbl, *order.TableID).Error; err == nil && tbl.Name != "" {
				tableName = tbl.Name
			}
		}

		itemsSummaryText := strings.Join(readyNames, ", ")
		if len(readyNames) > 3 {
			itemsSummaryText = fmt.Sprintf("%s ve %d ürün daha", strings.Join(readyNames[:3], ", "), len(readyNames)-3)
		}
		if itemsSummaryText == "" {
			itemsSummaryText = "Tüm sipariş ürünleri"
		}

		readyMsg := fmt.Sprintf("Masa %s: Siparişin tümü servise hazır! (%s)", tableName, itemsSummaryText)
		if order.TableID == nil {
			readyMsg = fmt.Sprintf("Paket Sipariş (#%s) servise hazır! (%s)", order.OrderNo, itemsSummaryText)
		}

		alert := fiber.Map{
			"order_id":      orderID,
			"order_no":      order.OrderNo,
			"table_id":      order.TableID,
			"table_name":    tableName,
			"waiter_name":   order.WaiterName,
			"items_summary": itemsSummaryText,
			"title":         "Mutfak Siparişi Hazır!",
			"message":       readyMsg,
			"ready_at":      time.Now().Local().Format("15:04"),
		}
		svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ORDER_READY_ALL", alert)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "KDS_ORDER_READY_ALL", alert)
		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "KITCHEN_ORDER_READY_ALERT", alert)
		svc.WSHub.BroadcastToChannel(tenantCode, "waiter", "KITCHEN_ORDER_READY_ALERT", alert)
		svc.WSHub.BroadcastToChannel(tenantCode, "all", "KITCHEN_ORDER_READY_ALERT", alert)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": order.TableID})
		return c.JSON(fiber.Map{"status": "ok", "order_id": orderID})
	})

	group.Post("/item/:item_id/approve-stock", func(c *fiber.Ctx) error {
		return handleApproveOutOfStockItem(c, svc)
	})

	group.Get("/stock-approvals", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var pendingItems []models.OrderItem
		db.Where("is_voided = ? AND status = ?", false, "stock_confirm").Order("id asc").Find(&pendingItems)
		if len(pendingItems) == 0 {
			return c.JSON([]fiber.Map{})
		}
		orderIDs := make([]int, 0, len(pendingItems))
		for _, it := range pendingItems {
			orderIDs = append(orderIDs, it.OrderID)
		}
		var orders []models.Order
		db.Where("id IN ? AND status IN ?", orderIDs, []string{"open", "bill_requested"}).Find(&orders)
		orderMap := make(map[int]models.Order, len(orders))
		tableIDs := make([]int, 0, len(orders))
		for _, o := range orders {
			orderMap[o.ID] = o
			if o.TableID != nil {
				tableIDs = append(tableIDs, *o.TableID)
			}
		}
		tableMap := make(map[int]string, len(tableIDs))
		if len(tableIDs) > 0 {
			var tbls []models.Table
			db.Where("id IN ?", tableIDs).Find(&tbls)
			for _, t := range tbls {
				tableMap[t.ID] = t.Name
			}
		}
		res := make([]fiber.Map, 0, len(pendingItems))
		for _, it := range pendingItems {
			ord, ok := orderMap[it.OrderID]
			if !ok {
				continue
			}
			tName := "Paket / Gel-Al"
			if ord.TableID != nil && tableMap[*ord.TableID] != "" {
				tName = tableMap[*ord.TableID]
			}
			res = append(res, fiber.Map{
				"item_id":      it.ID,
				"order_id":     ord.ID,
				"order_no":     ord.OrderNo,
				"table_id":     ord.TableID,
				"table_name":   tName,
				"product_id":   it.ProductID,
				"product_name": it.ProductName,
				"quantity":     it.Quantity,
				"message":      fmt.Sprintf("⚠️ %s %s istedi ama stok yok! Devam edilsin mi?", tName, it.ProductName),
			})
		}
		return c.JSON(res)
	})
}

func handleApproveOutOfStockItem(c *fiber.Ctx, svc *service.Services) error {
	db, tenantCode, err := getTenantDB(c, svc)
	if err != nil {
		return err
	}
	itemID, _ := strconv.Atoi(c.Params("item_id"))
	var body struct {
		ApprovedBy string `json:"approved_by"`
	}
	_ = c.BodyParser(&body)
	approvedBy := strings.TrimSpace(body.ApprovedBy)
	if approvedBy == "" {
		approvedBy = strings.TrimSpace(c.Query("approved_by"))
	}
	if approvedBy == "" {
		approvedBy = "Personel"
	}

	var item models.OrderItem
	var order models.Order
	tableName := "Paket"
	var newStock float64
	alreadyApproved := false

	txErr := db.Transaction(func(tx *gorm.DB) error {
		if err := repository.WithRowLock(tx).First(&item, itemID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kalem bulunamadı")
		}
		if err := tx.First(&order, item.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sipariş bulunamadı")
		}
		if order.TableID != nil {
			var tbl models.Table
			if tx.First(&tbl, *order.TableID).Error == nil && tbl.Name != "" {
				tableName = tbl.Name
			}
		}

		var prod models.Product
		hasProd := tx.Preload("Recipes.Ingredient").First(&prod, item.ProductID).Error == nil

		if item.Status != "stock_confirm" {
			alreadyApproved = true
			if hasProd {
				_, curStock, _, _ := service.GetProductAvailableStock(tx, prod)
				newStock = curStock
			}
			return nil
		}

		if err := service.DeductOrderIngredients(tx, item.ProductID, item.Quantity, order.OrderNo, 2); err != nil {
			return err
		}

		item.Status = "preparing"
		if item.KitchenNote != nil && strings.Contains(*item.KitchenNote, "[STOK YOK - ONAY BEKLİYOR]") {
			updatedNote := strings.ReplaceAll(*item.KitchenNote, "[STOK YOK - ONAY BEKLİYOR]", fmt.Sprintf("[EKSİ STOK ONAYLANDI: %s]", approvedBy))
			item.KitchenNote = &updatedNote
		}
		if err := tx.Save(&item).Error; err != nil {
			return err
		}

		if order.TableID != nil {
			var remainingPending int64
			tx.Model(&models.OrderItem{}).Where("order_id = ? AND is_voided = ? AND status = ?", order.ID, false, "stock_confirm").Count(&remainingPending)
			if remainingPending == 0 {
				var tbl models.Table
				if tx.First(&tbl, *order.TableID).Error == nil && tbl.WaiterCallReason != nil && strings.Contains(*tbl.WaiterCallReason, "stok yok") {
					tx.Model(&tbl).Update("waiter_call_reason", nil)
				}
			}
		}

		if hasProd {
			var reloadedProd models.Product
			if tx.Preload("Recipes.Ingredient").First(&reloadedProd, item.ProductID).Error == nil {
				_, curStock, _, _ := service.GetProductAvailableStock(tx, reloadedProd)
				newStock = curStock
			}
		}
		return nil
	})
	if txErr != nil {
		return txErr
	}

	if !alreadyApproved {
		payload := fiber.Map{
			"item_id":      item.ID,
			"order_id":     order.ID,
			"order_no":     order.OrderNo,
			"table_id":     order.TableID,
			"table_name":   tableName,
			"product_id":   item.ProductID,
			"product_name": item.ProductName,
			"quantity":     item.Quantity,
			"new_stock":    newStock,
			"approved_by":  approvedBy,
			"status":       item.Status,
			"kds_status":   item.Status,
		}
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "STOCK_APPROVAL_RESOLVED", payload)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "KDS_ITEM_STATUS_CHANGED", payload)
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "ORDER_UPDATED", fiber.Map{"order_id": order.ID, "table_id": order.TableID})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "MENU_UPDATED", fiber.Map{"product_id": item.ProductID})
		_ = svc.Broadcaster.BroadcastAll(tenantCode, "AREAS_UPDATED", fiber.Map{"table_id": order.TableID})
	}

	return c.JSON(fiber.Map{
		"status":           item.Status,
		"item_id":          item.ID,
		"order_id":         order.ID,
		"new_stock":        newStock,
		"approved_by":      approvedBy,
		"already_approved": alreadyApproved,
	})
}

// ============================================================================
// 7. CASHIER, PAYMENTS & Z-REPORT ROUTER (/api/cashier)
// ============================================================================

func getOrCreateActiveRegister(db *gorm.DB) models.CashRegister {
	return service.GetOrCreateActiveRegister(db)
}

func calculateReportSummary(db *gorm.DB, reg models.CashRegister) fiber.Map {
	return service.CalculateReportSummary(db, reg)
}

func RegisterCashierRoutes(group fiber.Router, svc *service.Services) {
	group.Get("/active-register", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		reg := getOrCreateActiveRegister(db)
		return c.JSON(calculateReportSummary(db, reg))
	})

	group.Post("/settle-payment", middleware.IdempotencyMiddleware(10*time.Minute), func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.SettlePaymentRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ödeme verisi.")
		}
		if payload.CashierName == "" {
			payload.CashierName = "Kasiyer"
		}

		if err := requirePermission(c, svc, db, payload.CashierName, []string{"order_take_payment", "order_fast_pay"}, true, "Ödeme alma veya hesap kapatma yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		for _, p := range payload.Payments {
			if p.ResolvedMethod() == "open_account" {
				if err := requirePermission(c, svc, db, payload.CashierName, []string{"order_open_account_transfer"}, false, "Açık hesaba (veresiye) devretme yetkiniz bulunmamaktadır."); err != nil {
					return err
				}
				break
			}
		}

		closeTable := true
		if payload.CloseTable != nil {
			closeTable = *payload.CloseTable
		}
		if math.Abs(payload.Rounding) > 10.0 {
			return fiber.NewError(fiber.StatusBadRequest, "Yuvarlama tutarı ±₺10.00 sınırını aşamaz.")
		}
		for _, p := range payload.Payments {
			if p.Amount <= 0 || p.Tip < 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Ödeme tutarı sıfırdan büyük olmalı ve bahşiş negatif olmamalıdır.")
			}
		}

		var order models.Order
		isFullyPaid := false
		tableStatus := ""
		changeAmount := 0.0

		// ACID Transaction with Row-Level Locks on Order and Table
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, payload.OrderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
			}
			if order.Status == "paid" || order.Status == "cancelled" {
				return fiber.NewError(fiber.StatusBadRequest, "Ödenmiş veya iptal edilmiş adisyona ödeme alınamaz.")
			}
			if len(payload.Payments) == 0 && !(order.RemainingTotal <= 0.05 && closeTable) {
				return fiber.NewError(fiber.StatusBadRequest, "En az bir ödeme satırı girilmelidir.")
			}

			roundingDelta := round2(payload.Rounding)
			unpaid := math.Max(0.0, round2(order.GrandTotal+roundingDelta-order.PaidTotal))

			for idx, p := range payload.Payments {
				if unpaid <= 0.01 {
					return fiber.NewError(fiber.StatusBadRequest, "Bu adisyonda kalan borç bulunmamaktadır.")
				}
				rAmt := 0.0
				if idx == 0 {
					rAmt = roundingDelta
				}
				method := p.ResolvedMethod()
				tendered := round2(p.Amount)
				applied := tendered
				if method == "cash" {
					if tendered > unpaid {
						applied = round2(unpaid)
						changeAmount = round2(changeAmount + round2(tendered-applied))
					}
				} else {
					if tendered > unpaid+0.05 {
						return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("%s tutarı kalan borcu (₺%.2f) aşamaz.", getPaymentMethodLabel(method), unpaid))
					}
					if tendered > unpaid {
						applied = round2(unpaid)
					}
				}
				unpaid = math.Max(0.0, round2(unpaid-applied))

				paymentRow := models.Payment{
					OrderID:        order.ID,
					PaymentMethod:  method,
					Amount:         applied,
					TipAmount:      round2(p.Tip),
					RoundingAmount: rAmt,
					CashierName:    payload.CashierName,
				}
				if err := tx.Create(&paymentRow).Error; err != nil {
					return err
				}
			}

			recalculateOrderTotals(tx, &order)

			if order.RemainingTotal <= 0.05 {
				order.RemainingTotal = 0.0
				cName := payload.CashierName
				order.CashierName = &cName
				isFullyPaid = true

				if closeTable || order.TableID == nil {
					now := time.Now().UTC()
					order.Status = "paid"
					order.ClosedAt = &now
					tableStatus = "empty"

					tblName := "Hızlı Satış"
					openedAtStr := ""
					if !order.CreatedAt.IsZero() {
						openedAtStr = order.CreatedAt.Local().Format("02.01.2006 15:04")
					}
					durationMin := 0
					if !order.CreatedAt.IsZero() {
						durationMin = int(now.Sub(order.CreatedAt).Minutes())
					}
					if durationMin < 0 {
						durationMin = 0
					}

					if order.TableID != nil {
						var tbl models.Table
						if err := repository.WithRowLock(tx).First(&tbl, *order.TableID).Error; err == nil {
							tblName = tbl.Name
							if tbl.OpenedAt != nil && !tbl.OpenedAt.IsZero() {
								openedAtStr = tbl.OpenedAt.Local().Format("02.01.2006 15:04")
								durationMin = int(now.Sub(*tbl.OpenedAt).Minutes())
								if durationMin < 0 {
									durationMin = 0
								}
							}
							var otherOpen int64
							tx.Model(&models.Order{}).Where("table_id = ? AND status IN ? AND id != ?", tbl.ID, []string{"open", "bill_requested"}, order.ID).Count(&otherOpen)
							if otherOpen == 0 {
								tbl.Status = "empty"
								tbl.CurrentOrderID = nil
								tbl.OpenedAt = nil
								tbl.KuverCount = 0
								tbl.WaiterName = nil
								tbl.WaiterCallReason = nil
								tx.Save(&tbl)

								var mergedTables []models.Table
								tx.Where("is_merged_to = ?", tbl.ID).Find(&mergedTables)
								for i := range mergedTables {
									mergedTables[i].IsMergedTo = nil
									mergedTables[i].Status = "empty"
									tx.Save(&mergedTables[i])
								}
							} else {
								tableStatus = "occupied"
							}
						}
					}

					closedAtStr := now.Local().Format("02.01.2006 15:04")
					ref := fmt.Sprintf("%s (#%s)", tblName, order.OrderNo)
					rc := "HESAP_KAPATILDI"
					rt := fmt.Sprintf("Masa %s hesabı kapatıldı. Açılış: %s, Kapanış: %s (%d dk). Toplam: ₺%.2f", tblName, openedAtStr, closedAtStr, durationMin, order.GrandTotal)
					opName, opRole := resolveAuditOperator(c, tx, payload.CashierName, "cashier")
					tx.Create(&models.AuditLog{
						ActionType:   "TABLE_CLOSED",
						OperatorName: opName,
						OperatorRole: opRole,
						TargetRef:    &ref,
						ReasonCode:   &rc,
						ReasonText:   &rt,
						Details: models.JSONMap{
							"table_id":         order.TableID,
							"table_name":       tblName,
							"order_id":         order.ID,
							"order_no":         order.OrderNo,
							"opened_at":        openedAtStr,
							"closed_at":        closedAtStr,
							"duration_minutes": durationMin,
							"grand_total":      order.GrandTotal,
							"paid_total":       order.PaidTotal,
							"waiter_name":      order.WaiterName,
							"cashier_name":     payload.CashierName,
						},
					})
				} else if order.TableID != nil {
					tableStatus = "occupied"
					if order.Status == "" || order.Status == "bill_requested" || order.Status == "bill_printed" {
						order.Status = "open"
					}
					var tbl models.Table
					if err := repository.WithRowLock(tx).First(&tbl, *order.TableID).Error; err == nil {
						tbl.Status = "occupied"
						tbl.CurrentOrderID = &order.ID
						tx.Save(&tbl)
					}
				}
			} else if order.TableID != nil {
				tableStatus = "occupied"
			}

			return tx.Save(&order).Error
		})
		if err != nil {
			return err
		}

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_PAID", fiber.Map{
			"order_id":        order.ID,
			"order_no":        order.OrderNo,
			"table_id":        order.TableID,
			"status":          order.Status,
			"paid_total":      order.PaidTotal,
			"remaining_total": order.RemainingTotal,
			"is_fully_paid":   isFullyPaid,
			"close_table":     closeTable,
		})
		if isFullyPaid && order.TableID != nil {
			if closeTable {
				svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
					"table_id": *order.TableID,
					"status":   "empty",
				})
				svc.WSHub.BroadcastToTable(tenantCode, *order.TableID, "TABLE_BILL_CLOSED", fiber.Map{
					"order_id": order.ID,
				})
			} else {
				svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
					"table_id":   *order.TableID,
					"status":     "occupied",
					"is_prepaid": true,
				})
				svc.WSHub.BroadcastToChannel(tenantCode, "kds", "KDS_ORDER_PREPAID", fiber.Map{
					"order_id":   order.ID,
					"order_no":   order.OrderNo,
					"table_id":   *order.TableID,
					"is_prepaid": true,
				})
				svc.WSHub.BroadcastToTable(tenantCode, *order.TableID, "TABLE_ORDER_UPDATED", fiber.Map{
					"order_id":   order.ID,
					"is_prepaid": true,
				})
			}
		}
		for _, p := range payload.Payments {
			if p.ResolvedMethod() == "cash" {
				svc.WSHub.BroadcastToChannel(tenantCode, "pos", "CASH_DRAWER_KICK", fiber.Map{
					"order_id": order.ID,
					"cashier":  payload.CashierName,
					"command":  "ESC p 0 25 250",
				})
				break
			}
		}

		return c.JSON(fiber.Map{
			"status":          "success",
			"order_id":        order.ID,
			"order_status":    order.Status,
			"grand_total":     order.GrandTotal,
			"paid_total":      order.PaidTotal,
			"remaining_total": order.RemainingTotal,
			"change_amount":   round2(changeAmount),
			"is_fully_paid":   isFullyPaid,
			"is_prepaid":      isFullyPaid && order.Status != "paid",
			"message":         "Payment recorded successfully",
			"table_status":    tableStatus,
		})
	})

	group.Delete("/payments/:payment_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		paymentID, _ := strconv.Atoi(c.Params("payment_id"))
		operatorName := c.Query("operator_name", "Yönetici")
		if err := requirePermission(c, svc, db, operatorName, []string{"order_take_payment", "order_refund"}, false, "Ödeme silme / iade yetkiniz bulunmamaktadır."); err != nil {
			return err
		}

		var payment models.Payment
		if err := db.First(&payment, paymentID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ödeme kaydı bulunamadı")
		}
		var order models.Order
		if err := db.First(&order, payment.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İlgili adisyon bulunamadı")
		}
		if err := ensureNotInClosedShift(db, payment.CreatedAt); err != nil {
			return err
		}
		if err := ensureNotInClosedShift(db, order.CreatedAt); err != nil {
			return err
		}

		method := payment.PaymentMethod
		amount := payment.Amount
		db.Delete(&payment)

		wasClosed := order.Status == "paid"
		recalculateOrderTotals(db, &order)
		if order.RemainingTotal > 0.05 && wasClosed {
			order.Status = "open"
			order.ClosedAt = nil
			if order.TableID != nil {
				var tbl models.Table
				if err := db.First(&tbl, *order.TableID).Error; err == nil && (tbl.Status == "free" || tbl.Status == "empty") {
					tbl.Status = "occupied"
					orderIDVal := order.ID
					tbl.CurrentOrderID = &orderIDVal
					now := time.Now().UTC()
					tbl.OpenedAt = &now
					wName := order.WaiterName
					tbl.WaiterName = &wName
					db.Save(&tbl)
				}
			}
		}

		ref := order.OrderNo
		opName, opRole := resolveAuditOperator(c, db, operatorName, "manager")
		db.Create(&models.AuditLog{
			ActionType:   "DELETE_PAYMENT",
			OperatorName: opName,
			OperatorRole: opRole,
			TargetRef:    &ref,
			Details: models.JSONMap{
				"order_id":   order.ID,
				"payment_id": paymentID,
				"method":     method,
				"amount":     amount,
				"order_no":   order.OrderNo,
			},
		})
		db.Save(&order)

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "ORDER_UPDATED", fiber.Map{"order_id": order.ID})
		return c.JSON(fiber.Map{
			"status":          "ok",
			"order_id":        order.ID,
			"order_status":    order.Status,
			"paid_total":      order.PaidTotal,
			"remaining_total": order.RemainingTotal,
		})
	})

	group.Post("/expenses", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CashExpenseRequest
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz gider verisi.")
		}
		if payload.CreatedBy == "" {
			payload.CreatedBy = "Kasiyer"
		}
		if err := requirePermission(c, svc, db, payload.CreatedBy, []string{"expense_add"}, false, "Kasa gider/giriş kaydı ekleme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		if payload.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Tutar sıfırdan büyük olmalıdır.")
		}
		expType := payload.ExpenseType
		if expType == "" {
			expType = "out"
		}
		reg := getOrCreateActiveRegister(db)
		expense := models.CashExpense{
			Category:    payload.Category,
			Amount:      round2(payload.Amount),
			ExpenseType: expType,
			Description: payload.Description,
			CreatedBy:   payload.CreatedBy,
		}
		db.Create(&expense)
		ref := fmt.Sprintf("EXP-%d", expense.ID)
		rCode := expType
		rText := fmt.Sprintf("%s: ₺%.2f (%s)", payload.Category, expense.Amount, payload.Description)
		db.Create(&models.AuditLog{
			ActionType:   "CASH_EXPENSE",
			OperatorName: payload.CreatedBy,
			OperatorRole: "cashier",
			TargetRef:    &ref,
			ReasonCode:   &rCode,
			ReasonText:   &rText,
			Details: models.JSONMap{
				"expense_id":   expense.ID,
				"category":     expense.Category,
				"amount":       expense.Amount,
				"expense_type": expense.ExpenseType,
				"description":  expense.Description,
			},
		})
		return c.JSON(fiber.Map{
			"status":     "ok",
			"expense_id": expense.ID,
			"summary":    calculateReportSummary(db, reg),
		})
	})

	group.Get("/expenses", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")
		query := db.Model(&models.CashExpense{})

		if startDate != "" || endDate != "" {
			if sUTC, eUTC, ok := service.ParseTRDateRange("", startDate, endDate); ok {
				if !sUTC.IsZero() {
					query = query.Where("created_at >= ?", sUTC)
				}
				if !eUTC.IsZero() {
					query = query.Where("created_at < ?", eUTC)
				}
			}
		}
		// Tarih parametresi verilmemişse ve active_shift istenmişse sadece aktif kasanın masraflarını getir
		if startDate == "" && endDate == "" {
			reg := getOrCreateActiveRegister(db)
			if !reg.OpenedAt.IsZero() {
				query = query.Where("created_at >= ?", reg.OpenedAt)
			}
		}

		var expenses []models.CashExpense
		query.Order("created_at desc").Find(&expenses)
		res := make([]fiber.Map, 0, len(expenses))
		for _, e := range expenses {
			var cStr interface{}
			if !e.CreatedAt.IsZero() {
				cStr = e.CreatedAt.Format(time.RFC3339)
			}
			expType := e.ExpenseType
			if expType == "" {
				expType = "out"
			}
			res = append(res, fiber.Map{
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
		return c.JSON(res)
	})

	group.Delete("/expenses/:id", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		operatorName := c.Query("operator_name", "Yönetici")
		if err := requirePermission(c, svc, db, operatorName, []string{"expense_edit_delete"}, false, "Masraf kaydı silme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		id := c.Params("id")
		var expense models.CashExpense
		if err := db.First(&expense, id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Masraf kaydı bulunamadı.")
		}
		if err := ensureNotInClosedShift(db, expense.CreatedAt); err != nil {
			return err
		}
		ref := fmt.Sprintf("EXP-%d", expense.ID)
		rText := fmt.Sprintf("Masraf silindi: %s ₺%.2f", expense.Category, expense.Amount)
		opName, opRole := resolveAuditOperator(c, db, operatorName, "manager")
		db.Create(&models.AuditLog{
			ActionType:   "DELETE_CASH_EXPENSE",
			OperatorName: opName,
			OperatorRole: opRole,
			TargetRef:    &ref,
			ReasonText:   &rText,
			Details: models.JSONMap{
				"expense_id":   expense.ID,
				"category":     expense.Category,
				"amount":       expense.Amount,
				"expense_type": expense.ExpenseType,
			},
		})
		db.Delete(&expense)
		reg := getOrCreateActiveRegister(db)
		return c.JSON(fiber.Map{
			"status":  "ok",
			"message": "Masraf kaydı başarıyla silindi.",
			"summary": calculateReportSummary(db, reg),
		})
	})

	group.Get("/x-report", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		cashierName := c.Query("cashier_name", "Kasiyer")
		reg := getOrCreateActiveRegister(db)
		summary := calculateReportSummary(db, reg)
		summary["report_type"] = "X-RAPORU (GÜN İÇİ ARA DENETİM)"
		summary["title"] = "X-RAPORU (ARA DENETİM)"
		summary["tenant_code"] = tenantCode
		summary["cashier_name"] = cashierName
		summary["date"] = time.Now().Format("02.01.2006 15:04:05")
		summary["generated_at"] = time.Now().Format("02.01.2006 15:04:05")
		summary["generated_at_iso"] = time.Now().UTC().Format(time.RFC3339)
		return c.JSON(summary)
	})

	group.Post("/z-report", middleware.IdempotencyMiddleware(10*time.Minute), func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CloseRegisterRequest
		_ = c.BodyParser(&payload)
		if payload.ClosedBy == "" {
			payload.ClosedBy = "Müdür"
		}
		if permErr := requirePermission(c, svc, db, payload.ClosedBy, []string{"reports_z_close"}, false, "Z-Raporu alma ve gün kapatma yetkiniz bulunmamaktadır."); permErr != nil {
			if payload.ManagerPin == nil || strings.TrimSpace(*payload.ManagerPin) == "" || !verifyCancelAuthorization(c, svc, db, payload.ClosedBy, payload.ManagerPin) {
				return permErr
			}
		}

		summary, err := service.ExecuteZReport(db, tenantCode, payload.ClosedBy, payload.ForceClose, svc.WSHub)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return c.JSON(summary)
	})

	group.Get("/auto-z-report", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		settings := service.GetAutoZReportSettings(db)
		return c.JSON(settings)
	})

	group.Post("/auto-z-report", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"reports_z_close", "def_general_settings"}, false, "Otomatik Z-Raporu ayarlarını değiştirme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		var payload service.AutoZReportSettings
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ayar verisi.")
		}
		if payload.Time == "" {
			payload.Time = "04:00"
		}
		current := service.GetAutoZReportSettings(db)
		current.Enabled = payload.Enabled
		current.Time = payload.Time
		current.ForceClose = payload.ForceClose
		service.SaveAutoZReportSettings(db, current)

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "AUTO_Z_REPORT_SETTINGS_UPDATED", current)
		return c.JSON(current)
	})

	group.Post("/auto-z-report/test", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		if err := requirePermission(c, svc, db, "", []string{"reports_z_close"}, false, "Otomatik Z-Raporu test etme yetkiniz bulunmamaktadır."); err != nil {
			return err
		}
		current := service.GetAutoZReportSettings(db)
		reg := getOrCreateActiveRegister(db)
		summary := calculateReportSummary(db, reg)
		loc := service.TurkeyLoc()
		now := time.Now().In(loc)
		current.LastRunStatus = fmt.Sprintf("Test Ön İzleme (Dry-Run) - %s", now.Format("15:04:05"))
		service.SaveAutoZReportSettings(db, current)
		return c.JSON(fiber.Map{
			"status":   "ok",
			"dry_run":  true,
			"message":  "Otomatik Z-Raporu dry-run kontrolü başarılı (kasa veya açık masalar kapatılmadı).",
			"settings": current,
			"summary":  summary,
		})
	})

	group.Get("/reports/day-end", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		targetDate := strings.TrimSpace(c.Query("target_date"))
		if targetDate == "" {
			targetDate = strings.TrimSpace(c.Query("date_str"))
		}
		if targetDate == "" {
			targetDate = strings.TrimSpace(c.Query("date"))
		}

		regIDStr := strings.TrimSpace(c.Query("register_id"))
		trLoc := service.TurkeyLoc()
		nowTR := time.Now().In(trLoc)
		todayTRStr := nowTR.Format("2006-01-02")

		var targetReg *models.CashRegister
		var dayStart, dayEnd time.Time

		if regIDStr != "" {
			var sr models.CashRegister
			if err := db.First(&sr, regIDStr).Error; err == nil {
				targetReg = &sr
				dayStart = sr.OpenedAt
				if sr.ClosedAt != nil && !sr.ClosedAt.IsZero() {
					dayEnd = *sr.ClosedAt
				} else {
					dayEnd = time.Now().UTC()
				}
			}
		}

		if dayStart.IsZero() && targetDate != "" {
			sUTC, eUTC, ok := service.ParseTRDateRange("", targetDate, targetDate)
			if ok && !sUTC.IsZero() {
				dayStart = sUTC
				dayEnd = eUTC
			}
		}

		var reg models.CashRegister
		if targetReg != nil {
			reg = *targetReg
		} else if targetDate == "" || targetDate == todayTRStr {
			reg = getOrCreateActiveRegister(db)
			if dayStart.IsZero() {
				dayStart, dayEnd = service.TRTodayBounds()
				if !reg.OpenedAt.IsZero() && reg.OpenedAt.Before(dayStart) {
					dayStart = reg.OpenedAt
				}
			}
		} else {
			var histReg models.CashRegister
			if err := db.Where("opened_at >= ? AND opened_at < ?", dayStart, dayEnd).Order("id desc").First(&histReg).Error; err == nil {
				reg = histReg
				targetReg = &histReg
			} else {
				reg = models.CashRegister{Status: "closed"}
			}
		}
		if dayStart.IsZero() {
			dayStart, dayEnd = service.TRTodayBounds()
		}

		useInclusiveEnd := targetReg != nil && targetReg.Status == "closed" && targetReg.ClosedAt != nil && !targetReg.ClosedAt.IsZero()
		endCmp := "created_at < ?"
		if useInclusiveEnd {
			endCmp = "created_at <= ?"
		}

		var orders []models.Order
		db.Preload("Items").Preload("Payments").Where("created_at >= ? AND "+endCmp, dayStart, dayEnd).Find(&orders)

		var validOrders, paidOrders, openOrders, cancelledOrders []models.Order
		validOrderIDs := make([]int, 0, len(orders))
		itemsByOrder := map[int][]models.OrderItem{}
		grossSales := 0.0
		netTurnover := 0.0
		totalDiscounts := 0.0
		totalTreats := 0.0
		totalKuver := 0
		kuverRevenue := 0.0
		voidItemsCount := 0
		voidTotalAmount := 0.0

		for _, o := range orders {
			if o.Status == "paid" || o.Status == "open" || o.Status == "bill_requested" || o.Status == "bill_printed" {
				validOrders = append(validOrders, o)
				validOrderIDs = append(validOrderIDs, o.ID)
				itemsByOrder[o.ID] = o.Items
				netTurnover += o.GrandTotal
				totalKuver += o.KuverCount
				kuverRevenue += o.KuverTotal
				itemDiscs := 0.0
				for _, it := range o.Items {
					if !it.IsVoided && !it.IsTreat {
						itemDiscs += it.DiscountAmount
					}
				}
				totalDiscounts += o.DiscountAmount + itemDiscs
				totalTreats += o.TreatAmount
			}
			if o.Status == "paid" {
				paidOrders = append(paidOrders, o)
			} else if o.Status == "open" || o.Status == "bill_requested" || o.Status == "bill_printed" {
				openOrders = append(openOrders, o)
			} else if o.Status == "cancelled" {
				cancelledOrders = append(cancelledOrders, o)
			}

			for _, it := range o.Items {
				if it.IsVoided {
					voidItemsCount++
					voidTotalAmount += it.TotalPrice
				}
			}
		}

		netTurnover = round2(netTurnover)
		totalDiscounts = round2(totalDiscounts)
		totalTreats = round2(totalTreats)
		grossSales = round2(netTurnover + totalDiscounts + totalTreats)
		kuverRevenue = round2(kuverRevenue)
		voidTotalAmount = round2(voidTotalAmount)

		var payments []models.Payment
		if len(validOrderIDs) > 0 {
			db.Where("order_id IN ? AND created_at >= ? AND "+endCmp, validOrderIDs, dayStart, dayEnd).Find(&payments)
		}

		type payAggItem struct {
			Name    string  `json:"name"`
			Amount  float64 `json:"amount"`
			Count   int     `json:"count"`
			Color   string  `json:"color"`
			Percent float64 `json:"percent"`
		}

		payAgg := map[string]*payAggItem{
			"cash":         {Name: "Nakit", Amount: 0.0, Count: 0, Color: "#10b981"},
			"credit_card":  {Name: "Kredi Kartı / POS", Amount: 0.0, Count: 0, Color: "#3b82f6"},
			"sodexo":       {Name: "Sodexo / Multinet / Ticket", Amount: 0.0, Count: 0, Color: "#8b5cf6"},
			"open_account": {Name: "Açık Hesap / Cari", Amount: 0.0, Count: 0, Color: "#f59e0b"},
			"online":       {Name: "Online Tahsilat", Amount: 0.0, Count: 0, Color: "#ec4899"},
		}

		totalTips := 0.0
		for _, p := range payments {
			target := service.PaymentBucketGroup(service.CategorizePaymentMethod(p.PaymentMethod))
			payAgg[target].Amount = round2(payAgg[target].Amount + p.Amount)
			payAgg[target].Count++
			totalTips = round2(totalTips + p.TipAmount)
		}

		if targetReg == nil || targetReg.Status == "open" {
			unpaidOpen := 0.0
			unpaidCount := 0
			for _, o := range validOrders {
				if o.Status != "paid" && o.RemainingTotal > 0 {
					unpaidOpen += o.RemainingTotal
					unpaidCount++
				}
			}
			if unpaidOpen > 0 {
				payAgg["open_account"].Amount = round2(payAgg["open_account"].Amount + unpaidOpen)
				payAgg["open_account"].Count += unpaidCount
			}
		}

		totPayAmt := 0.0
		for _, v := range payAgg {
			totPayAmt += v.Amount
		}
		for _, v := range payAgg {
			if totPayAmt > 0 {
				v.Percent = round2((v.Amount / totPayAmt) * 100)
			}
		}

		openingFloat := reg.OpeningFloat

		var expenses []models.CashExpense
		db.Where("created_at >= ? AND "+endCmp, dayStart, dayEnd).Find(&expenses)
		cashIn := 0.0
		cashOut := 0.0
		expensesList := make([]fiber.Map, 0, len(expenses))
		for _, e := range expenses {
			expType := e.ExpenseType
			if expType == "" {
				expType = "out"
			}
			if expType == "in" {
				if strings.EqualFold(strings.TrimSpace(e.Category), "Açılış Avansı") {
					openingFloat += e.Amount
				} else {
					cashIn += e.Amount
				}
			} else {
				cashOut += e.Amount
			}
			var cStr interface{}
			if !e.CreatedAt.IsZero() {
				cStr = e.CreatedAt.Format(time.RFC3339)
			}
			expensesList = append(expensesList, fiber.Map{
				"id":          e.ID,
				"category":    e.Category,
				"amount":      e.Amount,
				"type":        expType,
				"description": e.Description,
				"created_by":  e.CreatedBy,
				"created_at":  cStr,
			})
		}
		openingFloat = round2(openingFloat)
		cashIn = round2(cashIn)
		cashOut = round2(cashOut)
		totalExpenses := cashOut

		cashSales := payAgg["cash"].Amount
		expectedDrawerCash := round2(openingFloat + cashSales + cashIn - cashOut)

		prodVatMap := service.BuildProductVATMap(db)
		vatBreak := service.CalculateOrdersVATBreakdown(validOrders, itemsByOrder, prodVatMap)
		vat1Base := round2(vatBreak.Vat1Base)
		vat1Tax := round2(vatBreak.Vat1Tax)
		vat10Base := round2(vatBreak.Vat10Base)
		vat10Tax := round2(vatBreak.Vat10Tax)
		vat20Base := round2(vatBreak.Vat20Base)
		vat20Tax := round2(vatBreak.Vat20Tax)
		totalTax := round2(vatBreak.TotalTax)
		totalTaxBase := round2(vat1Base + vat10Base + vat20Base)

		channels := fiber.Map{
			"dine_in":  fiber.Map{"name": "Salon (Masa)", "orders": 0, "turnover": 0.0, "share": 0.0},
			"delivery": fiber.Map{"name": "Paket Servis (Kurye)", "orders": 0, "turnover": 0.0, "share": 0.0},
			"takeaway": fiber.Map{"name": "Gel-Al (Tezgah)", "orders": 0, "turnover": 0.0, "share": 0.0},
			"qr_order": fiber.Map{"name": "Masadan QR", "orders": 0, "turnover": 0.0, "share": 0.0},
		}

		waiterMap := make(map[string]*fiber.Map)
		catSales := make(map[string]*fiber.Map)

		for _, o := range validOrders {
			ot := strings.ToLower(o.OrderType)
			chKey := "dine_in"
			if ot == "delivery" || ot == "online_delivery" {
				chKey = "delivery"
			} else if ot == "takeaway" || ot == "gel_al" {
				chKey = "takeaway"
			} else if ot == "qr_order" || ot == "qr" {
				chKey = "qr_order"
			}
			ch := channels[chKey].(fiber.Map)
			ch["orders"] = ch["orders"].(int) + 1
			ch["turnover"] = round2(ch["turnover"].(float64) + o.GrandTotal)

			wn := o.WaiterName
			if wn == "" {
				wn = "Garson"
			}
			if _, exists := waiterMap[wn]; !exists {
				waiterMap[wn] = &fiber.Map{
					"waiter_name":  wn,
					"orders_count": 0,
					"turnover":     0.0,
				}
			}
			wEntry := *waiterMap[wn]
			wEntry["orders_count"] = wEntry["orders_count"].(int) + 1
			wEntry["turnover"] = round2(wEntry["turnover"].(float64) + o.GrandTotal)

			for _, it := range o.Items {
				if !it.IsVoided {
					st := strings.ToUpper(it.Station)
					if st == "" {
						st = "MUTFAK"
					}
					if _, exists := catSales[st]; !exists {
						catSales[st] = &fiber.Map{
							"name":     st,
							"quantity": 0.0,
							"turnover": 0.0,
						}
					}
					cEntry := *catSales[st]
					cEntry["quantity"] = round2(cEntry["quantity"].(float64) + it.Quantity)
					cEntry["turnover"] = round2(cEntry["turnover"].(float64) + it.TotalPrice)
				}
			}
		}

		channelList := make([]fiber.Map, 0, len(channels))
		for _, key := range []string{"dine_in", "delivery", "takeaway", "qr_order"} {
			ch := channels[key].(fiber.Map)
			if netTurnover > 0 {
				ch["share"] = round2((ch["turnover"].(float64) / netTurnover) * 100)
			}
			channelList = append(channelList, ch)
		}

		waiterList := make([]fiber.Map, 0, len(waiterMap))
		for _, v := range waiterMap {
			waiterList = append(waiterList, *v)
		}

		deptList := make([]fiber.Map, 0, len(catSales))
		for _, v := range catSales {
			deptList = append(deptList, *v)
		}

		avgTicket := 0.0
		if len(validOrders) > 0 {
			avgTicket = round2(netTurnover / float64(len(validOrders)))
		}

		payMethodsList := []fiber.Map{
			{"name": payAgg["cash"].Name, "amount": payAgg["cash"].Amount, "count": payAgg["cash"].Count, "color": payAgg["cash"].Color, "percent": payAgg["cash"].Percent},
			{"name": payAgg["credit_card"].Name, "amount": payAgg["credit_card"].Amount, "count": payAgg["credit_card"].Count, "color": payAgg["credit_card"].Color, "percent": payAgg["credit_card"].Percent},
			{"name": payAgg["sodexo"].Name, "amount": payAgg["sodexo"].Amount, "count": payAgg["sodexo"].Count, "color": payAgg["sodexo"].Color, "percent": payAgg["sodexo"].Percent},
			{"name": payAgg["open_account"].Name, "amount": payAgg["open_account"].Amount, "count": payAgg["open_account"].Count, "color": payAgg["open_account"].Color, "percent": payAgg["open_account"].Percent},
			{"name": payAgg["online"].Name, "amount": payAgg["online"].Amount, "count": payAgg["online"].Count, "color": payAgg["online"].Color, "percent": payAgg["online"].Percent},
		}

		dayTR := dayStart.In(trLoc)
		zNo := "Z-DRAFT-" + dayTR.Format("20060102")
		if reg.ZReportNo != nil && *reg.ZReportNo != "" {
			zNo = *reg.ZReportNo
		}
		var openedAtStr, closedAtStr interface{}
		if !reg.OpenedAt.IsZero() {
			openedAtStr = reg.OpenedAt.In(trLoc).Format("15:04:05")
		} else {
			openedAtStr = "--:--:--"
		}
		if reg.ClosedAt != nil && !reg.ClosedAt.IsZero() {
			closedAtStr = reg.ClosedAt.In(trLoc).Format("15:04:05")
		}

		return c.JSON(fiber.Map{
			"date":                dayTR.Format("2006-01-02"),
			"formatted_date":      dayTR.Format("02.01.2006"),
			"report_generated_at": time.Now().In(trLoc).Format("02.01.2006 15:04:05"),
			"z_report_no":         zNo,
			"is_closed":           reg.Status == "closed",
			"register_id":         reg.ID,
			"opened_at":           openedAtStr,
			"closed_at":           closedAtStr,
			"opened_by":           reg.OpenedBy,
			"closed_by":           reg.ClosedBy,
			"financial_summary": fiber.Map{
				"gross_sales":       grossSales,
				"net_turnover":      netTurnover,
				"total_discounts":   totalDiscounts,
				"total_treats":      totalTreats,
				"void_total_amount": voidTotalAmount,
				"void_items_count":  voidItemsCount,
				"kuver_revenue":     kuverRevenue,
				"total_kuver":       totalKuver,
				"total_orders":      len(validOrders),
				"paid_orders_count": len(paidOrders),
				"open_orders_count": len(openOrders),
				"average_ticket":    avgTicket,
			},
			"cash_flow": fiber.Map{
				"opening_float":        openingFloat,
				"cash_sales":           cashSales,
				"cash_in":              cashIn,
				"cash_out":             cashOut,
				"expected_drawer_cash": expectedDrawerCash,
				"expenses_list":        expensesList,
			},
			"payment_methods": payMethodsList,
			"vat_breakdown": fiber.Map{
				"vat_1":      fiber.Map{"rate": "%1", "base": vat1Base, "tax": vat1Tax, "total": round2(vat1Base + vat1Tax)},
				"vat_10":     fiber.Map{"rate": "%10", "base": vat10Base, "tax": vat10Tax, "total": round2(vat10Base + vat10Tax)},
				"vat_20":     fiber.Map{"rate": "%20", "base": vat20Base, "tax": vat20Tax, "total": round2(vat20Base + vat20Tax)},
				"total_base": totalTaxBase,
				"total_tax":  totalTax,
			},
			"channels":    channelList,
			"waiters":     waiterList,
			"departments": deptList,

			// Flat legacy fields for backward compatibility
			"opening_float":          openingFloat,
			"paid_orders_count":      len(paidOrders),
			"open_orders_count":      len(openOrders),
			"cancelled_orders_count": len(cancelledOrders),
			"total_kuver":            totalKuver,
			"gross_sales":            grossSales,
			"total_discounts":        totalDiscounts,
			"net_sales":              netTurnover,
			"total_tips":             totalTips,
			"total_expenses":         totalExpenses,
			"cash_in_drawer":         expectedDrawerCash,
			"expenses_list":          expensesList,
		})
	})

	group.Get("/reports/z-history", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var registers []models.CashRegister
		db.Order("id desc").Limit(100).Find(&registers)
		trLoc := service.TurkeyLoc()
		res := make([]fiber.Map, 0, len(registers))
		for _, r := range registers {
			var oStr, cStr interface{}
			if !r.OpenedAt.IsZero() {
				oStr = r.OpenedAt.In(trLoc).Format(time.RFC3339)
			}
			endBound := time.Now().UTC()
			if r.ClosedAt != nil && !r.ClosedAt.IsZero() {
				cStr = r.ClosedAt.In(trLoc).Format(time.RFC3339)
				endBound = *r.ClosedAt
			}

			var windowPayments []models.Payment
			db.Where("created_at >= ? AND created_at <= ?", r.OpenedAt, endBound).Find(&windowPayments)
			var cancelIDs []int
			pOrderIDs := make([]int, 0, len(windowPayments))
			for _, wp := range windowPayments {
				if wp.OrderID > 0 {
					pOrderIDs = append(pOrderIDs, wp.OrderID)
				}
			}
			cancelledSet := make(map[int]bool)
			if len(pOrderIDs) > 0 {
				db.Model(&models.Order{}).Where("id IN ? AND status = ?", pOrderIDs, "cancelled").Pluck("id", &cancelIDs)
				for _, cid := range cancelIDs {
					cancelledSet[cid] = true
				}
			}
			regTips := 0.0
			for _, wp := range windowPayments {
				if cancelledSet[wp.OrderID] {
					continue
				}
				regTips = round2(regTips + wp.TipAmount)
			}

			var windowExpenses []models.CashExpense
			db.Where("created_at >= ? AND created_at <= ?", r.OpenedAt, endBound).Find(&windowExpenses)
			openingFloat := r.OpeningFloat
			cashIn := 0.0
			for _, ex := range windowExpenses {
				if strings.EqualFold(ex.ExpenseType, "in") {
					if strings.EqualFold(strings.TrimSpace(ex.Category), "Açılış Avansı") {
						openingFloat += ex.Amount
					} else {
						cashIn += ex.Amount
					}
				}
			}
			openingFloat = round2(openingFloat)
			cashIn = round2(cashIn)

			mealCard := round2(r.TotalMultinet + r.TotalSodexo + r.TotalTicket)
			turnover := round2(r.TotalCash + r.TotalCard + mealCard + r.TotalOther)
			if r.TotalRevenue > 0 {
				turnover = round2(r.TotalRevenue)
			}
			zNo := ""
			if r.ZReportNo != nil && *r.ZReportNo != "" {
				zNo = *r.ZReportNo
			} else {
				zNo = fmt.Sprintf("Z-%s-%04d", r.OpenedAt.In(trLoc).Format("20060102"), r.ID)
			}
			res = append(res, fiber.Map{
				"id":                   r.ID,
				"register_id":          r.ID,
				"z_report_no":          zNo,
				"opened_at":            oStr,
				"closed_at":            cStr,
				"opened_by":            r.OpenedBy,
				"closed_by":            r.ClosedBy,
				"status":               r.Status,
				"opening_float":        openingFloat,
				"cash_in":              cashIn,
				"cash_sales":           r.TotalCash,
				"card_sales":           r.TotalCard,
				"meal_card_sales":      mealCard,
				"total_tips":           regTips,
				"total_discounts":      r.TotalDiscounts,
				"total_expenses":       r.TotalExpenses,
				"closing_cash_counted": round2(openingFloat + r.TotalCash + cashIn - r.TotalExpenses),
				"total_turnover":       turnover,
				"total_revenue":        turnover,
			})
		}
		return c.JSON(res)
	})
}
