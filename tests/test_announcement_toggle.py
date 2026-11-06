import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_announcement_lifecycle():
    print("=== Testing Announcement Toggle (Active / Deactive) & Deletion ===")
    
    # 1. Create a new test broadcast announcement
    payload = {
        "title": "Sistem Bakım Çalışması Bildirimi",
        "content": "Pazar gecesi 03:00 - 04:00 saatleri arasında veritabanı optimizasyonu yapılacaktır.",
        "banner_type": "warning",
        "target_type": "all",
        "show_as_popup": True,
        "dismissible": True,
        "sent_by": "Master Admin"
    }
    res = requests.post(f"{BASE_URL}/api/master/broadcast", json=payload)
    assert res.status_code == 201, f"Failed create announcement: {res.status_code} {res.text}"
    created = res.json()["announcement"]
    ann_id = created["id"]
    print(f"[PASS] Created announcement ID {ann_id}, is_active = {created['is_active']}")
    assert created["is_active"] is True
    
    # 2. Query /api/announcements/active (POS endpoint)
    res = requests.get(f"{BASE_URL}/api/announcements/active", headers={"X-Tenant-Code": "fatihciftligi"})
    assert res.status_code == 200
    active_list = res.json()
    assert any(a["id"] == ann_id for a in active_list), "Announcement should be in active list"
    print(f"[PASS] Announcement {ann_id} successfully listed in /api/announcements/active")
    
    # 3. Toggle announcement to INACTIVE via PATCH /api/master/announcements/:id/toggle
    res = requests.patch(f"{BASE_URL}/api/master/announcements/{ann_id}/toggle")
    assert res.status_code == 200, f"Failed toggle: {res.status_code} {res.text}"
    toggle_data = res.json()
    assert toggle_data["is_active"] is False, "Announcement should now be inactive"
    print(f"[PASS] Announcement {ann_id} successfully deactivated (is_active: false)")
    
    # 4. Verify /api/announcements/active no longer returns it
    res = requests.get(f"{BASE_URL}/api/announcements/active", headers={"X-Tenant-Code": "fatihciftligi"})
    assert res.status_code == 200
    active_list = res.json()
    assert not any(a["id"] == ann_id for a in active_list), "Deactivated announcement MUST NOT be in active list"
    print(f"[PASS] Verified: Deactivated announcement {ann_id} does NOT appear on POS")
    
    # 5. Toggle back to ACTIVE
    res = requests.patch(f"{BASE_URL}/api/master/announcements/{ann_id}/toggle")
    assert res.status_code == 200
    assert res.json()["is_active"] is True
    res = requests.get(f"{BASE_URL}/api/announcements/active", headers={"X-Tenant-Code": "fatihciftligi"})
    assert any(a["id"] == ann_id for a in res.json()), "Re-activated announcement should appear again"
    print(f"[PASS] Re-activated announcement {ann_id} and verified it appears on POS again")
    
    # 6. Delete announcement via DELETE /api/master/announcements/:id
    res = requests.delete(f"{BASE_URL}/api/master/announcements/{ann_id}")
    assert res.status_code == 200
    print(f"[PASS] Deleted announcement {ann_id}")
    
    # Verify deletion
    res = requests.get(f"{BASE_URL}/api/master/announcements")
    assert not any(a["id"] == ann_id for a in res.json()), "Deleted announcement should not exist in master list"
    print("=== ALL ANNOUNCEMENT TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    try:
        test_announcement_lifecycle()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
