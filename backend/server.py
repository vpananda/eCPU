"""EThree Agro Solutions - Drying Plant Management Backend."""
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
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

DATABASE_URL = os.environ["DATABASE_URL"].strip()
DB_NAME = os.environ["DB_NAME"].strip()
JWT_SECRET = os.environ.get("JWT_SECRET", "ethree-agro-secret-key-change-me-2026").strip()
JWT_ALGO = "HS256"
JWT_EXPIRE_MIN = 60 * 24 * 30  # 30 days

# ---------------------------- POSTGRES DB WRAPPER ----------------------------
ENUM_FIELDS = {
    "profiles": {"role": "user_role"},
    "machines": {"status": "machine_status"},
    "batches": {"status": "batch_status"},
    "batch_status_history": {"status": "batch_status"},
    "payments": {"mode": "payment_mode"},
    "maintenance": {"status": "maintenance_status"},
}

UUID_FIELDS = {
    "profiles": ["id", "branch_id"],
    "machines": ["id", "branch_id", "current_batch_id"],
    "customers": ["id", "branch_id", "created_by", "updated_by"],
    "batches": ["id", "customer_id", "product_id", "machine_id", "branch_id", "created_by", "updated_by"],
    "batch_status_history": ["id", "batch_id", "changed_by"],
    "payments": ["id", "batch_id", "created_by"],
    "expenses": ["id", "branch_id", "created_by"],
    "maintenance": ["id", "machine_id", "created_by"],
    "audit_logs": ["id", "user_id"],
    "user_sessions": ["user_id"]
}

JSONB_FIELDS = {
    "settings": ["value"],
    "audit_logs": ["before", "after"]
}

def get_col_placeholder(table_name, col_name):
    tbl = table_name.split(".")[-1]
    if tbl in ENUM_FIELDS and col_name in ENUM_FIELDS[tbl]:
        enum_type = ENUM_FIELDS[tbl][col_name]
        return f"%s::{enum_type}"
    if tbl in UUID_FIELDS and col_name in UUID_FIELDS[tbl]:
        return f"%s::uuid"
    return "%s"

def clean_val(table_name, col_name, val):
    import json
    tbl = table_name.split(".")[-1]
    if tbl in UUID_FIELDS and col_name in UUID_FIELDS[tbl]:
        if val in (None, ""):
            return None
    if tbl in JSONB_FIELDS and col_name in JSONB_FIELDS[tbl]:
        if val is not None:
            return json.dumps(val)
    return val

def postgres_to_mongo_types(row: dict, table_name: Optional[str] = None) -> dict:
    if not row:
        return row
    res = {}
    tbl = table_name.split(".")[-1] if table_name else None
    for k, v in row.items():
        if isinstance(v, uuid.UUID):
            res[k] = str(v)
        elif isinstance(v, (datetime, date)):
            res[k] = v.isoformat()
        elif v.__class__.__name__ == 'Decimal':
            f = float(v)
            res[k] = int(f) if f.is_integer() else f
        elif isinstance(v, list):
            res[k] = [postgres_to_mongo_types(item, table_name) if isinstance(item, dict) else (str(item) if isinstance(item, uuid.UUID) else item) for item in v]
        elif isinstance(v, dict):
            res[k] = postgres_to_mongo_types(v, table_name)
        else:
            res[k] = v

    if tbl == "batches":
        deliv = {}
        if "delivered_at" in res and res["delivered_at"] is not None:
            deliv["delivery_date"] = res["delivered_at"]
        if "actual_dry_weight" in res and res["actual_dry_weight"] is not None:
            deliv["actual_dry_weight"] = float(res["actual_dry_weight"])
        if "processed_bags" in res and res["processed_bags"] is not None:
            deliv["processed_bags"] = res["processed_bags"]
        if "weight_loss" in res and res["weight_loss"] is not None:
            deliv["weight_loss"] = float(res["weight_loss"])
        if "received_by" in res and res["received_by"] is not None:
            deliv["received_by"] = res["received_by"]
        if "received_by_phone" in res and res["received_by_phone"] is not None:
            deliv["received_by_phone"] = res["received_by_phone"]
        if "signature" in res and res["signature"] is not None:
            deliv["signature"] = res["signature"]
        if "delivery_remarks" in res and res["delivery_remarks"] is not None:
            deliv["delivery_remarks"] = res["delivery_remarks"]
        if deliv:
            res["delivery"] = deliv
    return res

KEY_MAPPING = {
    "delivery.delivery_date": "delivered_at",
    "delivery.actual_dry_weight": "actual_dry_weight",
    "delivery.processed_bags": "processed_bags",
    "delivery.weight_loss": "weight_loss",
    "delivery.received_by": "received_by",
    "delivery.received_by_phone": "received_by_phone",
    "delivery.signature": "signature",
    "delivery.delivery_remarks": "delivery_remarks",
}

def build_where_clause(filter_dict, table_name=None):
    if not filter_dict:
        return "1=1", []
    
    parts = []
    params = []
    tbl = table_name.split(".")[-1] if table_name else None
    
    for k, v in filter_dict.items():
        if k in KEY_MAPPING:
            k = KEY_MAPPING[k]
        if k == "$or" or k == "$and":
            sub_parts = []
            for sub in v:
                sub_clause, sub_params = build_where_clause(sub, table_name)
                sub_parts.append(f"({sub_clause})")
                params.extend(sub_params)
            op = " OR " if k == "$or" else " AND "
            parts.append("(" + op.join(sub_parts) + ")")
        elif isinstance(v, dict):
            for op, val in v.items():
                if op == "$in":
                    in_parts = []
                    non_null_vals = []
                    for item in val:
                        if item in (None, ""):
                            in_parts.append(f"{k} IS NULL")
                            in_parts.append(f"{k} = ''")
                        else:
                            non_null_vals.append(item)
                    if non_null_vals:
                        if tbl and tbl in UUID_FIELDS and k in UUID_FIELDS[tbl]:
                            in_parts.append(f"{k}::text = ANY(%s)")
                        else:
                            in_parts.append(f"{k} = ANY(%s)")
                        params.append(non_null_vals)
                    if not in_parts:
                        in_parts.append("FALSE")
                    parts.append("(" + " OR ".join(in_parts) + ")")
                elif op == "$ne":
                    if val is None:
                        parts.append(f"{k} IS NOT NULL")
                    elif tbl and tbl in UUID_FIELDS and k in UUID_FIELDS[tbl]:
                        parts.append(f"{k}::text != %s")
                        params.append(val)
                    else:
                        parts.append(f"({k} IS NULL OR {k} != %s)")
                        params.append(val)
                elif op == "$gte":
                    parts.append(f"{k} >= %s")
                    params.append(val)
                elif op == "$lte":
                    parts.append(f"{k} <= %s")
                    params.append(val)
                elif op == "$lt":
                    parts.append(f"{k} < %s")
                    params.append(val)
                elif op == "$gt":
                    parts.append(f"{k} > %s")
                    params.append(val)
                elif op == "$regex":
                    pattern = val
                    if isinstance(pattern, str):
                        pattern = pattern.replace("^", "")
                        if not pattern.endswith("$"):
                            pattern = pattern + "%"
                        if not pattern.startswith("^"):
                            pattern = "%" + pattern
                    parts.append(f"{k} ILIKE %s")
                    params.append(pattern)
        else:
            if v is None:
                parts.append(f"{k} IS NULL")
            elif tbl and tbl in UUID_FIELDS and k in UUID_FIELDS[tbl]:
                parts.append(f"{k}::text = %s")
                params.append(v)
            else:
                parts.append(f"{k} = %s")
                params.append(v)
                
    return " AND ".join(parts) if parts else "1=1", params

class PostgresFindCursor:
    def __init__(self, collection, filter_dict=None):
        self.collection = collection
        self.filter_dict = filter_dict
        self.sort_col = None
        self.sort_dir = "ASC"

    def sort(self, col, direction=-1):
        if col == "_id":
            col = "id"
        if col in KEY_MAPPING:
            col = KEY_MAPPING[col]
        self.sort_col = col
        self.sort_dir = "DESC" if direction == -1 else "ASC"
        return self

    async def to_list(self, limit=None):
        where_clause, params = build_where_clause(self.filter_dict, self.collection.table_name)
        query = f"SELECT * FROM {self.collection.table_name} WHERE {where_clause}"
        if self.sort_col:
            query += f" ORDER BY {self.sort_col} {self.sort_dir}"
        if limit:
            query += f" LIMIT {limit}"
        return await self.collection.db.query(query, params, self.collection.table_name)

class PostgresCollection:
    def __init__(self, db_wrapper, table_name, pk_col="id"):
        self.db = db_wrapper
        self.table_name = table_name
        self.pk_col = pk_col

    async def count_documents(self, filter_dict=None):
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"SELECT COUNT(*) as count FROM {self.table_name} WHERE {where_clause}"
        res = await self.db.query(query, params, self.table_name)
        return int(res[0]["count"]) if res else 0

    async def find_one(self, filter_dict=None, projection=None):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"SELECT * FROM {self.table_name} WHERE {where_clause} LIMIT 1"
        res = await self.db.query(query, params, self.table_name)
        return res[0] if res else None

    async def insert_one(self, document):
        doc = dict(document)
        doc.pop("_id", None)
        doc.pop("status_history", None)
        doc.pop("delivery", None)
        cols = list(doc.keys())
        placeholders = [get_col_placeholder(self.table_name, c) for c in cols]
        vals = [clean_val(self.table_name, c, doc[c]) for c in cols]
        
        query = f"INSERT INTO {self.table_name} ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING *"
        res = await self.db.query(query, vals, self.table_name)
        return res[0] if res else doc

    async def update_one(self, filter_dict, update_dict, upsert=False):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        
        check_query = f"SELECT 1 FROM {self.table_name} WHERE {where_clause}"
        exists = await self.db.query(check_query, params, self.table_name)
        
        if not exists and upsert:
            insert_doc = {}
            for k, v in filter_dict.items():
                if not k.startswith("$"):
                    if k in KEY_MAPPING:
                        k = KEY_MAPPING[k]
                    insert_doc[k] = v
            if "$set" in update_dict:
                for k, v in update_dict["$set"].items():
                    if k in KEY_MAPPING:
                        k = KEY_MAPPING[k]
                    insert_doc[k] = v
            insert_doc.pop("status_history", None)
            insert_doc.pop("delivery", None)
            await self.insert_one(insert_doc)
            return None
            
        if not exists:
            return None
            
        set_clause = []
        set_params = []
        
        if "$set" in update_dict:
            for k, v in update_dict["$set"].items():
                if k in ("status_history", "delivery"):
                    continue
                if k in KEY_MAPPING:
                    k = KEY_MAPPING[k]
                placeholders = get_col_placeholder(self.table_name, k)
                set_clause.append(f"{k} = {placeholders}")
                set_params.append(clean_val(self.table_name, k, v))
                
        if "$inc" in update_dict:
            for k, v in update_dict["$inc"].items():
                if k in KEY_MAPPING:
                    k = KEY_MAPPING[k]
                set_clause.append(f"{k} = COALESCE({k}, 0) + %s")
                set_params.append(v)
                
        if not set_clause:
            return None
            
        query = f"UPDATE {self.table_name} SET {', '.join(set_clause)} WHERE {where_clause}"
        await self.db.execute(query, set_params + params)
        return None

    async def find_one_and_update(self, filter_dict, update_dict, upsert=False, return_document=False):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        
        check_query = f"SELECT * FROM {self.table_name} WHERE {where_clause}"
        rows = await self.db.query(check_query, params, self.table_name)
        
        if not rows and upsert:
            insert_doc = {}
            for k, v in filter_dict.items():
                if not k.startswith("$"):
                    if k in KEY_MAPPING:
                        k = KEY_MAPPING[k]
                    insert_doc[k] = v
            if "$set" in update_dict:
                for k, v in update_dict["$set"].items():
                    if k in KEY_MAPPING:
                        k = KEY_MAPPING[k]
                    insert_doc[k] = v
            if "$inc" in update_dict:
                for k, v in update_dict["$inc"].items():
                    if k in KEY_MAPPING:
                        k = KEY_MAPPING[k]
                    insert_doc[k] = v
            
            res = await self.insert_one(insert_doc)
            return res
            
        if not rows:
            return None
            
        original_doc = rows[0]
        set_clause = []
        set_params = []
        
        if "$set" in update_dict:
            for k, v in update_dict["$set"].items():
                if k in ("status_history", "delivery"):
                    continue
                if k in KEY_MAPPING:
                    k = KEY_MAPPING[k]
                placeholders = get_col_placeholder(self.table_name, k)
                set_clause.append(f"{k} = {placeholders}")
                set_params.append(clean_val(self.table_name, k, v))
                
        if "$inc" in update_dict:
            for k, v in update_dict["$inc"].items():
                if k in KEY_MAPPING:
                    k = KEY_MAPPING[k]
                set_clause.append(f"{k} = COALESCE({k}, 0) + %s")
                set_params.append(v)
                
        if not set_clause:
            return original_doc
            
        query = f"UPDATE {self.table_name} SET {', '.join(set_clause)} WHERE {where_clause} RETURNING *"
        res = await self.db.query(query, set_params + params, self.table_name)
        
        if return_document:
            return res[0] if res else None
        return original_doc

    async def delete_one(self, filter_dict):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"DELETE FROM {self.table_name} WHERE {self.pk_col} IN (SELECT {self.pk_col} FROM {self.table_name} WHERE {where_clause} LIMIT 1)"
        await self.db.execute(query, params)
        return None

    async def delete_many(self, filter_dict):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"DELETE FROM {self.table_name} WHERE {where_clause}"
        await self.db.execute(query, params)
        return None

    def find(self, filter_dict=None, projection=None):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        return PostgresFindCursor(self, filter_dict)

class UsersCollection(PostgresCollection):
    def __init__(self, db_wrapper):
        super().__init__(db_wrapper, "public.profiles", "id")

    async def find_one(self, filter_dict=None, projection=None):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        where_clause = where_clause.replace("id::text", "p.id::text").replace("email", "p.email").replace("mobile", "p.mobile")
        
        query = f"""
            SELECT 
                p.id::text as id, p.name, p.email, p.mobile, p.role::text as role, 
                p.branch_id::text as branch_id, p.google_linked, p.picture, 
                p.created_at, p.updated_at, u.encrypted_password as password
            FROM public.profiles p
            JOIN auth.users u ON p.id = u.id
            WHERE {where_clause}
            LIMIT 1
        """
        res = await self.db.query(query, params)
        return res[0] if res else None

    async def insert_one(self, document):
        doc = dict(document)
        doc.pop("_id", None)
        uid = doc.get("id") or str(uuid.uuid4())
        email = doc.get("email") or f"{doc.get('mobile', uid)}@e3.example.com"
        password = doc.get("password") or "default-password"
        
        auth_query = """
            INSERT INTO auth.users (
                id, email, encrypted_password, email_confirmed_at, 
                role, aud, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
            ) VALUES (
                %s, %s, %s, now(), 
                'authenticated', 'authenticated', now(), now(), 
                '{"provider":"local","providers":["local"]}', %s
            )
        """
        import json
        meta = json.dumps({"name": doc.get("name", "")})
        await self.db.execute(auth_query, [uid, email, password, meta])
        
        upd_query = """
            UPDATE public.profiles
            SET name = %s, mobile = %s, role = %s::user_role, branch_id = %s::uuid
            WHERE id = %s
        """
        bid = doc.get("branch_id")
        if bid in (None, ""):
            bid = None
        await self.db.execute(upd_query, [doc.get("name"), doc.get("mobile"), doc.get("role", "Store Incharge"), bid, uid])
        return doc

    async def update_one(self, filter_dict, update_dict, upsert=False):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        where_clause = where_clause.replace("id::text", "p.id::text").replace("email", "p.email").replace("mobile", "p.mobile")
        
        select_query = f"SELECT p.id::text FROM public.profiles p JOIN auth.users u ON p.id = u.id WHERE {where_clause}"
        rows = await self.db.query(select_query, params)
        if not rows:
            return None
        
        uids = [row["id"] for row in rows]
        set_attrs = update_dict.get("$set", {})
        password = set_attrs.get("password")
        
        if password:
            for uid in uids:
                await self.db.execute("UPDATE auth.users SET encrypted_password = %s WHERE id = %s", [password, uid])
                
        profile_upds = {k: v for k, v in set_attrs.items() if k != "password"}
        if profile_upds:
            set_clause = []
            set_params = []
            for k, v in profile_upds.items():
                if k == "role":
                    set_clause.append("role = %s::user_role")
                elif k == "branch_id":
                    set_clause.append("branch_id = %s::uuid" if v else "branch_id = NULL")
                    if not v:
                        continue
                else:
                    set_clause.append(f"{k} = %s")
                set_params.append(v)
            
            for uid in uids:
                query = f"UPDATE public.profiles SET {', '.join(set_clause)} WHERE id = %s"
                await self.db.execute(query, set_params + [uid])
        return None

    def find(self, filter_dict=None, projection=None):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        return UsersFindCursor(self, filter_dict)

class UsersFindCursor(PostgresFindCursor):
    async def to_list(self, limit=None):
        where_clause, params = build_where_clause(self.filter_dict, self.collection.table_name)
        where_clause = where_clause.replace("id::text", "p.id::text").replace("email", "p.email").replace("mobile", "p.mobile")
        
        query = f"""
            SELECT 
                p.id::text as id, p.name, p.email, p.mobile, p.role::text as role, 
                p.branch_id::text as branch_id, p.google_linked, p.picture, 
                p.created_at, p.updated_at, u.encrypted_password as password
            FROM public.profiles p
            JOIN auth.users u ON p.id = u.id
            WHERE {where_clause}
        """
        if self.sort_col:
            sort_col_mapped = self.sort_col.replace("id", "p.id").replace("created_at", "p.created_at")
            query += f" ORDER BY {sort_col_mapped} {self.sort_dir}"
        if limit:
            query += f" LIMIT {limit}"
        return await self.collection.db.query(query, params)

class PostgresDBWrapper:
    def __init__(self, dsn):
        if "@2026@" in dsn:
            dsn = dsn.replace("e3Agro@2026@", "e3Agro%402026@")
        self.dsn = dsn
        self.pool = None
        
        self.users = UsersCollection(self)
        self.branches = PostgresCollection(self, "public.branches")
        self.products = PostgresCollection(self, "public.products")
        self.branch_product_rates = PostgresCollection(self, "public.branch_product_rates")
        self.machines = PostgresCollection(self, "public.machines")
        self.customers = PostgresCollection(self, "public.customers")
        self.batches = PostgresCollection(self, "public.batches")
        self.payments = PostgresCollection(self, "public.payments")
        self.expenses = PostgresCollection(self, "public.expenses")
        self.maintenance = PostgresCollection(self, "public.maintenance")
        self.settings = PostgresCollection(self, "public.settings", "key")
        self.audit_logs = PostgresCollection(self, "public.audit_logs")
        self.user_sessions = PostgresCollection(self, "public.user_sessions", "session_token")
        self.counters = PostgresCollection(self, "public.counters")

    async def open(self):
        self.pool = AsyncConnectionPool(
            conninfo=self.dsn,
            open=False,
            kwargs={"row_factory": dict_row}
        )
        await self.pool.open()

    async def close(self):
        if self.pool:
            await self.pool.close()

    async def query(self, sql, params=None, table_name=None):
        logger.info(f"DB QUERY START: {sql} | Params: {params}")
        for attempt in range(2):
            try:
                async with self.pool.connection() as conn:
                    logger.info("DB QUERY connection acquired")
                    async with conn.cursor() as cur:
                        await cur.execute(sql, params)
                        if cur.description:
                            rows = await cur.fetchall()
                            logger.info(f"DB QUERY success, rows: {len(rows)}")
                            return [postgres_to_mongo_types(row, table_name) for row in rows]
                        logger.info("DB QUERY success, no rows")
                        return []
            except psycopg.OperationalError as e:
                logger.warning(f"DB QUERY OperationalError on attempt {attempt+1}: {e}")
                if attempt == 0:
                    await asyncio.sleep(0.5)
                    continue
                logger.error(f"DB QUERY error after retry: {e}")
                raise
            except Exception as e:
                logger.error(f"DB QUERY error: {e}")
                raise

    async def execute(self, sql, params=None):
        logger.info(f"DB EXECUTE START: {sql} | Params: {params}")
        for attempt in range(2):
            try:
                async with self.pool.connection() as conn:
                    logger.info("DB EXECUTE connection acquired")
                    async with conn.cursor() as cur:
                        await cur.execute(sql, params)
                        logger.info("DB EXECUTE success")
                        return
            except psycopg.OperationalError as e:
                logger.warning(f"DB EXECUTE OperationalError on attempt {attempt+1}: {e}")
                if attempt == 0:
                    await asyncio.sleep(0.5)
                    continue
                logger.error(f"DB EXECUTE error after retry: {e}")
                raise
            except Exception as e:
                logger.error(f"DB EXECUTE error: {e}")
                raise

    def close_sync(self):
        pass

# Setup wrapper instead of motor client
db = PostgresDBWrapper(DATABASE_URL)
client = db

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

app = FastAPI(title="E3 - Energy Efficient Environment")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ethree")

# Supabase Initialization
from supabase import create_client, Client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY and not SUPABASE_URL.startswith("https://your-project-ref"):
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.warning(f"Could not connect to Supabase: {e}")


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
    def clean_for_json(val: Any) -> Any:
        if isinstance(val, dict):
            return {k: clean_for_json(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [clean_for_json(x) for x in val]
        elif val.__class__.__name__ == 'Decimal':
            f = float(val)
            return int(f) if f.is_integer() else f
        return val

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "user_id": user["id"],
        "user_mobile": user["mobile"],
        "user_role": user["role"],
        "before": clean_for_json(before),
        "after": clean_for_json(after),
        "timestamp": now_utc().isoformat(),
    })


def clean(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def branch_query(user: dict) -> dict:
    """Return a Mongo filter that scopes records to the user's branch.
    Admin: no scoping (sees all).
    Manager / Store Incharge: limited to their assigned branch_id.
    """
    role = user.get("role")
    bid = user.get("branch_id")
    if role == "Admin" or not bid:
        return {}
    # Match user's branch OR legacy records without branch_id
    return {"$or": [{"branch_id": bid}, {"branch_id": None}]}


def can_write_to_branch(user: dict, branch_id: Optional[str]) -> bool:
    """Store Incharge / Manager may only write within their branch."""
    if user.get("role") == "Admin":
        return True
    ub = user.get("branch_id")
    if not ub:
        return True  # legacy user with no branch — allow (backward compat)
    return branch_id in (None, "", ub)


async def resolve_branch_id(user: dict, requested: Optional[str]) -> Optional[str]:
    """Return the branch_id a new record should be tagged with."""
    if user.get("role") == "Admin":
        return requested or user.get("branch_id")
    return user.get("branch_id") or requested


async def next_seq(name: str) -> int:
    res = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return res["seq"] if res else 1


# ---------------------------- MODELS ----------------------------
class LoginIn(BaseModel):
    mobile: str
    password: str


class BranchIn(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""


class UserCreate(BaseModel):
    name: str
    mobile: str
    password: str
    role: str  # Admin, Manager, Store Incharge
    branch_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None
    password: Optional[str] = None


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
    branch_id: Optional[str] = None


class ProductIn(BaseModel):
    name: str
    default_rate: float = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    default_rate: Optional[float] = None


class BranchProductRateIn(BaseModel):
    branch_id: str
    rate: float


class BranchRateOverrideIn(BaseModel):
    product_id: str
    rate: float


class MachineIn(BaseModel):
    name: str
    capacity: float = 0
    status: str = "Available"  # Available, Running, Maintenance, Cleaning
    branch_id: Optional[str] = None


class MachineStatusUpdate(BaseModel):
    status: str


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[float] = None
    status: Optional[str] = None
    branch_id: Optional[str] = None


class MachineLoadIn(BaseModel):
    batch_ids: List[str]
    start_time: Optional[str] = None


class MachineStopIn(BaseModel):
    end_time: Optional[str] = None
    total_dry_weight: Optional[float] = None
    total_dry_bags: Optional[int] = None


class ArrivalIn(BaseModel):
    """Simplified Arrival: customer + product + weight + bags + photos.
    Machine is assigned later at 'Load' stage. Rate defaults to 12/kg."""
    customer_id: str
    product_id: str
    raw_weight: float
    bags: int = 0
    bag_weight: float = 0
    arrival_date: Optional[str] = None
    rate_per_kg: float = 12.0
    remarks: Optional[str] = ""
    photos: List[str] = []
    branch_id: Optional[str] = None
    received_from: Optional[str] = ""  # Who physically brought the produce


class BatchIn(BaseModel):
    customer_id: str
    product_id: str
    raw_weight: float
    estimated_dry_weight: float = 0
    moisture: float = 0
    bags: int = 0
    bag_weight: float = 0
    machine_id: Optional[str] = None
    rate_per_kg: float
    loading_charges: float = 0
    discount: float = 0
    advance_paid: float = 0
    expected_delivery_date: Optional[str] = None
    remarks: Optional[str] = ""
    photos: List[str] = []  # base64
    branch_id: Optional[str] = None


class BatchUpdate(BaseModel):
    arrival_date: Optional[str] = None


class BatchStatusUpdate(BaseModel):
    status: str  # Loaded, Drying, Completed
    remarks: Optional[str] = ""
    machine_id: Optional[str] = None  # required when transitioning to Loaded


class DeliveryIn(BaseModel):
    actual_dry_weight: float
    processed_bags: Optional[int] = 0
    received_by: str
    received_by_phone: Optional[str] = ""
    rate_per_kg: Optional[float] = None       # override rate at delivery
    amount_received: Optional[float] = 0.0    # record payment inline at delivery
    payment_mode: Optional[str] = "Cash"
    signature: Optional[str] = ""             # base64
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
    bill_photos: Optional[List[str]] = []
    remarks: Optional[str] = ""
    expense_date: Optional[str] = None
    branch_id: Optional[str] = None


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    vendor: Optional[str] = None
    bill_photos: Optional[List[str]] = None
    remarks: Optional[str] = None
    expense_date: Optional[str] = None
    branch_id: Optional[str] = None


class ExpenseCategoriesIn(BaseModel):
    categories: List[str]


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
    # 1. Create user_sessions table if not exists
    await db.execute("""
        CREATE TABLE IF NOT EXISTS public.user_sessions (
            session_token TEXT PRIMARY KEY,
            user_id UUID NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL
        );
    """)
    # Add bill_photos TEXT[] DEFAULT '{}' column to public.expenses if not exists
    await db.execute("""
        ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS bill_photos TEXT[] DEFAULT '{}';
    """)
    # Create counters table if not exists
    await db.execute("""
        CREATE TABLE IF NOT EXISTS public.counters (
            id TEXT PRIMARY KEY,
            seq INTEGER NOT NULL DEFAULT 0
        );
    """)

    # 2. Default branch
    default_branch = await db.branches.find_one({})
    if not default_branch:
        default_branch = {
            "id": str(uuid.uuid4()), "name": "Main Branch", "address": "HQ",
            "phone": "", "created_at": now_utc().isoformat(),
        }
        await db.branches.insert_one(dict(default_branch))
    default_branch_id = default_branch["id"]

    # 3. Users — seed default users
    for name, mobile, pw, role in DEFAULT_USERS:
        existing = await db.users.find_one({"mobile": mobile})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "name": name, "mobile": mobile,
                "email": f"{mobile}@e3.example.com",
                "password": hash_pw(pw), "role": role,
                "branch_id": default_branch_id,
                "created_at": now_utc().isoformat(),
            })
        elif not existing.get("branch_id"):
            await db.users.update_one({"id": existing["id"]},
                                      {"$set": {"branch_id": default_branch_id}})

    # 4. Products
    for pname, rate in DEFAULT_PRODUCTS:
        if not await db.products.find_one({"name": pname}):
            await db.products.insert_one({
                "id": str(uuid.uuid4()), "name": pname, "default_rate": rate,
                "created_at": now_utc().isoformat(),
            })

    # 5. Machines
    for mname, cap in DEFAULT_MACHINES:
        existing = await db.machines.find_one({"name": mname})
        if not existing:
            await db.machines.insert_one({
                "id": str(uuid.uuid4()), "name": mname, "capacity": cap,
                "status": "Available", "current_batch_id": None,
                "branch_id": default_branch_id,
                "created_at": now_utc().isoformat(),
            })
        elif not existing.get("branch_id"):
            await db.machines.update_one({"id": existing["id"]},
                                         {"$set": {"branch_id": default_branch_id}})

    # 6. Settings
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
    await db.open()
    await seed()
    logger.info("EThree Agro backend started; seed complete.")


@app.on_event("shutdown")
async def shutdown():
    await db.close()


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
        "created_by": user["id"], "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
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
    products = await db.products.find({}, {"_id": 0}).to_list(200)
    rates = await db.branch_product_rates.find({}, {"_id": 0}).to_list(1000)
    
    product_rates = {}
    for r in rates:
        pid = r["product_id"]
        bid = r["branch_id"]
        rate = float(r["rate"])
        if pid not in product_rates:
            product_rates[pid] = {}
        product_rates[pid][bid] = rate
        
    for p in products:
        p["branch_rates"] = product_rates.get(p["id"], {})
        p["default_rate"] = float(p.get("default_rate") or 0.0)
    return products


@api.post("/products")
async def add_product(body: ProductIn, user: dict = Depends(require_roles("Admin"))):
    p = {"id": str(uuid.uuid4()), "name": body.name, "default_rate": body.default_rate,
         "created_at": now_utc().isoformat(), "created_by": user["id"],
         "updated_at": now_utc().isoformat(), "updated_by": user["id"]}
    await db.products.insert_one(dict(p))
    await audit("create", "product", p["id"], user, None, p)
    p["branch_rates"] = {}
    p["default_rate"] = float(p["default_rate"])
    return clean(p)


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductUpdate, user: dict = Depends(require_roles("Admin"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    upd = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.default_rate is not None:
        upd["default_rate"] = body.default_rate
    if upd:
        upd["updated_at"] = now_utc().isoformat()
        upd["updated_by"] = user["id"]
        await db.products.update_one({"id": pid}, {"$set": upd})
        await audit("update", "product", pid, user, p, upd)
    
    updated = await db.products.find_one({"id": pid}, {"_id": 0})
    rates = await db.branch_product_rates.find({"product_id": pid}, {"_id": 0}).to_list(100)
    updated["branch_rates"] = {r["branch_id"]: float(r["rate"]) for r in rates}
    updated["default_rate"] = float(updated.get("default_rate") or 0.0)
    return clean(updated)


@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_roles("Admin"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
        
    batches_count = await db.batches.count_documents({"product_id": pid})
    if batches_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete spice product currently used in batches")
        
    await db.products.delete_one({"id": pid})
    await db.branch_product_rates.delete_many({"product_id": pid})
    await audit("delete", "product", pid, user, p, None)
    return {"ok": True}


@api.get("/products/{pid}/rates")
async def get_product_rates(pid: str, user: dict = Depends(require_roles("Admin"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
        
    rates = await db.branch_product_rates.find({"product_id": pid}, {"_id": 0}).to_list(200)
    rate_map = {r["branch_id"]: float(r["rate"]) for r in rates}
    
    branches = await db.branches.find({}, {"_id": 0}).to_list(200)
    
    res = []
    for b in branches:
        res.append({
            "branch_id": b["id"],
            "branch_name": b["name"],
            "rate": rate_map.get(b["id"], float(p["default_rate"] or 0.0))
        })
    return res


@api.put("/products/{pid}/rates")
async def update_product_rates(pid: str, body: List[BranchProductRateIn], user: dict = Depends(require_roles("Admin"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
        
    await db.branch_product_rates.delete_many({"product_id": pid})
    
    for r in body:
        item = {
            "id": str(uuid.uuid4()),
            "branch_id": r.branch_id,
            "product_id": pid,
            "rate": r.rate,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        await db.branch_product_rates.insert_one(item)
        
    await audit("update_rates", "product", pid, user, None, {"rates_count": len(body)})
    return {"ok": True}


# ---------------------------- MACHINES ----------------------------
@api.get("/machines")
async def list_machines(user: dict = Depends(get_current_user), branch_id: Optional[str] = None):
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        query = {"branch_id": branch_id}
    else:
        query = branch_query(user)
    machines = await db.machines.find(query, {"_id": 0}).to_list(50)
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    for m in machines:
        m["branch_name"] = branch_map.get(m.get("branch_id"), "")
        drying_batches = await db.batches.find({"machine_id": m["id"], "status": "Drying"}, {"_id": 0}).to_list(100)
        m["running_batches"] = []
        for db_batch in drying_batches:
            cust = await db.customers.find_one({"id": db_batch["customer_id"]}, {"_id": 0})
            m["running_batches"].append({
                "id": db_batch["id"],
                "batch_no": db_batch["batch_no"],
                "customer_name": cust["name"] if cust else "",
                "raw_weight": db_batch["raw_weight"],
                "bags": db_batch["bags"],
            })
        
        if drying_batches:
            first_b = drying_batches[0]
            first_cust = await db.customers.find_one({"id": first_b["customer_id"]}, {"_id": 0})
            m["current_batch"] = {
                "id": first_b["id"], "batch_no": first_b["batch_no"],
                "customer_name": first_cust["name"] if first_cust else "",
                "expected_delivery_date": first_b.get("expected_delivery_date"),
                "status": first_b["status"],
            }
    return machines


@api.post("/machines")
async def add_machine(body: MachineIn, user: dict = Depends(require_roles("Admin"))):
    m = {"id": str(uuid.uuid4()), "name": body.name, "capacity": body.capacity,
         "status": body.status, "current_batch_id": None,
         "branch_id": await resolve_branch_id(user, body.branch_id),
         "created_at": now_utc().isoformat(), "created_by": user["id"],
         "updated_at": now_utc().isoformat(), "updated_by": user["id"]}
    await db.machines.insert_one(dict(m))
    await audit("create", "machine", m["id"], user, None, m)
    return m


@api.put("/machines/{mid}/status")
async def update_machine_status(mid: str, body: MachineStatusUpdate,
                                user: dict = Depends(require_roles("Admin", "Manager", "Store Incharge"))):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    await db.machines.update_one({"id": mid}, {"$set": {
        "status": body.status,
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"]
    }})
    await audit("update_status", "machine", mid, user, {"status": m["status"]}, {"status": body.status})
    return {"ok": True}


@api.put("/machines/{mid}")
async def update_machine(mid: str, body: MachineUpdate, user: dict = Depends(require_roles("Admin"))):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    upd = {}
    if body.name is not None: upd["name"] = body.name
    if body.capacity is not None: upd["capacity"] = body.capacity
    if body.status is not None: upd["status"] = body.status
    if body.branch_id is not None:
        upd["branch_id"] = body.branch_id or None

    if upd:
        upd["updated_at"] = now_utc().isoformat()
        upd["updated_by"] = user["id"]
        await db.machines.update_one({"id": mid}, {"$set": upd})
        await audit("update", "machine", mid, user, m, upd)
    return {"ok": True}


@api.delete("/machines/{mid}")
async def delete_machine(mid: str, user: dict = Depends(require_roles("Admin"))):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    await db.machines.delete_one({"id": mid})
    await audit("delete", "machine", mid, user, {"name": m.get("name")}, None)
    return {"ok": True}


@api.post("/machines/{mid}/load")
async def load_machine(mid: str, body: MachineLoadIn, user: dict = Depends(get_current_user)):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    if not body.batch_ids:
        raise HTTPException(status_code=400, detail="At least one batch ID is required")

    # Fetch batches and validate
    batches = []
    for bid in body.batch_ids:
        b = await db.batches.find_one({"id": bid}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail=f"Batch {bid} not found")
        if b.get("branch_id") != m.get("branch_id"):
            raise HTTPException(status_code=400, detail=f"Batch {bid} belongs to a different branch")
        if b.get("status") != "Received":
            raise HTTPException(status_code=400, detail=f"Batch {bid} status must be Received")
        batches.append(b)

    # Load machine
    t_start = body.start_time or now_utc().isoformat()
    await db.machines.update_one({"id": mid}, {"$set": {
        "status": "Running",
        "current_batch_id": body.batch_ids[0],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"]
    }})

    # Update batches to Drying
    for b in batches:
        await db.batches.update_one({"id": b["id"]}, {"$set": {
            "status": "Drying",
            "machine_id": mid,
            "remarks": f"Loaded in {m['name']} at {t_start}",
            "updated_at": now_utc().isoformat(),
            "updated_by": user["id"]
        }})
        await audit("load_machine", "batch", b["id"], user, {"status": "Received"}, {"status": "Drying", "machine_id": mid})

    await audit("load", "machine", mid, user, None, {"batch_ids": body.batch_ids, "start_time": t_start})
    return {"ok": True}


@api.post("/machines/{mid}/stop")
async def stop_machine(mid: str, body: MachineStopIn, user: dict = Depends(get_current_user)):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    if body.total_dry_weight is not None:
        if body.total_dry_weight <= 0:
            raise HTTPException(status_code=400, detail="Total dry weight must be > 0")
    if body.total_dry_bags is not None:
        if body.total_dry_bags < 0:
            raise HTTPException(status_code=400, detail="Total dry bags cannot be negative")

    # Find active batches drying in this machine
    drying_batches = await db.batches.find({"machine_id": mid, "status": "Drying"}, {"_id": 0}).to_list(100)
    if not drying_batches:
        raise HTTPException(status_code=400, detail="No active drying batches found in this machine")

    total_raw_weight = sum(float(b["raw_weight"]) for b in drying_batches)
    if total_raw_weight <= 0:
        raise HTTPException(status_code=400, detail="Total raw weight of active batches is zero")

    t_end = body.end_time or now_utc().isoformat()

    # Process each batch
    for b in drying_batches:
        upd = {
            "status": "Completed",
            "remarks": f"Drying completed in {m['name']} at {t_end}",
            "updated_at": now_utc().isoformat(),
            "updated_by": user["id"],
        }

        if body.total_dry_weight is not None and body.total_dry_bags is not None:
            raw = float(b["raw_weight"])
            pct = raw / total_raw_weight
            prop_dry_weight = round(pct * body.total_dry_weight, 2)
            prop_bags = int(round(pct * body.total_dry_bags))

            upd.update({
                "actual_dry_weight": prop_dry_weight,
                "processed_bags": prop_bags,
                "weight_loss": round(raw - prop_dry_weight, 2)
            })

            tmp = dict(b)
            tmp["actual_dry_weight"] = prop_dry_weight
            tmp["processed_bags"] = prop_bags
            totals = await recompute_batch_totals(tmp)
            upd.update(totals)
        else:
            totals = await recompute_batch_totals({**b, **upd})
            upd.update(totals)

        await db.batches.update_one({"id": b["id"]}, {"$set": upd})
        await audit("stop_machine", "batch", b["id"], user, {"status": "Drying"}, {"status": "Completed"})

    # Free the machine
    await db.machines.update_one({"id": mid}, {"$set": {
        "status": "Available",
        "current_batch_id": None,
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"]
    }})

    await audit("stop", "machine", mid, user, None, {"end_time": t_end, "total_dry_weight": body.total_dry_weight, "total_dry_bags": body.total_dry_bags})
    return {"ok": True}


# ---------------------------- CUSTOMERS ----------------------------
@api.get("/customers")
async def list_customers(
    user: dict = Depends(get_current_user),
    q: Optional[str] = None,
    branch_id: Optional[str] = None,
    status: str = "active"
):
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        query: Dict[str, Any] = {"branch_id": branch_id}
    else:
        query = dict(branch_query(user))

    if status == "active":
        query["is_deleted"] = {"$ne": True}
    elif status == "inactive":
        query["is_deleted"] = True

    if q:
        query["$and"] = [{
            "$or": [
                {"name": {"$regex": q, "$options": "i"}},
                {"mobile": {"$regex": q, "$options": "i"}},
                {"code": {"$regex": q, "$options": "i"}},
            ]
        }]
    # Dispatch concurrently
    docs_task = db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    branches_task = db.branches.find({}, {"_id": 0}).to_list(100)
    
    target_branch = branch_id or user.get("branch_id") if user.get("role") != "Admin" else branch_id
    if target_branch:
        stats_task = db.query("""
            SELECT 
                customer_id::text as customer_id, 
                COUNT(*)::integer as total_arrivals, 
                COALESCE(SUM(bill_amount), 0)::float as total_amount, 
                COALESCE(SUM(total_paid), 0)::float as amount_received
            FROM public.batches
            WHERE branch_id::text = %s
            GROUP BY customer_id
        """, [target_branch])
    else:
        stats_task = db.query("""
            SELECT 
                customer_id::text as customer_id, 
                COUNT(*)::integer as total_arrivals, 
                COALESCE(SUM(bill_amount), 0)::float as total_amount, 
                COALESCE(SUM(total_paid), 0)::float as amount_received
            FROM public.batches
            GROUP BY customer_id
        """)

    docs, branches_list, stats_rows = await asyncio.gather(docs_task, branches_task, stats_task)
    branches = {b["id"]: b["name"] for b in branches_list}
    stats_map = {row["customer_id"]: row for row in stats_rows}

    for doc in docs:
        doc["branch_name"] = branches.get(doc.get("branch_id"), "-")
        c_stats = stats_map.get(doc["id"], {"total_arrivals": 0, "total_amount": 0.0, "amount_received": 0.0})
        doc["total_arrivals"] = c_stats["total_arrivals"]
        doc["total_amount"] = c_stats["total_amount"]
        doc["amount_received"] = c_stats["amount_received"]
        
    return docs


@api.get("/customers/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Enrich with branch name
    branch = await db.branches.find_one({"id": c.get("branch_id")}, {"_id": 0}) if c.get("branch_id") else None
    c["branch_name"] = branch["name"] if branch else "-"

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
    c["branch_id"] = await resolve_branch_id(user, c.get("branch_id"))
    if not can_write_to_branch(user, c["branch_id"]):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")
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
    if not can_write_to_branch(user, before.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")
    upd = body.dict()
    upd["branch_id"] = before.get("branch_id")  # preserve
    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]
    await db.customers.update_one({"id": cid}, {"$set": upd})
    await audit("update", "customer", cid, user, {"name": before["name"]}, {"name": upd["name"]})
    return {"ok": True}


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user: dict = Depends(require_roles("Admin"))):
    before = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Not found")
    # Soft delete: update is_deleted flag to True
    await db.customers.update_one(
        {"id": cid},
        {"$set": {"is_deleted": True, "updated_at": now_utc().isoformat(), "updated_by": user["id"]}}
    )
    await audit("delete", "customer", cid, user, {"name": before.get("name")}, None)
    return {"ok": True}


# ---------------------------- BATCHES ----------------------------
async def recompute_batch_totals(batch: dict) -> dict:
    raw = float(batch.get("raw_weight") or 0)
    rate = float(batch.get("rate_per_kg") or 0)
    loading = float(batch.get("loading_charges") or 0)
    discount = float(batch.get("discount") or 0)
    
    bill_amount = round(raw * rate + loading - discount, 2)
    payments = await db.payments.find({"batch_id": batch["id"]}, {"_id": 0}).to_list(500)
    total_paid = round(sum(float(p["amount"]) for p in payments), 2)
    return {
        "bill_amount": bill_amount,
        "total_paid": total_paid,
        "balance_amount": round(bill_amount - total_paid, 2),
    }

async def clean_batch(b: Optional[dict]) -> Optional[dict]:
    if not b:
        return None
    # 1. Fetch status history
    history = await db.query(
        "SELECT status, changed_at as at, changed_by as by, remarks FROM public.batch_status_history WHERE batch_id = %s ORDER BY changed_at ASC",
        [b["id"]], "public.batch_status_history"
    )
    b["status_history"] = history
    
    # 2. Reconstruct delivery object
    if b.get("delivered_at"):
        b["delivery"] = {
            "delivery_date": b.get("delivered_at"),
            "actual_dry_weight": b.get("actual_dry_weight"),
            "processed_bags": b.get("processed_bags"),
            "weight_loss": b.get("weight_loss"),
            "received_by": b.get("received_by"),
            "received_by_phone": b.get("received_by_phone"),
            "signature": b.get("signature"),
            "remarks": b.get("delivery_remarks"),
        }
    else:
        b["delivery"] = None
        
    return b


@api.get("/batches")
async def list_batches(user: dict = Depends(get_current_user),
                       q: Optional[str] = None, status: Optional[str] = None,
                       branch_id: Optional[str] = None,
                       start: Optional[str] = None,
                       end: Optional[str] = None):
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        query: Dict[str, Any] = {"branch_id": branch_id}
    else:
        query = dict(branch_query(user))
    if start and end:
        pstart, pend = _parse_range(start, end)
        query["created_at"] = {"$gte": pstart, "$lt": pend}
    if status:
        query["status"] = status
    if q:
        or_clause = [
            {"batch_no": {"$regex": q, "$options": "i"}},
            {"receipt_no": {"$regex": q, "$options": "i"}},
        ]
        if "$or" in query:
            query = {"$and": [{"$or": query.pop("$or")}, {"$or": or_clause}, query]} if query else {"$or": or_clause}
        else:
            query["$or"] = or_clause
    docs = await db.batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    for d in docs:
        d["branch_name"] = branch_map.get(d.get("branch_id"), "")
        cust = await db.customers.find_one({"id": d["customer_id"]}, {"_id": 0, "name": 1, "mobile": 1, "code": 1})
        prod = await db.products.find_one({"id": d["product_id"]}, {"_id": 0, "name": 1})
        mach = await db.machines.find_one({"id": d["machine_id"]}, {"_id": 0, "name": 1})
        d["customer"] = clean(cust) if cust else None
        d["product"] = clean(prod) if prod else None
        d["machine"] = clean(mach) if mach else None
        await clean_batch(d)
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
    await clean_batch(b)
    return b


@api.post("/batches")
async def create_batch(body: BatchIn, user: dict = Depends(get_current_user)):
    # Validation
    if body.raw_weight <= 0:
        raise HTTPException(status_code=400, detail="Raw weight must be > 0")
    if body.rate_per_kg < 0 or body.loading_charges < 0 or body.discount < 0 or body.advance_paid < 0:
        raise HTTPException(status_code=400, detail="Negative values not allowed")
    bill_amount = round(body.raw_weight * body.rate_per_kg + body.loading_charges - body.discount, 2)
    if body.advance_paid > bill_amount + 0.01:
        raise HTTPException(status_code=400, detail="Advance cannot exceed bill amount")

    seq = await next_seq("batch")
    rseq = await next_seq("receipt")
    bid = str(uuid.uuid4())
    b = body.dict()
    b["branch_id"] = await resolve_branch_id(user, b.get("branch_id"))
    if not can_write_to_branch(user, b["branch_id"]):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")
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
    return clean(await clean_batch(b))


@api.post("/arrivals")
async def create_arrival(body: ArrivalIn, user: dict = Depends(get_current_user)):
    """Simplified arrival entry — captures only customer/product/weight/bags/photos.
    Machine is assigned later at 'Load' stage. Rate defaults to ₹12/kg per spec."""
    if body.raw_weight <= 0:
        raise HTTPException(status_code=400, detail="Weight must be > 0")

    seq = await next_seq("batch")
    rseq = await next_seq("receipt")
    bid = str(uuid.uuid4())
    branch_id = await resolve_branch_id(user, body.branch_id)
    if not can_write_to_branch(user, branch_id):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")

    est_dry = body.raw_weight  # unknown until processed
    bill_amount = round(est_dry * body.rate_per_kg, 2)
    created_at = now_utc().isoformat()
    arrival_date = body.arrival_date or created_at

    b = {
        "id": bid,
        "batch_no": f"B{seq:05d}",
        "receipt_no": f"R{rseq:05d}",
        "qr_code": bid,
        "customer_id": body.customer_id,
        "product_id": body.product_id,
        "raw_weight": body.raw_weight,
        "estimated_dry_weight": est_dry,
        "moisture": 0,
        "bags": body.bags,
        "bag_weight": body.bag_weight,
        "machine_id": None,
        "rate_per_kg": body.rate_per_kg,
        "loading_charges": 0,
        "discount": 0,
        "advance_paid": 0,
        "expected_delivery_date": None,
        "remarks": body.remarks or "",
        "photos": body.photos or [],
        "received_from": body.received_from or "",
        "branch_id": branch_id,
        "arrival_date": arrival_date,
        "status": "Received",
        "status_history": [{"status": "Received", "at": created_at, "by": user["id"], "remarks": "Arrival"}],
        "bill_amount": bill_amount,
        "total_paid": 0.0,
        "balance_amount": bill_amount,
        "actual_dry_weight": None,
        "weight_loss": None,
        "delivery": None,
        "created_at": created_at,
        "created_by": user["id"],
        "updated_at": created_at,
        "updated_by": user["id"],
    }
    await db.batches.insert_one(dict(b))
    await audit("create_arrival", "batch", bid, user, None, {"batch_no": b["batch_no"], "raw_weight": body.raw_weight})
    return clean(await clean_batch(b))


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

    # Machine linkage — allow assignment at Load step
    machine_id = b.get("machine_id")
    if body.status == "Loaded":
        if body.machine_id:
            machine_id = body.machine_id
            upd["machine_id"] = machine_id
        if not machine_id:
            raise HTTPException(status_code=400, detail="Machine required to load batch")
        await db.machines.update_one({"id": machine_id},
                                     {"$set": {"status": "Running", "current_batch_id": bid}})
    elif body.status == "Delivered":
        if machine_id:
            await db.machines.update_one({"id": machine_id},
                                         {"$set": {"status": "Available", "current_batch_id": None}})

    await db.batches.update_one({"id": bid}, {"$set": upd})
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

    # Rate override allowed at delivery
    if body.rate_per_kg and body.rate_per_kg > 0:
        await db.batches.update_one({"id": bid}, {"$set": {"rate_per_kg": body.rate_per_kg}})
        b["rate_per_kg"] = body.rate_per_kg

    weight_loss = round(float(b["raw_weight"]) - float(body.actual_dry_weight), 2)
    delivery = {
        "actual_dry_weight": body.actual_dry_weight,
        "processed_bags": body.processed_bags or 0,
        "weight_loss": weight_loss,
        "delivery_date": now_utc().isoformat(),
        "received_by": body.received_by,
        "received_by_phone": body.received_by_phone or "",
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
        "processed_bags": body.processed_bags or 0,
        "weight_loss": weight_loss,
        "status": "Delivered",
        "delivered_at": delivery["delivery_date"],
        "received_by": delivery["received_by"],
        "received_by_phone": delivery["received_by_phone"],
        "signature": delivery["signature"],
        "delivery_remarks": delivery["remarks"],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
        **totals,
    }
    await db.batches.update_one({"id": bid}, {"$set": upd})

    # Optionally record payment inline at delivery
    if body.amount_received and body.amount_received > 0:
        pay = {
            "id": str(uuid.uuid4()), "batch_id": bid, "amount": body.amount_received,
            "mode": body.payment_mode or "Cash",
            "remarks": "Collected at delivery",
            "created_at": now_utc().isoformat(), "created_by": user["id"],
        }
        await db.payments.insert_one(dict(pay))
        new_totals = await recompute_batch_totals({**b, **upd})
        await db.batches.update_one({"id": bid}, {"$set": new_totals})
        totals = new_totals

    if b.get("machine_id"):
        await db.machines.update_one({"id": b["machine_id"]},
                                     {"$set": {"status": "Available", "current_batch_id": None}})
    await audit("delivery", "batch", bid, user, None, delivery)
    return {"ok": True, "weight_loss": weight_loss, "bill_amount": totals["bill_amount"], "balance_amount": totals["balance_amount"]}


@api.put("/batches/{bid}")
async def update_batch_fields(
    bid: str,
    body: BatchUpdate,
    user: dict = Depends(get_current_user)
):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if not can_write_to_branch(user, b.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")

    upd = {}
    if body.arrival_date is not None:
        try:
            import re
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.arrival_date):
                raise ValueError()
            dt = datetime.strptime(body.arrival_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            upd["arrival_date"] = dt.isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid arrival_date format, must be YYYY-MM-DD")

    if not upd:
        return {"ok": True}

    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]

    await db.batches.update_one({"id": bid}, {"$set": upd})
    await audit("update_batch", "batch", bid, user, {"arrival_date": b.get("arrival_date")}, upd)
    return {"ok": True}


@api.delete("/batches/{bid}")
async def delete_batch(
    bid: str,
    user: dict = Depends(require_roles("Admin"))
):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if not can_write_to_branch(user, b.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    machine_id = b.get("machine_id")
    if machine_id:
        m = await db.machines.find_one({"id": machine_id})
        if m and m.get("current_batch_id") == bid:
            await db.machines.update_one(
                {"id": machine_id},
                {"$set": {"status": "Available", "current_batch_id": None}}
            )

    await db.batches.delete_one({"id": bid})
    await audit("delete", "batch", bid, user, {"batch_no": b.get("batch_no")}, None)
    return {"ok": True}


# ---------------------------- PAYMENTS ----------------------------
@api.get("/payments")
async def list_payments(user: dict = Depends(get_current_user), branch_id: Optional[str] = None):
    # Filter by user's branch (or requested branch_id if allowed) by joining on batch
    target_branch = branch_id
    if target_branch:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != target_branch:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if user.get("role") != "Admin":
            target_branch = user.get("branch_id")

    if target_branch:
        branch_batches = await db.batches.find(
            {"branch_id": target_branch}, {"_id": 0, "id": 1}
        ).to_list(3000)
        branch_ids = [b["id"] for b in branch_batches]
        query = {"batch_id": {"$in": branch_ids}}
    else:
        query = {}
    docs = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
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
        "updated_at": now_utc().isoformat(), "updated_by": user["id"],
    }
    await db.payments.insert_one(dict(p))
    totals = await recompute_batch_totals(b)
    await db.batches.update_one({"id": body.batch_id}, {"$set": totals})
    await audit("create", "payment", p["id"], user, None, {"amount": p["amount"], "mode": p["mode"]})
    return clean(p)


# ---------------------------- EXPENSES ----------------------------
@api.get("/expenses")
async def list_expenses(
    start: Optional[str] = None,
    end: Optional[str] = None,
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")

    q = branch_query(user)
    where_clause, params = build_where_clause(q, "public.expenses")
    
    extra_clauses = []
    if start:
        extra_clauses.append("e.expense_date >= %s")
        params.append(start)
    if end:
        extra_clauses.append("e.expense_date <= %s")
        params.append(end)
    if branch_id:
        extra_clauses.append("e.branch_id::text = %s")
        params.append(branch_id)
        
    where_str = where_clause
    if extra_clauses:
        where_str += " AND " + " AND ".join(extra_clauses)
        
    query = f"""
        SELECT e.*, b.name as branch_name
        FROM public.expenses e
        LEFT JOIN public.branches b ON e.branch_id = b.id
        WHERE {where_str}
        ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT 500
    """
    rows = await db.query(query, params, "public.expenses")
    return rows


@api.post("/expenses")
async def add_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    e = body.dict()
    e["branch_id"] = await resolve_branch_id(user, e.get("branch_id"))
    if not can_write_to_branch(user, e["branch_id"]):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")
    e.update({
        "id": str(uuid.uuid4()),
        "expense_date": e.get("expense_date") or now_utc().date().isoformat(),
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
    })
    await db.expenses.insert_one(dict(e))
    await audit("create", "expense", e["id"], user, None, {"category": e["category"], "amount": e["amount"]})
    return clean(e)


@api.get("/expenses/{eid}")
async def get_expense(eid: str, user: dict = Depends(get_current_user)):
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    if not can_write_to_branch(user, e.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return clean(e)


@api.put("/expenses/{eid}")
async def update_expense(eid: str, body: ExpenseUpdate, user: dict = Depends(get_current_user)):
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    if not can_write_to_branch(user, e.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")

    upd = {k: v for k, v in body.dict().items() if v is not None}
    if "amount" in upd and upd["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if "expense_date" in upd and not upd["expense_date"]:
        upd.pop("expense_date")

    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]

    await db.expenses.update_one({"id": eid}, {"$set": upd})
    await audit("update", "expense", eid, user, e, upd)
    return {"ok": True}


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    await db.expenses.delete_one({"id": eid})
    await audit("delete", "expense", eid, user, e, None)
    return {"ok": True}


@api.get("/expense-categories")
async def expense_cats(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"key": "expense_categories"}, {"_id": 0})
    cats = doc["value"] if doc else DEFAULT_EXPENSE_CATS
    return sorted(cats, key=str.lower)


@api.put("/expense-categories")
async def update_expense_cats(body: ExpenseCategoriesIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    seen = set()
    unique_cats = [c for c in body.categories if not (c in seen or seen.add(c))]
    await db.settings.update_one(
        {"key": "expense_categories"},
        {"$set": {"value": unique_cats}},
        upsert=True
    )
    await audit("update", "settings", "expense_categories", user, None, unique_cats)
    return {"ok": True, "categories": unique_cats}


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
    mid = str(uuid.uuid4())
    m.update({
        "id": mid,
        "created_at": now_utc().isoformat(),
        "created_by": user["id"],
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"],
    })
    db_m = dict(m)
    db_m.pop("date", None)
    await db.maintenance.insert_one(db_m)
    await audit("create", "maintenance", mid, user, None, {"machine_id": m["machine_id"], "cost": m["cost"]})
    m["date"] = m["created_at"]
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
    branch_id: Optional[str] = None,
):
    tstart, tend = _today_range()
    pstart, pend = _parse_range(start, end)
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        bq = {"branch_id": branch_id}
    else:
        bq = branch_query(user)

    # Dispatch tasks concurrently
    period_batches_task = db.batches.find(
        {**bq, "created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    
    period_customers_task = db.customers.count_documents(bq)
    
    period_deliveries_task = db.batches.find(
        {**bq, "status": "Delivered", "delivery.delivery_date": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)
    
    bb_task = db.batches.find(bq, {"_id": 0, "id": 1}).to_list(3000) if bq else None
    
    period_expenses_task = db.expenses.find(
        {**bq, "created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).to_list(2000)

    today_batches_task = db.batches.find(
        {**bq, "created_at": {"$gte": tstart, "$lt": tend}}, {"_id": 0}
    ).to_list(1000)

    today_deliveries_task = db.batches.find(
        {**bq, "status": "Delivered", "delivery.delivery_date": {"$gte": tstart, "$lt": tend}}, {"_id": 0}
    ).to_list(1000)

    processing_task = db.batches.find(
        {**bq, "status": {"$in": ["Loaded", "Drying", "Completed"]}}, {"_id": 0}
    ).to_list(2000)

    all_batches_task = db.batches.find(bq, {"_id": 0}).to_list(5000)
    
    machines_task = db.machines.find(bq, {"_id": 0}).to_list(50)
    
    recent_task = db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(15)

    # Gather first round of queries
    tasks = [
        period_batches_task,
        period_customers_task,
        period_deliveries_task,
        period_expenses_task,
        today_batches_task,
        today_deliveries_task,
        processing_task,
        all_batches_task,
        machines_task,
        recent_task,
    ]
    if bb_task:
        tasks.append(bb_task)

    results = await asyncio.gather(*tasks)

    # Unpack results
    period_batches = results[0]
    period_customers = results[1]
    period_deliveries_docs = results[2]
    period_expenses = results[3]
    today_batches = results[4]
    today_deliveries_docs = results[5]
    processing_docs = results[6]
    all_batches = results[7]
    machines = results[8]
    recent = results[9]
    
    branch_batch_ids = None
    if bb_task:
        bb = results[10]
        branch_batch_ids = [x["id"] for x in bb]

    # Run secondary query (payments)
    pay_query: Dict[str, Any] = {"created_at": {"$gte": pstart, "$lt": pend}}
    if branch_batch_ids is not None:
        pay_query["batch_id"] = {"$in": branch_batch_ids}
    
    period_payments = await db.payments.find(pay_query, {"_id": 0}).to_list(2000)

    period_received_weight = round(sum(b.get("raw_weight", 0) for b in period_batches), 2)
    period_billed = round(sum(b.get("bill_amount", 0) for b in period_batches), 2)
    
    period_deliveries = len(period_deliveries_docs)
    period_delivered_weight = round(
        sum(b.get("actual_dry_weight") or 0 for b in period_deliveries_docs), 2
    )

    period_collection = round(sum(p["amount"] for p in period_payments), 2)
    period_expense = round(sum(e["amount"] for e in period_expenses), 2)

    today_in_weight = round(sum(b.get("raw_weight", 0) for b in today_batches), 2)
    today_in_count = len(today_batches)

    today_out_weight = round(sum(b.get("actual_dry_weight") or 0 for b in today_deliveries_docs), 2)
    today_out_count = len(today_deliveries_docs)

    processing_weight = round(sum(b.get("raw_weight", 0) for b in processing_docs), 2)
    processing_count = len(processing_docs)

    pending_payments = round(
        sum(b.get("balance_amount", 0) for b in all_batches if b.get("balance_amount", 0) > 0), 2
    )

    machines_running = sum(1 for m in machines if m["status"] == "Running")
    machines_available = sum(1 for m in machines if m["status"] == "Available")
    machines_maintenance = sum(1 for m in machines if m["status"] in ("Maintenance", "Cleaning"))

    drying_completed_count = sum(1 for b in processing_docs if b.get("status") == "Completed")
    pending_deliveries_count = sum(1 for b in processing_docs if b.get("status") == "Completed")
    pending_payments_count = sum(1 for b in all_batches if b.get("balance_amount", 0) > 0)

    return {
        "range": {"start": pstart[:10], "end": (datetime.fromisoformat(pend) - timedelta(days=1)).isoformat()[:10]},
        "today_arrival": {
            "in_weight": today_in_weight, "in_count": today_in_count,
            "out_weight": today_out_weight, "out_count": today_out_count,
            "processing_weight": processing_weight, "processing_count": processing_count,
        },
        "period_customers": period_customers,
        "period_received_weight": period_received_weight,
        "period_billed": period_billed,
        "period_deliveries": period_deliveries,
        "period_delivered_weight": period_delivered_weight,
        "period_collection": period_collection,
        "period_expenses": period_expense,
        "period_profit": round(period_collection - period_expense, 2),
        "pending_payments": pending_payments,
        "pending_payments_count": pending_payments_count,
        "drying_completed_count": drying_completed_count,
        "pending_deliveries_count": pending_deliveries_count,
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
    branch_id: Optional[str] = None,
):
    """List arrivals + processing + deliveries with customer + branch + weights."""
    pstart, pend = _parse_range(start, end)
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        bq = {"branch_id": branch_id}
    else:
        bq = branch_query(user)

    ins = await db.batches.find(
        {**bq, "created_at": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    outs = await db.batches.find(
        {**bq, "status": "Delivered", "delivery.delivery_date": {"$gte": pstart, "$lt": pend}}, {"_id": 0}
    ).sort("delivery.delivery_date", -1).to_list(1000)

    processing = await db.batches.find(
        {**bq, "status": {"$in": ["Received", "Loaded", "Drying", "Completed"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    # Branch lookup cache
    branches = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0}).to_list(200)}

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
            "branch_id": b.get("branch_id"),
            "branch_name": branches.get(b.get("branch_id"), "-"),
            "arrival_date": b.get("arrival_date") or b["created_at"],
            "raw_weight": b.get("raw_weight", 0),
            "actual_dry_weight": b.get("actual_dry_weight"),
            "delivery_date": (b.get("delivery") or {}).get("delivery_date"),
            "status": b["status"],
        }

    in_rows = [await enrich(b) for b in ins]
    out_rows = [await enrich(b) for b in outs]
    proc_rows = [await enrich(b) for b in processing]

    total_in = round(sum(r["raw_weight"] for r in in_rows), 2)
    total_out = round(sum((r["actual_dry_weight"] or 0) for r in out_rows), 2)
    total_proc = round(sum(r["raw_weight"] for r in proc_rows), 2)

    return {
        "range": {"start": pstart[:10], "end": (datetime.fromisoformat(pend) - timedelta(days=1)).isoformat()[:10]},
        "totals": {
            "in_weight": total_in, "out_weight": total_out, "processing_weight": total_proc,
            "in_count": len(in_rows), "out_count": len(out_rows), "processing_count": len(proc_rows),
        },
        "in": in_rows,
        "out": out_rows,
        "processing": proc_rows,
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
    cust = await db.customers.find({
        "is_deleted": {"$ne": True},
        "$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q, "$options": "i"}},
            {"code": {"$regex": q, "$options": "i"}},
        ]
    }, {"_id": 0}).to_list(20)
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
    return await db.branches.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


@api.post("/branches")
async def create_branch(body: BranchIn, user: dict = Depends(require_roles("Admin"))):
    b = {
        "id": str(uuid.uuid4()),
        "name": body.name, "address": body.address or "", "phone": body.phone or "",
        "created_at": now_utc().isoformat(), "created_by": user["id"],
        "updated_at": now_utc().isoformat(), "updated_by": user["id"],
    }
    await db.branches.insert_one(dict(b))
    await audit("create", "branch", b["id"], user, None, {"name": b["name"]})
    return b


@api.put("/branches/{bid}")
async def update_branch(bid: str, body: BranchIn, user: dict = Depends(require_roles("Admin"))):
    before = await db.branches.find_one({"id": bid}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Not found")
    await db.branches.update_one({"id": bid}, {"$set": {
        "name": body.name, "address": body.address or "", "phone": body.phone or "",
        "updated_at": now_utc().isoformat(), "updated_by": user["id"]
    }})
    await audit("update", "branch", bid, user, {"name": before["name"]}, {"name": body.name})
    return {"ok": True}


@api.delete("/branches/{bid}")
async def delete_branch(bid: str, user: dict = Depends(require_roles("Admin"))):
    branch = await db.branches.find_one({"id": bid}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Check dependencies to prevent DB inconsistencies
    batches = await db.batches.count_documents({"branch_id": bid})
    if batches > 0:
        raise HTTPException(status_code=400, detail="Cannot delete branch with configured batches/arrivals")
        
    machines = await db.machines.count_documents({"branch_id": bid})
    if machines > 0:
        raise HTTPException(status_code=400, detail="Cannot delete branch with configured machines")
        
    users = await db.users.count_documents({"branch_id": bid})
    if users > 0:
        raise HTTPException(status_code=400, detail="Cannot delete branch with assigned users")

    await db.branches.delete_one({"id": bid})
    await audit("delete", "branch", bid, user, {"name": branch["name"]}, None)
    return {"ok": True}


@api.get("/branches/{bid}/rates")
async def get_branch_rates(bid: str, user: dict = Depends(require_roles("Admin", "Manager"))):
    if user.get("role") != "Admin" and user.get("branch_id") != bid:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    branch = await db.branches.find_one({"id": bid}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    rates = await db.branch_product_rates.find({"branch_id": bid}, {"_id": 0}).to_list(1000)
    rate_map = {r["product_id"]: float(r["rate"]) for r in rates}
    
    res = []
    for p in products:
        res.append({
            "product_id": p["id"],
            "product_name": p["name"],
            "default_rate": float(p["default_rate"] or 0.0),
            "rate": rate_map.get(p["id"], float(p["default_rate"] or 0.0))
        })
    return res


@api.put("/branches/{bid}/rates")
async def update_branch_rates(bid: str, body: List[BranchRateOverrideIn], user: dict = Depends(require_roles("Admin", "Manager"))):
    if user.get("role") != "Admin" and user.get("branch_id") != bid:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    branch = await db.branches.find_one({"id": bid}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    await db.branch_product_rates.delete_many({"branch_id": bid})
    
    for r in body:
        item = {
            "id": str(uuid.uuid4()),
            "branch_id": bid,
            "product_id": r.product_id,
            "rate": r.rate,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        await db.branch_product_rates.insert_one(item)
        
    await audit("update_branch_rates", "branch", bid, user, None, {"rates_count": len(body)})
    return {"ok": True}


@api.put("/auth/users/{uid}")
async def update_user(uid: str, body: UserUpdate, user: dict = Depends(require_roles("Admin"))):
    existing = await db.users.find_one({"id": uid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    upd: Dict[str, Any] = {}
    if body.name is not None: upd["name"] = body.name
    if body.role is not None: upd["role"] = body.role
    if body.branch_id is not None: upd["branch_id"] = body.branch_id
    if body.password:
        upd["password"] = hash_pw(body.password)
    if upd:
        upd["updated_at"] = now_utc().isoformat()
        upd["updated_by"] = user["id"]
        await db.users.update_one({"id": uid}, {"$set": upd})
    await audit("update", "user", uid, user, {"role": existing.get("role")}, {k: v for k, v in upd.items() if k != "password"})
    return {"ok": True}


@api.delete("/auth/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_roles("Admin"))):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = await db.users.find_one({"id": uid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await audit("delete", "user", uid, user, {"name": existing.get("name")}, None)
    return {"ok": True}


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
