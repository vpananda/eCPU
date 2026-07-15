import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"mobile": "9999999999", "password": "admin123"}

def _login():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200
    return r.json()["token"]

@pytest.fixture(scope="module")
def admin_headers():
    token = _login()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def test_spice_and_branch_rates_crud(admin_headers):
    # 1. Fetch branches
    r = requests.get(f"{API}/branches", headers=admin_headers)
    assert r.status_code == 200
    branches = r.json()
    assert len(branches) > 0
    branch_id = branches[0]["id"]
    
    # 2. Add a new spice
    spice_data = {"name": "Test Spice X", "default_rate": 15.0}
    r = requests.post(f"{API}/products", headers=admin_headers, json=spice_data)
    assert r.status_code == 200
    spice = r.json()
    spice_id = spice["id"]
    assert spice["name"] == "Test Spice X"
    assert spice["default_rate"] == 15.0
    
    try:
        # 3. List products and check that our new spice has no branch rates configured yet
        r = requests.get(f"{API}/products", headers=admin_headers)
        assert r.status_code == 200
        products = r.json()
        saved_spice = next(p for p in products if p["id"] == spice_id)
        assert saved_spice["branch_rates"] == {}
        
        # 4. Fetch branch rates list for this spice
        r = requests.get(f"{API}/products/{spice_id}/rates", headers=admin_headers)
        assert r.status_code == 200
        rates_list = r.json()
        assert len(rates_list) == len(branches)
        # All rates should default to default_rate
        for rate_item in rates_list:
            assert rate_item["rate"] == 15.0
            
        # 5. Set a custom rate override for the first branch
        override_rate = 22.5
        payload = [{"branch_id": branch_id, "rate": override_rate}]
        r = requests.put(f"{API}/products/{spice_id}/rates", headers=admin_headers, json=payload)
        assert r.status_code == 200
        
        # 6. Verify rates list again
        r = requests.get(f"{API}/products/{spice_id}/rates", headers=admin_headers)
        assert r.status_code == 200
        rates_list = r.json()
        target_override = next(item for item in rates_list if item["branch_id"] == branch_id)
        assert target_override["rate"] == 22.5
        
        # 7. Check list products to see nested branch_rates overrides
        r = requests.get(f"{API}/products", headers=admin_headers)
        assert r.status_code == 200
        products = r.json()
        saved_spice = next(p for p in products if p["id"] == spice_id)
        assert saved_spice["branch_rates"][branch_id] == 22.5
        
    finally:
        # 8. Delete the test product
        r = requests.delete(f"{API}/products/{spice_id}", headers=admin_headers)
        assert r.status_code == 200


def test_branch_level_spice_rate_master(admin_headers):
    # 1. Fetch branches
    r = requests.get(f"{API}/branches", headers=admin_headers)
    assert r.status_code == 200
    branches = r.json()
    assert len(branches) > 0
    branch_id = branches[0]["id"]
    
    # 2. Add a new spice
    spice_data = {"name": "Test Spice Y", "default_rate": 18.0}
    r = requests.post(f"{API}/products", headers=admin_headers, json=spice_data)
    assert r.status_code == 200
    spice = r.json()
    spice_id = spice["id"]
    
    try:
        # 3. Get rates for this branch and verify our spice has default rate
        r = requests.get(f"{API}/branches/{branch_id}/rates", headers=admin_headers)
        assert r.status_code == 200
        rates = r.json()
        target_rate = next(item for item in rates if item["product_id"] == spice_id)
        assert target_rate["rate"] == 18.0
        
        # 4. Set custom rate using branch rates master endpoint
        payload = [{"product_id": spice_id, "rate": 25.0}]
        r = requests.put(f"{API}/branches/{branch_id}/rates", headers=admin_headers, json=payload)
        assert r.status_code == 200
        
        # 5. Fetch rates again and verify it is updated
        r = requests.get(f"{API}/branches/{branch_id}/rates", headers=admin_headers)
        assert r.status_code == 200
        rates = r.json()
        target_rate = next(item for item in rates if item["product_id"] == spice_id)
        assert target_rate["rate"] == 25.0
        
    finally:
        # Cleanup
        r = requests.delete(f"{API}/products/{spice_id}", headers=admin_headers)
        assert r.status_code == 200
