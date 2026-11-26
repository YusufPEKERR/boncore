package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
)

func TestPaket3_VATCategorizeIdempotencyShiftLockStockOnlineAndBackup(t *testing.T) {
	app, svc, prod, tbl := setupFinanceTestApp(t)
	tdb, err := svc.DBManager.GetTenantDB("fatihciftligi")
	if err != nil {
		t.Fatalf("GetTenantDB failed: %v", err)
	}

	// 1. Kuver + Service Charge included in 10% KDV + Authenticated AuditLog operator
	uname := "ahmet_mgr"
	staff := models.StaffUser{
		Name:     "Ahmet Gerçek Müdür",
		Username: &uname,
		Role:     "manager",
		IsActive: true,
	}
	tdb.Create(&staff)
	mgrTok, _ := middleware.CreateAccessToken(svc.Config, staff.ID, "manager", true, "fatihciftligi", nil)
	doWithTok := func(tok, method, path string, body interface{}, extraHeaders map[string]string) (int, http.Header, map[string]interface{}) {
		var r io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			r = bytes.NewReader(b)
		}
		req := httptest.NewRequest(method, path, r)
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("X-Restaurant-Code", "fatihciftligi")
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		for k, v := range extraHeaders {
			req.Header.Set(k, v)
		}
		resp, err := app.Test(req, 10000)
		if err != nil {
			t.Fatalf("%s %s error: %v", method, path, err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		var out map[string]interface{}
		_ = json.Unmarshal(raw, &out)
		return resp.StatusCode, resp.Header, out
	}

	// Idempotency test on /api/orders/create + Kuver/Service KDV + AuditLog operator check
	idemHeaders := map[string]string{"X-Idempotency-Key": "order-idem-1"}
	c1, _, o1 := doWithTok(mgrTok, "POST", "/api/orders/create", map[string]interface{}{
		"table_id":       tbl.ID,
		"order_type":     "dine_in",
		"waiter_name":    "Spoofed Name",
		"service_charge": 110.0,
		"items":          []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	}, idemHeaders)
	if c1 != http.StatusOK {
		t.Fatalf("expected 200 on create, got %d (%+v)", c1, o1)
	}
	c2, h2, o2 := doWithTok(mgrTok, "POST", "/api/orders/create", map[string]interface{}{
		"table_id":       tbl.ID,
		"order_type":     "dine_in",
		"waiter_name":    "Spoofed Name",
		"service_charge": 110.0,
		"items":          []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	}, idemHeaders)
	if c2 != http.StatusOK || h2.Get("X-Idempotency-Replay") != "true" || o1["id"] != o2["id"] {
		t.Fatalf("expected X-Idempotency-Replay=true with identical order, got c2=%d hdr=%q o1=%v o2=%v", c2, h2.Get("X-Idempotency-Replay"), o1["id"], o2["id"])
	}

	// Verify Kuver/Service KDV (420 + 110 = 530 @ 10% => 530 - 530/1.10 = 48.18) and AuditLog OperatorName
	orderID := int(o1["id"].(float64))
	var ord models.Order
	tdb.First(&ord, orderID)
	expectedTax := service.Round2(530.0 - (530.0 / 1.10))
	if ord.TaxTotal != expectedTax {
		t.Fatalf("expected TaxTotal=%v including service_charge, got %v", expectedTax, ord.TaxTotal)
	}
	var audit models.AuditLog
	tdb.Where("action_type = ?", "TABLE_OPENED").Order("id desc").First(&audit)
	if audit.OperatorName != "Ahmet Gerçek Müdür" {
		t.Fatalf("expected authenticated AuditLog operator 'Ahmet Gerçek Müdür', got %q", audit.OperatorName)
	}

	// 2. Shared BOM + WastePercentage check & no allow_neg_stock mutation
	cat := models.Category{Name: "BOM Kat", ShowInPos: true}
	tdb.Create(&cat)
	ing := models.Ingredient{Name: "Ortak Köfte", Unit: "Kg", CurrentStock: 1.0, WarehouseID: 2}
	tdb.Create(&ing)
	p1 := models.Product{CategoryID: cat.ID, Name: "Burger A", BasePrice: 100, IsAvailable: true, ShowInPos: true}
	p2 := models.Product{CategoryID: cat.ID, Name: "Burger B", BasePrice: 120, IsAvailable: true, ShowInPos: true}
	tdb.Create(&p1)
	tdb.Create(&p2)
	// Each requires 0.5 Kg + 10% waste = 0.55 Kg -> together 1.10 Kg > 1.0 Kg!
	tdb.Create(&models.Recipe{ProductID: p1.ID, IngredientID: ing.ID, Amount: 0.5, WastePercentage: 10})
	tdb.Create(&models.Recipe{ProductID: p2.ID, IngredientID: ing.ID, Amount: 0.5, WastePercentage: 10})

	bomCode, _, _ := doWithTok(mgrTok, "POST", "/api/orders/create", map[string]interface{}{
		"order_type": "takeaway",
		"items": []map[string]interface{}{
			{"product_id": p1.ID, "quantity": 1},
			{"product_id": p2.ID, "quantity": 1},
		},
	}, nil)
	if bomCode != http.StatusBadRequest {
		t.Fatalf("expected 400 BOM shortage across shared ingredient + waste, got %d", bomCode)
	}
	// Deduct single p1 (with allow_neg_stock=false directly via DeductOrderIngredients) and ensure allow_neg_stock remains false
	ing.CurrentStock = 0.1
	tdb.Save(&ing)
	_ = service.DeductOrderIngredients(tdb, p1.ID, 1, "ORD-NEG-CHECK", 2)
	var reloadedP1 models.Product
	tdb.First(&reloadedP1, p1.ID)
	if reloadedP1.AllowNegStock {
		t.Fatalf("expected allow_neg_stock NOT to be silently flipped to true")
	}

	// 3. Unmatched online SKU -> 422
	onlCode, _, _ := doWithTok(mgrTok, "POST", "/api/delivery/ingest-online-order", map[string]interface{}{
		"platform": "getir",
		"items":    []map[string]interface{}{{"name": "NON_EXISTENT_SKU_999", "quantity": 1, "unit_price": 50}},
	}, nil)
	if onlCode != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for unmatched online SKU, got %d", onlCode)
	}

	// 4. Dry-run /auto-z-report/test leaves register & open order untouched
	dryCode, _, dryRes := doWithTok(mgrTok, "POST", "/api/cashier/auto-z-report/test", nil, nil)
	if dryCode != http.StatusOK || dryRes["dry_run"] != true {
		t.Fatalf("expected dry_run=true from auto-z-report/test, got %d (%+v)", dryCode, dryRes)
	}
	var chkOrd models.Order
	tdb.First(&chkOrd, orderID)
	if chkOrd.Status != "open" {
		t.Fatalf("expected order to remain open after dry-run test, got %q", chkOrd.Status)
	}

	// 5. Settle with Idempotency + Z-Report + Closed shift immutability 409
	settleHdrs := map[string]string{"X-Idempotency-Key": "settle-idem-1"}
	s1, _, sRes1 := doWithTok(mgrTok, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    orderID,
		"close_table": true,
		"payments":    []map[string]interface{}{{"method": "sodexo", "amount": 530.0, "tip": 15.0}},
	}, settleHdrs)
	if s1 != http.StatusOK || sRes1["paid_total"].(float64) != 530.0 {
		t.Fatalf("settle failed: %d (%+v)", s1, sRes1)
	}
	s2, hSettle2, _ := doWithTok(mgrTok, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    orderID,
		"close_table": true,
		"payments":    []map[string]interface{}{{"method": "sodexo", "amount": 530.0, "tip": 15.0}},
	}, settleHdrs)
	if s2 != http.StatusOK || hSettle2.Get("X-Idempotency-Replay") != "true" {
		t.Fatalf("expected settle replay, got %d replay=%q", s2, hSettle2.Get("X-Idempotency-Replay"))
	}

	// Execute real Z-Report and check z-history tips
	zCode, _, _ := doWithTok(mgrTok, "POST", "/api/cashier/z-report", map[string]interface{}{"closed_by": "Müdür"}, nil)
	if zCode != http.StatusOK {
		t.Fatalf("z-report failed: %d", zCode)
	}
	var closedReg models.CashRegister
	tdb.Where("status = ?", "closed").Order("id desc").First(&closedReg)
	if closedReg.ClosedAt != nil && !chkOrd.CreatedAt.After(*closedReg.ClosedAt) {
		// Force chkOrd CreatedAt slightly before ClosedAt if test ran within same microsecond
		before := closedReg.ClosedAt.Add(-time.Second)
		tdb.Model(&models.Order{}).Where("id = ?", orderID).Update("created_at", before)
	}

	// Attempt to reopen order belonging to closed shift -> 409 Conflict
	reopenCode, _, _ := doWithTok(mgrTok, "POST", fmt.Sprintf("/api/orders/%d/reopen", orderID), map[string]interface{}{"operator_name": "Müdür"}, nil)
	if reopenCode != http.StatusConflict {
		t.Fatalf("expected 409 Conflict reopening closed-shift order, got %d", reopenCode)
	}

	// 6. Backup restore SHA-256 tamper check -> 422
	masterTok, _ := middleware.CreateMasterAccessToken(svc.Config, 1, true)
	bCode, _, bRes := doWithTok(masterTok, "POST", "/api/master/tenants/fatihciftligi/backup", nil, nil)
	if bCode != http.StatusCreated {
		t.Fatalf("backup create failed: %d (%+v)", bCode, bRes)
	}
	bMap := bRes["backup"].(map[string]interface{})
	bID := int(bMap["id"].(float64))
	bPath := bMap["file_path"].(string)
	_ = os.WriteFile(bPath, []byte("corrupted backup payload"), 0644)
	rCode, _, _ := doWithTok(masterTok, "POST", fmt.Sprintf("/api/master/backups/%d/restore", bID), nil, nil)
	if rCode != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 on tampered backup checksum restore, got %d", rCode)
	}
}
