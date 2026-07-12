"""EThree Agro Solutions - Drying Plant Management Backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Dict, Any
from pathlib import Path
import os
import uuid
import jwt
import httpx
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "ethree-agro-secret-key-change-me-2026")
JWT_ALGO = "HS256"
JWT_EXPIRE_MIN = 60 * 24 * 30  # 30 days

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

app = FastAPI(title="E3 - Energy Efficient Environment")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ethree")


# ---------------------------- HELPERS ----------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_pw(p: str) -> str:
    return pwd_ctx.hash(p)


def verify_pw(p: str, h: str) -> bool:
    try:
        return pwd_ctx.verify(p, h)
    except Exception:
        return False


def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "mobile": user["mobile"],
        "role": user["role"],
        "exp": now_utc() + timedelta(minutes=JWT_EXPIRE_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(cred: HTTPAuthorizationCredentials = Security(security)) -> dict:
    if not cred:
        raise HTTPException(status_code=401, detail="Missing token")
    token = cred.credentials

    # 1) Try JWT (mobile+password login)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
        if user:
            return user
    except jwt.PyJWTError:
        pass

    # 2) Fallback: Google-issued session_token stored in user_sessions
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        exp = session.get("expires_at")
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp)
            except Exception:
                exp = None
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp > now_utc():
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password": 0})
            if user:
                return user

    raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles):
    async def _dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _dep


async def audit(action: str, entity: str, entity_id: str, user: dict, before: Any = None, after: Any = None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "user_id": user["id"],
        "user_mobile": user["mobile"],
        "user_role": user["role"],
        "before": before,
        "after": after,
        "timestamp": now_utc().isoformat(),
    })


def clean(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


async def next_seq(name: str) -> int:
    res = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return res["seq"] if res else 1


# ---------------------------- MODELS ----------------------------
class LoginIn(BaseModel):
    mobile: str
    password: str


class UserCreate(BaseModel):
    name: str
    mobile: str
    password: str
    role: str  # Admin, Manager, Store Incharge
    branch_id: Optional[str] = None


class CustomerIn(BaseModel):
    name: str
    mobile: str
    alt_mobile: Optional[str] = ""
    village: Optional[str] = ""
    taluk: Optional[str] = ""
    district: Optional[str] = ""
    address: Optional[str] = ""
    gst: Optional[str] = ""
    remarks: Optional[str] = ""
    photo: Optional[str] = ""  # base64


class ProductIn(BaseModel):
    name: str
    default_rate: float = 0


class MachineIn(BaseModel):
    name: str
    capacity: float = 0
    status: str = "Available"  # Available, Running, Maintenance, Cleaning


class MachineStatusUpdate(BaseModel):
    status: str


class BatchIn(BaseModel):
    customer_id: str
    product_id: str
    raw_weight: float
    estimated_dry_weight: float = 0
    moisture: float = 0
    bags: int = 0
    bag_weight: float = 0
    machine_id: str
    rate_per_kg: float
    loading_charges: float = 0
    discount: float = 0
    advance_paid: float = 0
    expected_delivery_date: Optional[str] = None
    remarks: Optional[str] = ""
    photos: List[str] = []  # base64


class BatchStatusUpdate(BaseModel):
    status: str  # Loaded, Drying, Completed
    remarks: Optional[str] = ""


class DeliveryIn(BaseModel):
    actual_dry_weight: float
    received_by: str
    signature: Optional[str] = ""  # base64
    remarks: Optional[str] = ""


class PaymentIn(BaseModel):
    batch_id: str
    amount: float
    mode: str  # Cash, UPI, Bank, Credit
    remarks: Optional[str] = ""


class ExpenseIn(BaseModel):
    category: str
    amount: float
    vendor: Optional[str] = ""
    bill_photo: Optional[str] = ""
    remarks: Optional[str] = ""
    expense_date: Optional[str] = None


class MaintenanceIn(BaseModel):
    machine_id: str
    complaint: str
    description: Optional[str] = ""
    cost: float = 0
    technician: Optional[str] = ""
    next_service_date: Optional[str] = None
    status: str = "Open"


# ---------------------------- SEED ----------------------------
DEFAULT_PRODUCTS = [
    ("Cardamom", 15), ("Coffee", 12), ("Pepper", 18),
    ("Turmeric", 10), ("Cloves", 20), ("Vegetables", 8),
    ("Fruits", 8), ("Other", 10),
]
DEFAULT_MACHINES = [
    ("Dryer 1", 500), ("Dryer 2", 500), ("Dryer 3", 750), ("Dryer 4", 1000),
]
DEFAULT_EXPENSE_CATS = [
    "Electricity", "Diesel", "Machine Maintenance", "Repair", "Transport",
    "Packing", "Salary", "Tea", "Office Expense", "Miscellaneous",
]
DEFAULT_USERS = [
    ("Admin User", "9999999999", "admin123", "Admin"),
    ("Manager User", "8888888888", "manager123", "Manager"),
    ("Store Incharge", "7777777777", "store123", "Store Incharge"),
]


async def seed():
    # Drop any pre-existing unique mobile index so Google users (no mobile) can coexist
    try:
        await db.users.drop_index("mobile_1")
    except Exception:
        pass
    # Indexes
    await db.users.create_index("mobile", sparse=True)
    await db.users.create_index("email", unique=True, sparse=True)
    await db.customers.create_index("code", unique=True)
    await db.batches.create_index("batch_no", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    try:
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass

    # Default branch
    if not await db.branches.find_one({}):
        await db.branches.insert_one({
            "id": str(uuid.uuid4()), "name": "Main Branch", "address": "HQ",
            "created_at": now_utc().isoformat(),
        })

    # Users
    for name, mobile, pw, role in DEFAULT_USERS:
        if not await db.users.find_one({"mobile": mobile}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "name": name, "mobile": mobile,
                "password": hash_pw(pw), "role": role,
                "created_at": now_utc().isoformat(),
            })

    # Products
    for pname, rate in DEFAULT_PRODUCTS:
        if not await db.products.find_one({"name": pname}):
            await db.products.insert_one({
                "id": str(uuid.uuid4()), "name": pname, "default_rate": rate,
                "created_at": now_utc().isoformat(),
            })

    # Machines
    for mname, cap in DEFAULT_MACHINES:
        if not await db.machines.find_one({"name": mname}):
            await db.machines.insert_one({
                "id": str(uuid.uuid4()), "name": mname, "capacity": cap,
                "status": "Available", "current_batch_id": None,
                "created_at": now_utc().isoformat(),
            })

    # Expense categories (settings collection)
    if not await db.settings.find_one({"key": "expense_categories"}):
        await db.settings.insert_one({
            "key": "expense_categories", "value": DEFAULT_EXPENSE_CATS,
        })
    # Always upsert company info so rebrand takes effect
    await db.settings.update_one(
        {"key": "company"},
        {"$set": {"value": {
            "name": "E3", "address": "",
            "gst": "", "phone": "", "default_rate": 12,
            "tagline": "Post Harvest Processing Unit",
            "meaning": "Energy, Efficient, Environment",
        }}},
        upsert=True,
    )


@app.on_event("startup")
async def startup():
    await seed()
    logger.info("EThree Agro backend started; seed complete.")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------- AUTH ----------------------------
@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"mobile": body.mobile})
    if not u or not u.get("password") or not verify_pw(body.password, u["password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    user = clean(dict(u))
    user.pop("password", None)
    token = make_token(user)
    return {"token": token, "user": user}


class GoogleSessionIn(BaseModel):
    session_id: Optional[str] = None
    session_token: Optional[str] = None


@api.post("/auth/google")
async def google_auth(body: GoogleSessionIn):
    """Complete Google sign-in by verifying the session_id/session_token with Emergent
    and creating/linking a local user. Returns bearer token for subsequent API calls."""
    key = body.session_token or body.session_id
    if not key:
        raise HTTPException(status_code=400, detail="Missing session identifier")

    # Verify with Emergent OAuth service
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": key},
            )
    except Exception as e:
        logger.exception("Google session-data call failed")
        raise HTTPException(status_code=502, detail="Auth provider unavailable")

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")

    data = r.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email from Google")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture") or ""
    session_token = data.get("session_token") or key

    # Upsert user by email
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["id"]
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"name": name, "picture": picture, "google_linked": True,
                      "updated_at": now_utc().isoformat()}},
        )
    else:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "name": name,
            "email": email,
            "mobile": "",
            "picture": picture,
            "role": "Store Incharge",   # default role for new Google sign-ups
            "google_linked": True,
            "created_at": now_utc().isoformat(),
        })

    # Store session (dedupe on session_token)
    await db.user_sessions.delete_many({"session_token": session_token})
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now_utc().isoformat(),
        "expires_at": now_utc() + timedelta(days=7),
    })

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    await audit("google_login", "user", user_id,
                {"id": user_id, "mobile": user.get("mobile", ""), "role": user["role"]},
                None, {"email": email})
    return {"token": session_token, "user": user}


@api.post("/auth/logout")
async def logout(cred: HTTPAuthorizationCredentials = Security(security)):
    if cred:
        await db.user_sessions.delete_one({"session_token": cred.credentials})
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/users")
async def create_user(body: UserCreate, user: dict = Depends(require_roles("Admin"))):
    if await db.users.find_one({"mobile": body.mobile}):
        raise HTTPException(status_code=400, detail="Mobile already exists")
    u = {
        "id": str(uuid.uuid4()), "name": body.name, "mobile": body.mobile,
        "password": hash_pw(body.password), "role": body.role,
        "branch_id": body.branch_id, "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(dict(u))
    await audit("create", "user", u["id"], user, None, {"mobile": u["mobile"], "role": u["role"]})
    u.pop("password")
    return clean(u)


@api.get("/auth/users")
async def list_users(user: dict = Depends(require_roles("Admin", "Manager"))):
    docs = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    return docs


# ---------------------------- PRODUCTS ----------------------------
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(200)


@api.post("/products")
async def add_product(body: ProductIn, user: dict = Depends(require_roles("Admin"))):
    p = {"id": str(uuid.uuid4()), "name": body.name, "default_rate": body.default_rate,
         "created_at": now_utc().isoformat()}
    await db.products.insert_one(dict(p))
    await audit("create", "product", p["id"], user, None, p)
    return p


# ---------------------------- MACHINES ----------------------------
@api.get("/machines")
async def list_machines(user: dict = Depends(get_current_user)):
    machines = await db.machines.find({}, {"_id": 0}).to_list(50)
    for m in machines:
        if m.get("current_batch_id"):
            b = await db.batches.find_one({"id": m["current_batch_id"]}, {"_id": 0})
            if b:
                cust = await db.customers.find_one({"id": b["customer_id"]}, {"_id": 0})
                m["current_batch"] = {
                    "id": b["id"], "batch_no": b["batch_no"],
                    "customer_name": cust["name"] if cust else "",
                    "expected_delivery_date": b.get("expected_delivery_date"),
                    "status": b["status"],
                }
    return machines


@api.post("/machines")
async def add_machine(body: MachineIn, user: dict = Depends(require_roles("Admin"))):
    m = {"id": str(uuid.uuid4()), "name": body.name, "capacity": body.capacity,
         "status": body.status, "current_batch_id": None,
         "created_at": now_utc().isoformat()}
    await db.machines.insert_one(dict(m))
    await audit("create", "machine", m["id"], user, None, m)
    return m


@api.put("/machines/{mid}/status")
async def update_machine_status(mid: str, body: MachineStatusUpdate,
                                user: dict = Depends(require_roles("Admin", "Manager", "Store Incharge"))):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    await db.machines.update_one({"id": mid}, {"$set": {"status": body.status}})
    await audit("update_status", "machine", mid, user, {"status": m["status"]}, {"status": body.status})
    return {"ok": True}


# ---------------------------- CUSTOMERS ----------------------------
@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user), q: Optional[str] = None):
    query: Dict[str, Any] = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q, "$options": "i"}},
            {"code": {"$regex": q, "$options": "i"}},
        ]}
    docs = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.get("/customers/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    # stats
    batches = await db.batches.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_visits = len(batches)
    total_weight = sum(b.get("raw_weight", 0) for b in batches)
    total_revenue = sum(b.get("bill_amount", 0) for b in batches)
    total_paid = sum(b.get("total_paid", 0) for b in batches)
    pending_balance = total_revenue - total_paid
    c["stats"] = {
        "total_visits": total_visits, "total_weight": total_weight,
        "total_revenue": total_revenue, "pending_balance": pending_balance,
    }
    c["history"] = batches[:20]
    return c


@api.post("/customers")
async def create_customer(body: CustomerIn, user: dict = Depends(get_current_user)):
    seq = await next_seq("customer")
    c = body.dict()
    c.update({
        "id": str(uuid.uuid4()),
        "code": f"C{seq:04d}",
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
    })
    await db.customers.insert_one(dict(c))
    await audit("create", "customer", c["id"], user, None, {"name": c["name"], "code": c["code"]})
    return clean(c)


@api.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn,
                          user: dict = Depends(require_roles("Admin", "Manager", "Store Incharge"))):
    before = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Not found")
    upd = body.dict()
    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]
    await db.customers.update_one({"id": cid}, {"$set": upd})
    await audit("update", "customer", cid, user, {"name": before["name"]}, {"name": upd["name"]})
    return {"ok": True}


# ---------------------------- BATCHES ----------------------------
async def recompute_batch_totals(batch: dict) -> dict:
    dry = batch.get("actual_dry_weight") or batch.get("estimated_dry_weight") or 0
    bill_amount = round(dry * batch.get("rate_per_kg", 0) + batch.get("loading_charges", 0) - batch.get("discount", 0), 2)
    payments = await db.payments.find({"batch_id": batch["id"]}, {"_id": 0}).to_list(500)
    total_paid = round(sum(p["amount"] for p in payments), 2)
    return {
        "bill_amount": bill_amount,
        "total_paid": total_paid,
        "balance_amount": round(bill_amount - total_paid, 2),
    }


@api.get("/batches")
async def list_batches(user: dict = Depends(get_current_user),
                       q: Optional[str] = None, status: Optional[str] = None):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"batch_no": {"$regex": q, "$options": "i"}},
            {"receipt_no": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich
    for d in docs:
        cust = await db.customers.find_one({"id": d["customer_id"]}, {"_id": 0, "name": 1, "mobile": 1, "code": 1})
        prod = await db.products.find_one({"id": d["product_id"]}, {"_id": 0, "name": 1})
        mach = await db.machines.find_one({"id": d["machine_id"]}, {"_id": 0, "name": 1})
        d["customer"] = clean(cust) if cust else None
        d["product"] = clean(prod) if prod else None
        d["machine"] = clean(mach) if mach else None
    return docs


@api.get("/batches/{bid}")
async def get_batch(bid: str, user: dict = Depends(get_current_user)):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    b["customer"] = clean(await db.customers.find_one({"id": b["customer_id"]}, {"_id": 0}))
    b["product"] = clean(await db.products.find_one({"id": b["product_id"]}, {"_id": 0}))
    b["machine"] = clean(await db.machines.find_one({"id": b["machine_id"]}, {"_id": 0}))
    b["payments"] = await db.payments.find({"batch_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return b


@api.post("/batches")
async def create_batch(body: BatchIn, user: dict = Depends(get_current_user)):
    # Validation
    if body.raw_weight <= 0:
        raise HTTPException(status_code=400, detail="Raw weight must be > 0")
    if body.rate_per_kg < 0 or body.loading_charges < 0 or body.discount < 0 or body.advance_paid < 0:
        raise HTTPException(status_code=400, detail="Negative values not allowed")
    est_dry = body.estimated_dry_weight or body.raw_weight
    bill_amount = round(est_dry * body.rate_per_kg + body.loading_charges - body.discount, 2)
    if body.advance_paid > bill_amount + 0.01:
        raise HTTPException(status_code=400, detail="Advance cannot exceed bill amount")

    seq = await next_seq("batch")
    rseq = await next_seq("receipt")
    bid = str(uuid.uuid4())
    b = body.dict()
    b.update({
        "id": bid,
        "batch_no": f"B{seq:05d}",
        "receipt_no": f"R{rseq:05d}",
        "qr_code": bid,
        "status": "Received",
        "status_history": [{"status": "Received", "at": now_utc().isoformat(), "by": user["id"], "remarks": ""}],
        "bill_amount": bill_amount,
        "total_paid": 0.0,
        "balance_amount": bill_amount,
        "actual_dry_weight": None,
        "weight_loss": None,
        "delivery": None,
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
    })
    await db.batches.insert_one(dict(b))

    # Record advance as a payment (if any)
    if body.advance_paid > 0:
        pay = {
            "id": str(uuid.uuid4()), "batch_id": bid, "amount": body.advance_paid,
            "mode": "Cash", "remarks": "Advance",
            "created_at": now_utc().isoformat(), "created_by": user["id"],
        }
        await db.payments.insert_one(dict(pay))
        totals = await recompute_batch_totals(b)
        await db.batches.update_one({"id": bid}, {"$set": totals})

    await audit("create", "batch", bid, user, None, {"batch_no": b["batch_no"]})
    return clean(b)


@api.put("/batches/{bid}/status")
async def update_batch_status(bid: str, body: BatchStatusUpdate,
                              user: dict = Depends(get_current_user)):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    allowed = {"Received", "Loaded", "Drying", "Completed", "Delivered"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status")

    entry = {"status": body.status, "at": now_utc().isoformat(), "by": user["id"], "remarks": body.remarks or ""}
    history = b.get("status_history", [])
    history.append(entry)

    upd = {"status": body.status, "status_history": history, "updated_at": now_utc().isoformat(), "updated_by": user["id"]}
    await db.batches.update_one({"id": bid}, {"$set": upd})

    # Machine linkage
    if body.status == "Loaded":
        await db.machines.update_one({"id": b["machine_id"]},
                                     {"$set": {"status": "Running", "current_batch_id": bid}})
    elif body.status in ("Completed", "Delivered"):
        # free machine when delivered / completed
        if body.status == "Delivered":
            await db.machines.update_one({"id": b["machine_id"]},
                                         {"$set": {"status": "Available", "current_batch_id": None}})

    await audit("update_status", "batch", bid, user, {"status": b["status"]}, {"status": body.status})
    return {"ok": True}


@api.post("/batches/{bid}/delivery")
async def deliver_batch(bid: str, body: DeliveryIn,
                        user: dict = Depends(get_current_user)):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    if body.actual_dry_weight <= 0:
        raise HTTPException(status_code=400, detail="Dry weight must be > 0")

    weight_loss = round(b["raw_weight"] - body.actual_dry_weight, 2)
    delivery = {
        "actual_dry_weight": body.actual_dry_weight,
        "weight_loss": weight_loss,
        "delivery_date": now_utc().isoformat(),
        "received_by": body.received_by,
        "signature": body.signature or "",
        "remarks": body.remarks or "",
    }
    history = b.get("status_history", [])
    history.append({"status": "Delivered", "at": now_utc().isoformat(), "by": user["id"], "remarks": "Delivered"})

    # Recompute bill with actual dry weight
    tmp = dict(b)
    tmp["actual_dry_weight"] = body.actual_dry_weight
    totals = await recompute_batch_totals(tmp)

    upd = {
        "actual_dry_weight": body.actual_dry_weight,
        "weight_loss": weight_loss,
        "delivery": delivery,
        "status": "Delivered",
        "status_history": history,
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
        **totals,
    }
    await db.batches.update_one({"id": bid}, {"$set": upd})
    await db.machines.update_one({"id": b["machine_id"]},
                                 {"$set": {"status": "Available", "current_batch_id": None}})
    await audit("delivery", "batch", bid, user, None, delivery)
    return {"ok": True, "weight_loss": weight_loss, "bill_amount": totals["bill_amount"]}


# ---------------------------- PAYMENTS ----------------------------
@api.get("/payments")
async def list_payments(user: dict = Depends(get_current_user)):
    docs = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        b = await db.batches.find_one({"id": d["batch_id"]}, {"_id": 0, "batch_no": 1, "customer_id": 1})
        if b:
            d["batch_no"] = b["batch_no"]
            cust = await db.customers.find_one({"id": b["customer_id"]}, {"_id": 0, "name": 1})
            d["customer_name"] = cust["name"] if cust else ""
    return docs


@api.post("/payments")
async def add_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    b = await db.batches.find_one({"id": body.batch_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    p = {
        "id": str(uuid.uuid4()), "batch_id": body.batch_id, "amount": body.amount,
        "mode": body.mode, "remarks": body.remarks or "",
        "created_at": now_utc().isoformat(), "created_by": user["id"],
    }
    await db.payments.insert_one(dict(p))
    totals = await recompute_batch_totals(b)
    await db.batches.update_one({"id": body.batch_id}, {"$set": totals})
    await audit("create", "payment", p["id"], user, None, {"amount": p["amount"], "mode": p["mode"]})
    return clean(p)


# ---------------------------- EXPENSES ----------------------------
@api.get("/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    return await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/expenses")
async def add_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    e = body.dict()
    e.update({
        "id": str(uuid.uuid4()),
        "expense_date": e.get("expense_date") or now_utc().date().isoformat(),
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
    })
    await db.expenses.insert_one(dict(e))
    await audit("create", "expense", e["id"], user, None, {"category": e["category"], "amount": e["amount"]})
    return clean(e)


@api.get("/expense-categories")
async def expense_cats(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"key": "expense_categories"}, {"_id": 0})
    return doc["value"] if doc else DEFAULT_EXPENSE_CATS


# ---------------------------- MAINTENANCE ----------------------------
@api.get("/maintenance")
async def list_maintenance(user: dict = Depends(get_current_user)):
    docs = await db.maintenance.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        m = await db.machines.find_one({"id": d["machine_id"]}, {"_id": 0, "name": 1})
        d["machine_name"] = m["name"] if m else ""
    return docs


@api.post("/maintenance")
async def add_maintenance(body: MaintenanceIn, user: dict = Depends(get_current_user)):
    m = body.dict()
    m.update({
        "id": str(uuid.uuid4()),
        "date": now_utc().isoformat(),
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
    })
    await db.maintenance.insert_one(dict(m))
    await audit("create", "maintenance", m["id"], user, None, {"machine_id": m["machine_id"], "cost": m["cost"]})
    return clean(m)


# ---------------------------- DASHBOARD / REPORTS ----------------------------
def _today_range():
    now = now_utc()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _parse_range(start: Optional[str], end: Optional[str]):
    """Parse YYYY-MM-DD strings into UTC isoformat range. Default: this month → today."""
    now = now_utc()
    if start:
        try:
            sd = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start date")
    else:
        sd = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if end:
        try:
            ed = datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid end date")
    else:
        ed = now
    # inclusive end
    ed = ed.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    sd = sd.replace(hour=0, minute=0, second=0, microsecond=0)
    return sd.isoformat(), ed.isoformat()


@api.get("/dashboard")
async def dashboard(
    user: dict = Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    tstart, tend = _today_range()
    pstart, pend = _parse_range(start, end)

    # Period-scoped
    period_batches = await db.batches.find(
        {"created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    period_customers = len({b["customer_id"] for b in period_batches})
    period_received_weight = round(sum(b.get("raw_weight", 0) for b in period_batches), 2)

    period_deliveries_docs = await db.batches.find(
        {"status": "Delivered", "delivery.delivery_date": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    period_deliveries = len(period_deliveries_docs)
    period_delivered_weight = round(
        sum(b.get("actual_dry_weight") or 0 for b in period_deliveries_docs), 2
    )

    period_payments = await db.payments.find(
        {"created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    period_collection = round(sum(p["amount"] for p in period_payments), 2)

    period_expenses = await db.expenses.find(
        {"created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    period_expense = round(sum(e["amount"] for e in period_expenses), 2)

    # Today (for the "Today's Arrival of Spices" card)
    today_batches = await db.batches.find(
        {"created_at": {"$gte": tstart, "$lt": tend}}, {"_id": 0}
    ).to_list(1000)
    today_in_weight = round(sum(b.get("raw_weight", 0) for b in today_batches), 2)
    today_in_count = len(today_batches)

    today_deliveries_docs = await db.batches.find(
        {"status": "Delivered", "delivery.delivery_date": {"$gte": tstart, "$lt": tend}}, {"_id": 0}
    ).to_list(1000)
    today_out_weight = round(sum(b.get("actual_dry_weight") or 0 for b in today_deliveries_docs), 2)
    today_out_count = len(today_deliveries_docs)

    # Pending payments (all-time)
    all_batches = await db.batches.find({}, {"_id": 0}).to_list(3000)
    pending_payments = round(
        sum(b.get("balance_amount", 0) for b in all_batches if b.get("balance_amount", 0) > 0), 2
    )

    machines = await db.machines.find({}, {"_id": 0}).to_list(50)
    machines_running = sum(1 for m in machines if m["status"] == "Running")
    machines_available = sum(1 for m in machines if m["status"] == "Available")
    machines_maintenance = sum(1 for m in machines if m["status"] in ("Maintenance", "Cleaning"))

    recent = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(15)

    return {
        # Date range echo
        "range": {"start": pstart[:10], "end": (datetime.fromisoformat(pend) - timedelta(days=1)).isoformat()[:10]},

        # Today's Arrival of Spices (replaces profit hero)
        "today_arrival": {
            "in_weight": today_in_weight,
            "in_count": today_in_count,
            "out_weight": today_out_weight,
            "out_count": today_out_count,
        },

        # Period metrics (respect selected date range)
        "period_customers": period_customers,
        "period_received_weight": period_received_weight,
        "period_deliveries": period_deliveries,
        "period_delivered_weight": period_delivered_weight,
        "period_collection": period_collection,
        "period_expenses": period_expense,
        "period_profit": round(period_collection - period_expense, 2),

        # All-time
        "pending_payments": pending_payments,

        # Machines
        "machines_running": machines_running,
        "machines_available": machines_available,
        "machines_maintenance": machines_maintenance,
        "total_machines": len(machines),

        "recent_activities": recent,
    }


@api.get("/dashboard/arrivals")
async def dashboard_arrivals(
    user: dict = Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """List all arrivals (batch entries) + deliveries within a date range with customer + weights."""
    pstart, pend = _parse_range(start, end)

    # Batches created in range (arrivals IN)
    ins = await db.batches.find(
        {"created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    # Batches delivered in range (arrivals OUT)
    outs = await db.batches.find(
        {"status": "Delivered", "delivery.delivery_date": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).sort("delivery.delivery_date", -1).to_list(1000)

    async def enrich(b: dict):
        cust = await db.customers.find_one({"id": b["customer_id"]}, {"_id": 0, "name": 1, "code": 1, "mobile": 1})
        prod = await db.products.find_one({"id": b["product_id"]}, {"_id": 0, "name": 1})
        return {
            "batch_id": b["id"],
            "batch_no": b["batch_no"],
            "customer_name": cust["name"] if cust else "",
            "customer_code": cust["code"] if cust else "",
            "customer_mobile": cust["mobile"] if cust else "",
            "product": prod["name"] if prod else "",
            "arrival_date": b["created_at"],
            "raw_weight": b.get("raw_weight", 0),
            "actual_dry_weight": b.get("actual_dry_weight"),
            "delivery_date": (b.get("delivery") or {}).get("delivery_date"),
            "status": b["status"],
        }

    in_rows = [await enrich(b) for b in ins]
    out_rows = [await enrich(b) for b in outs]

    total_in = round(sum(r["raw_weight"] for r in in_rows), 2)
    total_out = round(sum((r["actual_dry_weight"] or 0) for r in out_rows), 2)

    return {
        "range": {"start": pstart[:10], "end": (datetime.fromisoformat(pend) - timedelta(days=1)).isoformat()[:10]},
        "totals": {"in_weight": total_in, "out_weight": total_out, "in_count": len(in_rows), "out_count": len(out_rows)},
        "in": in_rows,
        "out": out_rows,
    }


@api.get("/reports/summary")
async def reports_summary(user: dict = Depends(get_current_user)):
    all_batches = await db.batches.find({}, {"_id": 0}).to_list(2000)
    all_pay = await db.payments.find({}, {"_id": 0}).to_list(2000)
    all_exp = await db.expenses.find({}, {"_id": 0}).to_list(2000)

    total_collection = round(sum(p["amount"] for p in all_pay), 2)
    total_expense = round(sum(e["amount"] for e in all_exp), 2)
    pending_payments = round(sum(b.get("balance_amount", 0) for b in all_batches if b.get("balance_amount", 0) > 0), 2)
    pending_deliveries = sum(1 for b in all_batches if b.get("status") not in ("Delivered",))

    # Machine utilization %
    machines = await db.machines.find({}, {"_id": 0}).to_list(50)
    util = []
    for m in machines:
        cnt = await db.batches.count_documents({"machine_id": m["id"]})
        util.append({"name": m["name"], "batches": cnt, "status": m["status"]})

    # Expense by category
    cat_totals: Dict[str, float] = {}
    for e in all_exp:
        cat_totals[e["category"]] = round(cat_totals.get(e["category"], 0) + e["amount"], 2)

    return {
        "total_collection": total_collection,
        "total_expense": total_expense,
        "profit": round(total_collection - total_expense, 2),
        "pending_payments": pending_payments,
        "pending_deliveries": pending_deliveries,
        "machine_utilization": util,
        "expense_by_category": cat_totals,
        "total_batches": len(all_batches),
    }


# ---------------------------- SEARCH ----------------------------
@api.get("/search")
async def search(q: str, user: dict = Depends(get_current_user)):
    if not q:
        return {"customers": [], "batches": []}
    cust = await db.customers.find({"$or": [
        {"name": {"$regex": q, "$options": "i"}},
        {"mobile": {"$regex": q, "$options": "i"}},
        {"code": {"$regex": q, "$options": "i"}},
    ]}, {"_id": 0}).to_list(20)
    bat = await db.batches.find({"$or": [
        {"batch_no": {"$regex": q, "$options": "i"}},
        {"receipt_no": {"$regex": q, "$options": "i"}},
    ]}, {"_id": 0}).to_list(20)
    return {"customers": cust, "batches": bat}


# ---------------------------- SETTINGS ----------------------------
@api.get("/settings/company")
async def get_company(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"key": "company"}, {"_id": 0})
    return doc["value"] if doc else {}


@api.get("/branches")
async def list_branches(user: dict = Depends(get_current_user)):
    return await db.branches.find({}, {"_id": 0}).to_list(50)


@api.get("/audit")
async def audit_logs(user: dict = Depends(require_roles("Admin", "Manager")), limit: int = 100):
    return await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.get("/")
async def root():
    return {"app": "E3 - Energy Efficient Environment", "tagline": "Smart Drying Plant Management", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
