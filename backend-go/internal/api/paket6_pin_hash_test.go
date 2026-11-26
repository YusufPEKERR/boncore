package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
)

func TestStaffPINHashedStorageAndLoginCompatibility(t *testing.T) {
	app, svc, _, _ := setupFinanceTestApp(t)
	tdb, err := svc.DBManager.GetTenantDB("fatihciftligi")
	if err != nil || tdb == nil {
		t.Fatalf("GetTenantDB failed: %v", err)
	}

	// Simulate a legacy plaintext row before AutoMigrateTenant backfill
	legacyUname := "legacy_waiter_p6"
	legacy := models.StaffUser{
		Name:     "Legacy Garson",
		Username: &legacyUname,
		Role:     "waiter",
		PinCode:  "4321",
		IsActive: true,
	}
	if err := tdb.Create(&legacy).Error; err != nil {
		t.Fatalf("failed to seed legacy staff: %v", err)
	}

	// Re-run AutoMigrateTenant -> backfills plaintext PINs to hashed sentinel
	if err := svc.DBManager.AutoMigrateTenant(tdb); err != nil {
		t.Fatalf("AutoMigrateTenant failed: %v", err)
	}

	var refreshed models.StaffUser
	if err := tdb.First(&refreshed, legacy.ID).Error; err != nil {
		t.Fatalf("failed to reload staff user: %v", err)
	}
	if refreshed.PinCode == "4321" || !repository.IsHashedPinSentinel(refreshed.PinCode) {
		t.Fatalf("expected plaintext PIN to be replaced by hashed sentinel, got %q", refreshed.PinCode)
	}
	if refreshed.PinHash == nil || *refreshed.PinHash == "" || refreshed.PinLookupHash == nil || *refreshed.PinLookupHash == "" {
		t.Fatalf("expected PinHash and PinLookupHash to be populated during backfill")
	}

	// Test /api/auth/login-pin with backfilled PIN "4321"
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login-pin", strings.NewReader(`{"pin_code":"4321"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Restaurant-Code", "fatihciftligi")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("login-pin request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on login-pin after backfill, got %d", resp.StatusCode)
	}
	var loginOut map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&loginOut); err != nil {
		t.Fatalf("failed to decode login-pin response: %v", err)
	}
	if loginOut["access_token"] == "" || loginOut["access_token"] == nil {
		t.Fatalf("expected access_token on login-pin")
	}
}
