package api

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func recalculateOrderTotals(db *gorm.DB, order *models.Order) {
	var items []models.OrderItem
	db.Where("order_id = ?", order.ID).Find(&items)

	subtotal := 0.0
	itemDiscountsTotal := 0.0
	treatTotal := 0.0
	taxTotal := 0.0

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
		vatAmount := item.TotalPrice - (item.TotalPrice / 1.10)
		taxTotal += vatAmount
	}

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
			"vat_rate":           10.0,
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
		"kuver_count":     order.KuverCount,
		"kuver_total":     order.KuverTotal,
		"subtotal":        order.Subtotal,
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
	group.Get("/analytics/statistics", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		dateRange := c.Query("date_range")
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")

		now := time.Now()
		loc := now.Location()
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		todayEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, loc)

		query := db.Model(&models.Order{})
		if startDate != "" {
			if dt, err := time.Parse("2006-01-02", startDate); err == nil {
				query = query.Where("created_at >= ?", dt)
			}
		} else if dateRange == "today" {
			query = query.Where("created_at >= ? AND created_at <= ?", todayStart, todayEnd)
		} else if dateRange == "yesterday" {
			yStart := todayStart.AddDate(0, 0, -1)
			yEnd := todayEnd.AddDate(0, 0, -1)
			query = query.Where("created_at >= ? AND created_at <= ?", yStart, yEnd)
		} else if dateRange == "week" {
			wStart := todayStart.AddDate(0, 0, -7)
			query = query.Where("created_at >= ?", wStart)
		} else if dateRange == "month" {
			mStart := todayStart.AddDate(0, 0, -30)
			query = query.Where("created_at >= ?", mStart)
		}

		if endDate != "" {
			if dt, err := time.Parse("2006-01-02", endDate); err == nil {
				dtEnd := time.Date(dt.Year(), dt.Month(), dt.Day(), 23, 59, 59, 999999999, dt.Location())
				query = query.Where("created_at <= ?", dtEnd)
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
				pm := strings.ToLower(p.PaymentMethod)
				target := "cash"
				if strings.Contains(pm, "card") || strings.Contains(pm, "kredi") || strings.Contains(pm, "pos") {
					target = "credit_card"
				} else if strings.Contains(pm, "sodexo") || strings.Contains(pm, "ticket") || strings.Contains(pm, "multinet") || strings.Contains(pm, "yemek") {
					target = "sodexo"
				} else if strings.Contains(pm, "cari") || strings.Contains(pm, "hesap") || strings.Contains(pm, "open") {
					target = "open_account"
				} else if strings.Contains(pm, "online") {
					target = "online"
				}

				paymentMap[target].Amount = round2(paymentMap[target].Amount + p.Amount)
				paymentMap[target].Count++
				paymentBreakdownLegacy[p.PaymentMethod] = round2(paymentBreakdownLegacy[p.PaymentMethod] + p.Amount)
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
		voidAmount := 0.0
		voidCount := 0
		treatAmount := 0.0
		treatCount := 0

		for _, it := range allItems {
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

			if it.IsVoided {
				voidCount++
				voidAmount += it.TotalPrice
				continue
			}
			if it.IsTreat {
				treatCount++
				treatAmount += it.TotalPrice
				continue
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

		weekdayBuckets := make([]float64, 7)
		weekdayOrders := make([]int, 7)
		weekDayNames := []string{"Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"}

		for _, o := range paidOrders {
			if !o.CreatedAt.IsZero() {
				h := o.CreatedAt.Hour()
				hourlyBuckets[h]["orders"] = hourlyBuckets[h]["orders"].(int) + 1
				hourlyBuckets[h]["revenue"] = round2(hourlyBuckets[h]["revenue"].(float64) + o.GrandTotal)
				hourlyBuckets[h]["turnover"] = hourlyBuckets[h]["revenue"]

				slotIdx := (h - 8) / 2
				if slotIdx < 0 {
					slotIdx = 0
				}
				if slotIdx > 7 {
					slotIdx = 7
				}
				hourlySlots[slotIdx].OrdersCount++
				hourlySlots[slotIdx].Turnover = round2(hourlySlots[slotIdx].Turnover + o.GrandTotal)

				wd := int(o.CreatedAt.Weekday())
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

		chartHours := make([]fiber.Map, 0, 15)
		for h := 9; h <= 23; h++ {
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

		recentBills := make([]fiber.Map, 0, 20)
		limitCount := len(allOrders)
		if limitCount > 20 {
			limitCount = 20
		}
		for i := 0; i < limitCount; i++ {
			o := allOrders[i]
			tName := ""
			if o.TableID != nil {
				tName = tableMap[*o.TableID]
			}
			if tName == "" {
				if o.OrderType == "delivery" {
					tName = fmt.Sprintf("Paket #%d", o.ID)
				} else {
					tName = "Hızlı Satış"
				}
			}
			tStr := "--:--"
			if !o.CreatedAt.IsZero() {
				tStr = o.CreatedAt.Format("15:04")
			}
			stName := "Açık"
			if o.Status == "paid" {
				stName = "Ödendi"
			}
			pmStr := "Nakit"
			if o.Status != "paid" {
				pmStr = "Açık Masa"
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
		db.Order("id desc").Limit(30).Find(&deliveryOrders)

		courierDeliveryCounts := map[int]int{}
		for _, do := range deliveryOrders {
			if do.CourierID != nil {
				courierDeliveryCounts[*do.CourierID]++
			}
		}

		courierList := make([]fiber.Map, 0, len(couriers))
		for _, cr := range couriers {
			cStat := "Müsait"
			if !cr.IsActive {
				cStat = "Pasif"
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
				"avg_time":         "22 dk",
				"status":           cStat,
			})
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
				"avg_stay":    "45 dk",
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
				"avg_stay":    "25 dk",
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
				"avg_stay":    "10 dk",
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
				"avg_stay":    "35 dk",
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
		db.Find(&expenses)
		totalExpenses := 0.0
		for _, e := range expenses {
			totalExpenses += e.Amount
		}
		totalExpenses = round2(totalExpenses)

		grossSales := round2(totalRevenue + totalDiscount + treatAmount)

		deliveryPlatforms := []fiber.Map{
			{"name": "Telefon / Restoran", "orders": channelCounts["delivery"], "turnover": channelTurnover["delivery"], "share": 100.0, "badge": "bg-slate-700"},
			{"name": "Yemeksepeti", "orders": 0, "turnover": 0.0, "share": 0.0, "badge": "bg-rose-600"},
			{"name": "Getir Yemek", "orders": 0, "turnover": 0.0, "share": 0.0, "badge": "bg-purple-600"},
			{"name": "Trendyol Yemek", "orders": 0, "turnover": 0.0, "share": 0.0, "badge": "bg-orange-500"},
			{"name": "Migros Yemek", "orders": 0, "turnover": 0.0, "share": 0.0, "badge": "bg-amber-600"},
		}

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
					"vat_1":  fiber.Map{"rate": "%1", "base": round2(totalRevenue * 0.10), "tax": round2(totalRevenue * 0.10 * 0.01)},
					"vat_10": fiber.Map{"rate": "%10", "base": round2(totalRevenue * 0.75), "tax": round2(totalRevenue * 0.75 * 0.10)},
					"vat_20": fiber.Map{"rate": "%20", "base": round2(totalRevenue * 0.15), "tax": round2(totalRevenue * 0.15 * 0.20)},
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
				"total_turnover": channelTurnover["delivery"],
				"total_orders":   channelCounts["delivery"],
				"avg_ticket":     0.0,
				"on_the_way":     0,
				"delivered":      channelCounts["delivery"],
				"cancelled":      0,
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
				"treat_items":     []fiber.Map{},
				"void_items":      []fiber.Map{},
				"discount_orders": []fiber.Map{},
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
	})

	group.Get("/reports/product-sales", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")

		query := db.Model(&models.Order{}).Where("status = ?", "paid")
		if startDate != "" {
			if dt, err := time.Parse("2006-01-02", startDate); err == nil {
				query = query.Where("created_at >= ?", dt)
			}
		}
		if endDate != "" {
			if dt, err := time.Parse("2006-01-02", endDate); err == nil {
				dtEnd := time.Date(dt.Year(), dt.Month(), dt.Day(), 23, 59, 59, 999999999, dt.Location())
				query = query.Where("created_at <= ?", dtEnd)
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
			db.Where("order_id IN ? AND is_voided = ? AND is_treat = ?", orderIDs, false, false).Find(&items)
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
		for _, cat := range allCats {
			catMap[cat.ID] = cat
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
		for _, r := range recipes {
			if ing, ok := ingMap[r.IngredientID]; ok {
				unitCosts[r.ProductID] += r.Amount * ing.CostPerUnit
			}
		}

		type pSale struct {
			ProductID     int     `json:"product_id"`
			Name          string  `json:"name"`
			Category      string  `json:"category"`
			CategoryColor string  `json:"category_color"`
			UnitPrice     float64 `json:"unit_price"`
			UnitCost      float64 `json:"unit_cost"`
			Quantity      float64 `json:"quantity"`
			Revenue       float64 `json:"revenue"`
			TotalCost     float64 `json:"total_cost"`
			Profit        float64 `json:"profit"`
			OrdersCount   int     `json:"orders_count"`
			ProfitMargin  float64 `json:"profit_margin"`
			RevenueShare  float64 `json:"revenue_share"`
		}
		salesMap := map[int]*pSale{}
		totalQty := 0.0
		totalRev := 0.0
		totalCost := 0.0

		for _, it := range items {
			prod, ok := prodMap[it.ProductID]
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
			uCost := unitCosts[it.ProductID]
			if uCost == 0 && ok {
				uCost = round2(prod.BasePrice * 0.35)
			}

			if _, exists := salesMap[it.ProductID]; !exists {
				salesMap[it.ProductID] = &pSale{
					ProductID:     it.ProductID,
					Name:          pName,
					Category:      catName,
					CategoryColor: catColor,
					UnitPrice:     it.UnitPrice,
					UnitCost:      round2(uCost),
				}
			}
			st := salesMap[it.ProductID]
			itemCost := round2(uCost * it.Quantity)
			st.Quantity = round2(st.Quantity + it.Quantity)
			st.Revenue = round2(st.Revenue + it.TotalPrice)
			st.TotalCost = round2(st.TotalCost + itemCost)
			st.Profit = round2(st.Revenue - st.TotalCost)
			st.OrdersCount++

			totalQty += it.Quantity
			totalRev += it.TotalPrice
			totalCost += itemCost
		}

		productsList := make([]pSale, 0, len(salesMap))
		for _, p := range salesMap {
			if p.Revenue > 0 {
				p.ProfitMargin = round2((p.Profit / p.Revenue) * 100)
			}
			if totalRev > 0 {
				p.RevenueShare = round2((p.Revenue / totalRev) * 100)
			}
			productsList = append(productsList, *p)
		}
		sort.Slice(productsList, func(i, j int) bool { return productsList[i].Revenue > productsList[j].Revenue })

		return c.JSON(fiber.Map{
			"summary": fiber.Map{
				"total_products_sold": len(productsList),
				"total_quantity":      round2(totalQty),
				"total_revenue":       round2(totalRev),
				"total_cost":          round2(totalCost),
				"total_profit":        round2(totalRev - totalCost),
			},
			"products": productsList,
		})
	})

	group.Get("/reports/closed-bills", func(c *fiber.Ctx) error {
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

		now := time.Now()
		loc := now.Location()
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		todayEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, loc)

		query := db.Model(&models.Order{})
		switch statusFilter {
		case "paid":
			query = query.Where("status = ?", "paid")
		case "cancelled":
			query = query.Where("status = ?", "cancelled")
		default:
			query = query.Where("status IN ?", []string{"paid", "cancelled"})
		}

		if startDate != "" {
			if dt, err := time.Parse("2006-01-02", startDate); err == nil {
				query = query.Where("created_at >= ?", dt)
			}
		} else if dateRange == "today" {
			query = query.Where("created_at >= ? AND created_at <= ?", todayStart, todayEnd)
		} else if dateRange == "yesterday" {
			yStart := todayStart.AddDate(0, 0, -1)
			yEnd := todayEnd.AddDate(0, 0, -1)
			query = query.Where("created_at >= ? AND created_at <= ?", yStart, yEnd)
		} else if dateRange == "week" {
			wStart := todayStart.AddDate(0, 0, -7)
			query = query.Where("created_at >= ?", wStart)
		} else if dateRange == "month" {
			mStart := todayStart.AddDate(0, 0, -30)
			query = query.Where("created_at >= ?", mStart)
		}

		if endDate != "" {
			if dt, err := time.Parse("2006-01-02", endDate); err == nil {
				dtEnd := time.Date(dt.Year(), dt.Month(), dt.Day(), 23, 59, 59, 999999999, dt.Location())
				query = query.Where("created_at <= ?", dtEnd)
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
				cashierName := strings.ToLower(fmt.Sprintf("%v", sOrder["cashier_name"]))
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
					if pMethod == "cash" {
						cashTotal += amt
					} else if pMethod == "credit_card" {
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
	})

	group.Post("/create", func(c *fiber.Ctx) error {
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
				if err := repository.WithRowLock(tx).Where("table_id = ? AND status = ?", *payload.TableID, "open").First(&existingOrder).Error; err == nil {
					isAppendedToExisting = true
					if err := service.ValidateBOMStockForItems(tx, payload.Items); err != nil {
						return err
					}

					for _, itemIn := range payload.Items {
						var prod models.Product
						if err := tx.First(&prod, itemIn.ProductID).Error; err != nil {
							continue
						}
						unitPrice := prod.BasePrice
						if itemIn.UnitPrice != nil {
							unitPrice = *itemIn.UnitPrice
						}
						modTotal := 0.0
						modsSlice := make(models.ModifierSlice, 0, len(itemIn.SelectedModifiers))
						for _, m := range itemIn.SelectedModifiers {
							modTotal += m.Price
							modsSlice = append(modsSlice, m)
						}
						finalUnit := unitPrice + modTotal
						qty := itemIn.Quantity
						if qty <= 0 {
							qty = 1
						}
						lineTotal := round2(finalUnit * qty)
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
			var count int64
			tx.Model(&models.Order{}).Count(&count)
			orderNo := fmt.Sprintf("ADS-%s-%04d", now.Format("20060102"), count+1)

			kuverCount := 0
			if payload.KuverCount != nil {
				kuverCount = *payload.KuverCount
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
				var prod models.Product
				if err := tx.First(&prod, itemIn.ProductID).Error; err != nil {
					continue
				}
				unitPrice := prod.BasePrice
				if itemIn.UnitPrice != nil {
					unitPrice = *itemIn.UnitPrice
				}
				modTotal := 0.0
				modsSlice := make(models.ModifierSlice, 0, len(itemIn.SelectedModifiers))
				for _, m := range itemIn.SelectedModifiers {
					modTotal += m.Price
					modsSlice = append(modsSlice, m)
				}
				finalUnit := unitPrice + modTotal
				qty := itemIn.Quantity
				if qty <= 0 {
					qty = 1
				}
				lineTotal := round2(finalUnit * qty)
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
			tx.Create(&models.AuditLog{
				ActionType:   "TABLE_OPENED",
				OperatorName: order.WaiterName,
				OperatorRole: "waiter",
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
			item.IsVoided = true
			reason := payload.ReasonCode
			if payload.ReasonText != nil && *payload.ReasonText != "" {
				reason = fmt.Sprintf("%s: %s", payload.ReasonCode, *payload.ReasonText)
			}
			item.VoidReason = &reason
			op := payload.OperatorName
			item.VoidedBy = &op
			item.Status = "voided"
			if err := tx.Save(&item).Error; err != nil {
				return err
			}

			recalculateOrderTotals(tx, &order)
			if err := tx.Save(&order).Error; err != nil {
				return err
			}

			ref := order.OrderNo
			rCode := payload.ReasonCode
			tx.Create(&models.AuditLog{
				ActionType:   "VOID_ITEM",
				OperatorName: payload.OperatorName,
				OperatorRole: "manager",
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
		var order models.Order
		if err := db.First(&order, item.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
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
		db.Create(&models.AuditLog{
			ActionType:   "APPLY_ITEM_DISCOUNT",
			OperatorName: payload.OperatorName,
			OperatorRole: "manager",
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
		itemID, _ := strconv.Atoi(c.Params("item_id"))
		var item models.OrderItem
		if err := db.First(&item, itemID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sipariş kalemi bulunamadı")
		}
		var order models.Order
		if err := db.First(&order, item.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
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

			if err := service.ValidateBOMStockForItems(tx, payload.Items); err != nil {
				return err
			}

			for _, itemIn := range payload.Items {
				var prod models.Product
				if err := tx.First(&prod, itemIn.ProductID).Error; err != nil {
					continue
				}
				unitPrice := prod.BasePrice
				if itemIn.UnitPrice != nil {
					unitPrice = *itemIn.UnitPrice
				}
				modTotal := 0.0
				modsSlice := make(models.ModifierSlice, 0, len(itemIn.SelectedModifiers))
				for _, m := range itemIn.SelectedModifiers {
					modTotal += m.Price
					modsSlice = append(modsSlice, m)
				}
				finalUnit := unitPrice + modTotal
				qty := itemIn.Quantity
				if qty <= 0 {
					qty = 1
				}
				lineTotal := round2(finalUnit * qty)
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
			var items []models.OrderItem
			tx.Where("order_id = ?", order.ID).Find(&items)
			for i := range items {
				if !items[i].IsVoided {
					items[i].IsVoided = true
					r := payload.ReasonText
					items[i].VoidReason = &r
					op := payload.OperatorName
					items[i].VoidedBy = &op
					items[i].Status = "voided"
					tx.Save(&items[i])
				}
			}
			order.Status = "cancelled"
			now := time.Now().UTC()
			order.ClosedAt = &now
			recalculateOrderTotals(tx, &order)

			if order.TableID != nil {
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

			openedAtStr := ""
			if !order.CreatedAt.IsZero() {
				openedAtStr = order.CreatedAt.Local().Format("02.01.2006 15:04")
			}
			closedAtStr := time.Now().Local().Format("02.01.2006 15:04")
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
			tx.Create(&models.AuditLog{
				ActionType:   "CANCEL_ORDER",
				OperatorName: payload.OperatorName,
				OperatorRole: "manager",
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
		recalculateOrderTotals(db, &order)
		reason := payload.Reason
		order.DiscountReason = &reason
		if payload.DiscountType == "percentage" {
			order.DiscountRate = payload.Value
			order.DiscountAmount = round2(order.Subtotal * (payload.Value / 100.0))
		} else {
			order.DiscountRate = 0
			order.DiscountAmount = round2(payload.Value)
		}
		recalculateOrderTotals(db, &order)

		ref := order.OrderNo
		db.Create(&models.AuditLog{
			ActionType:   "APPLY_DISCOUNT",
			OperatorName: payload.OperatorName,
			OperatorRole: "manager",
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

		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
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

	group.Post("/:order_id/remove-all-discounts", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		orderID, _ := strconv.Atoi(c.Params("order_id"))
		var order models.Order
		if err := db.First(&order, orderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
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
		db.Create(&models.AuditLog{
			ActionType:   "TREAT_ITEMS",
			OperatorName: payload.OperatorName,
			OperatorRole: "manager",
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
			tx.Create(&models.AuditLog{
				ActionType:   "REOPEN_ORDER",
				OperatorName: payload.OperatorName,
				OperatorRole: "manager",
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
		station := c.Query("station")

		var openOrders []models.Order
		db.Where("status = ?", "open").Order("created_at asc").Find(&openOrders)
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
				if station != "" && station != "all" && itemStation != station {
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
					"id":                 item.ID,
					"product_id":         item.ProductID,
					"product_name":       pName,
					"station":            itemStation,
					"variant_name":       item.VariantName,
					"quantity":           item.Quantity,
					"selected_modifiers": mods,
					"negative_modifiers": negMods,
					"kitchen_note":       item.KitchenNote,
					"course_stage":       item.CourseStage,
					"is_hold":            item.IsHold,
					"status":             item.Status,
					"kds_status":         item.Status,
					"created_at":         createdStr,
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
				"elapsed_seconds": elapsedSeconds,
				"created_at":      createdStr,
				"items":           kdsItems,
			})
		}
		return c.JSON(result)
	})

	group.Post("/item/:item_id/progress", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		itemID, _ := strconv.Atoi(c.Params("item_id"))
		status := c.Query("status")

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
}

// ============================================================================
// 7. CASHIER, PAYMENTS & Z-REPORT ROUTER (/api/cashier)
// ============================================================================

func getOrCreateActiveRegister(db *gorm.DB) models.CashRegister {
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

func calculateReportSummary(db *gorm.DB, reg models.CashRegister) fiber.Map {
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
		methodTotals[p.PaymentMethod] = round2(methodTotals[p.PaymentMethod] + p.Amount)
		totalTips = round2(totalTips + p.TipAmount)
	}

	var expenses []models.CashExpense
	db.Where("created_at >= ?", reg.OpenedAt).Find(&expenses)
	totalExpenses := 0.0
	expensesList := make([]fiber.Map, 0, len(expenses))
	for _, e := range expenses {
		totalExpenses += e.Amount
		var cStr interface{}
		if !e.CreatedAt.IsZero() {
			cStr = e.CreatedAt.Format(time.RFC3339)
		}
		expensesList = append(expensesList, fiber.Map{
			"id":          e.ID,
			"category":    e.Category,
			"amount":      e.Amount,
			"description": e.Description,
			"created_at":  cStr,
		})
	}

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
	cashExpected := round2(reg.OpeningFloat + methodTotals["cash"] - totalExpenses)

	var openedAtStr interface{}
	if !reg.OpenedAt.IsZero() {
		openedAtStr = reg.OpenedAt.Format(time.RFC3339)
	}

	return fiber.Map{
		"id":                     reg.ID,
		"register_id":            reg.ID,
		"opened_at":              openedAtStr,
		"opened_by":              reg.OpenedBy,
		"opening_float":          reg.OpeningFloat,
		"paid_orders_count":      len(paidOrders),
		"open_orders_count":      len(openOrders),
		"cancelled_orders_count": len(cancelledOrders),
		"total_kuver":            totalKuver,
		"gross_sales":            round2(grossSales),
		"total_revenue":          round2(grossSales),
		"total_discounts":        round2(totalDiscounts),
		"net_sales":              round2(netSales),
		"total_tips":             totalTips,
		"payment_breakdown":      methodTotals,
		"total_expenses":         round2(totalExpenses),
		"cash_in_drawer":         cashExpected,
		"void_and_discount_logs": len(voidLogs),
		"expenses_list":          expensesList,
	}
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

	group.Post("/settle-payment", func(c *fiber.Ctx) error {
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

		var order models.Order
		isFullyPaid := false

		// ACID Transaction with Row-Level Locks on Order and Table
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := repository.WithRowLock(tx).First(&order, payload.OrderID).Error; err != nil {
				return fiber.NewError(fiber.StatusNotFound, "Adisyon bulunamadı")
			}

			for idx, p := range payload.Payments {
				rAmt := 0.0
				if idx == 0 {
					rAmt = round2(payload.Rounding)
				}
				paymentRow := models.Payment{
					OrderID:        order.ID,
					PaymentMethod:  p.ResolvedMethod(),
					Amount:         round2(p.Amount),
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
				order.Status = "paid"
				now := time.Now().UTC()
				order.ClosedAt = &now
				cName := payload.CashierName
				order.CashierName = &cName
				isFullyPaid = true

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

				if closeTable && order.TableID != nil {
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

						var strayOrders []models.Order
						tx.Where("table_id = ? AND status = ? AND id != ?", tbl.ID, "open", order.ID).Find(&strayOrders)
						for i := range strayOrders {
							strayOrders[i].Status = "paid"
							strayOrders[i].RemainingTotal = 0.0
							strayOrders[i].ClosedAt = &now
							tx.Save(&strayOrders[i])
						}
					}
				}

				closedAtStr := now.Local().Format("02.01.2006 15:04")
				ref := fmt.Sprintf("%s (#%s)", tblName, order.OrderNo)
				rc := "HESAP_KAPATILDI"
				rt := fmt.Sprintf("Masa %s hesabı kapatıldı. Açılış: %s, Kapanış: %s (%d dk). Toplam: ₺%.2f", tblName, openedAtStr, closedAtStr, durationMin, order.GrandTotal)
				tx.Create(&models.AuditLog{
					ActionType:   "TABLE_CLOSED",
					OperatorName: payload.CashierName,
					OperatorRole: "cashier",
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
		})
		if isFullyPaid && order.TableID != nil {
			svc.WSHub.BroadcastToChannel(tenantCode, "pos", "TABLE_STATUS_CHANGED", fiber.Map{
				"table_id": *order.TableID,
				"status":   "empty",
			})
			svc.WSHub.BroadcastToTable(tenantCode, *order.TableID, "TABLE_BILL_CLOSED", fiber.Map{
				"order_id": order.ID,
			})
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
			"is_fully_paid":   isFullyPaid,
			"message":         "Payment recorded successfully",
			"table_status":    "empty",
		})
	})

	group.Delete("/payments/:payment_id", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		paymentID, _ := strconv.Atoi(c.Params("payment_id"))
		operatorName := c.Query("operator_name", "Yönetici")

		var payment models.Payment
		if err := db.First(&payment, paymentID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ödeme kaydı bulunamadı")
		}
		var order models.Order
		if err := db.First(&order, payment.OrderID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İlgili adisyon bulunamadı")
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
		db.Create(&models.AuditLog{
			ActionType:   "DELETE_PAYMENT",
			OperatorName: operatorName,
			OperatorRole: "manager",
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
		if startDate != "" {
			if dt, err := time.Parse("2006-01-02", startDate); err == nil {
				query = query.Where("created_at >= ?", dt)
			}
		}
		if endDate != "" {
			if dt, err := time.Parse("2006-01-02", endDate); err == nil {
				dtEnd := time.Date(dt.Year(), dt.Month(), dt.Day(), 23, 59, 59, 999999999, dt.Location())
				query = query.Where("created_at <= ?", dtEnd)
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
			res = append(res, fiber.Map{
				"id":          e.ID,
				"category":    e.Category,
				"amount":      e.Amount,
				"description": e.Description,
				"created_by":  e.CreatedBy,
				"created_at":  cStr,
			})
		}
		return c.JSON(res)
	})

	group.Get("/x-report", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		reg := getOrCreateActiveRegister(db)
		summary := calculateReportSummary(db, reg)
		summary["report_type"] = "X-RAPORU (ARA KASA ÖZETİ)"
		summary["generated_at"] = time.Now().UTC().Format(time.RFC3339)
		return c.JSON(summary)
	})

	group.Post("/z-report", func(c *fiber.Ctx) error {
		db, tenantCode, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		var payload models.CloseRegisterRequest
		_ = c.BodyParser(&payload)
		if payload.ClosedBy == "" {
			payload.ClosedBy = "Müdür"
		}

		reg := getOrCreateActiveRegister(db)
		summary := calculateReportSummary(db, reg)

		var openOrdersCount int64
		db.Model(&models.Order{}).Where("status = ?", "open").Count(&openOrdersCount)
		if openOrdersCount > 0 {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Açıkta %d adet adisyon var! Z-Raporu almadan önce tüm masaları kapatmalısınız.", openOrdersCount))
		}

		now := time.Now().UTC()
		reg.Status = "closed"
		reg.ClosedAt = &now
		reg.ClosedBy = &payload.ClosedBy
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
			OpenedBy:     payload.ClosedBy,
			Status:       "open",
		}
		db.Create(&newReg)

		db.Create(&models.AuditLog{
			ActionType:   "Z_REPORT_CLOSED",
			OperatorName: payload.ClosedBy,
			OperatorRole: "manager",
			TargetRef:    &zNo,
			Details:      models.JSONMap(summary),
		})

		summary["report_type"] = "Z-RAPORU (GÜN SONU KESİN KAPANIŞ)"
		summary["closed_at"] = now.Format(time.RFC3339)
		summary["closed_by"] = payload.ClosedBy

		svc.WSHub.BroadcastToChannel(tenantCode, "pos", "Z_REPORT_COMPLETED", summary)
		return c.JSON(summary)
	})

	group.Get("/reports/day-end", func(c *fiber.Ctx) error {
		db, _, err := getTenantDB(c, svc)
		if err != nil {
			return err
		}
		targetDate := c.Query("target_date")
		now := time.Now().UTC()
		var dayStart, dayEnd time.Time
		if targetDate != "" {
			if dt, err := time.Parse("2006-01-02", targetDate); err == nil {
				dayStart = time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, time.UTC)
				dayEnd = time.Date(dt.Year(), dt.Month(), dt.Day(), 23, 59, 59, 999999999, time.UTC)
			}
		}
		if dayStart.IsZero() {
			dayStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
			dayEnd = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, time.UTC)
		}

		var orders []models.Order
		db.Preload("Items").Preload("Payments").Where("created_at >= ? AND created_at <= ?", dayStart, dayEnd).Find(&orders)

		var validOrders, paidOrders, openOrders, cancelledOrders []models.Order
		grossSales := 0.0
		netTurnover := 0.0
		totalDiscounts := 0.0
		totalTreats := 0.0
		totalKuver := 0
		kuverRevenue := 0.0
		voidItemsCount := 0
		voidTotalAmount := 0.0

		for _, o := range orders {
			if o.Status == "paid" || o.Status == "open" || o.Status == "bill_requested" {
				validOrders = append(validOrders, o)
				netTurnover += o.GrandTotal
				totalKuver += o.KuverCount
				kuverRevenue += o.KuverTotal
			}
			if o.Status == "paid" {
				paidOrders = append(paidOrders, o)
			} else if o.Status == "open" || o.Status == "bill_requested" {
				openOrders = append(openOrders, o)
			} else if o.Status == "cancelled" {
				cancelledOrders = append(cancelledOrders, o)
			}
			totalDiscounts += o.DiscountAmount
			totalTreats += o.TreatAmount

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
		db.Where("created_at >= ? AND created_at <= ?", dayStart, dayEnd).Find(&payments)

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
			pm := strings.ToLower(p.PaymentMethod)
			target := "cash"
			if strings.Contains(pm, "card") || strings.Contains(pm, "kredi") || strings.Contains(pm, "pos") {
				target = "credit_card"
			} else if strings.Contains(pm, "sodexo") || strings.Contains(pm, "multinet") || strings.Contains(pm, "ticket") || strings.Contains(pm, "yemek") {
				target = "sodexo"
			} else if strings.Contains(pm, "cari") || strings.Contains(pm, "hesap") || strings.Contains(pm, "open") {
				target = "open_account"
			} else if strings.Contains(pm, "online") {
				target = "online"
			}
			payAgg[target].Amount = round2(payAgg[target].Amount + p.Amount)
			payAgg[target].Count++
			totalTips = round2(totalTips + p.TipAmount)
		}

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

		totPayAmt := 0.0
		for _, v := range payAgg {
			totPayAmt += v.Amount
		}
		for _, v := range payAgg {
			if totPayAmt > 0 {
				v.Percent = round2((v.Amount / totPayAmt) * 100)
			}
		}

		var expenses []models.CashExpense
		db.Where("created_at >= ? AND created_at <= ?", dayStart, dayEnd).Find(&expenses)
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
				"id":          e.ID,
				"category":    e.Category,
				"amount":      e.Amount,
				"type":        expType,
				"description": e.Description,
				"created_by":  e.CreatedBy,
				"created_at":  cStr,
			})
		}
		cashIn = round2(cashIn)
		cashOut = round2(cashOut)
		totalExpenses := cashOut

		reg := getOrCreateActiveRegister(db)
		cashSales := payAgg["cash"].Amount
		expectedDrawerCash := round2(reg.OpeningFloat + cashSales + cashIn - cashOut)

		vat1Base := round2(netTurnover * 0.05)
		vat1Tax := round2(vat1Base * 0.01)
		vat10Base := round2(netTurnover * 0.80)
		vat10Tax := round2(vat10Base * 0.10)
		vat20Base := round2(netTurnover * 0.15)
		vat20Tax := round2(vat20Base * 0.20)
		totalTax := round2(vat1Tax + vat10Tax + vat20Tax)
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

		zNo := "Z-DRAFT-" + dayStart.Format("20060102")
		if reg.ZReportNo != nil && *reg.ZReportNo != "" {
			zNo = *reg.ZReportNo
		}
		var openedAtStr, closedAtStr interface{}
		if !reg.OpenedAt.IsZero() {
			openedAtStr = reg.OpenedAt.Format("15:04:05")
		} else {
			openedAtStr = "08:00:00"
		}
		if reg.ClosedAt != nil && !reg.ClosedAt.IsZero() {
			closedAtStr = reg.ClosedAt.Format("15:04:05")
		}

		return c.JSON(fiber.Map{
			"date":                dayStart.Format("2006-01-02"),
			"formatted_date":      dayStart.Format("02.01.2006"),
			"report_generated_at": time.Now().Format("02.01.2006 15:04:05"),
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
				"opening_float":        reg.OpeningFloat,
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
			"opening_float":          reg.OpeningFloat,
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
		db.Order("id desc").Limit(30).Find(&registers)
		res := make([]fiber.Map, 0, len(registers))
		for _, r := range registers {
			var oStr, cStr interface{}
			if !r.OpenedAt.IsZero() {
				oStr = r.OpenedAt.Format(time.RFC3339)
			}
			if r.ClosedAt != nil && !r.ClosedAt.IsZero() {
				cStr = r.ClosedAt.Format(time.RFC3339)
			}
			mealCard := round2(r.TotalMultinet + r.TotalSodexo + r.TotalTicket)
			res = append(res, fiber.Map{
				"id":                   r.ID,
				"opened_at":            oStr,
				"closed_at":            cStr,
				"opened_by":            r.OpenedBy,
				"closed_by":            r.ClosedBy,
				"status":               r.Status,
				"opening_float":        r.OpeningFloat,
				"cash_sales":           r.TotalCash,
				"card_sales":           r.TotalCard,
				"meal_card_sales":      mealCard,
				"total_tips":           0.0,
				"total_discounts":      r.TotalDiscounts,
				"total_expenses":       r.TotalExpenses,
				"closing_cash_counted": round2(r.OpeningFloat + r.TotalCash - r.TotalExpenses),
				"total_turnover":       round2(r.TotalCash + r.TotalCard + mealCard),
			})
		}
		return c.JSON(res)
	})
}
