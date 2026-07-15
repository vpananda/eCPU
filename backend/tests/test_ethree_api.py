"""EThree Agro Solutions - Backend API tests."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://cardamom-batch-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"mobile": "9999999999", "password": "admin123"}
MANAGER = {"mobile": "8888888888", "password": "manager123"}
STORE = {"mobile": "7777777777", "password": "store123"}


def _login(cred):
    r = requests.post(f"{API}/auth/login", json=cred, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    j = r.json()
    assert "token" in j and "user" in j
    return j["token"], j["user"]


@pytest.fixture(scope="session")
def admin_token():
    t, u = _login(ADMIN)
    assert u["role"] == "Admin"
    return t


@pytest.fixture(scope="session")
def manager_token():
    t, _ = _login(MANAGER)
    return t


@pytest.fixture(scope="session")
def store_token():
    t, _ = _login(STORE)
    return t


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_login_admin(self):
        _login(ADMIN)

    def test_login_manager(self):
        _login(MANAGER)

    def test_login_store(self):
        _login(STORE)

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"mobile": "9999999999", "password": "wrong"})
        assert r.status_code == 400

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "Admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)


# ---------------- SEED ----------------
class TestSeeded:
    def test_products_seeded(self, admin_token):
        r = requests.get(f"{API}/products", headers=H(admin_token))
        assert r.status_code == 200
        names = {p["name"] for p in r.json()}
        for expected in ["Cardamom", "Coffee", "Pepper", "Turmeric", "Cloves", "Vegetables", "Fruits", "Other"]:
            assert expected in names, f"Missing product {expected}"

    def test_machines_seeded(self, admin_token):
        r = requests.get(f"{API}/machines", headers=H(admin_token))
        assert r.status_code == 200
        machines = r.json()
        names = {m["name"] for m in machines}
        for expected in ["Dryer 2", "Dryer 3", "Dryer 4"]:
            assert expected in names
        assert any(x in names for x in ["Dryer 1", "HPD250-1"])
        for m in machines:
            assert "status" in m

    def test_expense_categories(self, admin_token):
        r = requests.get(f"{API}/expense-categories", headers=H(admin_token))
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) >= 10

    def test_dashboard_shape(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["today_arrival", "period_customers", "period_received_weight", "period_deliveries",
                  "period_collection", "period_expenses", "period_profit", "pending_payments",
                  "machines_running", "machines_available", "total_machines", "recent_activities", "range"]:
            assert k in d, f"Missing dashboard field {k}"


# ---------------- Cust / Batch / Delivery / Payment ----------------
class TestFlow:
    ids = {}

    def test_create_customer(self, admin_token):
        payload = {"name": f"TEST Farmer {uuid.uuid4().hex[:6]}", "mobile": f"9{uuid.uuid4().int % 1000000000:09d}",
                   "village": "TestV"}
        r = requests.post(f"{API}/customers", headers=H(admin_token), json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["code"].startswith("C") and len(c["code"]) == 5
        TestFlow.ids["customer_id"] = c["id"]

        # verify list + get
        rl = requests.get(f"{API}/customers", headers=H(admin_token))
        assert rl.status_code == 200
        assert any(x["id"] == c["id"] for x in rl.json())

        rg = requests.get(f"{API}/customers/{c['id']}", headers=H(admin_token))
        assert rg.status_code == 200
        got = rg.json()
        assert "stats" in got and "history" in got

    def test_create_batch(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token)).json()
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        product_id = next(p["id"] for p in prods if p["name"] == "Cardamom")
        # pick an available machine
        machine = next((m for m in machs if m["status"] == "Available"), machs[0])
        TestFlow.ids["machine_id"] = machine["id"]
        payload = {
            "customer_id": TestFlow.ids["customer_id"],
            "product_id": product_id,
            "raw_weight": 100,
            "estimated_dry_weight": 80,
            "moisture": 20,
            "bags": 5,
            "bag_weight": 20,
            "machine_id": machine["id"],
            "rate_per_kg": 15,
            "loading_charges": 100,
            "discount": 50,
            "advance_paid": 200,
        }
        r = requests.post(f"{API}/batches", headers=H(admin_token), json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["batch_no"].startswith("B") and len(b["batch_no"]) == 6
        assert b["receipt_no"].startswith("R")
        assert b["status"] == "Received"
        # bill = 100*15 + 100 - 50 = 1550
        assert abs(b["bill_amount"] - 1550.0) < 0.01, f"bill={b['bill_amount']}"
        TestFlow.ids["batch_id"] = b["id"]

        # Verify advance recorded as payment
        rg = requests.get(f"{API}/batches/{b['id']}", headers=H(admin_token))
        gb = rg.json()
        assert gb["total_paid"] == 200.0
        assert gb["balance_amount"] == 1350.0

    def test_batch_validation_raw_weight(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token)).json()
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        payload = {
            "customer_id": TestFlow.ids["customer_id"],
            "product_id": prods[0]["id"],
            "raw_weight": 0,
            "machine_id": machs[0]["id"],
            "rate_per_kg": 10,
        }
        r = requests.post(f"{API}/batches", headers=H(admin_token), json=payload)
        assert r.status_code == 400

    def test_batch_validation_advance_exceeds(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token)).json()
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        payload = {
            "customer_id": TestFlow.ids["customer_id"],
            "product_id": prods[0]["id"],
            "raw_weight": 10,
            "estimated_dry_weight": 8,
            "machine_id": machs[0]["id"],
            "rate_per_kg": 10,
            "advance_paid": 9999,
        }
        r = requests.post(f"{API}/batches", headers=H(admin_token), json=payload)
        assert r.status_code == 400

    def test_status_flow_loaded(self, admin_token):
        r = requests.put(f"{API}/batches/{TestFlow.ids['batch_id']}/status",
                         headers=H(admin_token), json={"status": "Loaded"})
        assert r.status_code == 200
        # machine should be Running with current_batch_id set
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        m = next(x for x in machs if x["id"] == TestFlow.ids["machine_id"])
        assert m["status"] == "Running"
        assert m.get("current_batch_id") == TestFlow.ids["batch_id"]

    def test_status_flow_drying_completed(self, admin_token):
        r1 = requests.put(f"{API}/batches/{TestFlow.ids['batch_id']}/status",
                          headers=H(admin_token), json={"status": "Drying"})
        assert r1.status_code == 200
        r2 = requests.put(f"{API}/batches/{TestFlow.ids['batch_id']}/status",
                          headers=H(admin_token), json={"status": "Completed"})
        assert r2.status_code == 200

    def test_delivery(self, admin_token):
        r = requests.post(f"{API}/batches/{TestFlow.ids['batch_id']}/delivery",
                          headers=H(admin_token),
                          json={"actual_dry_weight": 75, "received_by": "TEST"})
        assert r.status_code == 200, r.text
        d = r.json()
        # weight_loss = 100 - 75 = 25
        assert d["weight_loss"] == 25
        # bill = 100*15 + 100 - 50 = 1550
        assert abs(d["bill_amount"] - 1550.0) < 0.01

        # machine freed
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        m = next(x for x in machs if x["id"] == TestFlow.ids["machine_id"])
        assert m["status"] == "Available"
        assert m.get("current_batch_id") in (None, "")

        # batch status Delivered
        gb = requests.get(f"{API}/batches/{TestFlow.ids['batch_id']}", headers=H(admin_token)).json()
        assert gb["status"] == "Delivered"

    def test_add_payment(self, admin_token):
        r = requests.post(f"{API}/payments", headers=H(admin_token),
                          json={"batch_id": TestFlow.ids["batch_id"], "amount": 500, "mode": "UPI"})
        assert r.status_code == 200
        # total_paid should be 700 (200 advance + 500), bill 1550 → balance 850
        gb = requests.get(f"{API}/batches/{TestFlow.ids['batch_id']}", headers=H(admin_token)).json()
        assert gb["total_paid"] == 700.0
        assert abs(gb["balance_amount"] - 850.0) < 0.01

    def test_list_payments(self, admin_token):
        r = requests.get(f"{API}/payments", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Expenses / Maintenance ----------------
class TestExpense:
    def test_create_expense(self, admin_token):
        r = requests.post(f"{API}/expenses", headers=H(admin_token),
                          json={"category": "Electricity", "amount": 250, "vendor": "TEST-Vendor"})
        assert r.status_code == 200
        rl = requests.get(f"{API}/expenses", headers=H(admin_token))
        assert rl.status_code == 200

    def test_maintenance(self, admin_token):
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        r = requests.post(f"{API}/maintenance", headers=H(admin_token),
                          json={"machine_id": machs[0]["id"], "complaint": "TEST issue", "cost": 100})
        assert r.status_code == 200
        rl = requests.get(f"{API}/maintenance", headers=H(admin_token))
        assert rl.status_code == 200
        # ensure enrichment with machine_name
        items = rl.json()
        if items:
            assert "machine_name" in items[0]


# ---------------- Reports / Search / Audit / RBAC ----------------
class TestReports:
    def test_reports_summary(self, admin_token):
        r = requests.get(f"{API}/reports/summary", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_collection", "total_expense", "profit", "pending_payments",
                  "pending_deliveries", "machine_utilization", "expense_by_category"]:
            assert k in d
        assert isinstance(d["machine_utilization"], list)
        assert isinstance(d["expense_by_category"], dict)

    def test_search(self, admin_token):
        r = requests.get(f"{API}/search?q=TEST", headers=H(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert "customers" in j and "batches" in j


class TestRBAC:
    def test_audit_admin(self, admin_token):
        r = requests.get(f"{API}/audit", headers=H(admin_token))
        assert r.status_code == 200

    def test_audit_manager(self, manager_token):
        r = requests.get(f"{API}/audit", headers=H(manager_token))
        assert r.status_code == 200

    def test_audit_store_forbidden(self, store_token):
        r = requests.get(f"{API}/audit", headers=H(store_token))
        assert r.status_code == 403

    def test_create_user_admin(self, admin_token):
        mob = f"6{uuid.uuid4().int % 1000000000:09d}"
        r = requests.post(f"{API}/auth/users", headers=H(admin_token),
                          json={"name": "TEST User", "mobile": mob, "password": "pass1234", "role": "Store Incharge"})
        assert r.status_code == 200

    def test_create_user_manager_forbidden(self, manager_token):
        mob = f"6{uuid.uuid4().int % 1000000000:09d}"
        r = requests.post(f"{API}/auth/users", headers=H(manager_token),
                          json={"name": "TEST User", "mobile": mob, "password": "pass1234", "role": "Store Incharge"})
        assert r.status_code == 403

    def test_create_user_store_forbidden(self, store_token):
        mob = f"6{uuid.uuid4().int % 1000000000:09d}"
        r = requests.post(f"{API}/auth/users", headers=H(store_token),
                          json={"name": "TEST User", "mobile": mob, "password": "pass1234", "role": "Store Incharge"})
        assert r.status_code == 403
