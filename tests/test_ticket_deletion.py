import requests

BASE_URL = "http://127.0.0.1:8000"

def test_ticket_deletion():
    print("=== Testing Support Ticket Deletion & Bulk Deletion ===")

    # 1. Create 3 test tickets
    created_ids = []
    for i in range(1, 4):
        payload = {
            "category": "pos",
            "priority": "normal",
            "subject": f"Silme Testi Bileti {i}",
            "description": f"Bu bilet silme testi için oluşturuldu {i}",
            "submitted_by_name": "Test Silme Kullanıcı",
            "submitted_by_role": "cashier"
        }
        res = requests.post(f"{BASE_URL}/api/support/tickets", data=payload)
        assert res.status_code == 201, f"Create ticket {i} failed: {res.text}"
        ticket_id = res.json()["ticket"]["id"]
        created_ids.append(ticket_id)
        print(f"Created ticket {i}: ID={ticket_id}")

    assert len(created_ids) == 3

    # Add a message to first ticket
    requests.post(f"{BASE_URL}/api/master/tickets/{created_ids[0]}/messages", json={
        "sender_name": "Destek",
        "message": "Silinecek mesaj testi"
    })

    # 2. Delete single ticket (first one)
    res = requests.delete(f"{BASE_URL}/api/master/tickets/{created_ids[0]}")
    assert res.status_code == 200, f"Delete ticket failed: {res.text}"
    print(f"Successfully deleted ticket ID={created_ids[0]}")

    # Verify first ticket is gone from master tickets
    res = requests.get(f"{BASE_URL}/api/master/tickets")
    assert res.status_code == 200
    all_tickets = res.json()
    assert not any(t["id"] == created_ids[0] for t in all_tickets), "Ticket was not deleted!"
    print(f"Verified ticket ID={created_ids[0]} no longer exists in master catalog.")

    # 3. Bulk delete remaining tickets (second and third)
    res = requests.post(f"{BASE_URL}/api/master/tickets/bulk-delete", json={"ids": created_ids[1:]})
    assert res.status_code == 200, f"Bulk delete failed: {res.text}"
    print(f"Successfully bulk deleted tickets: {created_ids[1:]}")

    # Verify both are gone
    res = requests.get(f"{BASE_URL}/api/master/tickets")
    assert res.status_code == 200
    all_tickets = res.json()
    assert not any(t["id"] in created_ids for t in all_tickets), "Tickets were not bulk deleted!"
    print(f"Verified all created tickets {created_ids} are completely removed.")

    print("\n>>> ALL TICKET DELETION TESTS PASSED 100%! <<<")

if __name__ == "__main__":
    test_ticket_deletion()
