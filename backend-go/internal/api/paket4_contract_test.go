package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
)

func TestPaket4_ContractRBACServiceChargeImpersonateAndClone(t *testing.T) {
	app, svc, prod, tbl := setupFinanceTestApp(t)
	tdb, _ := svc.DBManager.GetTenantDB("fatihciftligi")

	// 1. NormalizeRoleKey("chef") -> "kitchen"
	if got := svc.Permissions.NormalizeRoleKey("chef"); got != "kitchen" {
		t.Fatalf("expected NormalizeRoleKey('chef') == 'kitchen', got %q", got)
	}
	if got := svc.Permissions.NormalizeRoleKey("şef"); got != "kitchen" {
		t.Fatalf("expected NormalizeRoleKey('şef') == 'kitchen', got %q", got)
	}

	doTok := func(tok, method, path string, body interface{}) (int, map[string]interface{}) {
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
		resp, err := app.Test(req, 10000)
		if err != nil {
			t.Fatalf("%s %s err: %v", method, path, err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		var out map[string]interface{}
		_ = json.Unmarshal(raw, &out)
		return resp.StatusCode, out
	}

	// 2. PUT /api/auth/me updates own name safely
	uname := "kasiyer1"
	cashier := models.StaffUser{Name: "Eski Ad", Username: &uname, Role: "cashier", IsActive: true}
	tdb.Create(&cashier)
	cashierTok, _ := middleware.CreateAccessToken(svc.Config, cashier.ID, "cashier", true, "fatihciftligi", nil)

	meCode, meRes := doTok(cashierTok, "PUT", "/api/auth/me", map[string]interface{}{
		"name": "Yeni Kasiyer Adı",
		"role": "manager",
	})
	if meCode != http.StatusOK {
		t.Fatalf("expected 200 on PUT /api/auth/me, got %d (%+v)", meCode, meRes)
	}
	var updatedStaff models.StaffUser
	tdb.First(&updatedStaff, cashier.ID)
	if updatedStaff.Name != "Yeni Kasiyer Adı" || updatedStaff.Role != "cashier" {
		t.Fatalf("unexpected updated staff: name=%q role=%q", updatedStaff.Name, updatedStaff.Role)
	}

	// 3. POST /api/orders/:order_id/service-charge
	_, oRes := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"table_id": tbl.ID,
		"items":    []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	})
	oid := int(oRes["id"].(float64))
	scCode, scRes := doAuthJSON(t, app, svc, "POST", fmt.Sprintf("/api/orders/%d/service-charge", oid), map[string]interface{}{
		"amount": 50.0,
		"note":   "Bilardo 60 dk",
	})
	if scCode != http.StatusOK || scRes["grand_total"].(float64) != 470.0 {
		t.Fatalf("expected grand_total=470 after service-charge, got %d (%+v)", scCode, scRes)
	}

	// 4. POST /api/master/tenants/:tenant_id/impersonate
	masterTok, _ := middleware.CreateMasterAccessToken(svc.Config, 1, true)
	impCode, impRes := doTok(masterTok, "POST", "/api/master/tenants/fatihciftligi/impersonate", nil)
	if impCode != http.StatusOK || impRes["access_token"] == nil || impRes["tenant_code"] != "fatihciftligi" {
		t.Fatalf("expected 200 & token on /impersonate, got %d (%+v)", impCode, impRes)
	}

	// 5. GET /api/cashier/expenses uses TR date bounds
	trLoc := service.TurkeyLoc()
	todayTR := time.Now().In(trLoc).Format("2006-01-02")
	expCode, _ := doAuthJSON(t, app, svc, "GET", fmt.Sprintf("/api/cashier/expenses?start_date=%s&end_date=%s", todayTR, todayTR), nil)
	if expCode != http.StatusOK {
		t.Fatalf("expected 200 on GET /api/cashier/expenses, got %d", expCode)
	}
}
