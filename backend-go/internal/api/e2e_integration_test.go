package api_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api"
	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"
)

func TestEndToEndPOSFlow_TableOpen_Order_KDS_SettleBill(t *testing.T) {
	cfg := config.Load()
	cfg.DefaultTenantCode = "e2e-test-branch"

	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	defer dbManager.Close()

	// Prepare clean isolated tenant DB for E2E simulation
	tdb, err := dbManager.GetTenantDB("e2e-test-branch")
	if err != nil {
		t.Fatalf("GetTenantDB failed: %v", err)
	}
	tdb.Exec("DELETE FROM payments;")
	tdb.Exec("DELETE FROM order_items;")
	tdb.Exec("DELETE FROM orders;")
	tdb.Exec("DELETE FROM tables;")
	tdb.Exec("DELETE FROM areas;")
	tdb.Exec("DELETE FROM recipes;")
	tdb.Exec("DELETE FROM products;")
	tdb.Exec("DELETE FROM categories;")
	tdb.Exec("DELETE FROM ingredients;")

	// Seed Area, Table, Category, Product, Ingredient & BOM Recipe
	area := models.Area{Name: "Ana Salon", OrderIndex: 1}
	tdb.Create(&area)

	tbl := models.Table{
		AreaID: area.ID,
		Name:   "Salon-1",
		Shape:  "square",
		Seats:  4,
		Status: "empty",
	}
	tdb.Create(&tbl)

	cat := models.Category{
		Name:          "Artisan Burgerler",
		Icon:          "Beef",
		Color:         "#f97316",
		TargetStation: "kitchen",
		ShowInPos:     true,
	}
	tdb.Create(&cat)

	ing := models.Ingredient{
		Name:          "Angus Burger Köftesi",
		Unit:          "Adet",
		CurrentStock:  100,
		MinStockAlert: 10,
		CostPerUnit:   95.0,
		WarehouseID:   1,
	}
	tdb.Create(&ing)

	prod := models.Product{
		CategoryID:  cat.ID,
		Name:        "BonCore Truffle Burger",
		BasePrice:   420.0,
		VatRate:     10.0,
		Station:     "kitchen",
		IsAvailable: true,
		ShowInPos:   true,
	}
	tdb.Create(&prod)

	tdb.Create(&models.Recipe{
		ProductID:    prod.ID,
		IngredientID: ing.ID,
		Amount:       1.0,
	})

	wsHub := ws.NewHub("redis://127.0.0.1:6399/0")
	defer wsHub.Close()

	services := service.NewServices(cfg, dbManager, wsHub)

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
	api.RegisterRoutes(app, services)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer ln.Close()

	go func() {
		_ = app.Listener(ln)
	}()
	time.Sleep(50 * time.Millisecond)

	baseHTTP := fmt.Sprintf("http://%s", ln.Addr().String())
	baseWS := fmt.Sprintf("ws://%s", ln.Addr().String())

	// 1. Connect WebSocket clients: POS (/ws/pos), KDS (/ws/kds), and Table (/ws/table/:id)
	headers := http.Header{}
	headers.Set("X-Restaurant-Code", "e2e-test-branch")

	posWS, _, err := websocket.DefaultDialer.Dial(baseWS+"/ws/pos?tenant=e2e-test-branch", headers)
	if err != nil {
		t.Fatalf("failed to connect /ws/pos: %v", err)
	}
	defer posWS.Close()

	kdsWS, _, err := websocket.DefaultDialer.Dial(baseWS+"/ws/kds?tenant=e2e-test-branch", headers)
	if err != nil {
		t.Fatalf("failed to connect /ws/kds: %v", err)
	}
	defer kdsWS.Close()

	tableWS, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("%s/ws/table/%d?tenant=e2e-test-branch", baseWS, tbl.ID), headers)
	if err != nil {
		t.Fatalf("failed to connect /ws/table/%d: %v", tbl.ID, err)
	}
	defer tableWS.Close()

	time.Sleep(30 * time.Millisecond)

	// 2. STEP A: Open Table & Create Order via POST /api/orders/create
	createPayload := map[string]interface{}{
		"table_id":    tbl.ID,
		"order_type":  "dine_in",
		"waiter_name": "Ahmet Garson",
		"kuver_count": 2,
		"items": []map[string]interface{}{
			{
				"product_id": prod.ID,
				"quantity":   2,
				"selected_modifiers": []map[string]interface{}{
					{"group": "Pişme Derecesi", "name": "Orta (Medium)", "price": 0},
					{"group": "Sos", "name": "Trüf Mayonez", "price": 30},
				},
				"negative_modifiers": []string{"Soğansız"},
				"kitchen_note":       "Lütfen sıcak servis edilsin",
			},
		},
	}
	bodyBytes, _ := json.Marshal(createPayload)
	req, _ := http.NewRequest("POST", baseHTTP+"/api/orders/create", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Restaurant-Code", "e2e-test-branch")
	req.Header.Set("X-User-Role", "manager")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/orders/create failed: %v", err)
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/orders/create, got %d: %s", resp.StatusCode, string(respBody))
	}

	var createdOrder map[string]interface{}
	_ = json.Unmarshal(respBody, &createdOrder)
	orderID := int(createdOrder["id"].(float64))
	grandTotal := createdOrder["grand_total"].(float64)
	// 2 * (420 + 30) = 900.0
	if grandTotal != 900.0 {
		t.Fatalf("expected grand_total=900.0, got %v", grandTotal)
	}
	t.Logf("[E2E STEP 1] Masa (%s) açıldı ve Sipariş (#%v) oluşturuldu -> Toplam: %.2f TL", tbl.Name, createdOrder["order_no"], grandTotal)

	// 3. STEP B: Verify Instant KDS WebSocket Event (KDS_NEW_ORDER)
	_ = kdsWS.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, kdsMsgBytes, err := kdsWS.ReadMessage()
	if err != nil {
		t.Fatalf("KDS WebSocket did not receive KDS_NEW_ORDER: %v", err)
	}
	var kdsEvent ws.ChannelWirePayload
	_ = json.Unmarshal(kdsMsgBytes, &kdsEvent)
	if kdsEvent.Type != "KDS_NEW_ORDER" {
		t.Fatalf("expected KDS_NEW_ORDER event on /ws/kds, got %s", kdsEvent.Type)
	}
	t.Logf("[E2E STEP 2] Mutfak KDS WebSocket (%s) anlık olarak tetiklendi!", kdsEvent.Type)

	// Verify KDS REST endpoint GET /api/kds/orders
	kdsReq, _ := http.NewRequest("GET", baseHTTP+"/api/kds/orders?station=all", nil)
	kdsReq.Header.Set("X-Restaurant-Code", "e2e-test-branch")
	kdsResp, err := http.DefaultClient.Do(kdsReq)
	if err != nil {
		t.Fatalf("GET /api/kds/orders failed: %v", err)
	}
	var kdsOrders []map[string]interface{}
	_ = json.NewDecoder(kdsResp.Body).Decode(&kdsOrders)
	kdsResp.Body.Close()
	if len(kdsOrders) != 1 {
		t.Fatalf("expected 1 active KDS order, got %d", len(kdsOrders))
	}

	// Progress item on KDS to "ready"
	itemsArr := createdOrder["items"].([]interface{})
	firstItemID := int(itemsArr[0].(map[string]interface{})["id"].(float64))
	progReq, _ := http.NewRequest("POST", fmt.Sprintf("%s/api/kds/item/%d/progress?status=ready", baseHTTP, firstItemID), nil)
	progReq.Header.Set("X-Restaurant-Code", "e2e-test-branch")
	progResp, err := http.DefaultClient.Do(progReq)
	if err != nil || progResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/kds/item/progress failed: %v", err)
	}
	progResp.Body.Close()
	t.Logf("[E2E STEP 3] Mutfak (KDS) siparişi 'ready' (Hazır) durumuna ilerletti.")

	// 4. STEP C: Settle Payment & Close Bill via POST /api/cashier/settle-payment
	settlePayload := map[string]interface{}{
		"order_id":     orderID,
		"cashier_name": "Kasiyer Ece",
		"close_table":  true,
		"payments": []map[string]interface{}{
			{"method": "cash", "amount": 500.0, "tip": 0},
			{"method": "credit_card", "amount": 400.0, "tip": 50.0},
		},
	}
	settleBytes, _ := json.Marshal(settlePayload)
	settleReq, _ := http.NewRequest("POST", baseHTTP+"/api/cashier/settle-payment", bytes.NewReader(settleBytes))
	settleReq.Header.Set("Content-Type", "application/json")
	settleReq.Header.Set("X-Restaurant-Code", "e2e-test-branch")
	settleReq.Header.Set("X-User-Role", "manager")

	settleResp, err := http.DefaultClient.Do(settleReq)
	if err != nil {
		t.Fatalf("POST /api/cashier/settle-payment failed: %v", err)
	}
	settleRespBody, _ := io.ReadAll(settleResp.Body)
	settleResp.Body.Close()
	if settleResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/cashier/settle-payment, got %d: %s", settleResp.StatusCode, string(settleRespBody))
	}

	var settleResult map[string]interface{}
	_ = json.Unmarshal(settleRespBody, &settleResult)
	if settleResult["is_fully_paid"] != true || settleResult["order_status"] != "paid" {
		t.Fatalf("expected order to be fully paid, got: %+v", settleResult)
	}
	t.Logf("[E2E STEP 4] Parçalı ödeme (500 TL Nakit + 400 TL Kredi Kartı) alındı ve Adisyon kapatıldı!")

	// 5. Verify Table WS received TABLE_BILL_CLOSED and Floor Plan shows table is free
	_ = tableWS.SetReadDeadline(time.Now().Add(2 * time.Second))
	foundBillClosed := false
	for i := 0; i < 10; i++ {
		_, tblMsgBytes, err := tableWS.ReadMessage()
		if err != nil {
			t.Logf("tableWS read error or timeout: %v", err)
			break
		}
		var tblEvent ws.TableWirePayload
		_ = json.Unmarshal(tblMsgBytes, &tblEvent)
		t.Logf("tableWS received message: %s", string(tblMsgBytes))
		if tblEvent.Type == "TABLE_BILL_CLOSED" {
			foundBillClosed = true
			break
		}
	}
	if !foundBillClosed {
		t.Fatalf("expected TABLE_BILL_CLOSED event on /ws/table/%d", tbl.ID)
	}

	// Verify BOM stock was deducted by 2 (100 -> 98)
	var updatedIng models.Ingredient
	tdb.First(&updatedIng, ing.ID)
	if updatedIng.CurrentStock != 98.0 {
		t.Fatalf("expected BOM stock to be deducted to 98.0, got %v", updatedIng.CurrentStock)
	}
	t.Logf("[E2E STEP 5] Masa WebSocket 'TABLE_BILL_CLOSED' aldı ve BOM Reçete Stoğu 100 -> %.0f olarak güncellendi!", updatedIng.CurrentStock)
}

func TestOrderCreate_InvalidTableID_Returns404(t *testing.T) {
	cfg := config.Load()
	cfg.DefaultTenantCode = "e2e-test-branch"

	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	defer dbManager.Close()

	wsHub := ws.NewHub("redis://127.0.0.1:6399/0")
	defer wsHub.Close()

	services := service.NewServices(cfg, dbManager, wsHub)

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
	api.RegisterRoutes(app, services)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer ln.Close()

	go func() {
		_ = app.Listener(ln)
	}()
	time.Sleep(50 * time.Millisecond)

	baseHTTP := fmt.Sprintf("http://%s", ln.Addr().String())

	invalidPayload := map[string]interface{}{
		"table_id":    999999,
		"order_type":  "dine_in",
		"waiter_name": "Ahmet Garson",
		"items":       []map[string]interface{}{},
	}
	bodyBytes, _ := json.Marshal(invalidPayload)
	req, _ := http.NewRequest("POST", baseHTTP+"/api/orders/create", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Restaurant-Code", "e2e-test-branch")
	req.Header.Set("X-User-Role", "waiter")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/orders/create failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected HTTP 404 for non-existent table_id 999999, got %d: %s", resp.StatusCode, string(body))
	}
	t.Logf("Successfully verified non-existent table_id returns HTTP 404 (status: %d)", resp.StatusCode)
}

