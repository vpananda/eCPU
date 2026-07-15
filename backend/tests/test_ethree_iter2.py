"""EThree Agro - Iteration 2 backend tests.

Covers: Processing dashboard fields, /dashboard/arrivals with branch_name,
/arrivals endpoint, /batches/{id}/status w/ machine_id requirement, delivery inline
payment, branches CRUD, users CRUD, branch scoping, google auth invalid session,
regression on seeded logins.
"""
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
    return j["token"], j["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin_token():
    t, u = _login(ADMIN)
    assert u["role"] == "Admin"
    return t


@pytest.fixture(scope="session")
def admin_user():
    _, u = _login(ADMIN)
    return u


@pytest.fixture(scope="session")
def manager_token():
    return _login(MANAGER)[0]


@pytest.fixture(scope="session")
def store_token():
    return _login(STORE)[0]


# -------------------- Regression: seeded logins --------------------
class TestSeededLogins:
    def test_admin_login(self):
        _login(ADMIN)

    def test_manager_login(self):
        _login(MANAGER)

    def test_store_login(self):
        _login(STORE)


# -------------------- Dashboard shape --------------------
class TestDashboardProcessing:
    def test_dashboard_processing_fields(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        ta = d.get("today_arrival")
        assert isinstance(ta, dict), "today_arrival missing"
        for k in ["in_weight", "out_weight", "in_count", "out_count",
                  "processing_weight", "processing_count"]:
            assert k in ta, f"today_arrival missing key {k}"
        for k in ["period_customers", "period_received_weight", "period_deliveries",
                  "period_collection", "period_expenses", "pending_payments",
                  "machines_running", "machines_available", "range"]:
            assert k in d, f"dashboard missing key {k}"
        # range shape
        assert "start" in d["range"] and "end" in d["range"]

    def test_dashboard_arrivals(self, admin_token):
        r = requests.get(f"{API}/dashboard/arrivals", headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["in", "out", "processing", "totals", "range"]:
            assert k in d
        # branch_name populated in each row (may be "-" if branch unset)
        for section in ["in", "out", "processing"]:
            for row in d[section]:
                assert "branch_name" in row
                assert "customer_name" in row
                assert "product" in row
                assert "arrival_date" in row


# -------------------- Arrivals endpoint --------------------
class TestArrivals:
    ids = {}

    def _get_customer(self, tok):
        cs = requests.get(f"{API}/customers", headers=H(tok)).json()
        if cs:
            return cs[0]["id"]
        # create one
        r = requests.post(f"{API}/customers", headers=H(tok),
                          json={"name": f"TEST Arrival Cust {uuid.uuid4().hex[:6]}",
                                "mobile": f"9{uuid.uuid4().int % 1000000000:09d}",
                                "village": "V"})
        return r.json()["id"]

    def test_create_arrival(self, admin_token):
        prods = requests.get(f"{API}/products", headers=H(admin_token)).json()
        pid = next(p["id"] for p in prods if p["name"] == "Cardamom")
        cid = self._get_customer(admin_token)
        payload = {
            "customer_id": cid, "product_id": pid,
            "raw_weight": 50, "bags": 3, "bag_weight": 16,
            "rate_per_kg": 12.0,
            "remarks": "TEST arrival",
            "photos": [],
        }
        r = requests.post(f"{API}/arrivals", headers=H(admin_token), json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "Received"
        assert b["machine_id"] in (None, "")
        assert b["batch_no"].startswith("B")
        # bill = 50*12 = 600
        assert abs(b["bill_amount"] - 600.0) < 0.01
        TestArrivals.ids["batch_id"] = b["id"]
        TestArrivals.ids["customer_id"] = cid
        TestArrivals.ids["product_id"] = pid

    def test_status_loaded_requires_machine(self, admin_token):
        bid = TestArrivals.ids["batch_id"]
        r = requests.put(f"{API}/batches/{bid}/status",
                         headers=H(admin_token), json={"status": "Loaded"})
        assert r.status_code == 400, r.text

    def test_status_loaded_with_machine(self, admin_token):
        bid = TestArrivals.ids["batch_id"]
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        m = next((x for x in machs if x["status"] == "Available"), machs[0])
        r = requests.put(f"{API}/batches/{bid}/status",
                         headers=H(admin_token),
                         json={"status": "Loaded", "machine_id": m["id"]})
        assert r.status_code == 200, r.text
        gb = requests.get(f"{API}/batches/{bid}", headers=H(admin_token)).json()
        assert gb["status"] == "Loaded"
        assert gb["machine_id"] == m["id"]
        # machine is Running
        machs2 = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        m2 = next(x for x in machs2 if x["id"] == m["id"])
        assert m2["status"] == "Running"
        TestArrivals.ids["machine_id"] = m["id"]

    def test_status_next_step_no_machine_ok(self, admin_token):
        bid = TestArrivals.ids["batch_id"]
        r1 = requests.put(f"{API}/batches/{bid}/status",
                          headers=H(admin_token), json={"status": "Drying"})
        assert r1.status_code == 200
        r2 = requests.put(f"{API}/batches/{bid}/status",
                          headers=H(admin_token), json={"status": "Completed"})
        assert r2.status_code == 200

    def test_delivery_with_inline_payment(self, admin_token):
        bid = TestArrivals.ids["batch_id"]
        payload = {
            "actual_dry_weight": 40,
            "processed_bags": 3,
            "rate_per_kg": 15.0,   # override
            "received_by": "TEST Recv",
            "received_by_phone": "9000000001",
            "amount_received": 200.0,
            "payment_mode": "UPI",
            "remarks": "TEST delivery"
        }
        r = requests.post(f"{API}/batches/{bid}/delivery", headers=H(admin_token), json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        # weight_loss = 50 - 40 = 10
        assert abs(j["weight_loss"] - 10.0) < 0.01
        # bill = 50*15 = 750, balance = 750-200 = 550
        assert abs(j["bill_amount"] - 750.0) < 0.01
        assert abs(j["balance_amount"] - 550.0) < 0.01
        # verify payment recorded
        pays = requests.get(f"{API}/payments", headers=H(admin_token)).json()
        assert any(p["batch_id"] == bid and abs(p["amount"] - 200.0) < 0.01 for p in pays)
        # machine freed
        machs = requests.get(f"{API}/machines", headers=H(admin_token)).json()
        m = next(x for x in machs if x["id"] == TestArrivals.ids["machine_id"])
        assert m["status"] == "Available"


# -------------------- Branches CRUD --------------------
class TestBranches:
    ids = {}

    def test_admin_list(self, admin_token):
        r = requests.get(f"{API}/branches", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_manager_can_list(self, manager_token):
        # /branches is not admin-only (all authenticated users may list)
        r = requests.get(f"{API}/branches", headers=H(manager_token))
        assert r.status_code == 200

    def test_create_branch_admin(self, admin_token):
        name = f"TEST-Branch-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/branches", headers=H(admin_token),
                          json={"name": name, "address": "Addr", "phone": "9999900000"})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["name"] == name
        TestBranches.ids["branch_id"] = b["id"]
        TestBranches.ids["branch_name"] = name

    def test_create_branch_manager_forbidden(self, manager_token):
        r = requests.post(f"{API}/branches", headers=H(manager_token),
                          json={"name": "TEST-Deny", "address": "", "phone": ""})
        assert r.status_code == 403

    def test_update_branch(self, admin_token):
        bid = TestBranches.ids["branch_id"]
        new_name = TestBranches.ids["branch_name"] + "-upd"
        r = requests.put(f"{API}/branches/{bid}", headers=H(admin_token),
                         json={"name": new_name, "address": "Addr2", "phone": "9999900002"})
        assert r.status_code == 200
        # verify persistence
        branches = requests.get(f"{API}/branches", headers=H(admin_token)).json()
        assert any(b["id"] == bid and b["name"] == new_name for b in branches)


# -------------------- Users CRUD + Manager list --------------------
class TestUsers:
    ids = {}

    def test_list_users_admin(self, admin_token):
        r = requests.get(f"{API}/auth/users", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_users_manager_allowed(self, manager_token):
        r = requests.get(f"{API}/auth/users", headers=H(manager_token))
        assert r.status_code == 200

    def test_list_users_store_forbidden(self, store_token):
        r = requests.get(f"{API}/auth/users", headers=H(store_token))
        assert r.status_code == 403

    def test_create_user_with_branch(self, admin_token):
        # need a branch to assign to
        branches = requests.get(f"{API}/branches", headers=H(admin_token)).json()
        assert branches
        bid = branches[0]["id"]
        mob = f"6{uuid.uuid4().int % 1000000000:09d}"
        payload = {"name": f"TEST Mgr {uuid.uuid4().hex[:4]}", "mobile": mob,
                   "password": "pass1234", "role": "Manager", "branch_id": bid}
        r = requests.post(f"{API}/auth/users", headers=H(admin_token), json=payload)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "Manager"
        assert u["branch_id"] == bid
        TestUsers.ids["user_id"] = u["id"]
        TestUsers.ids["mobile"] = mob
        TestUsers.ids["password"] = "pass1234"
        TestUsers.ids["branch_id"] = bid

        # can login with new user
        tok, u2 = _login({"mobile": mob, "password": "pass1234"})
        assert u2["role"] == "Manager"

    def test_update_user_role_and_password(self, admin_token):
        uid = TestUsers.ids["user_id"]
        new_pw = "newpass9"
        r = requests.put(f"{API}/auth/users/{uid}", headers=H(admin_token),
                         json={"name": "TEST Updated", "password": new_pw})
        assert r.status_code == 200
        # verify new pw works
        tok, _ = _login({"mobile": TestUsers.ids["mobile"], "password": new_pw})
        assert tok

    def test_delete_user(self, admin_token):
        uid = TestUsers.ids["user_id"]
        r = requests.delete(f"{API}/auth/users/{uid}", headers=H(admin_token))
        assert r.status_code == 200
        # login now fails
        r2 = requests.post(f"{API}/auth/login",
                           json={"mobile": TestUsers.ids["mobile"], "password": "newpass9"})
        assert r2.status_code in (400, 401)


# -------------------- Branch Scoping --------------------
class TestBranchScoping:
    ids = {}

    def test_scoping_flow(self, admin_token):
        # create a second branch
        bname = f"TEST-ScopeBranch-{uuid.uuid4().hex[:6]}"
        rb = requests.post(f"{API}/branches", headers=H(admin_token),
                           json={"name": bname, "address": "", "phone": ""})
        assert rb.status_code == 200
        branch_id = rb.json()["id"]
        TestBranchScoping.ids["branch_id"] = branch_id

        # create Manager for that branch
        mob = f"6{uuid.uuid4().int % 1000000000:09d}"
        ru = requests.post(f"{API}/auth/users", headers=H(admin_token),
                           json={"name": "TEST BranchMgr", "mobile": mob,
                                 "password": "pass1234", "role": "Manager",
                                 "branch_id": branch_id})
        assert ru.status_code == 200
        mgr_uid = ru.json()["id"]
        TestBranchScoping.ids["mgr_uid"] = mgr_uid

        # login as new manager
        mtok, mu = _login({"mobile": mob, "password": "pass1234"})
        assert mu["branch_id"] == branch_id

        # create customer as this Manager
        mob2 = f"9{uuid.uuid4().int % 1000000000:09d}"
        rc = requests.post(f"{API}/customers", headers=H(mtok),
                           json={"name": "TEST ScopedCust", "mobile": mob2, "village": "V"})
        assert rc.status_code == 200, rc.text
        cust = rc.json()
        assert cust.get("branch_id") == branch_id, f"Customer branch_id={cust.get('branch_id')}, expected {branch_id}"
        cust_id = cust["id"]

        # list customers as Manager -> branch's customers + legacy (branch_id null)
        # By design, branch_query includes legacy records for backward compat.
        # Verify: customers from OTHER named branches must NOT be visible.
        rl = requests.get(f"{API}/customers", headers=H(mtok))
        assert rl.status_code == 200
        listed = rl.json()
        assert any(c["id"] == cust_id for c in listed)
        # No customer belonging to a *different* branch is visible
        for c in listed:
            cb = c.get("branch_id")
            assert cb in (None, "", branch_id), f"Manager sees foreign-branch customer: id={c['id']} branch_id={cb}"

        # admin sees this customer too (all-branches)
        rla = requests.get(f"{API}/customers", headers=H(admin_token))
        assert any(c["id"] == cust_id for c in rla.json())

        # cleanup
        requests.delete(f"{API}/auth/users/{mgr_uid}", headers=H(admin_token))


# -------------------- Google Auth --------------------
class TestGoogleAuth:
    def test_google_invalid_session_returns_401(self):
        r = requests.post(f"{API}/auth/google",
                          json={"session_token": "invalid-session-token-xxx"},
                          timeout=25)
        assert r.status_code in (401, 400), f"Expected 401/400, got {r.status_code} {r.text}"

    def test_bearer_accepts_jwt(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "Admin"


class TestBatchModificationsAndCustomerStats:
    def test_update_and_delete_batch(self, admin_token):
        # 1. Create a customer
        mob = f"9{uuid.uuid4().int % 1000000000:09d}"
        rc = requests.post(f"{API}/customers", headers=H(admin_token),
                           json={"name": "Test batch-mod customer", "mobile": mob})
        assert rc.status_code == 200
        cid = rc.json()["id"]

        # 2. Create a batch/arrival
        rp = requests.get(f"{API}/products", headers=H(admin_token))
        pid = rp.json()[0]["id"]
        
        rb = requests.post(f"{API}/arrivals", headers=H(admin_token),
                           json={"customer_id": cid, "product_id": pid, "raw_weight": 100, "rate_per_kg": 12, "arrival_date": "2026-07-10"})
        assert rb.status_code == 200
        bid = rb.json()["id"]
        assert rb.json()["arrival_date"].startswith("2026-07-10")

        # 3. Update arrival date (valid format)
        ru = requests.put(f"{API}/batches/{bid}", headers=H(admin_token),
                          json={"arrival_date": "2026-07-12"})
        assert ru.status_code == 200
        
        # Verify get
        rg = requests.get(f"{API}/batches/{bid}", headers=H(admin_token))
        assert rg.json()["arrival_date"].startswith("2026-07-12")

        # 4. Update arrival date (invalid format)
        ru_invalid = requests.put(f"{API}/batches/{bid}", headers=H(admin_token),
                                   json={"arrival_date": "12-07-2026"})
        assert ru_invalid.status_code == 400

        # 5. Check customer list stats
        rcl = requests.get(f"{API}/customers", headers=H(admin_token))
        assert rcl.status_code == 200
        cust_list = rcl.json()
        target_cust = next((c for c in cust_list if c["id"] == cid), None)
        assert target_cust is not None
        assert target_cust["total_arrivals"] == 1
        assert target_cust["total_amount"] == 1200.0  # 100 * 12
        assert target_cust["amount_received"] == 0.0

        # 6. Delete batch
        rd = requests.delete(f"{API}/batches/{bid}", headers=H(admin_token))
        assert rd.status_code == 200

        # Verify batch is deleted
        rg2 = requests.get(f"{API}/batches/{bid}", headers=H(admin_token))
        assert rg2.status_code == 404

    def test_update_and_delete_machine(self, admin_token):
        # 1. Create a machine
        mname = f"TEST-Dryer-{uuid.uuid4().hex[:4]}"
        rm = requests.post(f"{API}/machines", headers=H(admin_token),
                           json={"name": mname, "capacity": 600, "status": "Available"})
        assert rm.status_code == 200
        mid = rm.json()["id"]

        # 2. Update machine fields
        ru = requests.put(f"{API}/machines/{mid}", headers=H(admin_token),
                          json={"name": mname + "-edited", "capacity": 700, "status": "Cleaning"})
        assert ru.status_code == 200

        # Verify get
        rml = requests.get(f"{API}/machines", headers=H(admin_token))
        assert rml.status_code == 200
        m = next((x for x in rml.json() if x["id"] == mid), None)
        assert m is not None
        assert m["name"] == mname + "-edited"
        assert float(m["capacity"]) == 700.0
        assert m["status"] == "Cleaning"

        # 3. Delete machine
        rd = requests.delete(f"{API}/machines/{mid}", headers=H(admin_token))
        assert rd.status_code == 200

        # Verify deleted
        rml2 = requests.get(f"{API}/machines", headers=H(admin_token))
        assert rml2.status_code == 200
        assert not any(x["id"] == mid for x in rml2.json())
