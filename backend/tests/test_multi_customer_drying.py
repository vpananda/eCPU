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
