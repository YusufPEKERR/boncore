import requests

BASE_URL = "http://127.0.0.1:8000"

def test_announcement_edit():
    print("=== Testing Announcement Edit (PUT /api/master/announcements/:id) ===")
    
    # 1. Create a test broadcast announcement
    payload = {
        "title": "İlk Duyuru Başlığı",
        "content": "Eski duyuru açıklaması burada yer alıyor.",
        "banner_type": "info",
        "target_type": "all",
        "show_as_popup": False,
        "dismissible": True,
        "sent_by": "Master Admin"
    }
    res = requests.post(f"{BASE_URL}/api/master/broadcast", json=payload)
    assert res.status_code == 201, f"Failed create: {res.status_code} {res.text}"
    created = res.json()["announcement"]
    ann_id = created["id"]
    print(f"[PASS] Created test announcement ID {ann_id}")
    
    # 2. Update via PUT /api/master/announcements/:id
    update_payload = {
        "title": "Güncellenmiş Yeni Başlık (v2)",
        "content": "Bu duyuru Master Admin tarafından düzenlendi ve güncellendi.",
        "banner_type": "danger",
        "show_as_popup": True,
        "dismissible": False,
        "target_type": "all"
    }
    res = requests.put(f"{BASE_URL}/api/master/announcements/{ann_id}", json=update_payload)
    assert res.status_code == 200, f"Failed update: {res.status_code} {res.text}"
    updated = res.json()["announcement"]
    
    assert updated["title"] == update_payload["title"], f"Expected {update_payload['title']}, got {updated['title']}"
    assert updated["content"] == update_payload["content"], f"Expected {update_payload['content']}, got {updated['content']}"
    assert updated["banner_type"] == "danger", f"Expected danger, got {updated['banner_type']}"
    assert updated["show_as_popup"] is True, f"Expected popup true, got {updated['show_as_popup']}"
    assert updated["dismissible"] is False, f"Expected dismissible false, got {updated['dismissible']}"
    print(f"[PASS] Successfully updated announcement fields via PUT")
    
    # 3. Check POS active announcements to ensure updated text is served
    res = requests.get(f"{BASE_URL}/api/announcements/active", headers={"X-Tenant-Code": "fatihciftligi"})
    assert res.status_code == 200
    active_items = res.json()
    matched = next((a for a in active_items if a["id"] == ann_id), None)
    assert matched is not None, "Updated announcement must be in active list"
    assert matched["title"] == update_payload["title"]
    assert matched["content"] == update_payload["content"]
    assert matched["banner_type"] == "danger"
    print(f"[PASS] Verified POS active list returns updated title & content")
    
    # 4. Clean up
    res = requests.delete(f"{BASE_URL}/api/master/announcements/{ann_id}")
    assert res.status_code == 200
    print(f"[PASS] Cleaned up test announcement ID {ann_id}")
    print("=== All announcement edit tests passed successfully! ===")

if __name__ == "__main__":
    test_announcement_edit()
