package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
)

func TestPaket7_DeletedProductVATAndAuditPaginationAndBillingOverdue(t *testing.T) {
	app, svc, prod, tbl := setupFinanceTestApp(t)
	tdb, err := svc.DBManager.GetTenantDB("fatihciftligi")
	if err != nil {
		t.Fatalf("GetTenantDB failed: %v", err)
	}
	mdb := svc.DBManager.MasterGorm

	// 1. Deleted product in order -> serializeOrder must fall back to 10% KDV (not 1%)
	order := models.Order{
		OrderNo:        "P7-DEL-001",
		TableID:        &tbl.ID,
		OrderType:      "dine_in",
		Status:         "open",
		Subtotal:       100,
		GrandTotal:     100,
		RemainingTotal: 100,
	}
	tdb.Create(&order)
	item := models.OrderItem{
		OrderID:     order.ID,
		ProductID:   prod.ID + 99999, // non-existent / deleted product
		ProductName: "Silinmiş Ürün",
		UnitPrice:   100,
		Quantity:    1,
		TotalPrice:  100,
	}
	tdb.Create(&item)

	mgrToken, _ := middleware.CreateAccessToken(svc.Config, 1, "manager", false, "fatihciftligi", nil)
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/orders/%d", order.ID), nil)
	req.Header.Set("Authorization", "Bearer "+mgrToken)
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp := execTest(t, app, req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET order failed: %d", resp.StatusCode)
	}
	var orderBody map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&orderBody)
	resp.Body.Close()
	itemsArr := orderBody["items"].([]interface{})
	firstItem := itemsArr[0].(map[string]interface{})
	if vat, _ := firstItem["vat_rate"].(float64); vat != 10.0 {
		t.Fatalf("expected deleted-product vat_rate fallback 10, got %v", vat)
	}

	// 2. GET /api/audit/logs bounded limit + offset + X-Total-Count
	tdb.Exec("DELETE FROM audit_logs;")
	for i := 1; i <= 5; i++ {
		tdb.Create(&models.AuditLog{
			ActionType:   "TEST_EVENT",
			OperatorName: fmt.Sprintf("Op%d", i),
			OperatorRole: "manager",
		})
	}
	auditReq := httptest.NewRequest(http.MethodGet, "/api/audit/logs?limit=2&offset=1", nil)
	auditReq.Header.Set("Authorization", "Bearer "+mgrToken)
	auditReq.Header.Set("X-Restaurant-Code", "fatihciftligi")
	auditResp := execTest(t, app, auditReq)
	if auditResp.StatusCode != http.StatusOK {
		t.Fatalf("GET audit logs failed: %d", auditResp.StatusCode)
	}
	if totalHdr := auditResp.Header.Get("X-Total-Count"); totalHdr != "5" {
		t.Fatalf("expected X-Total-Count=5, got %q", totalHdr)
	}
	var auditRows []map[string]interface{}
	_ = json.NewDecoder(auditResp.Body).Decode(&auditRows)
	auditResp.Body.Close()
	if len(auditRows) != 2 {
		t.Fatalf("expected 2 bounded audit rows, got %d", len(auditRows))
	}

	// 3. Overdue invoice pay guard -> keep read_only_mode=true until all overdue invoices paid
	mdb.Model(&models.RestaurantTenant{}).Where("code = ?", "fatihciftligi").Updates(map[string]interface{}{
		"status":         "suspended",
		"read_only_mode": true,
	})
	pastDue := time.Now().Add(-48 * time.Hour)
	inv1 := models.TenantInvoice{TenantID: 1, TenantCode: "fatihciftligi", InvoiceNo: "INV-P7-1", Amount: 1000, Status: "overdue", DueDate: &pastDue}
	inv2 := models.TenantInvoice{TenantID: 1, TenantCode: "fatihciftligi", InvoiceNo: "INV-P7-2", Amount: 1000, Status: "overdue", DueDate: &pastDue}
	mdb.Create(&inv1)
	mdb.Create(&inv2)

	pay1 := newMasterReq(svc, http.MethodPut, fmt.Sprintf("/api/master/invoices/%d/pay", inv1.ID), bytes.NewReader([]byte(`{}`)))
	pay1Resp := execTest(t, app, pay1)
	if pay1Resp.StatusCode != http.StatusOK {
		t.Fatalf("pay inv1 failed: %d", pay1Resp.StatusCode)
	}
	var pay1Out map[string]interface{}
	_ = json.NewDecoder(pay1Resp.Body).Decode(&pay1Out)
	pay1Resp.Body.Close()
	if rem, _ := pay1Out["remaining_overdue_count"].(float64); rem != 1 {
		t.Fatalf("expected remaining_overdue_count=1 after paying 1st overdue invoice, got %v", rem)
	}
	t1 := pay1Out["tenant"].(map[string]interface{})
	if ro, _ := t1["read_only_mode"].(bool); !ro {
		t.Fatalf("expected read_only_mode to remain true while 1 overdue invoice remains")
	}

	pay2 := newMasterReq(svc, http.MethodPut, fmt.Sprintf("/api/master/invoices/%d/pay", inv2.ID), bytes.NewReader([]byte(`{}`)))
	pay2Resp := execTest(t, app, pay2)
	if pay2Resp.StatusCode != http.StatusOK {
		t.Fatalf("pay inv2 failed: %d", pay2Resp.StatusCode)
	}
	var pay2Out map[string]interface{}
	_ = json.NewDecoder(pay2Resp.Body).Decode(&pay2Out)
	pay2Resp.Body.Close()
	t2 := pay2Out["tenant"].(map[string]interface{})
	if ro, _ := t2["read_only_mode"].(bool); ro {
		t.Fatalf("expected read_only_mode=false after paying last overdue invoice")
	}

	// 4. BuildIngredientNameMap Turkish Unicode lookup
	ing := models.Ingredient{Name: "Süzme Yoğurt", Unit: "Kg", CurrentStock: 5}
	tdb.Create(&ing)
	nameMap := service.BuildIngredientNameMap(tdb)
	if gotID, ok := service.FindIngredientIDFromMap(nameMap, "  süzme   yoğurt "); !ok || gotID != ing.ID {
		t.Fatalf("BuildIngredientNameMap failed: ok=%v gotID=%d want=%d", ok, gotID, ing.ID)
	}

	// 5. DELETE /api/master/tenants/:id closes tenant DB pool
	disposable := models.RestaurantTenant{Code: "disposable_p7", Name: "Silinecek Test", Status: "active"}
	mdb.Create(&disposable)
	if _, pErr := svc.DBManager.ProvisionTenantDB(disposable.Code); pErr != nil {
		t.Fatalf("ProvisionTenantDB failed: %v", pErr)
	}
	delReq := newMasterReq(svc, http.MethodDelete, fmt.Sprintf("/api/master/tenants/%d", disposable.ID), nil)
	delResp := execTest(t, app, delReq)
	if delResp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE tenant failed: %d", delResp.StatusCode)
	}
	delResp.Body.Close()
}
