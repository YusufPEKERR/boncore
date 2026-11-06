package service

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func Round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func Round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

// CalculateBOMStock computes the bottleneck producible stock count for a product with BOM recipes,
// identical to `calculate_bom_stock` in `backend/app/routers/products.py`.
func CalculateBOMStock(prodName string, recipes []models.Recipe) (float64, []map[string]interface{}, []map[string]interface{}) {
	var bomRows []models.Recipe
	cleanProdName := strings.ToLower(strings.TrimSpace(prodName))

	for _, r := range recipes {
		if r.Ingredient == nil || r.Amount <= 0 {
			continue
		}
		ingName := strings.ToLower(strings.TrimSpace(r.Ingredient.Name))
		if ingName == cleanProdName && r.Amount == 1.0 && len(recipes) == 1 {
			continue
		}
		bomRows = append(bomRows, r)
	}

	if len(bomRows) == 0 {
		return -1.0, []map[string]interface{}{}, []map[string]interface{}{}
	}

	recipeItems := make([]map[string]interface{}, 0, len(bomRows))
	missingIngredients := make([]map[string]interface{}, 0)
	var minProducible *int

	for _, r := range bomRows {
		ing := r.Ingredient
		ingStock := Round3(ing.CurrentStock)
		usedAmt := r.Amount
		producible := 0
		if usedAmt > 0 {
			effStock := ingStock
			if effStock < 0 {
				effStock = 0
			}
			producible = int(math.Floor(effStock / usedAmt))
		}
		if minProducible == nil || producible < *minProducible {
			val := producible
			minProducible = &val
		}

		unit := ing.Unit
		if unit == "" {
			unit = "Adet"
		}
		itemInfo := map[string]interface{}{
			"ingredient_id":    ing.ID,
			"ingredient_name":  strings.TrimSpace(ing.Name),
			"amount":           usedAmt,
			"unit":             unit,
			"current_stock":    ingStock,
			"producible_count": producible,
		}
		recipeItems = append(recipeItems, itemInfo)
		if ingStock <= 0 || ingStock < usedAmt {
			missingIngredients = append(missingIngredients, itemInfo)
		}
	}

	calcStock := 0.0
	if minProducible != nil {
		calcStock = float64(*minProducible)
	}
	return calcStock, recipeItems, missingIngredients
}

// ValidateBOMStockForItems validates that all BOM recipe ingredients have sufficient stock before order creation,
// returning a 400 Bad Request Fiber error with the exact message expected by the frontend if any ingredient is out of stock.
func ValidateBOMStockForItems(tx *gorm.DB, items []models.OrderItemInput) error {
	if len(items) == 0 {
		return nil
	}

	qtyByProd := make(map[int]float64)
	prodIDs := make([]int, 0, len(items))
	for _, it := range items {
		qty := it.Quantity
		if qty <= 0 {
			qty = 1.0
		}
		if _, exists := qtyByProd[it.ProductID]; !exists {
			prodIDs = append(prodIDs, it.ProductID)
		}
		qtyByProd[it.ProductID] += qty
	}

	var products []models.Product
	if err := tx.Preload("Recipes.Ingredient").Where("id IN ?", prodIDs).Find(&products).Error; err != nil {
		return err
	}

	prodsMap := make(map[int]models.Product, len(products))
	for _, p := range products {
		prodsMap[p.ID] = p
	}

	for _, pid := range prodIDs {
		totalQty := qtyByProd[pid]
		prod, ok := prodsMap[pid]
		if !ok || len(prod.Recipes) == 0 {
			continue
		}

		var outOfStockMsgs []string
		cleanProdName := strings.ToLower(strings.TrimSpace(prod.Name))

		for _, r := range prod.Recipes {
			if r.Ingredient == nil || r.Amount <= 0 {
				continue
			}
			ing := r.Ingredient
			if strings.ToLower(strings.TrimSpace(ing.Name)) == cleanProdName && r.Amount == 1.0 && len(prod.Recipes) == 1 {
				continue
			}

			avail := Round3(ing.CurrentStock)
			needed := Round3(r.Amount * totalQty)
			unitLbl := ing.Unit
			if unitLbl == "" {
				unitLbl = "Adet"
			}

			if avail <= 0 {
				outOfStockMsgs = append(outOfStockMsgs, fmt.Sprintf("• %s: STOK BİTTİ (Mevcut Stok: 0 %s, Gereken: %g %s)", ing.Name, unitLbl, needed, unitLbl))
			} else if avail < needed {
				outOfStockMsgs = append(outOfStockMsgs, fmt.Sprintf("• %s: STOK YETERSİZ (Mevcut Stok: %g %s, Gereken: %g %s)", ing.Name, avail, unitLbl, needed, unitLbl))
			}
		}

		if len(outOfStockMsgs) > 0 {
			joined := strings.Join(outOfStockMsgs, "\n")
			detail := fmt.Sprintf(
				"\"%s\" ürününün reçetesinde bulunan malzeme(ler)in stoğu bitmiştir / yetersizdir:\n%s\nSipariş girebilmek için lütfen Stok/Envanter ekranından bu ürünün stoğunu güncelleyin veya Ürün Reçetesi (BOM) ekranından reçeteden kaldırın.",
				prod.Name,
				joined,
			)
			return fiber.NewError(fiber.StatusBadRequest, detail)
		}
	}

	return nil
}

// DeductOrderIngredients deducts BOM recipe or direct product stock within an active ACID transaction,
// applying PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) in deterministic ID order to prevent deadlocks.
func DeductOrderIngredients(tx *gorm.DB, productID int, quantity float64, orderNo string, warehouseID int) error {
	if warehouseID <= 0 {
		warehouseID = 2
	}

	var recipes []models.Recipe
	if err := tx.Where("product_id = ?", productID).Order("ingredient_id ASC").Find(&recipes).Error; err != nil {
		return err
	}

	var prod models.Product
	hasProd := tx.First(&prod, productID).Error == nil

	if len(recipes) == 0 {
		if hasProd && strings.TrimSpace(prod.Name) != "" {
			var directIng models.Ingredient
			if err := repository.WithRowLock(tx).Where("LOWER(name) = ?", strings.ToLower(strings.TrimSpace(prod.Name))).First(&directIng).Error; err == nil {
				deductAmt := quantity
				newStock := Round3(math.Max(0.0, directIng.CurrentStock-deductAmt))
				tx.Model(&directIng).Update("current_stock", newStock)

				whID := warehouseID
				note := fmt.Sprintf("Sipariş Doğrudan Satış Düşümü: %gx", quantity)
				ref := orderNo
				tx.Create(&models.StockMovement{
					MovementType:      "sale_deduction",
					IngredientID:      directIng.ID,
					SourceWarehouseID: &whID,
					Amount:            deductAmt,
					Unit:              directIng.Unit,
					CostPrice:         directIng.CostPerUnit,
					ReferenceNo:       &ref,
					Notes:             &note,
					CreatedBy:         "Sistem (Otomatik Stok)",
				})
			}
		}
		return nil
	}

	// Lock recipe ingredients in deterministic ascending ID order (`ORDER BY id ASC FOR UPDATE`)
	sort.Slice(recipes, func(i, j int) bool {
		return recipes[i].IngredientID < recipes[j].IngredientID
	})

	var minRatio *int
	for _, recipe := range recipes {
		var ingredient models.Ingredient
		if err := repository.WithRowLock(tx).First(&ingredient, recipe.IngredientID).Error; err != nil {
			continue
		}

		baseAmount := recipe.Amount * quantity
		fireMultiplier := 1.0 + (recipe.WastePercentage / 100.0)
		totalDeduct := Round3(baseAmount * fireMultiplier)

		newStock := Round3(math.Max(0.0, ingredient.CurrentStock-totalDeduct))
		tx.Model(&ingredient).Update("current_stock", newStock)

		if recipe.Amount > 0 {
			r := int(math.Floor(newStock / recipe.Amount))
			if minRatio == nil || r < *minRatio {
				val := r
				minRatio = &val
			}
		}

		whID := warehouseID
		note := fmt.Sprintf("Sipariş Satış Düşümü: %gx", quantity)
		ref := orderNo
		tx.Create(&models.StockMovement{
			MovementType:      "sale_deduction",
			IngredientID:      ingredient.ID,
			SourceWarehouseID: &whID,
			Amount:            totalDeduct,
			Unit:              ingredient.Unit,
			CostPrice:         ingredient.CostPerUnit,
			ReferenceNo:       &ref,
			Notes:             &note,
			CreatedBy:         "Sistem (Otomatik Reçete)",
		})
	}

	if minRatio != nil && hasProd && strings.TrimSpace(prod.Name) != "" {
		var prodIng models.Ingredient
		if err := repository.WithRowLock(tx).Where("LOWER(name) = ?", strings.ToLower(strings.TrimSpace(prod.Name))).First(&prodIng).Error; err == nil {
			tx.Model(&prodIng).Update("current_stock", float64(*minRatio))
		}
	}

	return nil
}

// GenerateEAdisyon generates the GİB E-Adisyon document matching `FiscalService.generate_e_adisyon` in Python.
func GenerateEAdisyon(order *models.Order, payments []models.Payment, cashierName string) map[string]interface{} {
	if cashierName == "" {
		cashierName = "Kasiyer"
	}
	now := time.Now()
	docDate := now.Format("2006-01-02")
	docTime := now.Format("15:04:05")
	docNo := fmt.Sprintf("EAD%s%06d", now.Format("20060102"), order.ID)
	ettn := fmt.Sprintf("e0a1b2c3-%s-%04d-9f00-%012d", now.Format("0102"), order.ID%10000, now.UnixNano()%1000000000000)

	vat10Base := 0.0
	vat10Tax := 0.0

	itemsList := make([]map[string]interface{}, 0, len(order.Items))
	for _, it := range order.Items {
		if it.IsVoided {
			continue
		}
		vatRate := 10.0
		baseAmt := it.TotalPrice / (1.0 + vatRate/100.0)
		taxAmt := it.TotalPrice - baseAmt
		vat10Base = Round2(vat10Base + baseAmt)
		vat10Tax = Round2(vat10Tax + taxAmt)

		variant := ""
		if it.VariantName != nil {
			variant = *it.VariantName
		}
		note := ""
		if it.KitchenNote != nil {
			note = *it.KitchenNote
		}
		itemsList = append(itemsList, map[string]interface{}{
			"product_name": it.ProductName,
			"variant":      variant,
			"quantity":     it.Quantity,
			"unit_price":   it.UnitPrice,
			"total_price":  it.TotalPrice,
			"vat_rate":     vatRate,
			"notes":        note,
		})
	}

	tableName := "Paket"
	if order.Table != nil && order.Table.Name != "" {
		tableName = order.Table.Name
	}

	gibQR := fmt.Sprintf("VKN:1234567890|ETTN:%s|TUTAR:%.2f|TARIH:%s %s|SERI:%s", ettn, order.GrandTotal, docDate, docTime, docNo)

	var xmlBuilder strings.Builder
	xmlBuilder.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<E-Adisyon xmlns="urn:gib:gov:tr:eAdisyon" ETTN="%s" BelgeNo="%s">
    <GIB_Bilgileri>
        <VKN_TCKN>1234567890</VKN_TCKN>
        <Unvan>BONCORE RESTORAN VE GIDA TIC. A.S.</Unvan>
        <Tarih>%s</Tarih>
        <Saat>%s</Saat>
    </GIB_Bilgileri>
    <MasaBilgisi>
        <MasaNo>%s</MasaNo>
        <Garson>%s</Garson>
        <Kasiyer>%s</Kasiyer>
    </MasaBilgisi>
    <Kalemler>
`, ettn, docNo, docDate, docTime, tableName, order.WaiterName, cashierName))

	for _, it := range itemsList {
		xmlBuilder.WriteString(fmt.Sprintf(`        <Kalem>
            <UrunAdi>%v</UrunAdi>
            <Miktar>%v</Miktar>
            <BirimFiyat>%.2f</BirimFiyat>
            <Toplam>%.2f</Toplam>
            <KDVOrani>%v</KDVOrani>
        </Kalem>
`, it["product_name"], it["quantity"], it["unit_price"], it["total_price"], it["vat_rate"]))
	}

	xmlBuilder.WriteString(fmt.Sprintf(`    </Kalemler>
    <Toplamlar>
        <AraToplam>%.2f</AraToplam>
        <Indirim>%.2f</Indirim>
        <Ikram>%.2f</Ikram>
        <Kuver>%.2f</Kuver>
        <KDV10>%.2f</KDV10>
        <GenelToplam>%.2f</GenelToplam>
    </Toplamlar>
    <Karekod>%s</Karekod>
</E-Adisyon>`, order.Subtotal, order.DiscountAmount, order.TreatAmount, order.KuverTotal, vat10Tax, order.GrandTotal, gibQR))

	methodMap := map[string]string{
		"cash":         "NAKİT",
		"credit_card":  "KREDİ KARTI",
		"open_account": "AÇIK HESAP",
		"sodexo":       "SODEXO",
		"multinet":     "MULTİNET",
		"ticket":       "TICKET",
		"meal_card":    "YEMEK KARTI",
		"online":       "ONLINE ÖDEME",
	}

	paymentList := make([]map[string]interface{}, 0, len(payments))
	for _, p := range payments {
		lbl, ok := methodMap[p.PaymentMethod]
		if !ok {
			lbl = strings.ToUpper(p.PaymentMethod)
		}
		paymentList = append(paymentList, map[string]interface{}{
			"method": p.PaymentMethod,
			"label":  lbl,
			"amount": p.Amount,
		})
	}

	return map[string]interface{}{
		"ettn":           ettn,
		"doc_no":         docNo,
		"date":           docDate,
		"time":           docTime,
		"company_title":  "BONCORE RESTORAN & LOUNGE",
		"vkn":            "1234567890",
		"table_name":     tableName,
		"waiter_name":    order.WaiterName,
		"cashier_name":   cashierName,
		"items":          itemsList,
		"subtotal":       order.Subtotal,
		"discount":       order.DiscountAmount,
		"treat":          order.TreatAmount,
		"kuver":          order.KuverTotal,
		"service_charge": order.ServiceCharge,
		"grand_total":    order.GrandTotal,
		"payments":       paymentList,
		"vat_summary": map[string]interface{}{
			"vat_1":  map[string]interface{}{"rate": 1, "base": 0.0, "tax": 0.0},
			"vat_10": map[string]interface{}{"rate": 10, "base": vat10Base, "tax": vat10Tax},
			"vat_20": map[string]interface{}{"rate": 20, "base": 0.0, "tax": 0.0},
		},
		"qr_code_content": gibQR,
		"xml_content":     xmlBuilder.String(),
	}
}

// GenerateEscposThermalSlip generates the 80mm thermal slip string matching `FiscalService.generate_escpos_thermal_slip`.
func GenerateEscposThermalSlip(order *models.Order) string {
	tableName := "Paket"
	if order.Table != nil && order.Table.Name != "" {
		tableName = order.Table.Name
	}
	var lines []string
	sepBold := strings.Repeat("━", 42)
	sepThin := strings.Repeat("─", 42)

	lines = append(lines, sepBold)
	lines = append(lines, "     BONCORE RESTAURANT & LOUNGE")
	lines = append(lines, "     GIB E-ADISYON / BILGI FISI")
	lines = append(lines, sepBold)
	lines = append(lines, fmt.Sprintf("Masa: %s    Garson: %s", tableName, order.WaiterName))
	lines = append(lines, fmt.Sprintf("Tarih: %s", time.Now().Format("02.01.2006 15:04:05")))
	lines = append(lines, fmt.Sprintf("Sipariş No: %s", order.OrderNo))
	lines = append(lines, sepThin)
	lines = append(lines, fmt.Sprintf("%-22s%4s%8s%8s", "URUN", "AD", "FIYAT", "TUTAR"))
	lines = append(lines, sepThin)

	for _, it := range order.Items {
		if it.IsVoided {
			continue
		}
		name := it.ProductName
		if len(name) > 20 {
			name = name[:20]
		}
		lines = append(lines, fmt.Sprintf("%-22s%4g%8.2f%8.2f", name, it.Quantity, it.UnitPrice, it.TotalPrice))
	}

	lines = append(lines, sepThin)
	lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Ara Toplam:", order.Subtotal))
	if order.DiscountAmount > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Indirim:", -order.DiscountAmount))
	}
	if order.TreatAmount > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Ikram:", -order.TreatAmount))
	}
	if order.ServiceCharge > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Servis Bedeli:", order.ServiceCharge))
	}
	lines = append(lines, sepBold)
	lines = append(lines, fmt.Sprintf("%-26s%13.2f TL", "GENEL TOPLAM:", order.GrandTotal))
	lines = append(lines, sepBold)
	lines = append(lines, "     MALI DEGERI YOKTUR - BILGI FISIDIR")
	lines = append(lines, "           AFIYET OLSUN!")
	lines = append(lines, sepBold)

	return strings.Join(lines, "\n")
}
