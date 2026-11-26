package service

import (
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/models"
	"gorm.io/gorm"
)

var trtLocation = time.FixedZone("TRT", 3*3600)

// TurkeyLoc returns Turkey's fixed UTC+03:00 timezone (safe on Windows without tzdata).
func TurkeyLoc() *time.Location {
	return trtLocation
}

// TRDayBounds returns inclusive-start and exclusive-end UTC timestamps for the Turkey civil day containing t.
func TRDayBounds(t time.Time) (time.Time, time.Time) {
	inTR := t.In(trtLocation)
	startTR := time.Date(inTR.Year(), inTR.Month(), inTR.Day(), 0, 0, 0, 0, trtLocation)
	endTR := startTR.AddDate(0, 0, 1)
	return startTR.UTC(), endTR.UTC()
}

// TRTodayBounds returns UTC start/end bounds for today's Turkey civil day.
func TRTodayBounds() (time.Time, time.Time) {
	return TRDayBounds(time.Now())
}

// ParseTRDateRange resolves filter ranges ("today", "yesterday", "week", "month", "custom", "all")
// into UTC [start, endExclusive) bounds corresponding to Turkey civil days.
func ParseTRDateRange(dateRange, startStr, endStr string) (time.Time, time.Time, bool) {
	nowTR := time.Now().In(trtLocation)
	todayStartTR := time.Date(nowTR.Year(), nowTR.Month(), nowTR.Day(), 0, 0, 0, 0, trtLocation)

	startStr = strings.TrimSpace(startStr)
	endStr = strings.TrimSpace(endStr)
	if startStr != "" || endStr != "" {
		var sUTC, eUTC time.Time
		if startStr != "" {
			if dt, err := time.ParseInLocation("2006-01-02", startStr, trtLocation); err == nil {
				sUTC = dt.UTC()
			}
		}
		if endStr != "" {
			if dt, err := time.ParseInLocation("2006-01-02", endStr, trtLocation); err == nil {
				eUTC = dt.AddDate(0, 0, 1).UTC()
			}
		}
		return sUTC, eUTC, !sUTC.IsZero() || !eUTC.IsZero()
	}

	switch strings.ToLower(strings.TrimSpace(dateRange)) {
	case "all", "":
		if strings.ToLower(strings.TrimSpace(dateRange)) == "all" {
			return time.Time{}, time.Time{}, false
		}
		return todayStartTR.UTC(), todayStartTR.AddDate(0, 0, 1).UTC(), true
	case "today":
		return todayStartTR.UTC(), todayStartTR.AddDate(0, 0, 1).UTC(), true
	case "yesterday":
		yStart := todayStartTR.AddDate(0, 0, -1)
		return yStart.UTC(), todayStartTR.UTC(), true
	case "week", "7d", "7days":
		return todayStartTR.AddDate(0, 0, -6).UTC(), todayStartTR.AddDate(0, 0, 1).UTC(), true
	case "month", "30d", "30days":
		return todayStartTR.AddDate(0, 0, -29).UTC(), todayStartTR.AddDate(0, 0, 1).UTC(), true
	case "this_month":
		mStart := time.Date(nowTR.Year(), nowTR.Month(), 1, 0, 0, 0, 0, trtLocation)
		return mStart.UTC(), todayStartTR.AddDate(0, 0, 1).UTC(), true
	default:
		return time.Time{}, time.Time{}, false
	}
}

// FiscalCompanyInfo carries tenant tax/identity metadata for official GİB E-Adisyon & ESC/POS slips.
type FiscalCompanyInfo struct {
	Title     string
	Branch    string
	TaxOffice string
	TaxNumber string
	Address   string
	Phone     string
}

// VATBreakdown holds tax-inclusive KDV buckets (%1, %10, %20) and total tax.
type VATBreakdown struct {
	Vat1Base  float64
	Vat1Tax   float64
	Vat10Base float64
	Vat10Tax  float64
	Vat20Base float64
	Vat20Tax  float64
	TotalTax  float64
}

// BuildProductVATMap loads every product's configured VatRate keyed by product ID.
func BuildProductVATMap(db *gorm.DB) map[int]float64 {
	res := make(map[int]float64)
	if db == nil {
		return res
	}
	var prods []models.Product
	db.Select("id, vat_rate").Find(&prods)
	for _, p := range prods {
		res[p.ID] = p.VatRate
	}
	return res
}

// BuildProductVATMapForIDs loads VatRate only for the specified product IDs.
func BuildProductVATMapForIDs(db *gorm.DB, prodIDs []int) map[int]float64 {
	res := make(map[int]float64, len(prodIDs))
	if db == nil || len(prodIDs) == 0 {
		return res
	}
	var prods []models.Product
	db.Select("id, vat_rate").Where("id IN ?", prodIDs).Find(&prods)
	for _, p := range prods {
		res[p.ID] = p.VatRate
	}
	return res
}

// NormalizeVATBucket maps any configured product VAT percentage into Turkey's standard buckets (1, 10, 20).
func NormalizeVATBucket(rate float64) int {
	switch {
	case rate <= 2.0:
		return 1
	case rate <= 15.0:
		return 10
	default:
		return 20
	}
}

// CategorizePaymentMethod normalizes arbitrary payment method aliases into canonical method keys.
func CategorizePaymentMethod(raw string) string {
	pm := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case pm == "" || pm == "cash" || pm == "nakit" || strings.Contains(pm, "nakit"):
		return "cash"
	case pm == "multinet" || strings.Contains(pm, "multinet"):
		return "multinet"
	case pm == "sodexo" || strings.Contains(pm, "sodexo"):
		return "sodexo"
	case pm == "ticket" || strings.Contains(pm, "ticket"):
		return "ticket"
	case pm == "meal_card" || strings.Contains(pm, "yemek") || strings.Contains(pm, "setcard") || strings.Contains(pm, "metropol"):
		return "meal_card"
	case pm == "open_account" || strings.Contains(pm, "cari") || strings.Contains(pm, "hesap") || strings.Contains(pm, "open") || strings.Contains(pm, "veresiye"):
		return "open_account"
	case pm == "online" || strings.Contains(pm, "online"):
		return "online"
	case pm == "credit_card" || strings.Contains(pm, "card") || strings.Contains(pm, "kredi") || strings.Contains(pm, "pos") || strings.Contains(pm, "kart"):
		return "credit_card"
	default:
		return "credit_card"
	}
}

// PaymentBucketGroup maps canonical payment methods into the 5 consolidated report buckets.
func PaymentBucketGroup(canonical string) string {
	switch CategorizePaymentMethod(canonical) {
	case "cash":
		return "cash"
	case "credit_card":
		return "credit_card"
	case "multinet", "sodexo", "ticket", "meal_card":
		return "sodexo"
	case "open_account":
		return "open_account"
	case "online":
		return "online"
	default:
		return "credit_card"
	}
}

// CalculateVATBreakdown computes real tax-inclusive KDV across non-voided, non-treat OrderItems,
// applying item-level discounts and an optional order-level discount ratio (`order.DiscountAmount / order.Subtotal`).
func CalculateVATBreakdown(items []models.OrderItem, prodVatMap map[int]float64, orderDiscountRatio float64) VATBreakdown {
	return CalculateVATBreakdownWithExtras(items, prodVatMap, orderDiscountRatio, 0, 0)
}

// CalculateVATBreakdownWithExtras computes tax-inclusive KDV across items plus kuverTotal and serviceCharge (at 10% KDV).
func CalculateVATBreakdownWithExtras(items []models.OrderItem, prodVatMap map[int]float64, orderDiscountRatio float64, kuverTotal float64, serviceCharge float64) VATBreakdown {
	var out VATBreakdown
	if orderDiscountRatio < 0 {
		orderDiscountRatio = 0
	}
	if orderDiscountRatio > 1 {
		orderDiscountRatio = 1
	}

	var b1, t1, b10, t10, b20, t20 float64
	for _, it := range items {
		if it.IsVoided || it.IsTreat {
			continue
		}
		lineGross := it.TotalPrice - it.DiscountAmount
		if lineGross <= 0 {
			continue
		}
		if orderDiscountRatio > 0 {
			lineGross = lineGross * (1.0 - orderDiscountRatio)
		}
		rate := 10.0
		if prodVatMap != nil {
			if r, ok := prodVatMap[it.ProductID]; ok && r >= 0 {
				rate = r
			}
		}
		if rate == 0 {
			continue
		}
		base := lineGross / (1.0 + rate/100.0)
		tax := lineGross - base
		switch NormalizeVATBucket(rate) {
		case 1:
			b1 += base
			t1 += tax
		case 10:
			b10 += base
			t10 += tax
		default:
			b20 += base
			t20 += tax
		}
	}

	extrasGross := 0.0
	if kuverTotal > 0 {
		extrasGross += kuverTotal
	}
	if serviceCharge > 0 {
		extrasGross += serviceCharge
	}
	if extrasGross > 0 {
		extraBase := extrasGross / 1.10
		b10 += extraBase
		t10 += extrasGross - extraBase
	}

	out.Vat1Base = Round2(b1)
	out.Vat1Tax = Round2(t1)
	out.Vat10Base = Round2(b10)
	out.Vat10Tax = Round2(t10)
	out.Vat20Base = Round2(b20)
	out.Vat20Tax = Round2(t20)
	out.TotalTax = Round2(out.Vat1Tax + out.Vat10Tax + out.Vat20Tax)
	return out
}

// CalculateOrdersVATBreakdown aggregates real VAT across multiple orders using their respective items, extras, and order-level discounts.
func CalculateOrdersVATBreakdown(orders []models.Order, itemsByOrder map[int][]models.OrderItem, prodVatMap map[int]float64) VATBreakdown {
	var total VATBreakdown
	for _, o := range orders {
		items := itemsByOrder[o.ID]
		ratio := 0.0
		if o.Subtotal > 0 && o.DiscountAmount > 0 {
			ratio = o.DiscountAmount / o.Subtotal
		}
		vb := CalculateVATBreakdownWithExtras(items, prodVatMap, ratio, o.KuverTotal, o.ServiceCharge)
		total.Vat1Base = Round2(total.Vat1Base + vb.Vat1Base)
		total.Vat1Tax = Round2(total.Vat1Tax + vb.Vat1Tax)
		total.Vat10Base = Round2(total.Vat10Base + vb.Vat10Base)
		total.Vat10Tax = Round2(total.Vat10Tax + vb.Vat10Tax)
		total.Vat20Base = Round2(total.Vat20Base + vb.Vat20Base)
		total.Vat20Tax = Round2(total.Vat20Tax + vb.Vat20Tax)
	}
	total.TotalTax = Round2(total.Vat1Tax + total.Vat10Tax + total.Vat20Tax)
	return total
}
