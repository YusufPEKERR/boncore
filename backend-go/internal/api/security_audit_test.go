package api_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/boncore/pos-backend/internal/api"
	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/boncore/pos-backend/internal/ws"
	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"
)

func TestSecurity_Paket1_AuthTenantIsolationAndPrivilegeEscalation(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("SQLITE_DATA_DIR", tempDir)
	cfg := config.Load()
	cfg.DefaultTenantCode = "fatihciftligi"
	cfg.PublicBaseURL = "https://pos.boncore.example"

	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	defer dbManager.Close()

	wsHub := ws.NewHub("")
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

	// 1. Unauthenticated access to internal/PII/financial endpoints must return 401
	protectedEndpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/cashier/day-end"},
		{"GET", "/api/audit/logs"},
		{"GET", "/api/delivery/orders"},
		{"GET", "/api/products/"},
		{"POST", "/api/scale/print"},
		{"GET", "/api/support/tickets"},
		{"GET", "/api/scale/agent/poll?terminal_id=kasa-1"},
	}
	for _, ep := range protectedEndpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		req.Header.Set("X-Restaurant-Code", "fatihciftligi")
		resp := execTest(t, app, req)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 for unauthenticated %s %s, got %d", ep.method, ep.path, resp.StatusCode)
		}
	}

	// 2. Arbitrary unregistered X-Restaurant-Code must NOT create a SQLite DB file on disk
	unregCode := "attacker-random-db-999"
	reqUnreg := newTenantReq(svcHelper(services), unregCode, "manager", "GET", "/api/tables/", nil)
	respUnreg := execTest(t, app, reqUnreg)
	if respUnreg.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unregistered tenant DB creation attempt, got %d", respUnreg.StatusCode)
	}
	if _, statErr := os.Stat(filepath.Join(tempDir, "data", "tenants", unregCode+".db")); statErr == nil {
		t.Fatalf("SECURITY VIOLATION: unregistered tenant DB file was created on disk!")
	}

	// 3. Tenant manager cannot create master_admin/superadmin staff user
	badStaffBody, _ := json.Marshal(map[string]interface{}{
		"name":     "Evil Escalator",
		"username": "evil_master",
		"role":     "master_admin",
		"pin_code": "7412",
	})
	reqStaff := newTenantReq(services, "fatihciftligi", "manager", "POST", "/api/auth/staff", bytes.NewReader(badStaffBody))
	reqStaff.Header.Set("Content-Type", "application/json")
	respStaff := execTest(t, app, reqStaff)
	if respStaff.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 when tenant manager tries to create role=master_admin, got %d", respStaff.StatusCode)
	}

	// 4. Forged tenant token claiming role=master_admin without master_platform aud/rc cannot access /api/master/*
	forgedTok, _ := middleware.CreateAccessToken(cfg, 1, "master_admin", false, "fatihciftligi", nil)
	reqMaster := httptest.NewRequest("GET", "/api/master/tenants", nil)
	reqMaster.Header.Set("Authorization", "Bearer "+forgedTok)
	respMaster := execTest(t, app, reqMaster)
	if respMaster.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for forged tenant token on /api/master/tenants, got %d", respMaster.StatusCode)
	}

	// 5. Creating a new tenant via Master Admin must NOT seed Kemal Müdür / 9999 backdoor
	newTenantBody, _ := json.Marshal(map[string]interface{}{
		"code":       "guvenli-bistro",
		"name":       "Güvenli Bistro",
		"owner_name": "Ali Veli",
	})
	reqCreateTenant := newMasterReq(services, "POST", "/api/master/tenants", bytes.NewReader(newTenantBody))
	reqCreateTenant.Header.Set("Content-Type", "application/json")
	respCreateTenant := execTest(t, app, reqCreateTenant)
	if respCreateTenant.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(respCreateTenant.Body)
		t.Fatalf("POST /api/master/tenants failed: %d %s", respCreateTenant.StatusCode, string(b))
	}
	newTdb, err := dbManager.GetTenantDB("guvenli-bistro")
	if err != nil {
		t.Fatalf("GetTenantDB(guvenli-bistro) failed: %v", err)
	}
	var staffList []models.StaffUser
	newTdb.Find(&staffList)
	for _, u := range staffList {
		if u.PinCode == "9999" || strings.Contains(u.Name, "Kemal") {
			t.Fatalf("SECURITY VIOLATION: Backdoor user seeded in new tenant: %+v", u)
		}
	}

	// 6. /api/scale/download-agent must ignore X-Forwarded-Host and use configured PublicBaseURL + agent_api_key
	reqDl := newTenantReq(services, "fatihciftligi", "manager", "GET", "/api/scale/download-agent", nil)
	reqDl.Header.Set("X-Forwarded-Host", "evil-attacker.com")
	reqDl.Header.Set("X-Forwarded-Proto", "http")
	respDl := execTest(t, app, reqDl)
	if respDl.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/scale/download-agent failed: %d", respDl.StatusCode)
	}
	zipBytes, _ := io.ReadAll(respDl.Body)
	zr, zErr := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if zErr != nil {
		t.Fatalf("invalid zip returned: %v", zErr)
	}
	foundConfig := false
	for _, f := range zr.File {
		if f.Name == "Kurulum.bat" || f.Name == "BonCoreCertificate.cer" {
			t.Fatalf("SECURITY VIOLATION: %s must not be bundled in agent zip", f.Name)
		}
		if f.Name == "config.json" {
			foundConfig = true
			rc, _ := f.Open()
			cfgData, _ := io.ReadAll(rc)
			_ = rc.Close()
			var parsed map[string]interface{}
			_ = json.Unmarshal(cfgData, &parsed)
			if parsed["server_url"] != "https://pos.boncore.example" {
				t.Fatalf("expected server_url=https://pos.boncore.example, got %v", parsed["server_url"])
			}
			if key, _ := parsed["agent_api_key"].(string); !strings.HasPrefix(key, "bca_") {
				t.Fatalf("expected generated agent_api_key in config.json, got %v", parsed["agent_api_key"])
			}
		}
	}
	if !foundConfig {
		t.Fatal("config.json not found in agent zip")
	}
}

func svcHelper(s *service.Services) *service.Services { return s }

func TestSecurity_WebSocketAuthAndQRTableIsolation(t *testing.T) {
	t.Setenv("SQLITE_DATA_DIR", t.TempDir())
	cfg := config.Load()
	cfg.DefaultTenantCode = "fatihciftligi"

	dbManager, err := repository.NewDatabaseManager(cfg)
	if err != nil {
		t.Fatalf("NewDatabaseManager failed: %v", err)
	}
	defer dbManager.Close()

	wsHub := ws.NewHub("")
	defer wsHub.Close()
	services := service.NewServices(cfg, dbManager, wsHub)

	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	api.RegisterRoutes(app, services)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	defer ln.Close()
	go func() { _ = app.Listener(ln) }()
	time.Sleep(40 * time.Millisecond)

	baseWS := fmt.Sprintf("ws://%s", ln.Addr().String())

	// 1. Unauthenticated /ws/pos must be rejected (non-101 handshake error)
	_, respUnauth, dialErr := websocket.DefaultDialer.Dial(baseWS+"/ws/pos?restaurant_code=fatihciftligi", nil)
	if dialErr == nil {
		t.Fatal("expected unauthenticated /ws/pos to fail handshake")
	}
	if respUnauth != nil && respUnauth.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauthenticated /ws/pos, got %d", respUnauth.StatusCode)
	}

	// 2. QR table client (/ws/table/5) must NOT receive internal "pos" or "all" broadcasts
	tblHeaders := http.Header{}
	tblHeaders.Set("X-Restaurant-Code", "fatihciftligi")
	tableWS, _, err := websocket.DefaultDialer.Dial(baseWS+"/ws/table/5?restaurant_code=fatihciftligi", tblHeaders)
	if err != nil {
		t.Fatalf("QR table WS failed: %v", err)
	}
	defer tableWS.Close()
	time.Sleep(30 * time.Millisecond)

	_ = wsHub.BroadcastToChannel("fatihciftligi", "pos", "ORDER_CREATED", map[string]interface{}{"secret": "internal-pii"})
	_ = wsHub.BroadcastToChannel("fatihciftligi", "all", "DELIVERY_ORDER_CREATED", map[string]interface{}{"phone": "05551112233"})

	_ = tableWS.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	_, msg, readErr := tableWS.ReadMessage()
	if readErr == nil {
		t.Fatalf("SECURITY VIOLATION: QR table WebSocket leaked internal POS/All broadcast: %s", string(msg))
	}
}
