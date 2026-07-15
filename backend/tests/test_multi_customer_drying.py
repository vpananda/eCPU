import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"mobile": "9999999999", "password": "admin123"}

def _login():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    return r.json()["token"]

def H(tok):
    return {"Authorization": f"Bearer {tok}"}

def test_multi_customer_drying_flow():
    tok = _login()
    headers = H(tok)

    # 1. Fetch products and branches to use valid IDs
    branches = requests.get(f"{API}/branches", headers=headers).json()
    assert len(branches) > 0
    branch_id = branches[0]["id"]

    products = requests.get(f"{API}/products", headers=headers).json()
    assert len(products) > 0
    product_id = products[0]["id"]

    # 2. Create two test customers
    c1_payload = {"name": "Test Customer A", "mobile": "9988776655", "branch_id": branch_id}
    c1 = requests.post(f"{API}/customers", headers=headers, json=c1_payload).json()
    assert "id" in c1

    c2_payload = {"name": "Test Customer B", "mobile": "9988776654", "branch_id": branch_id}
    c2 = requests.post(f"{API}/customers", headers=headers, json=c2_payload).json()
    assert "id" in c2

    # 3. Create two separate arrivals
    arr1_payload = {
        "customer_id": c1["id"],
        "product_id": product_id,
        "raw_weight": 100.0,
        "bags": 4,
        "bag_weight": 1.0,
        "rate_per_kg": 12.0,
        "branch_id": branch_id
    }
    arr1 = requests.post(f"{API}/arrivals", headers=headers, json=arr1_payload).json()
    assert arr1["status"] == "Received"

    arr2_payload = {
        "customer_id": c2["id"],
        "product_id": product_id,
        "raw_weight": 200.0,
        "bags": 8,
        "bag_weight": 1.0,
        "rate_per_kg": 12.0,
        "branch_id": branch_id
    }
    arr2 = requests.post(f"{API}/arrivals", headers=headers, json=arr2_payload).json()
    assert arr2["status"] == "Received"

    # 4. Create a test dryer machine
    m_payload = {"name": "Test Dryer Multi", "capacity": 500.0, "status": "Available", "branch_id": branch_id}
    machine = requests.post(f"{API}/machines", headers=headers, json=m_payload).json()
    assert machine["status"] == "Available"
    machine_id = machine["id"]

    # 5. Load the machine with both arrivals
    load_payload = {
        "batch_ids": [arr1["id"], arr2["id"]]
    }
    load_res = requests.post(f"{API}/machines/{machine_id}/load", headers=headers, json=load_payload)
    assert load_res.status_code == 200

    # Verify machine is Running
    machines_list = requests.get(f"{API}/machines", headers=headers).json()
    m_curr = next(m for m in machines_list if m["id"] == machine_id)
    assert m_curr["status"] == "Running"
    assert len(m_curr["running_batches"]) == 2

    # Verify arrivals are Drying
    b1 = requests.get(f"{API}/batches/{arr1['id']}", headers=headers).json()
    b2 = requests.get(f"{API}/batches/{arr2['id']}", headers=headers).json()
    assert b1["status"] == "Drying"
    assert b2["status"] == "Drying"

    # 6. Stop the machine and record drying completion
    stop_payload = {
        "total_dry_weight": 150.0,
        "total_dry_bags": 6
    }
    stop_res = requests.post(f"{API}/machines/{machine_id}/stop", headers=headers, json=stop_payload)
    assert stop_res.status_code == 200

    # Verify machine is Available
    machines_list = requests.get(f"{API}/machines", headers=headers).json()
    m_after = next(m for m in machines_list if m["id"] == machine_id)
    assert m_after["status"] == "Available"
    assert len(m_after["running_batches"]) == 0

    # Verify proportional dry weights and statuses
    b1_after = requests.get(f"{API}/batches/{arr1['id']}", headers=headers).json()
    b2_after = requests.get(f"{API}/batches/{arr2['id']}", headers=headers).json()

    assert b1_after["status"] == "Completed"
    assert b2_after["status"] == "Completed"

    # Raw: 100 vs 200. Dry: 150. Proportions should be 50 vs 100.
    assert float(b1_after["actual_dry_weight"]) == 50.0
    assert float(b2_after["actual_dry_weight"]) == 100.0

    # Bags: 6 total. Proportions should be 2 vs 4.
    assert int(b1_after["processed_bags"]) == 2
    assert int(b2_after["processed_bags"]) == 4

    # Clean up test database additions
    requests.delete(f"{API}/batches/{arr1['id']}", headers=headers)
    requests.delete(f"{API}/batches/{arr2['id']}", headers=headers)
    requests.delete(f"{API}/machines/{machine_id}", headers=headers)


def test_stop_dryer_without_dry_weight_flow():
    tok = _login()
    headers = H(tok)

    branches = requests.get(f"{API}/branches", headers=headers).json()
    branch_id = branches[0]["id"]
    products = requests.get(f"{API}/products", headers=headers).json()
    product_id = products[0]["id"]

    # 1. Create a customer
    c_payload = {"name": "Test Customer NoStopWeight", "mobile": "9988770000", "branch_id": branch_id}
    c = requests.post(f"{API}/customers", headers=headers, json=c_payload).json()
    assert "id" in c

    # 2. Create arrival
    arr_payload = {
        "customer_id": c["id"],
        "product_id": product_id,
        "raw_weight": 120.0,
        "bags": 5,
        "bag_weight": 1.0,
        "rate_per_kg": 12.0,
        "branch_id": branch_id
    }
    arr = requests.post(f"{API}/arrivals", headers=headers, json=arr_payload).json()
    assert arr["status"] == "Received"

    # 3. Create machine
    m_payload = {"name": "Test Dryer NoStopWeight", "capacity": 500.0, "status": "Available", "branch_id": branch_id}
    machine = requests.post(f"{API}/machines", headers=headers, json=m_payload).json()
    machine_id = machine["id"]

    # 4. Load machine
    requests.post(f"{API}/machines/{machine_id}/load", headers=headers, json={"batch_ids": [arr["id"]]})

    # 5. Stop machine WITHOUT dry weights/bags
    stop_res = requests.post(f"{API}/machines/{machine_id}/stop", headers=headers, json={})
    assert stop_res.status_code == 200

    # 6. Verify machine status is Available
    m_after = requests.get(f"{API}/machines", headers=headers).json()
    m_test = next(x for x in m_after if x["id"] == machine_id)
    assert m_test["status"] == "Available"

    # 7. Verify batch status is Completed but actual_dry_weight, processed_bags, weight_loss are None/null
    b_after = requests.get(f"{API}/batches/{arr['id']}", headers=headers).json()
    assert b_after["status"] == "Completed"
    assert b_after.get("actual_dry_weight") is None
    assert b_after.get("processed_bags") is None or b_after.get("processed_bags") == 0
    assert b_after.get("weight_loss") is None

    # 8. Deliver batch and record weight
    delivery_payload = {
        "actual_dry_weight": 105.5,
        "processed_bags": 4,
        "rate_per_kg": 12.0,
        "received_by": "Test Receiver",
        "received_by_phone": "9999999999",
        "amount_received": 0.0,
        "payment_mode": "Cash",
        "remarks": "Delivered okay"
    }
    del_res = requests.post(f"{API}/batches/{arr['id']}/delivery", headers=headers, json=delivery_payload)
    assert del_res.status_code == 200

    # 9. Verify delivered details
    b_del = requests.get(f"{API}/batches/{arr['id']}", headers=headers).json()
    assert b_del["status"] == "Delivered"
    assert float(b_del["actual_dry_weight"]) == 105.5
    assert int(b_del["processed_bags"]) == 4
    assert float(b_del["weight_loss"]) == 14.5 # 120.0 - 105.5

    # 10. Clean up
    requests.delete(f"{API}/batches/{arr['id']}", headers=headers)
    requests.delete(f"{API}/machines/{machine_id}", headers=headers)


def test_customer_soft_delete_flow():
    admin_tok = _login()
    headers_admin = {"Authorization": f"Bearer {admin_tok}"}
    
    manager_res = requests.post(f"{API}/auth/login", json={"mobile": "8888888888", "password": "manager123"}, timeout=15)
    assert manager_res.status_code == 200
    manager_tok = manager_res.json()["token"]
    headers_manager = {"Authorization": f"Bearer {manager_tok}"}
    
    # 1. Create a customer
    payload = {
        "name": "Soft Delete Tester",
        "mobile": "9998887770",
        "alt_mobile": "",
        "village": "Test Ville",
        "taluk": "Test Tal",
        "district": "Test Dist",
        "address": "Test Road",
        "gst": "",
        "remarks": "",
        "branch_id": None
    }
    create_res = requests.post(f"{API}/customers", headers=headers_admin, json=payload)
    assert create_res.status_code == 200
    customer = create_res.json()
    cid = customer["id"]
    
    # 2. Verify they are listed
    list_res = requests.get(f"{API}/customers", headers=headers_admin).json()
    assert any(c["id"] == cid for c in list_res)
    
    # 3. Verify they show up in search
    search_res = requests.get(f"{API}/search?q=Soft Delete Tester", headers=headers_admin).json()
    assert any(c["id"] == cid for c in search_res["customers"])
    
    # 4. Attempt deletion by Manager (should fail with 403)
    del_fail = requests.delete(f"{API}/customers/{cid}", headers=headers_manager)
    assert del_fail.status_code == 403
    
    # 5. Perform deletion by Admin (should succeed)
    del_ok = requests.delete(f"{API}/customers/{cid}", headers=headers_admin)
    assert del_ok.status_code == 200
    
    # 6. Verify they are excluded from listing
    list_after = requests.get(f"{API}/customers", headers=headers_admin).json()
    assert not any(c["id"] == cid for c in list_after)
    
    # 7. Verify they do not show up in search
    search_after = requests.get(f"{API}/search?q=Soft Delete Tester", headers=headers_admin).json()
    assert not any(c["id"] == cid for c in search_after["customers"])
    
    # 8. Verify they are still fetchable directly (for historical records)
    get_res = requests.get(f"{API}/customers/{cid}", headers=headers_admin)
    assert get_res.status_code == 200
    assert get_res.json()["is_deleted"] is True


