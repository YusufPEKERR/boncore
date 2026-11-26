package api_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/boncore/pos-backend/internal/api"
	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/gofiber/fiber/v2"
)

func setupFinanceTestApp(t *testing.T) (*fiber.App, *service.Services, models.Product, models.Table) {
	t.Helper()
	t.Setenv("SQLITE_DATA_DIR", t.TempDir())
	cfg := config.Load()
	cfg.DefaultTenantCode = "fatihciftligi"
	dm, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	hub := ws.NewHub("")
	t.Cleanup(func() {
		hub.Close()
		dm.Close()
	})
	svc := service.NewServices(cfg, dm, hub)

	tdb, err := dm.GetTenantDB("fatihciftligi")
	if err != nil {
		t.Fatalf("GetTenantDB failed: %v", err)
	}
	tdb.Exec("DELETE FROM payments;")
	tdb.Exec("DELETE FROM order_items;")
	tdb.Exec("DELETE FROM orders;")
	tdb.Exec("DELETE FROM cash_registers;")

	area := models.Area{Name: "Salon Fin", OrderIndex: 1}
	tdb.Create(&area)
	tbl := models.Table{AreaID: area.ID, Name: "Fin Masa 1", Status: "empty"}
	tdb.Create(&tbl)
	cat := models.Category{Name: "Fin Kategori", OrderIndex: 1, ShowInPos: true}
	tdb.Create(&cat)
	prod := models.Product{
		CategoryID:  cat.ID,
		Name:        "Truffle Burger",
		BasePrice:   420.0,
		VatRate:     10.0,
		Station:     "kitchen",
		IsAvailable: true,
		ShowInPos:   true,
	}
	tdb.Create(&prod)
	mg := models.ModifierGroup{ProductID: prod.ID, Name: "Sos", MaxSelection: 3}
	tdb.Create(&mg)
	tdb.Create(&models.ModifierOption{GroupID: mg.ID, Name: "Trüf Mayonez", Price: 30.0})

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}
			return c.Status(code).JSON(models.FastAPIErrorResponse{Detail: err.Error()})
		},
	})
	api.RegisterRoutes(app, svc)
	return app, svc, prod, tbl
}

func doAuthJSON(t *testing.T, app *fiber.App, svc *service.Services, method, path string, body interface{}) (int, map[string]interface{}) {
	t.Helper()
	tok, _ := middleware.CreateAccessToken(svc.Config, 1, "manager", true, "fatihciftligi", nil)
	if tok == "" {
		t.Fatal("CreateAccessToken returned empty token")
	}
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Test(req, 10000)
	if err != nil {
		t.Fatalf("app.Test %s %s failed: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var parsed map[string]interface{}
	_ = json.Unmarshal(raw, &parsed)
	return resp.StatusCode, parsed
}

func TestPaket2_PricingModifiersChangeAndZeroRemainingClose(t *testing.T) {
	app, svc, prod, tbl := setupFinanceTestApp(t)

	// 1. Even if client already added modifier price into unit_price (450), server MUST NOT double-charge (450+30=480)
	code, created := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"table_id":    tbl.ID,
		"order_type":  "dine_in",
		"waiter_name": "Kasa",
		"items": []map[string]interface{}{
			{
				"product_id": prod.ID,
				"unit_price": 450.0,
				"quantity":   2,
				"selected_modifiers": []map[string]interface{}{
					{"group": "Sos", "name": "Trüf Mayonez", "price": 999.0},
				},
			},
		},
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200 on valid create, got %d (%+v)", code, created)
	}
	if created["grand_total"].(float64) != 900.0 {
		t.Fatalf("expected non-double-charged authoritative grand_total=900.0, got %v", created["grand_total"])
	}
	orderID := int(created["id"].(float64))

	// 2. Reject negative unit_price, negative service_charge, qty <= 0
	if badCode, _ := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"order_type":     "takeaway",
		"service_charge": -5.0,
		"items":          []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	}); badCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative service_charge, got %d", badCode)
	}
	if badCode, _ := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"order_type": "takeaway",
		"items":      []map[string]interface{}{{"product_id": prod.ID, "quantity": 0}},
	}); badCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for qty <= 0, got %d", badCode)
	}
	if badCode, _ := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"order_type": "takeaway",
		"items":      []map[string]interface{}{{"product_id": prod.ID, "unit_price": -10, "quantity": 1}},
	}); badCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative unit_price, got %d", badCode)
	}

	// 3. Reject rounding > 10 and non-cash overpayment > remaining + 0.05
	if badCode, _ := doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id": orderID,
		"rounding": 15.0,
		"payments": []map[string]interface{}{{"method": "cash", "amount": 100}},
	}); badCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for rounding > 10, got %d", badCode)
	}
	if badCode, _ := doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id": orderID,
		"payments": []map[string]interface{}{{"method": "credit_card", "amount": 950}},
	}); badCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for credit_card overpayment, got %d", badCode)
	}

	// 4. Cash tender of 1000 on 900 order with close_table=false records paid_total=900, change_amount=100, remaining_total=0
	payCode, payRes := doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    orderID,
		"close_table": false,
		"payments":    []map[string]interface{}{{"method": "cash", "amount": 1000}},
	})
	if payCode != http.StatusOK {
		t.Fatalf("expected 200 on cash change payment, got %d (%+v)", payCode, payRes)
	}
	if payRes["paid_total"].(float64) != 900.0 || payRes["change_amount"].(float64) != 100.0 || payRes["remaining_total"].(float64) != 0.0 {
		t.Fatalf("unexpected cash change response: %+v", payRes)
	}

	// 5. Close prepaid/zero-remaining table cleanly with payments: [] and close_table: true
	closeCode, closeRes := doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    orderID,
		"close_table": true,
		"payments":    []map[string]interface{}{},
	})
	if closeCode != http.StatusOK || closeRes["order_status"] != "paid" || closeRes["table_status"] != "empty" {
		t.Fatalf("expected 200 & paid/empty on zero-remaining close, got %d (%+v)", closeCode, closeRes)
	}
}

func TestPaket2_KioskOpenStatusAndExecuteZReportPaidPreservation(t *testing.T) {
	app, svc, prod, _ := setupFinanceTestApp(t)

	// 1. Kiosk order stays open & unpaid until paid
	kCode, kRes := doAuthJSON(t, app, svc, "POST", "/api/modules/kiosk-order", map[string]interface{}{
		"customer_name": "Kiosk Misafir",
		"service_type":  "takeaway",
		"items":         []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	})
	if kCode != http.StatusOK || kRes["order_status"] != "open" || kRes["remaining_total"].(float64) != 420.0 {
		t.Fatalf("expected kiosk order status=open & remaining=420, got %d (%+v)", kCode, kRes)
	}

	tdb, _ := svc.DBManager.GetTenantDB("fatihciftligi")
	kioskID := int(kRes["order_id"].(float64))

	// Create a second prepaid open order (already fully paid, table left open) and verify ExecuteZReport preserves it as paid
	_, o2Res := doAuthJSON(t, app, svc, "POST", "/api/orders/create", map[string]interface{}{
		"order_type": "takeaway",
		"items":      []map[string]interface{}{{"product_id": prod.ID, "quantity": 1}},
	})
	prepaidID := int(o2Res["id"].(float64))
	// Pay kiosk as partially paid first to test refusal, then settle remaining cleanly
	_, _ = doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    prepaidID,
		"close_table": false,
		"payments":    []map[string]interface{}{{"method": "cash", "amount": 200.0}},
	})
	tdb.Model(&models.Order{}).Where("id = ?", prepaidID).Update("status", "open")

	// Partially paid open order must refuse forceClose=true
	if _, err := service.ExecuteZReport(tdb, "fatihciftligi", "Müdür", true, svc.WSHub); err == nil {
		t.Fatalf("expected ExecuteZReport forceClose=true to refuse cancelling partially paid order #%d", prepaidID)
	}

	// Finish paying prepaidID cleanly without closing
	_, _ = doAuthJSON(t, app, svc, "POST", "/api/cashier/settle-payment", map[string]interface{}{
		"order_id":    prepaidID,
		"close_table": false,
		"payments":    []map[string]interface{}{{"method": "cash", "amount": 220.0}},
	})
	// Force status back to "open" with RemainingTotal=0 to simulate open prepaid table at Z-Report time
	tdb.Model(&models.Order{}).Where("id = ?", prepaidID).Update("status", "open")

	if _, err := service.ExecuteZReport(tdb, "fatihciftligi", "Müdür", true, svc.WSHub); err != nil {
		t.Fatalf("expected ExecuteZReport forceClose=true to succeed cleanly: %v", err)
	}

	var prepaidOrder, kioskOrder models.Order
	tdb.First(&prepaidOrder, prepaidID)
	tdb.First(&kioskOrder, kioskID)
	if prepaidOrder.Status != "paid" {
		t.Fatalf("expected fully paid open order to transition to 'paid', got %q", prepaidOrder.Status)
	}
	if kioskOrder.Status != "cancelled" {
		t.Fatalf("expected unpaid kiosk order to transition to 'cancelled', got %q", kioskOrder.Status)
	}
}

func TestPaket2_ConcurrentModuleStoreWrites(t *testing.T) {
	app, svc, _, _ := setupFinanceTestApp(t)

	const n = 12
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			code, _ := doAuthJSON(t, app, svc, "POST", "/api/modules/reservations", map[string]interface{}{
				"guest_name": fmt.Sprintf("Misafir %d", idx),
				"guests":     2,
			})
			if code != http.StatusOK {
				t.Errorf("concurrent reservation post failed with %d", code)
			}
		}(i)
	}
	wg.Wait()

	code, res := doAuthJSON(t, app, svc, "GET", "/api/modules/reservations", nil)
	if code != http.StatusOK {
		t.Fatalf("GET /api/modules/reservations failed: %d", code)
	}
	list := res["reservations"].([]interface{})
	if len(list) != n {
		t.Fatalf("expected all %d concurrent reservations preserved, got %d", n, len(list))
	}
}
