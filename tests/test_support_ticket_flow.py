import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_support_ticket_flow():
    print("=== Testing Support Ticket Flow & Return Visibility ===")

    # 1. Tenant submits a support ticket
    ticket_payload = {
        "category": "pos",
        "priority": "high",
        "subject": "Otomatik Test: Adisyon hesap fişi yazdırma sorunu",
        "description": "Yazıcıdan fiş alamıyoruz, kırmızı ışık yanıp sönüyor.",
        "submitted_by_name": "Ahmet Kasiyer",
        "submitted_by_role": "cashier",
        "device_info": "Test Runner Terminal"
    }

    res = requests.post(f"{BASE_URL}/api/support/tickets", data=ticket_payload)
    assert res.status_code == 201, f"Create ticket failed: {res.text}"
    ticket_data = res.json()
    assert ticket_data.get("success") is True
    ticket = ticket_data.get("ticket")
    ticket_id = ticket["id"]
    ticket_no = ticket["ticket_number"]
    print(f"1. Support Ticket Created Successfully: ID={ticket_id}, No={ticket_no}")

    # 2. Master Admin views tickets list
    res = requests.get(f"{BASE_URL}/api/master/tickets")
    assert res.status_code == 200, f"Master tickets list failed: {res.text}"
    tickets = res.json()
    assert any(t["id"] == ticket_id for t in tickets), "Created ticket not found in master tickets list"
    print(f"2. Master Admin found ticket #{ticket_no} in ticket catalog.")

    # 3. Master Admin sends reply message to ticket
    msg_payload = {
        "sender_name": "Mustafa (SaaS Destek Uzmanı)",
        "message": "Merhaba Ahmet Bey, yazıcı IP adresini ve kağıt rulosu yönünü kontrol ediniz. Sistem üzerinden yazıcı servisini yeniden başlattık."
    }
    res = requests.post(f"{BASE_URL}/api/master/tickets/{ticket_id}/messages", json=msg_payload)
    assert res.status_code == 201, f"Send message failed: {res.text}"
    print(f"3. Master Admin replied to ticket #{ticket_no}.")

    # 4. Master Admin updates status with resolution notes
    status_payload = {
        "status": "resolved",
        "resolution_notes": "Yazıcı sürücüsü yeniden başlatıldı ve test çıktısı başarıyla onaylandı.",
        "performed_by": "Mustafa (SaaS Destek Uzmanı)"
    }
    res = requests.put(f"{BASE_URL}/api/master/tickets/{ticket_id}/status", json=status_payload)
    assert res.status_code == 200, f"Update status failed: {res.text}"
    print(f"4. Master Admin updated ticket #{ticket_no} status to resolved with resolution note.")

    # 5. Restaurant Staff views their tickets (GET /api/support/tickets)
    res = requests.get(f"{BASE_URL}/api/support/tickets")
    assert res.status_code == 200, f"Tenant tickets list failed: {res.text}"
    tenant_tickets = res.json()
    our_ticket = next((t for t in tenant_tickets if t["id"] == ticket_id), None)
    assert our_ticket is not None, "Ticket not returned to tenant"
    assert our_ticket["status"] == "resolved", f"Expected status 'resolved', got '{our_ticket['status']}'"
    assert our_ticket.get("resolution_notes") == status_payload["resolution_notes"], "Resolution notes mismatch"
    assert len(our_ticket.get("messages", [])) >= 1, "Messages not preloaded for tenant"
    print(f"5. Tenant received ticket #{ticket_no} with preloaded messages & resolution notes! Messages count: {len(our_ticket['messages'])}")

    # 6. Restaurant Staff replies back to ticket
    reply_payload = {
        "sender_name": "Ahmet Kasiyer",
        "message": "Teşekkürler Mustafa Bey, kağıt rulosunu düzelttik ve şu an fiş sorunsuz yazdırılıyor!"
    }
    res = requests.post(f"{BASE_URL}/api/support/tickets/{ticket_id}/reply", json=reply_payload)
    assert res.status_code == 201, f"Tenant reply failed: {res.text}"
    print(f"6. Restaurant Staff replied back to ticket #{ticket_no}.")

    # 7. Check ticket detail in Master Admin
    res = requests.get(f"{BASE_URL}/api/master/tickets/{ticket_id}")
    assert res.status_code == 200, f"Master ticket detail failed: {res.text}"
    detail = res.json()
    assert len(detail.get("messages", [])) >= 2, f"Expected at least 2 messages in conversation, got {len(detail.get('messages', []))}"
    print(f"7. Master Admin confirmed 2-way conversation thread with {len(detail['messages'])} messages.")

    print("\n>>> ALL SUPPORT TICKET RETURN & CONVERSATION TESTS PASSED 100%! <<<")

if __name__ == "__main__":
    test_support_ticket_flow()
