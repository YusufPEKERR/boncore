package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScaleAgentHeartbeatStatusAndIPPreservation(t *testing.T) {
	app, svc := setupTestApp(t)
	defer svc.DBManager.Close()

	testTID := "test_kasa_unit_01"
	testMachineID := "mach-unit-test-999"

	defer func() {
		delReq := httptest.NewRequest("DELETE", "/api/scale/terminals/"+testTID, nil)
		delReq.Header.Set("X-Restaurant-Code", "fatihciftligi")
		_ = execTest(t, app, delReq)
	}()

	// 1. Agent sends initial heartbeat with real LAN IP and machine_id
	hb1 := map[string]interface{}{
		"terminal_id":   testTID,
		"terminal_name": "Test Kasa",
		"machine_id":    testMachineID,
		"local_ip":      "192.168.0.120",
		"version":       "2.4.5",
		"scale_ip":      "192.168.0.15",
		"scale_port":    2004,
		"printers":      []string{"MUTFAK-POS"},
	}
	b1, _ := json.Marshal(hb1)
	req1 := httptest.NewRequest("POST", "/api/scale/agent/heartbeat", bytes.NewReader(b1))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp1 := execTest(t, app, req1)
	if resp1.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on heartbeat 1, got %d", resp1.StatusCode)
	}

	// 2. Transient 127.0.0.1 heartbeat must NOT overwrite good local_ip
	hb2 := map[string]interface{}{
		"terminal_id":   testTID,
		"terminal_name": "Test Kasa",
		"machine_id":    testMachineID,
		"local_ip":      "127.0.0.1",
		"version":       "2.4.5",
	}
	b2, _ := json.Marshal(hb2)
	req2 := httptest.NewRequest("POST", "/api/scale/agent/heartbeat", bytes.NewReader(b2))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Restaurant-Code", "fatihciftligi")
	resp2 := execTest(t, app, req2)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on heartbeat 2, got %d", resp2.StatusCode)
	}

	// 3. /api/scale/agent/status must return frontend camelCase fields (isOnline, localIp, version)
	statusReq := httptest.NewRequest("GET", "/api/scale/agent/status?terminal_id="+testTID, nil)
	statusReq.Header.Set("X-Restaurant-Code", "fatihciftligi")
	statusResp := execTest(t, app, statusReq)
	if statusResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on /agent/status, got %d", statusResp.StatusCode)
	}
	statusBody, _ := io.ReadAll(statusResp.Body)
	var statusJSON map[string]interface{}
	if err := json.Unmarshal(statusBody, &statusJSON); err != nil {
		t.Fatalf("invalid json from /agent/status: %v", err)
	}
	if isOnline, _ := statusJSON["isOnline"].(bool); !isOnline {
		t.Fatalf("expected isOnline=true, got %+v", statusJSON)
	}
	if gotIP, _ := statusJSON["localIp"].(string); gotIP != "192.168.0.120" {
		t.Fatalf("expected preserved localIp=192.168.0.120, got %q (payload: %+v)", gotIP, statusJSON)
	}
	if gotVer, _ := statusJSON["version"].(string); gotVer != "2.4.5" {
		t.Fatalf("expected version=2.4.5, got %q", gotVer)
	}

	// 4. /api/scale/agent/poll keeps terminal alive and succeeds without pending commands
	pollReq := httptest.NewRequest("GET", "/api/scale/agent/poll?terminal_id="+testTID, nil)
	pollReq.Header.Set("X-Restaurant-Code", "fatihciftligi")
	pollResp := execTest(t, app, pollReq)
	if pollResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on /agent/poll, got %d", pollResp.StatusCode)
	}

	// 5. Heartbeat matching by machine_id updates existing terminal rather than duplicating
	hb3 := map[string]interface{}{
		"terminal_id":   testTID,
		"terminal_name": "Test Kasa",
		"machine_id":    testMachineID,
		"local_ip":      "192.168.0.125",
		"version":       "2.4.5",
	}
	b3, _ := json.Marshal(hb3)
	req3 := httptest.NewRequest("POST", "/api/scale/agent/heartbeat", bytes.NewReader(b3))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set("X-Restaurant-Code", "fatihciftligi")
	_ = execTest(t, app, req3)

	termsReq := httptest.NewRequest("GET", "/api/scale/terminals", nil)
	termsReq.Header.Set("X-Restaurant-Code", "fatihciftligi")
	termsResp := execTest(t, app, termsReq)
	termsBody, _ := io.ReadAll(termsResp.Body)
	var termsJSON struct {
		Terminals []map[string]interface{} `json:"terminals"`
	}
	if err := json.Unmarshal(termsBody, &termsJSON); err != nil {
		t.Fatalf("invalid json from /terminals: %v", err)
	}
	matches := 0
	for _, term := range termsJSON.Terminals {
		if term["id"] == testTID {
			matches++
			if term["local_ip"] != "192.168.0.125" {
				t.Fatalf("expected updated local_ip=192.168.0.125, got %v", term["local_ip"])
			}
			if online, _ := term["is_online"].(bool); !online {
				t.Fatalf("expected terminal to be online")
			}
		}
	}
	if matches != 1 {
		t.Fatalf("expected exactly 1 terminal for %s, got %d", testTID, matches)
	}
}
