package service

import (
	"fmt"
	"html"
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

// NormalizeStockName Türkçe karakter güvenli (Unicode) ad normalizasyonu.
// SQLite LOWER() yalnızca ASCII küçülttüğü için eşleştirme Go tarafında yapılır.
func NormalizeStockName(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// FindIngredientIDByName ürün adıyla eşleşen stok kartının ID'sini Unicode güvenli şekilde bulur.
func FindIngredientIDByName(tx *gorm.DB, name string) (int, bool) {
	target := NormalizeStockName(name)
	if target == "" {
		return 0, false
	}
	type row struct {
		ID   int
		Name string
	}
	var rows []row
	if err := tx.Model(&models.Ingredient{}).Select("id, name").Find(&rows).Error; err != nil {
		return 0, false
	}
	for _, r := range rows {
		if NormalizeStockName(r.Name) == target {
			return r.ID, true
		}
	}
	return 0, false
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

// GetProductAvailableStock returns whether the product has stock tracking (BOM recipe,
// direct ingredient card, or allow_negative_stock), its current available stock (allowing
// negative values when AllowNegStock is enabled), whether it uses a BOM recipe, and missing ingredients.
func GetProductAvailableStock(tx *gorm.DB, prod models.Product) (bool, float64, bool, []map[string]interface{}) {
	if len(prod.Recipes) == 0 && tx != nil && prod.ID > 0 {
		_ = tx.Preload("Ingredient").Where("product_id = ?", prod.ID).Find(&prod.Recipes).Error
	}

	calcStock, recipeItems, missing := CalculateBOMStock(prod.Name, prod.Recipes)
	if len(recipeItems) > 0 {
		availStock := calcStock
		if len(prod.Recipes) == 1 && prod.Recipes[0].Ingredient != nil && prod.Recipes[0].Amount > 0 && prod.Recipes[0].Ingredient.CurrentStock < 0 {
			availStock = Round3(prod.Recipes[0].Ingredient.CurrentStock / prod.Recipes[0].Amount)
		} else if calcStock <= 0 {
			var minRatio *float64
			cleanProdName := strings.ToLower(strings.TrimSpace(prod.Name))
			for _, r := range prod.Recipes {
				if r.Ingredient == nil || r.Amount <= 0 {
					continue
				}
				ingName := strings.ToLower(strings.TrimSpace(r.Ingredient.Name))
				if ingName == cleanProdName && r.Amount == 1.0 && len(prod.Recipes) == 1 {
					continue
				}
				ratio := Round3(r.Ingredient.CurrentStock / r.Amount)
				if minRatio == nil || ratio < *minRatio {
					v := ratio
					minRatio = &v
				}
			}
			if minRatio != nil && *minRatio < 0 {
				availStock = *minRatio
			}
		}
		return true, availStock, true, missing
	}

	if tx != nil && strings.TrimSpace(prod.Name) != "" {
		if ingID, found := FindIngredientIDByName(tx, prod.Name); found {
			var directIng models.Ingredient
			if tx.First(&directIng, ingID).Error == nil {
				return true, Round3(directIng.CurrentStock), false, nil
			}
		} else if prod.AllowNegStock {
			return true, 0.0, false, nil
		}
	}

	return false, -1.0, false, nil
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
		if !ok || len(prod.Recipes) == 0 || prod.AllowNegStock {
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
			ingID, found := FindIngredientIDByName(tx, prod.Name)
			if found && repository.WithRowLock(tx).First(&directIng, ingID).Error == nil {
				deductAmt := quantity
				newStock := Round3(directIng.CurrentStock - deductAmt)
				tx.Model(&directIng).Update("current_stock", newStock)
				if newStock < 0 && prod.ID > 0 && !prod.AllowNegStock {
					tx.Model(&models.Product{}).Where("id = ?", prod.ID).Update("allow_neg_stock", true)
					prod.AllowNegStock = true
				}

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
			} else if prod.AllowNegStock {
				newIng := models.Ingredient{
					Name:         strings.TrimSpace(prod.Name),
					Unit:         "Kg",
					CurrentStock: Round3(-quantity),
					WarehouseID:  warehouseID,
				}
				if err := tx.Create(&newIng).Error; err == nil {
					whID := warehouseID
					note := fmt.Sprintf("Sipariş Eksi Stok Düşümü: %gx", quantity)
					ref := orderNo
					tx.Create(&models.StockMovement{
						MovementType:      "sale_deduction",
						IngredientID:      newIng.ID,
						SourceWarehouseID: &whID,
						Amount:            quantity,
						Unit:              newIng.Unit,
						CostPrice:         0,
						ReferenceNo:       &ref,
						Notes:             &note,
						CreatedBy:         "Sistem (Otomatik Stok)",
					})
				}
			}
		}
		return nil
	}

	// Lock recipe ingredients in deterministic ascending ID order (`ORDER BY id ASC FOR UPDATE`)
	sort.Slice(recipes, func(i, j int) bool {
		return recipes[i].IngredientID < recipes[j].IngredientID
	})

	var minRatio *int
	usedIngIDs := make(map[int]bool, len(recipes))
	for _, recipe := range recipes {
		var ingredient models.Ingredient
		if err := repository.WithRowLock(tx).First(&ingredient, recipe.IngredientID).Error; err != nil {
			continue
		}
		usedIngIDs[ingredient.ID] = true

		baseAmount := recipe.Amount * quantity
		fireMultiplier := 1.0 + (recipe.WastePercentage / 100.0)
		totalDeduct := Round3(baseAmount * fireMultiplier)

		newStock := Round3(ingredient.CurrentStock - totalDeduct)
		tx.Model(&ingredient).Update("current_stock", newStock)
		if newStock < 0 && hasProd && prod.ID > 0 && !prod.AllowNegStock {
			tx.Model(&models.Product{}).Where("id = ?", prod.ID).Update("allow_neg_stock", true)
			prod.AllowNegStock = true
		}

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
		if ingID, found := FindIngredientIDByName(tx, prod.Name); found && !usedIngIDs[ingID] && repository.WithRowLock(tx).First(&prodIng, ingID).Error == nil {
			tx.Model(&prodIng).Update("current_stock", float64(*minRatio))
		}
	}

	return nil
}

// RestoreOrderIngredients restores BOM recipe or direct product stock within an active ACID transaction
// when an order or item is voided / cancelled.
func RestoreOrderIngredients(tx *gorm.DB, productID int, quantity float64, orderNo string, warehouseID int) error {
	if quantity <= 0 {
		return nil
	}
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
			ingID, found := FindIngredientIDByName(tx, prod.Name)
			if found && repository.WithRowLock(tx).First(&directIng, ingID).Error == nil {
				restoreAmt := quantity
				newStock := Round3(directIng.CurrentStock + restoreAmt)
				tx.Model(&directIng).Update("current_stock", newStock)

				whID := warehouseID
				note := fmt.Sprintf("Sipariş/Ürün İptali Stok İadesi: %gx", quantity)
				ref := orderNo
				tx.Create(&models.StockMovement{
					MovementType:      "order_cancel_restoration",
					IngredientID:      directIng.ID,
					SourceWarehouseID: &whID,
					Amount:            restoreAmt,
					Unit:              directIng.Unit,
					CostPrice:         directIng.CostPerUnit,
					ReferenceNo:       &ref,
					Notes:             &note,
					CreatedBy:         "Sistem (İptal/İade)",
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
	usedIngIDs := make(map[int]bool, len(recipes))
	for _, recipe := range recipes {
		var ingredient models.Ingredient
		if err := repository.WithRowLock(tx).First(&ingredient, recipe.IngredientID).Error; err != nil {
			continue
		}
		usedIngIDs[ingredient.ID] = true

		baseAmount := recipe.Amount * quantity
		fireMultiplier := 1.0 + (recipe.WastePercentage / 100.0)
		totalRestore := Round3(baseAmount * fireMultiplier)

		newStock := Round3(ingredient.CurrentStock + totalRestore)
		tx.Model(&ingredient).Update("current_stock", newStock)

		if recipe.Amount > 0 {
			r := int(math.Floor(newStock / recipe.Amount))
			if minRatio == nil || r < *minRatio {
				val := r
				minRatio = &val
			}
		}

		whID := warehouseID
		note := fmt.Sprintf("Sipariş/Ürün İptali Reçete İadesi: %gx", quantity)
		ref := orderNo
		tx.Create(&models.StockMovement{
			MovementType:      "order_cancel_restoration",
			IngredientID:      ingredient.ID,
			SourceWarehouseID: &whID,
			Amount:            totalRestore,
			Unit:              ingredient.Unit,
			CostPrice:         ingredient.CostPerUnit,
			ReferenceNo:       &ref,
			Notes:             &note,
			CreatedBy:         "Sistem (İptal/İade)",
		})
	}

	if minRatio != nil && hasProd && strings.TrimSpace(prod.Name) != "" {
		var prodIng models.Ingredient
		if ingID, found := FindIngredientIDByName(tx, prod.Name); found && !usedIngIDs[ingID] && repository.WithRowLock(tx).First(&prodIng, ingID).Error == nil {
			tx.Model(&prodIng).Update("current_stock", float64(*minRatio))
		}
	}

	return nil
}

func truncateRunes(s string, maxLen int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= maxLen {
		return string(r)
	}
	if maxLen <= 1 {
		return string(r[:maxLen])
	}
	return string(r[:maxLen-1]) + "."
}

func padRightRunes(s string, width int) string {
	r := []rune(s)
	if len(r) >= width {
		return string(r[:width])
	}
	return s + strings.Repeat(" ", width-len(r))
}

// GenerateEAdisyon preserves the legacy signature and delegates to GenerateEAdisyonWithInfo.
func GenerateEAdisyon(order *models.Order, payments []models.Payment, cashierName string) map[string]interface{} {
	return GenerateEAdisyonWithInfo(order, payments, cashierName, FiscalCompanyInfo{}, nil)
}

// GenerateEAdisyonWithInfo generates the GİB E-Adisyon document with real tenant identity & per-product VAT rates.
func GenerateEAdisyonWithInfo(order *models.Order, payments []models.Payment, cashierName string, info FiscalCompanyInfo, prodVatMap map[int]float64) map[string]interface{} {
	if cashierName == "" {
		cashierName = "Kasiyer"
	}
	companyTitle := strings.TrimSpace(info.Title)
	if companyTitle == "" {
		companyTitle = "BonCore POS İşletmesi"
	}
	vkn := strings.TrimSpace(info.TaxNumber)
	if vkn == "" {
		vkn = "-"
	}

	nowTR := time.Now().In(TurkeyLoc())
	docDate := nowTR.Format("2006-01-02")
	docTime := nowTR.Format("15:04:05")
	docNo := fmt.Sprintf("EAD%s%06d", nowTR.Format("20060102"), order.ID)
	ettn := fmt.Sprintf("e0a1b2c3-%s-%04d-9f00-%012d", nowTR.Format("0102"), order.ID%10000, nowTR.UnixNano()%1000000000000)

	discRatio := 0.0
	if order.Subtotal > 0 && order.DiscountAmount > 0 {
		discRatio = order.DiscountAmount / order.Subtotal
	}
	vb := CalculateVATBreakdown(order.Items, prodVatMap, discRatio)

	itemsList := make([]map[string]interface{}, 0, len(order.Items))
	for _, it := range order.Items {
		if it.IsVoided {
			continue
		}
		vatRate := 10.0
		if prodVatMap != nil {
			if r, ok := prodVatMap[it.ProductID]; ok && r >= 0 {
				vatRate = r
			}
		}

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
			"is_treat":     it.IsTreat,
			"notes":        note,
		})
	}

	tableName := "Paket"
	if order.Table != nil && order.Table.Name != "" {
		tableName = order.Table.Name
	}

	gibQR := fmt.Sprintf("VKN:%s|ETTN:%s|TUTAR:%.2f|TARIH:%s %s|SERI:%s", vkn, ettn, order.GrandTotal, docDate, docTime, docNo)

	var xmlBuilder strings.Builder
	xmlBuilder.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<E-Adisyon xmlns="urn:gib:gov:tr:eAdisyon" ETTN="%s" BelgeNo="%s">
    <GIB_Bilgileri>
        <VKN_TCKN>%s</VKN_TCKN>
        <Unvan>%s</Unvan>
        <VergiDairesi>%s</VergiDairesi>
        <Adres>%s</Adres>
        <Tarih>%s</Tarih>
        <Saat>%s</Saat>
    </GIB_Bilgileri>
    <MasaBilgisi>
        <MasaNo>%s</MasaNo>
        <Garson>%s</Garson>
        <Kasiyer>%s</Kasiyer>
    </MasaBilgisi>
    <Kalemler>
`, html.EscapeString(ettn), html.EscapeString(docNo), html.EscapeString(vkn), html.EscapeString(companyTitle), html.EscapeString(info.TaxOffice), html.EscapeString(info.Address), docDate, docTime, html.EscapeString(tableName), html.EscapeString(order.WaiterName), html.EscapeString(cashierName)))

	for _, it := range itemsList {
		xmlBuilder.WriteString(fmt.Sprintf(`        <Kalem>
            <UrunAdi>%s</UrunAdi>
            <Miktar>%v</Miktar>
            <BirimFiyat>%.2f</BirimFiyat>
            <Toplam>%.2f</Toplam>
            <KDVOrani>%v</KDVOrani>
        </Kalem>
`, html.EscapeString(fmt.Sprintf("%v", it["product_name"])), it["quantity"], it["unit_price"], it["total_price"], it["vat_rate"]))
	}

	xmlBuilder.WriteString(fmt.Sprintf(`    </Kalemler>
    <Toplamlar>
        <AraToplam>%.2f</AraToplam>
        <Indirim>%.2f</Indirim>
        <Ikram>%.2f</Ikram>
        <Kuver>%.2f</Kuver>
        <KDV1>%.2f</KDV1>
        <KDV10>%.2f</KDV10>
        <KDV20>%.2f</KDV20>
        <ToplamKDV>%.2f</ToplamKDV>
        <GenelToplam>%.2f</GenelToplam>
    </Toplamlar>
    <Karekod>%s</Karekod>
</E-Adisyon>`, order.Subtotal, order.DiscountAmount, order.TreatAmount, order.KuverTotal, vb.Vat1Tax, vb.Vat10Tax, vb.Vat20Tax, vb.TotalTax, order.GrandTotal, html.EscapeString(gibQR)))

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
		"order_no":       order.OrderNo,
		"date":           docDate,
		"time":           docTime,
		"company_title":  companyTitle,
		"vkn":            vkn,
		"tax_office":     info.TaxOffice,
		"address":        info.Address,
		"phone":          info.Phone,
		"table_name":     tableName,
		"waiter_name":    order.WaiterName,
		"cashier_name":   cashierName,
		"items":          itemsList,
		"subtotal":       order.Subtotal,
		"discount":       order.DiscountAmount,
		"treat":          order.TreatAmount,
		"kuver":          order.KuverTotal,
		"service_charge": order.ServiceCharge,
		"tax_total":      vb.TotalTax,
		"grand_total":    order.GrandTotal,
		"payments":       paymentList,
		"vat_summary": map[string]interface{}{
			"vat_1":  map[string]interface{}{"rate": 1, "base": vb.Vat1Base, "tax": vb.Vat1Tax},
			"vat_10": map[string]interface{}{"rate": 10, "base": vb.Vat10Base, "tax": vb.Vat10Tax},
			"vat_20": map[string]interface{}{"rate": 20, "base": vb.Vat20Base, "tax": vb.Vat20Tax},
		},
		"qr_code_content": gibQR,
		"xml_content":     xmlBuilder.String(),
	}
}

// GenerateEscposThermalSlip preserves the legacy signature and delegates to GenerateEscposThermalSlipWithInfo.
func GenerateEscposThermalSlip(order *models.Order) string {
	return GenerateEscposThermalSlipWithInfo(order, FiscalCompanyInfo{})
}

// GenerateEscposThermalSlipWithInfo generates a UTF-8 rune-safe 80mm thermal slip using tenant business info.
func GenerateEscposThermalSlipWithInfo(order *models.Order, info FiscalCompanyInfo) string {
	tableName := "Paket"
	if order.Table != nil && order.Table.Name != "" {
		tableName = order.Table.Name
	}
	title := strings.TrimSpace(info.Title)
	if title == "" {
		title = "BonCore POS İşletmesi"
	}
	var lines []string
	sepBold := strings.Repeat("━", 42)
	sepThin := strings.Repeat("─", 42)

	lines = append(lines, sepBold)
	lines = append(lines, "  "+truncateRunes(title, 38))
	if strings.TrimSpace(info.Address) != "" {
		lines = append(lines, "  "+truncateRunes(info.Address, 38))
	}
	if strings.TrimSpace(info.Phone) != "" {
		lines = append(lines, "  Tel: "+truncateRunes(info.Phone, 32))
	}
	if strings.TrimSpace(info.TaxNumber) != "" {
		lines = append(lines, "  VKN: "+info.TaxNumber)
	}
	lines = append(lines, "  GİB E-ADİSYON / BİLGİ FİŞİ")
	lines = append(lines, sepBold)
	lines = append(lines, fmt.Sprintf("Masa: %s    Garson: %s", tableName, order.WaiterName))
	lines = append(lines, fmt.Sprintf("Tarih: %s", time.Now().In(TurkeyLoc()).Format("02.01.2006 15:04:05")))
	lines = append(lines, fmt.Sprintf("Sipariş No: %s", order.OrderNo))
	lines = append(lines, sepThin)
	lines = append(lines, fmt.Sprintf("%-22s%4s%8s%8s", "ÜRÜN", "AD", "FİYAT", "TUTAR"))
	lines = append(lines, sepThin)

	for _, it := range order.Items {
		if it.IsVoided {
			continue
		}
		name := padRightRunes(truncateRunes(it.ProductName, 21), 22)
		lines = append(lines, fmt.Sprintf("%s%4g%8.2f%8.2f", name, it.Quantity, it.UnitPrice, it.TotalPrice))
	}

	lines = append(lines, sepThin)
	lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Ara Toplam:", order.Subtotal))
	if order.DiscountAmount > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "İndirim:", -order.DiscountAmount))
	}
	if order.TreatAmount > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "İkram:", -order.TreatAmount))
	}
	if order.KuverTotal > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Kuver Ücreti:", order.KuverTotal))
	}
	if order.ServiceCharge > 0 {
		lines = append(lines, fmt.Sprintf("%-28s%11.2f TL", "Servis Bedeli:", order.ServiceCharge))
	}
	lines = append(lines, sepBold)
	lines = append(lines, fmt.Sprintf("%-26s%13.2f TL", "GENEL TOPLAM:", order.GrandTotal))
	lines = append(lines, sepBold)
	lines = append(lines, "     MALİ DEĞERİ YOKTUR - BİLGİ FİŞİDİR")
	lines = append(lines, "           AFİYET OLSUN!")
	lines = append(lines, sepBold)

	return strings.Join(lines, "\n")
}
