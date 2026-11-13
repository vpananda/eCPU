"""EThree Agro Solutions - Drying Plant Management Backend."""
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Dict, Any
from pathlib import Path
import os
import time
import uuid
import jwt
import httpx
import logging
from whatsapp_service import (
    send_arrival_receipt,
    send_drying_completed,
    send_delivery_statement,
    send_payment_receipt,
    send_whatsapp_template,
    send_whatsapp_text,
    send_daily_summary_whatsapp,
    clean_phone_number,
    get_config,
)
from sms_service import send_sms, check_sms_wallet

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
DB_NAME = os.environ.get("DB_NAME", "postgres").strip()
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
    "batches": ["id", "customer_id", "product_id", "machine_id", "branch_id", "parent_batch_id", "created_by", "updated_by"],
    "batch_status_history": ["id", "batch_id", "changed_by"],
    "payments": ["id", "batch_id", "customer_id", "branch_id", "created_by"],
    "expenses": ["id", "branch_id", "machine_id", "created_by"],
    "maintenance": ["id", "machine_id", "created_by"],
    "audit_logs": ["id", "user_id"],
    "user_sessions": ["user_id"],
    "sales": ["id", "customer_id", "branch_id", "created_by"]
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
        fast_cache.clear()
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
        fast_cache.clear()
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
        fast_cache.clear()
        
        if return_document:
            return res[0] if res else None
        return original_doc

    async def delete_one(self, filter_dict):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"DELETE FROM {self.table_name} WHERE {self.pk_col} IN (SELECT {self.pk_col} FROM {self.table_name} WHERE {where_clause} LIMIT 1)"
        await self.db.execute(query, params)
        fast_cache.clear()
        return None

    async def delete_many(self, filter_dict):
        if filter_dict and "_id" in filter_dict:
            filter_dict = {("id" if k == "_id" else k): v for k, v in filter_dict.items()}
        where_clause, params = build_where_clause(filter_dict, self.table_name)
        query = f"DELETE FROM {self.table_name} WHERE {where_clause}"
        await self.db.execute(query, params)
        fast_cache.clear()
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
        import socket
        if dsn and "://" in dsn:
            try:
                prefix, rest = dsn.split("://", 1)
                if "?" in rest:
                    main_part, params_part = rest.split("?", 1)
                else:
                    main_part, params_part = rest, ""
                parts = main_part.rsplit("@", 1)
                if len(parts) == 2:
                    creds, host_db = parts
                else:
                    creds, host_db = "", parts[0]
                if "/" in host_db:
                    host_port, db_path = host_db.split("/", 1)
                else:
                    host_port, db_path = host_db, ""
                if ":" in host_port:
                    host, port = host_port.split(":", 1)
                else:
                    host, port = host_port, ""
                
                try:
                    addrinfo = socket.getaddrinfo(host, None, socket.AF_INET6)
                    if not addrinfo:
                        addrinfo = socket.getaddrinfo(host, None, socket.AF_INET)
                    resolved_ip = addrinfo[0][4][0]
                    
                    params = {}
                    if params_part:
                        for p in params_part.split("&"):
                            if "=" in p:
                                k, v = p.split("=", 1)
                                params[k] = v
                    params["hostaddr"] = resolved_ip
                    new_params_part = "&".join(f"{k}={v}" for k, v in params.items())
                    dsn = f"{prefix}://{creds}@{host_port}/{db_path}?{new_params_part}"
                except Exception as dns_err:
                    print(f"Dynamic DNS resolution failed for host {host}: {dns_err}")
            except Exception as parse_err:
                print(f"Failed to parse database DSN: {parse_err}")

        if dsn and "@2026@" in dsn:
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
        self.sales = PostgresCollection(self, "public.sales")
        self.user_sessions = PostgresCollection(self, "public.user_sessions", "session_token")
        self.counters = PostgresCollection(self, "public.counters")

    async def open(self):
        if not self.dsn:
            raise RuntimeError(
                "DATABASE_URL is not set in backend/.env! "
                "Please configure DATABASE_URL (PostgreSQL/Supabase connection string) to start the server."
            )
        min_size = int(os.getenv("DB_POOL_MIN_SIZE", "3"))
        max_size = int(os.getenv("DB_POOL_MAX_SIZE", "25"))
        self.pool = AsyncConnectionPool(
            conninfo=self.dsn,
            open=False,
            min_size=min_size,
            max_size=max_size,
            max_idle=300.0,
            max_lifetime=1800.0,
            timeout=20.0,
            check=AsyncConnectionPool.check_connection,
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
                        fast_cache.clear()
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

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=r".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

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


# ---------------------------- HIGH-SPEED IN-MEMORY MICRO-CACHE ----------------------------
class MicroCache:
    def __init__(self):
        self._store: Dict[str, tuple] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            exp, val = self._store[key]
            if time.time() < exp:
                return val
            self._store.pop(key, None)
        return None

    def set(self, key: str, val: Any, ttl_seconds: float = 6.0):
        self._store[key] = (time.time() + ttl_seconds, val)

    def invalidate_prefix(self, prefix: str):
        keys_to_del = [k for k in self._store if k.startswith(prefix)]
        for k in keys_to_del:
            self._store.pop(k, None)

    def clear(self):
        self._store.clear()

fast_cache = MicroCache()


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
        "user_id": user.get("id", ""),
        "user_mobile": user.get("mobile", ""),
        "user_role": user.get("role", "Admin"),
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
    val = res["seq"] if res else 1
    try:
        if name == "customer":
            max_row = await db.query("SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 2) AS INTEGER)), 0) FROM public.customers WHERE code ~ '^C[0-9]+$'")
            if max_row and max_row[0][0] >= val:
                val = max_row[0][0] + 1
                await db.counters.update_one({"_id": "customer"}, {"$set": {"seq": val}})
        elif name == "batch":
            max_row = await db.query("SELECT COALESCE(MAX(CAST(SUBSTRING(batch_no FROM 2) AS INTEGER)), 0) FROM public.batches WHERE batch_no ~ '^B[0-9]+$'")
            if max_row and max_row[0][0] >= val:
                val = max_row[0][0] + 1
                await db.counters.update_one({"_id": "batch"}, {"$set": {"seq": val}})
        elif name == "receipt":
            max_row = await db.query("SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no FROM 2) AS INTEGER)), 0) FROM public.batches WHERE receipt_no ~ '^R[0-9]+$'")
            if max_row and max_row[0][0] >= val:
                val = max_row[0][0] + 1
                await db.counters.update_one({"_id": "receipt"}, {"$set": {"seq": val}})
    except Exception as ex:
        logger.warning(f"Error checking max seq for {name}: {ex}")
    return val


# ---------------------------- MODELS ----------------------------
class LoginIn(BaseModel):
    mobile: str
    password: str


class BranchIn(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    report_phones: Optional[str] = ""


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
    preferred_language: Optional[str] = "en"
    whatsapp_enabled: Optional[bool] = True


class MergeCustomerIn(BaseModel):
    source_customer_id: str
    target_customer_id: str


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
    is_outsourced: bool = False
    vendor_name: Optional[str] = ""
    vendor_phone: Optional[str] = ""
    vendor_rate_per_kg: float = 0.0


class MachineStatusUpdate(BaseModel):
    status: str


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[float] = None
    status: Optional[str] = None
    branch_id: Optional[str] = None
    is_outsourced: Optional[bool] = None
    vendor_name: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_rate_per_kg: Optional[float] = None


class BatchLoadItem(BaseModel):
    batch_id: str
    load_weight: Optional[float] = None
    load_bags: Optional[int] = None


class MachineLoadIn(BaseModel):
    batch_ids: Optional[List[str]] = None
    loads: Optional[List[BatchLoadItem]] = None
    start_time: Optional[str] = None


class MachineStopIn(BaseModel):
    end_time: Optional[str] = None
    total_dry_weight: Optional[float] = None
    total_padi_weight: Optional[float] = None
    total_dry_bags: Optional[int] = None
    batch_outputs: Optional[List[Dict[str, Any]]] = None  # [{ "batch_id": ..., "dry_weight": ..., "padi_weight": ..., "bags": ... }]


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
    allow_duplicate: Optional[bool] = False


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
    arrival_date: Optional[str] = None
    received_from: Optional[str] = ""
    allow_duplicate: Optional[bool] = False


class BatchUpdate(BaseModel):
    arrival_date: Optional[str] = None
    processing_started_at: Optional[str] = None
    processing_ended_at: Optional[str] = None
    delivered_at: Optional[str] = None
    raw_weight: Optional[float] = None
    rate_per_kg: Optional[float] = None
    bags: Optional[int] = None
    customer_id: Optional[str] = None
    product_id: Optional[str] = None
    remarks: Optional[str] = None
    received_from: Optional[str] = None
    machine_id: Optional[str] = None
    status: Optional[str] = None


class SplitLotAdjustment(BaseModel):
    batch_id: str
    raw_weight: float
    machine_id: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


class AdjustSplitIn(BaseModel):
    lots: List[SplitLotAdjustment]


class BatchStatusUpdate(BaseModel):
    status: str  # Loaded, Drying, Completed
    remarks: Optional[str] = ""
    machine_id: Optional[str] = None  # required when transitioning to Loaded
    actual_dry_weight: Optional[float] = None
    padi_weight: Optional[float] = None
    processed_bags: Optional[int] = None
    processing_started_at: Optional[str] = None
    processing_ended_at: Optional[str] = None


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
    deliver_siblings: Optional[bool] = False  # deliver all split lots in arrival together
    delivery_date: Optional[str] = None


class PaymentIn(BaseModel):
    batch_id: Optional[str] = None
    customer_id: Optional[str] = None
    branch_id: Optional[str] = None
    amount: float
    mode: str  # Cash, UPI, Bank, Credit
    remarks: Optional[str] = ""
    created_at: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    mode: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[str] = None


class SaleIn(BaseModel):
    customer_id: str
    branch_id: str
    item_name: str
    quantity: float
    rate: float
    amount: float
    payment_mode: str
    remarks: Optional[str] = ""
    sale_date: Optional[str] = None


class ExpenseIn(BaseModel):
    category: str
    amount: float
    vendor: Optional[str] = ""
    payment_mode: Optional[str] = "Cash"
    bill_photo: Optional[str] = ""
    bill_photos: Optional[List[str]] = []
    remarks: Optional[str] = ""
    expense_date: Optional[str] = None
    branch_id: Optional[str] = None
    machine_id: Optional[str] = None


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    vendor: Optional[str] = None
    payment_mode: Optional[str] = None
    bill_photos: Optional[List[str]] = None
    remarks: Optional[str] = None
    expense_date: Optional[str] = None
    branch_id: Optional[str] = None
    machine_id: Optional[str] = None


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
    "Packing", "Salary", "Tea", "Office Expense", "Outsourced Drying", "Miscellaneous",
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
    # Add report_phones column to public.branches for automated daily WhatsApp status reports
    await db.execute("""
        ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS report_phones TEXT DEFAULT '';
    """)
    # Add bill_photos TEXT[] DEFAULT '{}' column to public.expenses if not exists
    await db.execute("""
        ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS bill_photos TEXT[] DEFAULT '{}';
    """)
    # Add machine_id column to public.expenses for tracking outsourced dryer payouts
    await db.execute("""
        ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL;
    """)
    # Add is_split and parent_batch_id columns to public.batches for multi-machine split arrivals
    await db.execute("""
        ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE;
    """)
    await db.execute("""
        ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS parent_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL;
        ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
        ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS processing_ended_at TIMESTAMPTZ;
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
    exp_cats_doc = await db.settings.find_one({"key": "expense_categories"})
    if not exp_cats_doc:
        await db.settings.insert_one({
            "key": "expense_categories", "value": DEFAULT_EXPENSE_CATS,
        })
    else:
        existing_cats = list(exp_cats_doc.get("value") or [])
        if "Outsourced Drying" not in existing_cats:
            existing_cats.append("Outsourced Drying")
            await db.settings.update_one(
                {"key": "expense_categories"},
                {"$set": {"value": existing_cats}}
            )
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
    # Seed default daily WhatsApp report settings if not exist
    daily_rep_doc = await db.settings.find_one({"key": "daily_report_settings"})
    if not daily_rep_doc:
        await db.settings.insert_one({
            "key": "daily_report_settings",
            "value": {
                "enabled": True,
                "send_time": "21:00",
                "admin_phones": "",
                "include_financials": True,
                "last_sent_date": ""
            }
        })


async def daily_report_scheduler_worker():
    """Background worker that runs every 60 seconds to check if current IST time matches the configured daily WhatsApp status report time."""
    logger.info("Daily WhatsApp status report scheduler worker started.")
    while True:
        try:
            await asyncio.sleep(60)
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            now_ist = datetime.now(timezone.utc).astimezone(ist_tz)
            now_hm = now_ist.strftime("%H:%M")
            today_str = now_ist.strftime("%Y-%m-%d")

            d_doc = await db.settings.find_one({"key": "daily_report_settings"})
            settings = (d_doc or {}).get("value") or {}
            enabled = settings.get("enabled", True)
            send_time = settings.get("send_time", "21:00")
            last_sent_date = settings.get("last_sent_date", "")

            # Trigger if enabled, current time has reached or passed scheduled send_time, and not yet sent today
            if enabled and now_hm >= send_time and last_sent_date != today_str:
                logger.info(f"Triggering scheduled daily WhatsApp status reports at {now_hm} IST for date {today_str} (configured send_time: {send_time})...")
                # Immediately mark last_sent_date BEFORE dispatching to prevent duplicate triggers from concurrent workers/instances
                settings["last_sent_date"] = today_str
                await db.settings.update_one(
                    {"key": "daily_report_settings"},
                    {"$set": {"value": settings}}
                )
                await dispatch_daily_reports()
                logger.info(f"Scheduled daily WhatsApp status reports dispatched successfully for date {today_str}.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in daily_report_scheduler_worker: {e}")


async def db_keepalive_worker():
    """Background worker that pings the database and self-pings host every 8 minutes to prevent idle connection closure and cold starts."""
    while True:
        try:
            await asyncio.sleep(480)
            if db.pool:
                await db.query("SELECT 1;")
                logger.info("Database keep-alive ping successful.")
            render_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("BACKEND_SELF_URL") or "https://ecpu.onrender.com"
            if render_url:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.get(f"{render_url.rstrip('/')}/health")
                    logger.info("Self-ping keep-alive successful.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Database keep-alive ping warning: {e}")


@app.get("/health")
@api.get("/health")
async def health_check():
    """Public health check for uptime monitors, Render/Railway, and Supabase keep-alive."""
    try:
        await db.query("SELECT 1 as alive;")
        return {"status": "ok", "database": "connected", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Database unreachable: {e}")


@app.on_event("startup")
async def startup():
    await db.open()
    await seed()
    app.state.keepalive_task = asyncio.create_task(db_keepalive_worker())
    app.state.daily_report_task = asyncio.create_task(daily_report_scheduler_worker())
    logger.info("EThree Agro backend started; seed, keepalive, and daily report scheduler worker active.")


@app.on_event("shutdown")
async def shutdown():
    for task_name in ["keepalive_task", "daily_report_task"]:
        task = getattr(app.state, task_name, None)
        if task:
            task.cancel()
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
    cached = fast_cache.get("static_products")
    if cached:
        return cached
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
    fast_cache.set("static_products", products, ttl_seconds=60.0)
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
    cache_key = f"static_machines:{branch_id or user.get('branch_id') or 'all'}"
    cached = fast_cache.get(cache_key)
    if cached:
        return cached

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
    fast_cache.set(cache_key, machines, ttl_seconds=10.0)
    return machines


@api.get("/machines/{mid}")
async def get_machine(mid: str, user: dict = Depends(get_current_user)):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    m["branch_name"] = branch_map.get(m.get("branch_id"), "")
    drying_batches = await db.batches.find({"machine_id": m["id"], "status": "Drying"}, {"_id": 0}).to_list(100)
    if drying_batches:
        first_b = drying_batches[0]
        first_cust = await db.customers.find_one({"id": first_b["customer_id"]}, {"_id": 0})
        m["current_batch"] = {
            "id": first_b["id"], "batch_no": first_b["batch_no"],
            "customer_name": first_cust["name"] if first_cust else "",
            "expected_delivery_date": first_b.get("expected_delivery_date"),
            "status": first_b["status"],
        }

    # Outsourcing ledger & history
    if m.get("is_outsourced"):
        # 1. Fetch batches processed in this machine
        batches = await db.query("""
            SELECT 
                b.id, b.batch_no, b.raw_weight, b.actual_dry_weight, b.estimated_dry_weight, b.status, 
                b.arrival_date, b.created_at, b.expected_delivery_date,
                c.name as customer_name, c.mobile as customer_mobile
            FROM public.batches b
            LEFT JOIN public.customers c ON b.customer_id = c.id
            WHERE b.machine_id = %s
            ORDER BY COALESCE(b.arrival_date, b.created_at) DESC, b.created_at DESC
        """, [mid])

        total_kg = round(sum(float(b.get("raw_weight") or 0) for b in (batches or [])), 2)
        rate_per_kg = float(m.get("vendor_rate_per_kg") or 0.0)
        total_cost = round(total_kg * rate_per_kg, 2)

        # 2. Fetch payouts to this vendor/machine
        vendor_name = m.get("vendor_name") or ""
        payouts = await db.query("""
            SELECT id, amount, payment_mode, expense_date, remarks, created_at
            FROM public.expenses
            WHERE machine_id = %s OR (category = 'Outsourced Drying' AND vendor ILIKE %s)
            ORDER BY expense_date DESC, created_at DESC
        """, [mid, vendor_name or m.get("name")])

        total_paid = round(sum(float(p.get("amount") or 0) for p in (payouts or [])), 2)
        balance_payable = max(0.0, round(total_cost - total_paid, 2))

        m["outsourcing_ledger"] = {
            "total_processed_kg": total_kg,
            "vendor_rate_per_kg": rate_per_kg,
            "total_job_cost": total_cost,
            "total_paid": total_paid,
            "balance_payable": balance_payable,
            "batches": batches or [],
            "payouts": payouts or [],
        }

    return m


@api.post("/machines")
async def add_machine(body: MachineIn, user: dict = Depends(require_roles("Admin", "Manager"))):
    m = {"id": str(uuid.uuid4()), "name": body.name, "capacity": body.capacity,
         "status": body.status, "current_batch_id": None,
         "branch_id": await resolve_branch_id(user, body.branch_id),
         "is_outsourced": bool(body.is_outsourced),
         "vendor_name": body.vendor_name or "",
         "vendor_phone": body.vendor_phone or "",
         "vendor_rate_per_kg": float(body.vendor_rate_per_kg or 0.0),
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
async def update_machine(mid: str, body: MachineUpdate, user: dict = Depends(require_roles("Admin", "Manager"))):
    m = await db.machines.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    upd = {}
    if body.name is not None: upd["name"] = body.name
    if body.capacity is not None: upd["capacity"] = body.capacity
    if body.status is not None: upd["status"] = body.status
    if body.branch_id is not None:
        upd["branch_id"] = body.branch_id or None
    if body.is_outsourced is not None: upd["is_outsourced"] = bool(body.is_outsourced)
    if body.vendor_name is not None: upd["vendor_name"] = body.vendor_name
    if body.vendor_phone is not None: upd["vendor_phone"] = body.vendor_phone
    if body.vendor_rate_per_kg is not None: upd["vendor_rate_per_kg"] = float(body.vendor_rate_per_kg)

    if upd:
        upd["updated_at"] = now_utc().isoformat()
        upd["updated_by"] = user["id"]
        await db.machines.update_one({"id": mid}, {"$set": upd})
        await audit("update", "machine", mid, user, m, upd)
    return {"ok": True}


@api.delete("/machines/{mid}")
async def delete_machine(mid: str, user: dict = Depends(require_roles("Admin", "Manager"))):
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
    
    # Normalize inputs: support both body.loads (with partial load weights) and legacy body.batch_ids
    load_items: List[BatchLoadItem] = []
    if body.loads:
        load_items = body.loads
    elif body.batch_ids:
        load_items = [BatchLoadItem(batch_id=bid) for bid in body.batch_ids]

    if not load_items:
        raise HTTPException(status_code=400, detail="At least one batch must be selected to load")

    t_start = body.start_time or now_utc().isoformat()
    loaded_batch_ids = []

    for item in load_items:
        b = await db.batches.find_one({"id": item.batch_id}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail=f"Batch {item.batch_id} not found")
        if b.get("branch_id") != m.get("branch_id"):
            raise HTTPException(status_code=400, detail=f"Batch {item.batch_id} belongs to a different branch")
        if b.get("status") != "Received":
            raise HTTPException(status_code=400, detail=f"Batch {item.batch_id} status must be Received")

        cur_weight = float(b.get("raw_weight") or 0)
        load_w = float(item.load_weight) if item.load_weight is not None else cur_weight

        if load_w <= 0:
            raise HTTPException(status_code=400, detail=f"Load weight for {b.get('batch_no')} must be greater than 0")
        if load_w > cur_weight + 0.001:
            raise HTTPException(status_code=400, detail=f"Load weight ({load_w} kg) cannot exceed arrival weight ({cur_weight} kg) for {b.get('batch_no')}")

        is_partial = (cur_weight - load_w) >= 0.1  # at least 100g remaining to split

        if not is_partial:
            # Full load (no split needed)
            t_load = t_start or now_utc().isoformat()
            await db.batches.update_one({"id": b["id"]}, {"$set": {
                "status": "Drying",
                "machine_id": mid,
                "processing_started_at": t_load,
                "remarks": f"Loaded in {m['name']} at {t_start}",
                "updated_at": now_utc().isoformat(),
                "updated_by": user["id"]
            }})
            loaded_batch_ids.append(b["id"])
            await audit("load_machine", "batch", b["id"], user, {"status": "Received"}, {"status": "Drying", "machine_id": mid})
        else:
            # Partial load / split on the fly!
            rem_w = round(cur_weight - load_w, 2)
            cur_bags = int(b.get("bags") or 1)

            if item.load_bags is not None and item.load_bags > 0:
                load_b = min(cur_bags, item.load_bags)
            else:
                load_b = max(1, round((load_w / cur_weight) * cur_bags))
            rem_b = max(1, cur_bags - load_b)

            base_batch_no = b["batch_no"].split("-")[0]
            base_receipt_no = (b.get("receipt_no") or "").split("-")[0]

            # Find existing sub-batches to assign sequential numbers
            existing_sub_batches = await db.query(
                "SELECT batch_no FROM public.batches WHERE batch_no LIKE %s",
                [f"{base_batch_no}%"]
            )
            existing_suffixes = []
            for row in existing_sub_batches:
                bno = str(row.get("batch_no") or "")
                if "-" in bno:
                    try:
                        existing_suffixes.append(int(bno.split("-")[-1]))
                    except ValueError:
                        pass
            max_suffix = max(existing_suffixes) if existing_suffixes else 0

            loaded_batch_no = b["batch_no"] if "-" in b["batch_no"] else f"{base_batch_no}-1"
            loaded_receipt_no = b.get("receipt_no") if "-" in (b.get("receipt_no") or "") else f"{base_receipt_no}-1"

            rem_suffix = max(max_suffix + 1, 2)
            rem_batch_no = f"{base_batch_no}-{rem_suffix}"
            rem_receipt_no = f"{base_receipt_no}-{rem_suffix}"

            # 1. Update the portion being loaded in this machine
            rate = float(b.get("rate_per_kg") or 12)
            await db.batches.update_one({"id": b["id"]}, {"$set": {
                "batch_no": loaded_batch_no,
                "receipt_no": loaded_receipt_no,
                "raw_weight": load_w,
                "bags": load_b,
                "bill_amount": round(load_w * rate, 2),
                "balance_amount": round(load_w * rate, 2) - float(b.get("total_paid") or 0),
                "status": "Drying",
                "machine_id": mid,
                "processing_started_at": t_load,
                "is_split": True,
                "parent_batch_id": b.get("parent_batch_id") or b["id"],
                "remarks": f"Split lot loaded in {m['name']} at {t_start}",
                "updated_at": now_utc().isoformat(),
                "updated_by": user["id"]
            }})
            loaded_batch_ids.append(b["id"])

            # 2. Insert remainder portion as a new Received arrival
            rem_id = str(uuid.uuid4())
            rem_bill = round(rem_w * rate, 2)
            rem_doc = {
                "id": rem_id,
                "batch_no": rem_batch_no,
                "receipt_no": rem_receipt_no,
                "qr_code": rem_batch_no,
                "customer_id": b["customer_id"],
                "product_id": b["product_id"],
                "branch_id": b.get("branch_id"),
                "raw_weight": rem_w,
                "bags": rem_b,
                "bag_weight": b.get("bag_weight") or 0,
                "estimated_dry_weight": rem_w,
                "moisture": b.get("moisture") or 0,
                "rate_per_kg": rate,
                "loading_charges": 0,
                "discount": 0,
                "advance_paid": 0,
                "total_paid": 0,
                "bill_amount": rem_bill,
                "balance_amount": rem_bill,
                "status": "Received",
                "machine_id": None,
                "is_split": True,
                "parent_batch_id": b.get("parent_batch_id") or b["id"],
                "arrival_date": b.get("arrival_date") or now_utc().isoformat(),
                "received_from": b.get("received_from"),
                "remarks": f"Split remaining from {b['batch_no']} ({rem_w} kg pending)",
                "created_at": now_utc().isoformat(),
                "created_by": user["id"],
                "updated_at": now_utc().isoformat(),
                "updated_by": user["id"],
            }
            await db.batches.insert_one(rem_doc)
            await audit("split_batch", "batch", rem_id, user, None, {
                "parent_batch_id": b["id"],
                "original_weight": cur_weight,
                "loaded_weight": load_w,
                "remainder_weight": rem_w,
                "loaded_batch_no": loaded_batch_no,
                "remainder_batch_no": rem_batch_no,
            })

    # Update machine status to Running
    await db.machines.update_one({"id": mid}, {"$set": {
        "status": "Running",
        "current_batch_id": loaded_batch_ids[0] if loaded_batch_ids else None,
        "updated_at": now_utc().isoformat(),
        "updated_by": user["id"]
    }})

    await audit("load", "machine", mid, user, None, {"batch_ids": loaded_batch_ids, "start_time": t_start})
    return {"ok": True, "loaded_batch_ids": loaded_batch_ids}


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
    batch_out_map = {str(item.get("batch_id")): item for item in (body.batch_outputs or []) if item.get("batch_id")}

    # Process each batch
    for b in drying_batches:
        upd = {
            "status": "Completed",
            "processing_ended_at": now_utc().isoformat(),
            "remarks": f"Drying completed in {m['name']} at {t_end}",
            "updated_at": now_utc().isoformat(),
            "updated_by": user["id"],
        }

        raw = float(b["raw_weight"])
        if str(b["id"]) in batch_out_map:
            item = batch_out_map[str(b["id"])]
            b_dry = round(float(item.get("dry_weight") or 0), 2)
            b_padi = round(float(item.get("padi_weight") or 0), 2)
            b_bags = int(item.get("bags") or 0)
            upd.update({
                "actual_dry_weight": b_dry,
                "padi_weight": b_padi,
                "processed_bags": b_bags,
                "weight_loss": round(raw - b_dry, 2),
            })
            tmp = dict(b)
            tmp["actual_dry_weight"] = b_dry
            tmp["padi_weight"] = b_padi
            tmp["processed_bags"] = b_bags
            totals = await recompute_batch_totals(tmp)
            upd.update(totals)
        elif body.total_dry_weight is not None:
            pct = raw / total_raw_weight
            prop_dry_weight = round(pct * body.total_dry_weight, 2)
            prop_padi_weight = round(pct * (body.total_padi_weight or 0), 2)
            prop_bags = int(round(pct * (body.total_dry_bags or 0)))

            upd.update({
                "actual_dry_weight": prop_dry_weight,
                "padi_weight": prop_padi_weight,
                "processed_bags": prop_bags,
                "weight_loss": round(raw - prop_dry_weight, 2),
            })

            tmp = dict(b)
            tmp["actual_dry_weight"] = prop_dry_weight
            tmp["padi_weight"] = prop_padi_weight
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

    # Auto-dispatch WhatsApp Drying Completed alerts to customers
    for b in drying_batches:
        try:
            cust = await db.customers.find_one({"id": b.get("customer_id")}, {"_id": 0})
            prod = await db.products.find_one({"id": b.get("product_id")}, {"_id": 0})
            br = await db.branches.find_one({"id": b.get("branch_id")}, {"_id": 0})
            
            # Fetch updated batch for weights
            updated_b = await db.batches.find_one({"id": b["id"]}, {"_id": 0}) or b
            dry_wt = updated_b.get("actual_dry_weight")
            padi_wt = updated_b.get("padi_weight") or 0.0
            
            phone = (cust.get("mobile") or cust.get("phone")) if cust else None
            if cust and phone and dry_wt and cust.get("whatsapp_enabled", True) is not False:
                asyncio.create_task(
                    send_drying_completed(
                        to_phone=phone,
                        customer_name=cust.get("name", "Valued Customer"),
                        product_name=prod.get("name", "Cardamom") if prod else "Cardamom",
                        batch_no=b.get("batch_no", ""),
                        dry_weight=float(dry_wt),
                        branch_name=br.get("name", "Main Plant") if br else "Main Plant",
                        language_code=cust.get("preferred_language") or "en",
                        padi_weight=float(padi_wt)
                    )
                )
                logger.info(f"Queued WhatsApp drying completed for {cust.get('name')} ({phone})")
        except Exception as e:
            logger.error(f"Failed to queue WhatsApp drying completed: {e}")

    await audit("stop", "machine", mid, user, None, {"end_time": t_end, "total_dry_weight": body.total_dry_weight, "total_dry_bags": body.total_dry_bags})
    return {"ok": True}


# ---------------------------- CUSTOMERS ----------------------------
@api.get("/customers")
async def list_customers(
    user: dict = Depends(get_current_user),
    q: Optional[str] = None,
    branch_id: Optional[str] = None,
    status: str = "active",
    lite: bool = False
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
    
    if lite:
        docs, branches_list = await asyncio.gather(docs_task, branches_task)
        branches = {b["id"]: b["name"] for b in branches_list}
        for doc in docs:
            doc["branch_name"] = branches.get(doc.get("branch_id"), "-")
        return docs

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


@api.post("/customers/merge")
async def merge_customers(body: MergeCustomerIn, user: dict = Depends(require_roles("Admin", "Manager"))):
    src_id = body.source_customer_id
    tgt_id = body.target_customer_id
    if src_id == tgt_id:
        raise HTTPException(status_code=400, detail="Source and target customer cannot be the same")

    src = await db.customers.find_one({"id": src_id}, {"_id": 0})
    tgt = await db.customers.find_one({"id": tgt_id}, {"_id": 0})
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="Customer not found")

    # 1. Reassign all batches from duplicate (source) to primary (target)
    await db.query(
        "UPDATE public.batches SET customer_id = %s::uuid WHERE customer_id = %s::uuid",
        [tgt_id, src_id],
        "public.batches"
    )

    # 2. Reassign all payments
    await db.query(
        "UPDATE public.payments SET customer_id = %s::uuid WHERE customer_id = %s::uuid",
        [tgt_id, src_id],
        "public.payments"
    )

    # 3. Reassign all sales
    await db.query(
        "UPDATE public.sales SET customer_id = %s::uuid WHERE customer_id = %s::uuid",
        [tgt_id, src_id],
        "public.sales"
    )

    # 4. Remove the source duplicate customer completely
    await db.customers.delete_one({"id": src_id})

    # 5. Audit log
    await audit(
        "merge", "customer", src_id, user,
        {"from": f"{src.get('name')} ({src.get('code')})"},
        {"into": f"{tgt.get('name')} ({tgt.get('code')})"}
    )

    return {
        "ok": True,
        "message": f"Successfully merged {src.get('name')} ({src.get('code')}) into {tgt.get('name')} ({tgt.get('code')})"
    }


@api.get("/customers/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Enrich with branch name
    branch = await db.branches.find_one({"id": c.get("branch_id")}, {"_id": 0}) if c.get("branch_id") else None
    c["branch_name"] = branch["name"] if branch else "-"

    # stats & complete arrivals history
    batches_sql = """
        SELECT 
            b.*,
            p.name as product_name,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE b.customer_id = %s::uuid
        ORDER BY COALESCE(b.arrival_date, b.created_at) DESC, b.created_at DESC
        LIMIT 1000
    """
    rows = await db.query(batches_sql, [cid])
    batches = []
    for r in rows:
        d = dict(r)
        for field in ["id", "customer_id", "product_id", "machine_id", "branch_id"]:
            if d.get(field):
                d[field] = str(d[field])
        if d.get("arrival_date"):
            d["arrival_date"] = d["arrival_date"].isoformat() if hasattr(d["arrival_date"], "isoformat") else str(d["arrival_date"])
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"])
        if d.get("delivered_at"):
            d["delivered_at"] = d["delivered_at"].isoformat() if hasattr(d["delivered_at"], "isoformat") else str(d["delivered_at"])
        if d.get("raw_weight") is not None:
            d["raw_weight"] = float(d["raw_weight"])
        if d.get("rate_per_kg") is not None:
            d["rate_per_kg"] = float(d["rate_per_kg"])
        if d.get("bill_amount") is not None:
            d["bill_amount"] = float(d["bill_amount"])
        if d.get("total_paid") is not None:
            d["total_paid"] = float(d["total_paid"])
        if d.get("balance_amount") is not None:
            d["balance_amount"] = float(d["balance_amount"])
        batches.append(d)

    # Fetch payments for this customer (both batch-linked and advances)
    payments_sql = """
        SELECT 
            p.id::text as id, p.amount, p.mode, p.remarks, p.created_at, p.batch_id::text as batch_id,
            b.batch_no
        FROM public.payments p
        LEFT JOIN public.batches b ON p.batch_id = b.id
        WHERE p.customer_id = %s::uuid OR b.customer_id = %s::uuid
        ORDER BY p.created_at ASC
    """
    pay_rows = await db.query(payments_sql, [cid, cid])
    payments = []
    for pr in pay_rows:
        pd = dict(pr)
        pd["amount"] = float(pd["amount"])
        if pd.get("created_at"):
            pd["created_at"] = pd["created_at"].isoformat() if hasattr(pd["created_at"], "isoformat") else str(pd["created_at"])
        payments.append(pd)

    total_visits = len(batches)
    total_weight = round(sum(b.get("raw_weight", 0) for b in batches), 2)
    total_revenue = round(sum(b.get("bill_amount", 0) for b in batches), 2)
    total_paid = round(sum(p.get("amount", 0) for p in payments), 2)
    pending_balance = round(total_revenue - total_paid, 2)
    c["stats"] = {
        "total_visits": total_visits, "total_weight": total_weight,
        "total_revenue": total_revenue, "total_paid": total_paid,
        "pending_balance": pending_balance,
    }
    c["history"] = batches
    c["payments"] = payments

    # Build full chronological double-entry accounting ledger
    ledger = []
    for b in batches:
        ledger.append({
            "id": b["id"],
            "type": "debit",
            "date": b.get("arrival_date") or b.get("created_at"),
            "ref_no": b.get("batch_no"),
            "description": f"Drying: {b.get('product_name') or 'Spice'} ({b.get('raw_weight', 0)}kg @ ₹{b.get('rate_per_kg', 0)})",
            "debit": float(b.get("bill_amount", 0)),
            "credit": 0.0,
            "mode": None,
            "remarks": b.get("remarks") or "",
        })
    for p in payments:
        ledger.append({
            "id": p["id"],
            "type": "credit",
            "date": p.get("created_at"),
            "ref_no": p.get("batch_no") or "Advance",
            "description": f"Payment ({p.get('mode')})" + (f" - {p.get('remarks')}" if p.get("remarks") else ""),
            "debit": 0.0,
            "credit": float(p.get("amount", 0)),
            "mode": p.get("mode"),
            "remarks": p.get("remarks") or "",
        })
    
    # Sort chronological
    ledger.sort(key=lambda x: str(x.get("date") or ""))
    curr_balance = 0.0
    for entry in ledger:
        curr_balance += (entry["debit"] - entry["credit"])
        entry["balance"] = round(curr_balance, 2)

    c["ledger"] = ledger
    return c


@api.post("/customers")
async def create_customer(body: CustomerIn, user: dict = Depends(get_current_user)):
    target_branch_id = await resolve_branch_id(user, body.branch_id)
    if not can_write_to_branch(user, target_branch_id):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")

    # Check for duplicate customer
    mobile = body.mobile.strip() if body.mobile else ""
    if mobile and not mobile.startswith("90001"):
        existing_mob = await db.customers.find_one({"mobile": mobile, "is_deleted": {"$ne": True}})
        if existing_mob:
            raise HTTPException(status_code=400, detail=f"Customer with mobile {mobile} already exists ({existing_mob.get('name')}, {existing_mob.get('code')})")

    existing_name = await db.customers.find_one({
        "name": body.name.strip(),
        "branch_id": target_branch_id,
        "is_deleted": {"$ne": True}
    })
    if existing_name:
        raise HTTPException(status_code=400, detail=f"Customer '{body.name}' already exists in this branch ({existing_name.get('code')})")

    while True:
        seq = await next_seq("customer")
        code = f"C{seq:04d}"
        existing_code = await db.customers.find_one({"code": code})
        if not existing_code:
            break

    c = body.dict()
    c["branch_id"] = target_branch_id
    c.update({
        "id": str(uuid.uuid4()),
        "code": code,
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
    # Allow Admins to reassign customer to a different branch; for non-admins, preserve existing branch
    if user.get("role") == "Admin":
        if body.branch_id and body.branch_id.strip():
            upd["branch_id"] = body.branch_id.strip()
        else:
            upd["branch_id"] = before.get("branch_id")
    else:
        upd["branch_id"] = before.get("branch_id")
    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]
    await db.customers.update_one({"id": cid}, {"$set": upd})
    await audit("update", "customer", cid, user,
                {"name": before.get("name"), "branch_id": before.get("branch_id")},
                {"name": upd.get("name"), "branch_id": upd.get("branch_id")})
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

async def clean_batch(b: Optional[dict], include_history: bool = True) -> Optional[dict]:
    if not b:
        return None
    # 1. Fetch status history
    if include_history:
        history = await db.query(
            "SELECT status, changed_at as at, changed_by as by, remarks FROM public.batch_status_history WHERE batch_id = %s ORDER BY changed_at ASC",
            [b["id"]], "public.batch_status_history"
        )
        b["status_history"] = history
    else:
        b["status_history"] = []
    
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
                       customer_id: Optional[str] = None,
                       start: Optional[str] = None,
                       end: Optional[str] = None,
                       has_balance: Optional[bool] = None):
    # Scoping
    where_clauses = ["1=1"]
    params = []
    
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        where_clauses.append("b.branch_id = %s::uuid")
        params.append(branch_id)
    else:
        # branch scoping from user
        role = user.get("role")
        bid = user.get("branch_id")
        if role != "Admin" and bid:
            where_clauses.append("b.branch_id = %s::uuid")
            params.append(bid)
            
    if customer_id:
        where_clauses.append("b.customer_id = %s::uuid")
        params.append(customer_id)

    if start and end:
        s_date = start[:10]
        e_date = end[:10]
        where_clauses.append("COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) <= %s::date")
        params.extend([s_date, e_date])
        
    if status:
        where_clauses.append("b.status = %s")
        params.append(status)
        
    if q:
        where_clauses.append("(b.batch_no ILIKE %s OR b.receipt_no ILIKE %s OR c.name ILIKE %s OR c.mobile ILIKE %s OR c.code ILIKE %s OR p.name ILIKE %s)")
        q_like = f"%{q}%"
        params.extend([q_like, q_like, q_like, q_like, q_like, q_like])

    limit = 500
    if has_balance:
        where_clauses.append("b.balance_amount > 0")
        limit = 5000
        
    sql = f"""
        SELECT 
            b.*,
            c.name as customer_name, c.mobile as customer_mobile, c.code as customer_code,
            p.name as product_name,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE {" AND ".join(where_clauses)}
        ORDER BY COALESCE(b.arrival_date, b.created_at) DESC, b.created_at DESC
        LIMIT {limit}
    """
    
    rows = await db.query(sql, params)
    
    docs = []
    for r in rows:
        d = dict(r)
        
        # Convert UUID fields to strings dynamically
        for field in ["id", "customer_id", "product_id", "machine_id", "branch_id"]:
            if d.get(field):
                d[field] = str(d[field])
        
        # Format customer
        if d.get("customer_id"):
            d["customer"] = {
                "id": d["customer_id"],
                "name": d.get("customer_name") or "",
                "mobile": d.get("customer_mobile") or "",
                "code": d.get("customer_code") or ""
            }
        else:
            d["customer"] = None
            
        # Format product
        if d.get("product_id"):
            d["product"] = {
                "id": d["product_id"],
                "name": d.get("product_name") or ""
            }
        else:
            d["product"] = None
            
        # Format machine
        if d.get("machine_id"):
            d["machine"] = {
                "id": d["machine_id"],
                "name": d.get("machine_name") or ""
            }
        else:
            d["machine"] = None
            
        await clean_batch(d, include_history=False)
        docs.append(d)
        
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

    # Attach sibling split batches if this arrival was split across dryers
    parent_id = b.get("parent_batch_id") or b["id"]
    base_bno = b["batch_no"].split("-")[0] if "-" in (b.get("batch_no") or "") else b.get("batch_no")
    sibling_sql = """
        SELECT b2.id::text, b2.batch_no, b2.raw_weight, b2.status, b2.machine_id::text, m.name as machine_name, b2.actual_dry_weight,
               b2.arrival_date, b2.processing_started_at, b2.processing_ended_at
        FROM public.batches b2
        LEFT JOIN public.machines m ON b2.machine_id = m.id
        WHERE (b2.parent_batch_id = %s OR b2.id = %s OR (b2.customer_id = %s AND b2.batch_no LIKE %s))
        ORDER BY b2.batch_no ASC
    """
    sibling_rows = await db.query(sibling_sql, [parent_id, parent_id, b["customer_id"], f"{base_bno}%"])
    if sibling_rows and len(sibling_rows) > 1:
        b["is_split"] = True
        b["total_arrival_weight"] = round(sum(float(r.get("raw_weight") or 0) for r in sibling_rows), 2)
        b["sibling_batches"] = [
            {
                "id": str(r["id"]),
                "batch_no": r["batch_no"],
                "raw_weight": float(r.get("raw_weight") or 0),
                "status": r.get("status"),
                "machine_id": str(r["machine_id"]) if r.get("machine_id") else None,
                "machine_name": r.get("machine_name") or "Unassigned",
                "actual_dry_weight": float(r["actual_dry_weight"]) if r.get("actual_dry_weight") is not None else None,
                "arrival_date": r.get("arrival_date").isoformat() if r.get("arrival_date") else None,
                "processing_started_at": r.get("processing_started_at").isoformat() if r.get("processing_started_at") else None,
                "processing_ended_at": r.get("processing_ended_at").isoformat() if r.get("processing_ended_at") else None,
            }
            for r in sibling_rows
        ]
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
    est_dry = body.raw_weight
    bill_amount = round(est_dry * body.rate_per_kg, 2)
    b = body.dict()
    b["branch_id"] = await resolve_branch_id(user, b.get("branch_id"))
    if not can_write_to_branch(user, b["branch_id"]):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")

    # Duplicate entry prevention
    if not body.allow_duplicate:
        check_date = (b.get("arrival_date") or now_utc().isoformat())[:10]
        dup_sql = """
            SELECT b.id, b.batch_no, b.receipt_no, b.raw_weight, b.arrival_date,
                   c.name as customer_name, p.name as product_name
            FROM public.batches b
            LEFT JOIN public.customers c ON b.customer_id = c.id
            LEFT JOIN public.products p ON b.product_id = p.id
            WHERE b.branch_id = %s
              AND b.customer_id = %s
              AND b.product_id = %s
              AND b.raw_weight = %s
              AND b.arrival_date::date = %s::date
            LIMIT 1
        """
        dup_rows = await db.query(dup_sql, [b["branch_id"], body.customer_id, body.product_id, body.raw_weight, check_date])
        if dup_rows:
            dup = dict(dup_rows[0])
            cust_name = dup.get("customer_name") or "Customer"
            prod_name = dup.get("product_name") or "Produce"
            bno = dup.get("batch_no") or ""
            rno = dup.get("receipt_no") or ""
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate arrival detected! An entry for {cust_name} ({prod_name}, {body.raw_weight} kg) on {check_date} already exists as Batch {bno} (Receipt {rno})."
            )
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
            "customer_id": b.get("customer_id"),
            "branch_id": b.get("branch_id"),
            "created_at": now_utc().isoformat(), "created_by": user["id"],
        }
        await db.payments.insert_one(dict(pay))
        totals = await recompute_batch_totals(b)
        await db.batches.update_one({"id": bid}, {"$set": totals})

    await audit("create", "batch", bid, user, None, {"batch_no": b["batch_no"]})

    # Auto-dispatch WhatsApp stock arrival receipt
    try:
        cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
        prod = await db.products.find_one({"id": body.product_id}, {"_id": 0})
        br = await db.branches.find_one({"id": b["branch_id"]}, {"_id": 0})
        phone = (cust.get("mobile") or cust.get("phone")) if cust else None
        if cust and phone and cust.get("whatsapp_enabled", True) is not False:
            asyncio.create_task(
                send_arrival_receipt(
                    to_phone=phone,
                    customer_name=cust.get("name", "Valued Customer"),
                    product_name=prod.get("name", "Cardamom") if prod else "Cardamom",
                    branch_name=br.get("name", "Main Plant") if br else "Main Plant",
                    batch_no=b["batch_no"],
                    raw_weight=float(body.raw_weight),
                    bags=int(body.bags or 0),
                    arrival_time=b.get("arrival_date") or b.get("created_at"),
                    language_code=cust.get("preferred_language") or "en"
                )
            )
            logger.info(f"Queued WhatsApp arrival receipt for {cust.get('name')} ({phone})")
    except Exception as e:
        logger.error(f"Failed to queue WhatsApp arrival: {e}")

    return clean(await clean_batch(b))


@api.get("/arrivals/check-duplicate")
async def check_arrival_duplicate(
    customer_id: str,
    product_id: str,
    raw_weight: float,
    branch_id: Optional[str] = None,
    arrival_date: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Check if an arrival with same branch, customer, product, weight, and arrival date already exists."""
    bid = await resolve_branch_id(user, branch_id)
    check_date = (arrival_date or now_utc().isoformat())[:10]
    dup_sql = """
        SELECT b.id, b.batch_no, b.receipt_no, b.raw_weight, b.arrival_date, b.status,
               c.name as customer_name, p.name as product_name, br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE b.branch_id = %s
          AND b.customer_id = %s
          AND b.product_id = %s
          AND b.raw_weight = %s
          AND b.arrival_date::date = %s::date
        LIMIT 1
    """
    rows = await db.query(dup_sql, [bid, customer_id, product_id, raw_weight, check_date])
    if rows:
        dup = dict(rows[0])
        return {
            "is_duplicate": True,
            "existing_batch": {
                "id": str(dup["id"]),
                "batch_no": dup.get("batch_no"),
                "receipt_no": dup.get("receipt_no"),
                "raw_weight": float(dup.get("raw_weight") or 0),
                "customer_name": dup.get("customer_name"),
                "product_name": dup.get("product_name"),
                "branch_name": dup.get("branch_name"),
                "arrival_date": str(dup.get("arrival_date"))[:10],
                "status": dup.get("status"),
            },
            "message": f"Duplicate detected: Batch {dup.get('batch_no')} for {dup.get('customer_name')} ({dup.get('product_name')}, {raw_weight} kg) on {check_date} already exists."
        }
    return {"is_duplicate": False}


@api.post("/arrivals")
async def create_arrival(body: ArrivalIn, user: dict = Depends(get_current_user)):
    """Simplified arrival entry — captures only customer/product/weight/bags/photos.
    Machine is assigned later at 'Load' stage. Rate defaults to ₹12/kg per spec."""
    if body.raw_weight <= 0:
        raise HTTPException(status_code=400, detail="Weight must be > 0")

    branch_id = await resolve_branch_id(user, body.branch_id)
    if not can_write_to_branch(user, branch_id):
        raise HTTPException(status_code=403, detail="Cannot create in this branch")

    created_at = now_utc().isoformat()
    arrival_date = body.arrival_date or created_at

    # Duplicate entry prevention
    if not body.allow_duplicate:
        check_date = arrival_date[:10]
        dup_sql = """
            SELECT b.id, b.batch_no, b.receipt_no, b.raw_weight, b.arrival_date,
                   c.name as customer_name, p.name as product_name
            FROM public.batches b
            LEFT JOIN public.customers c ON b.customer_id = c.id
            LEFT JOIN public.products p ON b.product_id = p.id
            WHERE b.branch_id = %s
              AND b.customer_id = %s
              AND b.product_id = %s
              AND b.raw_weight = %s
              AND b.arrival_date::date = %s::date
            LIMIT 1
        """
        dup_rows = await db.query(dup_sql, [branch_id, body.customer_id, body.product_id, body.raw_weight, check_date])
        if dup_rows:
            dup = dict(dup_rows[0])
            cust_name = dup.get("customer_name") or "Customer"
            prod_name = dup.get("product_name") or "Produce"
            bno = dup.get("batch_no") or ""
            rno = dup.get("receipt_no") or ""
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate arrival detected! An entry for {cust_name} ({prod_name}, {body.raw_weight} kg) on {check_date} already exists as Batch {bno} (Receipt {rno})."
            )

    seq = await next_seq("batch")
    rseq = await next_seq("receipt")
    bid = str(uuid.uuid4())
    est_dry = body.raw_weight
    bill_amount = round(est_dry * body.rate_per_kg, 2)

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

    # Auto-dispatch WhatsApp stock arrival receipt
    try:
        cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
        prod = await db.products.find_one({"id": body.product_id}, {"_id": 0})
        br = await db.branches.find_one({"id": branch_id}, {"_id": 0})
        phone = (cust.get("mobile") or cust.get("phone")) if cust else None
        if cust and phone and cust.get("whatsapp_enabled", True) is not False:
            asyncio.create_task(
                send_arrival_receipt(
                    to_phone=phone,
                    customer_name=cust.get("name", "Valued Customer"),
                    product_name=prod.get("name", "Cardamom") if prod else "Cardamom",
                    branch_name=br.get("name", "Main Plant") if br else "Main Plant",
                    batch_no=b["batch_no"],
                    raw_weight=float(body.raw_weight),
                    bags=int(body.bags or 0),
                    arrival_time=b.get("arrival_date") or b.get("created_at"),
                    language_code=cust.get("preferred_language") or "en"
                )
            )
            logger.info(f"Queued WhatsApp arrival receipt for {cust.get('name')} ({phone})")
    except Exception as e:
        logger.error(f"Failed to queue WhatsApp arrival: {e}")

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

    try:
        await db.execute("""
            INSERT INTO public.batch_status_history (id, batch_id, status, changed_at, changed_by, remarks)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, [str(uuid.uuid4()), bid, body.status, now_utc().isoformat(), user["id"], body.remarks or ""])
    except Exception as e:
        logger.warning(f"Could not record batch_status_history: {e}")

    upd = {"status": body.status, "updated_at": now_utc().isoformat(), "updated_by": user["id"]}

    # Machine linkage — allow assignment at Load / Drying step
    machine_id = b.get("machine_id")
    if body.status in ("Loaded", "Drying"):
        if not b.get("processing_started_at"):
            upd["processing_started_at"] = body.processing_started_at or now_utc().isoformat()
        if body.machine_id:
            machine_id = body.machine_id
            upd["machine_id"] = machine_id
        if not machine_id and body.status == "Loaded":
            raise HTTPException(status_code=400, detail="Machine required to load batch")
        if machine_id:
            await db.machines.update_one({"id": machine_id},
                                         {"$set": {"status": "Running", "current_batch_id": bid}})
    elif body.status == "Completed":
        upd["processing_ended_at"] = body.processing_ended_at or now_utc().isoformat()
        if not b.get("processing_started_at"):
            upd["processing_started_at"] = b.get("created_at") or now_utc().isoformat()
        if machine_id:
            # Check if any OTHER active batches are still drying in this machine before marking machine Available
            other_active = await db.query(
                "SELECT id FROM public.batches WHERE machine_id::text = %s AND status = 'Drying' AND id::text != %s LIMIT 1",
                [str(machine_id), str(bid)]
            )
            if not other_active:
                await db.machines.update_one({"id": machine_id},
                                             {"$set": {"status": "Available", "current_batch_id": None}})
        if body.actual_dry_weight is not None and body.actual_dry_weight > 0:
            upd["actual_dry_weight"] = body.actual_dry_weight
            raw = float(b.get("raw_weight") or 0)
            padi = float(body.padi_weight or 0)
            upd["padi_weight"] = padi
            upd["processed_bags"] = body.processed_bags or 0
            upd["weight_loss"] = round(raw - body.actual_dry_weight, 2)

            tmp = dict(b)
            tmp["actual_dry_weight"] = body.actual_dry_weight
            tmp["padi_weight"] = padi
            tmp["processed_bags"] = body.processed_bags or 0
            totals = await recompute_batch_totals(tmp)
            upd.update(totals)
    elif body.status == "Delivered":
        if machine_id:
            await db.machines.update_one({"id": machine_id},
                                         {"$set": {"status": "Available", "current_batch_id": None}})

    await db.batches.update_one({"id": bid}, {"$set": upd})
    await audit("update_status", "batch", bid, user, {"status": b["status"]}, {"status": body.status})

    # Dispatch WhatsApp alert when processing completes
    if body.status == "Completed":
        try:
            cust = await db.customers.find_one({"id": b.get("customer_id")}, {"_id": 0})
            prod = await db.products.find_one({"id": b.get("product_id")}, {"_id": 0})
            br = await db.branches.find_one({"id": b.get("branch_id")}, {"_id": 0})
            dry_wt = upd.get("actual_dry_weight") or b.get("actual_dry_weight")
            padi_wt = upd.get("padi_weight") if "padi_weight" in upd else (b.get("padi_weight") or 0.0)
            phone = (cust.get("mobile") or cust.get("phone")) if cust else None
            if cust and phone and dry_wt and cust.get("whatsapp_enabled", True) is not False:
                asyncio.create_task(
                    send_drying_completed(
                        to_phone=phone,
                        customer_name=cust.get("name", "Valued Customer"),
                        product_name=prod.get("name", "Cardamom") if prod else "Cardamom",
                        batch_no=b.get("batch_no", ""),
                        dry_weight=float(dry_wt),
                        branch_name=br.get("name", "Main Plant") if br else "Main Plant",
                        language_code=cust.get("preferred_language") or "en",
                        padi_weight=float(padi_wt)
                    )
                )
                logger.info(f"Queued WhatsApp drying completed alert for {cust.get('name')} ({phone})")
        except Exception as e:
            logger.error(f"Failed to queue WhatsApp drying completed: {e}")

    return {"ok": True}


@api.post("/batches/{bid}/delivery")
async def deliver_batch(bid: str, body: DeliveryIn,
                        user: dict = Depends(get_current_user)):
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    if b.get("status") not in ("Completed", "Delivered"):
        raise HTTPException(
            status_code=400,
            detail=f"Batch cannot be delivered until processing is Completed (currently {b.get('status')})"
        )
    if body.actual_dry_weight <= 0:
        raise HTTPException(status_code=400, detail="Dry weight must be > 0")

    # Rate override allowed at delivery
    if body.rate_per_kg and body.rate_per_kg > 0:
        await db.batches.update_one({"id": bid}, {"$set": {"rate_per_kg": body.rate_per_kg}})
        b["rate_per_kg"] = body.rate_per_kg

    weight_loss = round(float(b["raw_weight"]) - float(body.actual_dry_weight), 2)
    deliv_time = body.delivery_date or now_utc().isoformat()
    delivery = {
        "actual_dry_weight": body.actual_dry_weight,
        "processed_bags": body.processed_bags or 0,
        "weight_loss": weight_loss,
        "delivery_date": deliv_time,
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
            "customer_id": b.get("customer_id"),
            "branch_id": b.get("branch_id"),
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

    # If deliver_siblings requested, deliver all sibling batches in the split arrival together
    combined_batch_no = b.get("batch_no", "")
    combined_delivered_weight = float(body.actual_dry_weight)
    combined_bill = float(totals.get("bill_amount") or 0)
    combined_balance = float(totals.get("balance_amount") or 0)

    if body.deliver_siblings:
        parent_id = b.get("parent_batch_id") or b["id"]
        base_bno = b["batch_no"].split("-")[0] if "-" in (b.get("batch_no") or "") else b.get("batch_no")
        sibling_sql = """
            SELECT id::text, batch_no, raw_weight, actual_dry_weight, processed_bags, status, machine_id::text, bill_amount, total_paid, balance_amount, rate_per_kg
            FROM public.batches
            WHERE (parent_batch_id = %s OR id = %s OR (customer_id = %s AND batch_no LIKE %s)) AND id != %s
            ORDER BY batch_no ASC
        """
        siblings = await db.query(sibling_sql, [parent_id, parent_id, b["customer_id"], f"{base_bno}%", bid])
        if siblings:
            # SAFETY PROTECTION: Active drying machines must NEVER be closed prematurely!
            incomplete = [s["batch_no"] for s in siblings if s.get("status") not in ("Completed", "Delivered")]
            if incomplete:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot deliver combined: Split lot(s) {', '.join(incomplete)} are still drying in machines or pending. Active drying lots cannot be closed automatically. Please wait until all dryers complete drying, or deliver this lot individually."
                )

            combined_batch_no = f"{base_bno} ({len(siblings) + 1} Lots)"
            for sb in siblings:
                if sb.get("status") != "Completed":
                    continue
                sb_id = sb["id"]
                sb_dry = float(sb.get("actual_dry_weight") or 0)
                combined_delivered_weight += sb_dry
                sb_upd = {
                    "status": "Delivered",
                    "delivered_at": delivery["delivery_date"],
                    "received_by": delivery["received_by"],
                    "received_by_phone": delivery["received_by_phone"],
                    "signature": delivery["signature"],
                    "delivery_remarks": delivery["remarks"],
                    "updated_at": now_utc().isoformat(),
                    "updated_by": user["id"],
                }
                if body.rate_per_kg:
                    sb_upd["rate_per_kg"] = body.rate_per_kg
                sb_full = await db.batches.find_one({"id": sb_id}, {"_id": 0})
                if sb_full:
                    sb_totals = await recompute_batch_totals({**sb_full, **sb_upd})
                    sb_upd.update(sb_totals)
                    combined_bill += float(sb_totals.get("bill_amount") or 0)
                    combined_balance += float(sb_totals.get("balance_amount") or 0)
                await db.batches.update_one({"id": sb_id}, {"$set": sb_upd})
                if sb.get("machine_id"):
                    await db.machines.update_one({"id": sb["machine_id"]},
                                                 {"$set": {"status": "Available", "current_batch_id": None}})
            combined_delivered_weight = round(combined_delivered_weight, 2)
            combined_bill = round(combined_bill, 2)
            combined_balance = round(combined_balance, 2)

    # Auto-dispatch WhatsApp Delivery Statement with full financial breakdown
    try:
        cust = await db.customers.find_one({"id": b.get("customer_id")}, {"_id": 0})
        prod = await db.products.find_one({"id": b.get("product_id")}, {"_id": 0})
        br = await db.branches.find_one({"id": b.get("branch_id")}, {"_id": 0})
        branch_name = br.get("name", "Main Plant") if br else "Main Plant"

        # Delivered to person name and phone if captured
        delivered_to = (body.received_by or "").strip()
        if body.received_by_phone and body.received_by_phone.strip():
            delivered_to = f"{delivered_to} ({body.received_by_phone.strip()})"
        if not delivered_to:
            delivered_to = cust.get("name", "Customer") if cust else "Customer"
        
        # Calculate customer overall pending
        cust_batches = await db.batches.find({"customer_id": b.get("customer_id")}, {"_id": 0, "balance_amount": 1}).to_list(1000)
        overall_pending = sum(float(cb.get("balance_amount") or 0) for cb in cust_batches)

        phone = (cust.get("mobile") or cust.get("phone")) if cust else None
        if cust and phone and cust.get("whatsapp_enabled", True) is not False:
            asyncio.create_task(
                send_delivery_statement(
                    to_phone=phone,
                    customer_name=cust.get("name", "Valued Customer"),
                    product_name=prod.get("name", "Cardamom") if prod else "Cardamom",
                    batch_no=combined_batch_no,
                    delivered_weight=combined_delivered_weight,
                    delivered_to=delivered_to,
                    bill_amount=combined_bill,
                    amount_received=float(body.amount_received or 0),
                    batch_pending=combined_balance,
                    overall_pending=float(overall_pending),
                    branch_name=branch_name,
                    language_code=cust.get("preferred_language") or "en"
                )
            )
            logger.info(f"Queued WhatsApp delivery statement for {cust.get('name')} ({phone})")
    except Exception as e:
        logger.error(f"Failed to queue WhatsApp delivery statement: {e}")

    fast_cache.clear()
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

    if body.processing_started_at is not None:
        upd["processing_started_at"] = body.processing_started_at
    if body.processing_ended_at is not None:
        upd["processing_ended_at"] = body.processing_ended_at
    if body.delivered_at is not None:
        upd["delivered_at"] = body.delivered_at

    if body.raw_weight is not None and body.raw_weight > 0:
        upd["raw_weight"] = float(body.raw_weight)
        upd["estimated_dry_weight"] = float(body.raw_weight)
        if b.get("status") == "Delivered":
            upd["actual_dry_weight"] = float(body.raw_weight)

    if body.rate_per_kg is not None and body.rate_per_kg > 0:
        upd["rate_per_kg"] = float(body.rate_per_kg)

    if body.bags is not None and body.bags >= 0:
        upd["bags"] = int(body.bags)

    if body.customer_id is not None:
        upd["customer_id"] = body.customer_id

    if body.product_id is not None:
        upd["product_id"] = body.product_id

    if body.remarks is not None:
        upd["remarks"] = body.remarks

    if body.received_from is not None:
        upd["received_from"] = body.received_from

    if body.machine_id is not None:
        new_mid = body.machine_id.strip() if body.machine_id else None
        upd["machine_id"] = new_mid
        old_mid = b.get("machine_id")
        if new_mid:
            await db.machines.update_one({"id": new_mid}, {"$set": {"status": "Running", "current_batch_id": bid}})
            if b.get("status") == "Received" and not body.status:
                upd["status"] = "Drying"
        elif old_mid:
            other = await db.query(
                "SELECT id FROM public.batches WHERE machine_id::text = %s AND status = 'Drying' AND id::text != %s LIMIT 1",
                [str(old_mid), str(bid)]
            )
            if not other:
                await db.machines.update_one({"id": old_mid}, {"$set": {"status": "Available", "current_batch_id": None}})

    if body.status is not None:
        allowed = {"Received", "Loaded", "Drying", "Completed", "Delivered"}
        if body.status in allowed:
            upd["status"] = body.status
            if body.status in ("Loaded", "Drying"):
                target_mid = upd.get("machine_id") or b.get("machine_id")
                if target_mid:
                    await db.machines.update_one({"id": target_mid}, {"$set": {"status": "Running", "current_batch_id": bid}})
            elif body.status in ("Completed", "Delivered", "Received"):
                curr_mid = b.get("machine_id")
                if curr_mid:
                    other = await db.query(
                        "SELECT id FROM public.batches WHERE machine_id::text = %s AND status = 'Drying' AND id::text != %s LIMIT 1",
                        [str(curr_mid), str(bid)]
                    )
                    if not other:
                        await db.machines.update_one({"id": curr_mid}, {"$set": {"status": "Available", "current_batch_id": None}})

    # Recalculate bill and balance if weight or rate changed
    new_weight = upd.get("raw_weight", b.get("raw_weight", 0))
    new_rate = upd.get("rate_per_kg", b.get("rate_per_kg", 10))
    loading = b.get("loading_charges", 0)
    discount = b.get("discount", 0)
    new_bill = round((float(new_weight) * float(new_rate)) + float(loading) - float(discount), 2)
    upd["bill_amount"] = new_bill
    total_paid = float(b.get("total_paid", 0))
    upd["balance_amount"] = round(new_bill - total_paid, 2)

    if not upd:
        return {"ok": True}

    upd["updated_at"] = now_utc().isoformat()
    upd["updated_by"] = user["id"]

    await db.batches.update_one({"id": bid}, {"$set": upd})
    fast_cache.clear()
    await audit("update_batch", "batch", bid, user, b, upd)
    return {"ok": True}


@api.post("/batches/{bid}/adjust-split")
async def adjust_split_batches(
    bid: str,
    body: AdjustSplitIn,
    user: dict = Depends(get_current_user)
):
    """Adjust split weights and machine assignments across sibling sub-lots of an arrival."""
    b = await db.batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not can_write_to_branch(user, b.get("branch_id")):
        raise HTTPException(status_code=403, detail="Forbidden")

    for item in body.lots:
        target = await db.batches.find_one({"id": item.batch_id}, {"_id": 0})
        if not target:
            continue
        upd = {}
        if item.raw_weight is not None and item.raw_weight > 0:
            upd["raw_weight"] = float(item.raw_weight)
            upd["estimated_dry_weight"] = float(item.raw_weight)
            rate = float(target.get("rate_per_kg") or 12)
            new_bill = round(float(item.raw_weight) * rate, 2)
            upd["bill_amount"] = new_bill
            total_paid = float(target.get("total_paid") or 0)
            upd["balance_amount"] = round(new_bill - total_paid, 2)

        if item.machine_id is not None:
            new_mid = item.machine_id.strip() if item.machine_id else None
            upd["machine_id"] = new_mid
            old_mid = target.get("machine_id")
            if new_mid:
                upd["status"] = "Drying"
                await db.machines.update_one({"id": new_mid}, {"$set": {"status": "Running", "current_batch_id": item.batch_id}})
            elif old_mid:
                other = await db.query(
                    "SELECT id FROM public.batches WHERE machine_id::text = %s AND status = 'Drying' AND id::text != %s LIMIT 1",
                    [str(old_mid), str(item.batch_id)]
                )
                if not other:
                    await db.machines.update_one({"id": old_mid}, {"$set": {"status": "Available", "current_batch_id": None}})

        if item.status:
            upd["status"] = item.status

        if item.remarks:
            upd["remarks"] = item.remarks

        if upd:
            upd["updated_at"] = now_utc().isoformat()
            upd["updated_by"] = user["id"]
            await db.batches.update_one({"id": item.batch_id}, {"$set": upd})
            await audit("adjust_split", "batch", item.batch_id, user, target, upd)

    fast_cache.clear()
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
async def list_payments(
    user: dict = Depends(get_current_user),
    branch_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None
):
    # Filter by user's branch (or requested branch_id if allowed) by joining on batch
    target_branch = branch_id
    if target_branch:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != target_branch:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if user.get("role") != "Admin":
            target_branch = user.get("branch_id")

    where_clauses = ["1=1"]
    params = []
    
    if target_branch:
        where_clauses.append("(p.branch_id = %s OR b.branch_id = %s)")
        params.extend([target_branch, target_branch])

    if customer_id:
        where_clauses.append("(p.customer_id = %s::uuid OR b.customer_id = %s::uuid)")
        params.extend([customer_id, customer_id])
        
    if start:
        where_clauses.append("p.created_at >= %s")
        params.append(start + "T00:00:00")
    if end:
        where_clauses.append("p.created_at <= %s")
        params.append(end + "T23:59:59.999999")
        
    sql = f"""
        SELECT 
            p.id::text as id, p.amount, p.mode, p.remarks, p.created_at, p.updated_at,
            p.batch_id::text as batch_id, p.customer_id::text as customer_id, p.branch_id::text as branch_id,
            b.batch_no,
            COALESCE(c.name, cb.name) as customer_name,
            COALESCE(c.code, cb.code) as customer_code,
            COALESCE(c.mobile, cb.mobile) as customer_mobile,
            COALESCE(br.name, brb.name) as branch_name
        FROM public.payments p
        LEFT JOIN public.batches b ON p.batch_id = b.id
        LEFT JOIN public.customers c ON p.customer_id = c.id
        LEFT JOIN public.customers cb ON b.customer_id = cb.id
        LEFT JOIN public.branches br ON p.branch_id = br.id
        LEFT JOIN public.branches brb ON b.branch_id = brb.id
        WHERE {" AND ".join(where_clauses)}
        ORDER BY p.created_at DESC
        LIMIT 2000
    """
    
    rows = await db.query(sql, params)
    
    docs = []
    for r in rows:
        d = dict(r)
        if not d.get("batch_id"):
            d["batch_no"] = "Advance"
        docs.append(d)
        
    return docs


@api.post("/payments")
async def add_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
        
    created_time = body.created_at if body.created_at else now_utc().isoformat()

    if body.batch_id:
        b = await db.batches.find_one({"id": body.batch_id}, {"_id": 0})
        if not b:
            raise HTTPException(status_code=404, detail="Batch not found")
        p = {
            "id": str(uuid.uuid4()), "batch_id": body.batch_id, "amount": body.amount,
            "mode": body.mode, "remarks": body.remarks or "",
            "customer_id": b.get("customer_id"),
            "branch_id": b.get("branch_id"),
            "created_at": created_time, "created_by": user["id"],
            "updated_at": now_utc().isoformat(), "updated_by": user["id"],
        }
        await db.payments.insert_one(dict(p))
        totals = await recompute_batch_totals(b)
        await db.batches.update_one({"id": body.batch_id}, {"$set": totals})
        await audit("create", "payment", p["id"], user, None, {"amount": p["amount"], "mode": p["mode"]})

        # Auto-dispatch WhatsApp payment receipt
        try:
            cid = b.get("customer_id")
            cust = await db.customers.find_one({"id": cid}, {"_id": 0})
            br = await db.branches.find_one({"id": b.get("branch_id")}, {"_id": 0})
            branch_name = br.get("name", "Main Plant") if br else "Main Plant"
            phone = (cust.get("mobile") or cust.get("phone")) if cust else None
            if cust and phone and cust.get("whatsapp_enabled", True) is not False:
                cust_batches = await db.batches.find({"customer_id": cid}, {"_id": 0, "balance_amount": 1}).to_list(1000)
                new_bal = sum(float(cb.get("balance_amount") or 0) for cb in cust_batches)
                asyncio.create_task(
                    send_payment_receipt(
                        to_phone=phone,
                        customer_name=cust.get("name", "Valued Customer"),
                        amount=float(body.amount),
                        date=created_time[:10],
                        receipt_no=p["id"][:8].upper(),
                        balance=float(new_bal),
                        branch_name=branch_name,
                        language_code=cust.get("preferred_language") or "en"
                    )
                )
                logger.info(f"Queued WhatsApp payment receipt for {cust.get('name')} ({phone})")
        except Exception as e:
            logger.error(f"Failed to queue WhatsApp payment: {e}")

        return clean(p)
    else:
        # Customer Account payment (automatically applies FIFO to unpaid batches & keeps excess as advance)
        if not body.customer_id or not body.branch_id:
            raise HTTPException(status_code=400, detail="customer_id and branch_id are required")
        cust = await db.customers.find_one({"id": body.customer_id})
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")
        branch = await db.branches.find_one({"id": body.branch_id})
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
            
        unpaid_batches_sql = """
            SELECT * FROM public.batches 
            WHERE customer_id = %s::uuid AND balance_amount > 0
            ORDER BY COALESCE(arrival_date, created_at) ASC, created_at ASC
        """
        unpaid_rows = await db.query(unpaid_batches_sql, [body.customer_id], "public.batches")
        
        remaining_to_allocate = float(body.amount)
        first_p = None
        
        for ub in unpaid_rows:
            if remaining_to_allocate <= 0:
                break
            batch_bal = float(ub.get("balance_amount") or 0)
            if batch_bal <= 0:
                continue
            alloc = min(remaining_to_allocate, batch_bal)
            p = {
                "id": str(uuid.uuid4()), "batch_id": str(ub["id"]), "amount": alloc,
                "mode": body.mode, "remarks": body.remarks or "",
                "customer_id": body.customer_id,
                "branch_id": str(ub.get("branch_id") or body.branch_id),
                "created_at": created_time, "created_by": user["id"],
                "updated_at": now_utc().isoformat(), "updated_by": user["id"],
            }
            await db.payments.insert_one(dict(p))
            totals = await recompute_batch_totals(ub)
            await db.batches.update_one({"id": str(ub["id"])}, {"$set": totals})
            if not first_p:
                first_p = p
            remaining_to_allocate = round(remaining_to_allocate - alloc, 2)
            
        # If any remaining amount (greater than total balance) or customer had no unpaid batches:
        if remaining_to_allocate > 0 or not unpaid_rows:
            p = {
                "id": str(uuid.uuid4()), "batch_id": None, "amount": remaining_to_allocate if unpaid_rows else body.amount,
                "mode": body.mode, "remarks": body.remarks or ("Advance payment" if unpaid_rows else ""),
                "customer_id": body.customer_id,
                "branch_id": body.branch_id,
                "created_at": created_time, "created_by": user["id"],
                "updated_at": now_utc().isoformat(), "updated_by": user["id"],
            }
            await db.payments.insert_one(dict(p))
            if not first_p:
                first_p = p
                
        await audit("create", "payment", (first_p or {}).get("id", ""), user, None, {
            "amount": body.amount, "mode": body.mode, "customer_id": body.customer_id
        })

        # Auto-dispatch WhatsApp payment receipt
        try:
            cid = body.customer_id
            cust = await db.customers.find_one({"id": cid}, {"_id": 0})
            branch_name = branch.get("name", "Main Plant") if branch else "Main Plant"
            phone = (cust.get("mobile") or cust.get("phone")) if cust else None
            if cust and phone and cust.get("whatsapp_enabled", True) is not False:
                cust_batches = await db.batches.find({"customer_id": cid}, {"_id": 0, "balance_amount": 1}).to_list(1000)
                new_bal = sum(float(cb.get("balance_amount") or 0) for cb in cust_batches)
                receipt_ref = (first_p or {}).get("id", "")[:8].upper() or "PAY-E3"
                asyncio.create_task(
                    send_payment_receipt(
                        to_phone=phone,
                        customer_name=cust.get("name", "Valued Customer"),
                        amount=float(body.amount),
                        date=created_time[:10],
                        receipt_no=receipt_ref,
                        balance=float(new_bal),
                        branch_name=branch_name,
                        language_code=cust.get("preferred_language") or "en"
                    )
                )
                logger.info(f"Queued WhatsApp payment receipt for {cust.get('name')} ({phone})")
        except Exception as e:
            logger.error(f"Failed to queue WhatsApp payment: {e}")

        return clean(first_p)


@api.put("/payments/{pid}")
async def update_payment(pid: str, body: PaymentUpdate, user: dict = Depends(get_current_user)):
    sql = """
        SELECT p.*, b.id::text as b_id 
        FROM public.payments p 
        LEFT JOIN public.batches b ON p.batch_id = b.id 
        WHERE p.id = %s::uuid
    """
    rows = await db.query(sql, [pid])
    if not rows:
        raise HTTPException(status_code=404, detail="Payment not found")
    old_p = dict(rows[0])
    
    if user.get("role") not in ("Admin", "Manager"):
        raise HTTPException(status_code=403, detail="Only Admin or Manager can edit payments")

    set_clauses = ["updated_at = now()", "updated_by = %s::uuid"]
    params = [user["id"]]

    new_amount = float(old_p["amount"])
    if body.amount is not None:
        if body.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be > 0")
        set_clauses.append("amount = %s")
        params.append(body.amount)
        new_amount = body.amount

    if body.mode is not None:
        if body.mode not in ("Cash", "UPI", "Bank", "Credit"):
            raise HTTPException(status_code=400, detail="Invalid payment mode")
        set_clauses.append("mode = %s::payment_mode")
        params.append(body.mode)

    if body.remarks is not None:
        set_clauses.append("remarks = %s")
        params.append(body.remarks)

    if body.created_at:
        set_clauses.append("created_at = %s::timestamptz")
        params.append(body.created_at)

    params.append(pid)
    upd_sql = f"UPDATE public.payments SET {', '.join(set_clauses)} WHERE id = %s::uuid"
    await db.execute(upd_sql, params)

    if old_p.get("batch_id"):
        batch = await db.batches.find_one({"id": str(old_p["batch_id"])}, {"_id": 0})
        if batch:
            totals = await recompute_batch_totals(batch)
            await db.batches.update_one({"id": str(old_p["batch_id"])}, {"$set": totals})

    await audit(
        "update", "payment", pid, user,
        {"amount": float(old_p["amount"]), "mode": old_p["mode"]},
        {"amount": float(new_amount), "mode": body.mode or old_p["mode"]}
    )
    
    updated_rows = await db.query(sql, [pid])
    return clean(dict(updated_rows[0]))


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Only Admin can delete payments")
    sql = "SELECT p.* FROM public.payments p WHERE p.id = %s::uuid"
    rows = await db.query(sql, [pid])
    if not rows:
        raise HTTPException(status_code=404, detail="Payment not found")
    old_p = dict(rows[0])
    
    await db.execute("DELETE FROM public.payments WHERE id = %s::uuid", [pid])
    
    if old_p.get("batch_id"):
        batch = await db.batches.find_one({"id": str(old_p["batch_id"])}, {"_id": 0})
        if batch:
            totals = await recompute_batch_totals(batch)
            await db.batches.update_one({"id": str(old_p["batch_id"])}, {"$set": totals})

    await audit("delete", "payment", pid, user, {"amount": float(old_p["amount"])}, None)
    return {"ok": True, "deleted": pid}


# ---------------------------- SALES ----------------------------
@api.get("/sales")
async def list_sales(
    start: Optional[str] = None,
    end: Optional[str] = None,
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    q = dict(branch_query(user))
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        q["branch_id"] = branch_id
    
    if start and end:
        q["sale_date"] = {"$gte": start, "$lte": end}
    elif start:
        q["sale_date"] = {"$gte": start}
    elif end:
        q["sale_date"] = {"$lte": end}
        
    docs = await db.sales.find(q, {"_id": 0}).sort("sale_date", -1).to_list(500)
    for d in docs:
        cust = await db.customers.find_one({"id": d["customer_id"]}, {"_id": 0, "name": 1})
        d["customer_name"] = cust["name"] if cust else ""
        branch = await db.branches.find_one({"id": d["branch_id"]}, {"_id": 0, "name": 1})
        d["branch_name"] = branch["name"] if branch else ""
    return docs


@api.post("/sales")
async def record_sale(body: SaleIn, user: dict = Depends(get_current_user)):
    if body.quantity <= 0 or body.rate < 0 or body.amount < 0:
        raise HTTPException(status_code=400, detail="Invalid quantity, rate, or amount")
        
    cust = await db.customers.find_one({"id": body.customer_id})
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    branch = await db.branches.find_one({"id": body.branch_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    s = {
        "id": str(uuid.uuid4()),
        "customer_id": body.customer_id,
        "branch_id": body.branch_id,
        "item_name": body.item_name,
        "quantity": body.quantity,
        "rate": body.rate,
        "amount": body.amount,
        "payment_mode": body.payment_mode,
        "remarks": body.remarks or "",
        "sale_date": body.sale_date or date.today().isoformat(),
        "created_at": now_utc().isoformat(),
        "created_by": user["id"]
    }
    await db.sales.insert_one(dict(s))
    await audit("create", "sale", s["id"], user, None, {"item_name": s["item_name"], "amount": s["amount"]})
    return clean(s)


@api.delete("/sales/{id}")
async def delete_sale(id: str, user: dict = Depends(require_roles("Admin", "Manager"))):
    s = await db.sales.find_one({"id": id})
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    await db.sales.delete_one({"id": id})
    await audit("delete", "sale", id, user, None, None)
    return {"message": "Sale deleted"}


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



# ---------------------------- REMINDERS & SCHEDULE ----------------------------
DEFAULT_REMINDER_CONFIG = {
    "enabled": True,
    "frequency": "weekly",  # "daily" | "weekly" | "fifteen_days" | "monthly"
    "time": "09:00 AM",
    "day_of_week": "Monday",
    "day_of_month": 1,
    "min_balance": 1.0,
    "only_pending": True,
    "branch_id": None,
    "custom_message": "",
}


@api.get("/reminders/config")
async def get_reminder_config(
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    target_branch = branch_id or (user.get("branch_id") if user.get("role") != "Admin" else None)
    if target_branch:
        doc = await db.settings.find_one({"key": f"reminder_schedule_{target_branch}"}, {"_id": 0})
        if doc and doc.get("value"):
            cfg = dict(DEFAULT_REMINDER_CONFIG)
            cfg.update(doc["value"])
            cfg["branch_id"] = target_branch
            return cfg

        # fallback to global template if set
        gdoc = await db.settings.find_one({"key": "reminder_schedule"}, {"_id": 0})
        cfg = dict(gdoc["value"] if gdoc and gdoc.get("value") else DEFAULT_REMINDER_CONFIG)
        cfg["branch_id"] = target_branch
        return cfg

    doc = await db.settings.find_one({"key": "reminder_schedule"}, {"_id": 0})
    return doc["value"] if doc and doc.get("value") else DEFAULT_REMINDER_CONFIG


@api.put("/reminders/config")
async def update_reminder_config(
    body: dict,
    branch_id: Optional[str] = None,
    user: dict = Depends(require_roles("Admin", "Manager"))
):
    target_branch = branch_id or body.get("branch_id")
    if not target_branch and user.get("role") != "Admin":
        target_branch = user.get("branch_id")

    if target_branch:
        setting_key = f"reminder_schedule_{target_branch}"
        body["branch_id"] = target_branch
    else:
        setting_key = "reminder_schedule"

    await db.settings.update_one(
        {"key": setting_key},
        {"$set": {"value": body}},
        upsert=True
    )
    await audit("update", "settings", setting_key, user, None, body)
    return {"ok": True, "config": body}


@api.get("/reminders/branch-configs")
async def get_all_branch_reminder_configs(user: dict = Depends(get_current_user)):
    branches = await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    results = []
    gdoc = await db.settings.find_one({"key": "reminder_schedule"}, {"_id": 0})
    base_cfg = gdoc["value"] if gdoc and gdoc.get("value") else DEFAULT_REMINDER_CONFIG

    for b in branches:
        b_id = str(b.get("id"))
        doc = await db.settings.find_one({"key": f"reminder_schedule_{b_id}"}, {"_id": 0})
        cfg = dict(base_cfg)
        if doc and doc.get("value"):
            cfg.update(doc["value"])
        cfg["branch_id"] = b_id
        cfg["branch_name"] = b.get("name")
        results.append(cfg)
    return results


@api.post("/reminders/copy-to-all")
async def copy_reminder_config_to_all(
    body: dict,
    user: dict = Depends(require_roles("Admin"))
):
    source_config = body.get("config") or DEFAULT_REMINDER_CONFIG
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    for b in branches:
        b_id = str(b.get("id"))
        cfg = dict(source_config)
        cfg["branch_id"] = b_id
        await db.settings.update_one(
            {"key": f"reminder_schedule_{b_id}"},
            {"$set": {"value": cfg}},
            upsert=True
        )
    await audit("copy_to_all", "settings", "reminder_schedule", user, None, {"count": len(branches)})
    return {"ok": True, "count": len(branches)}


@api.get("/reminders/statements")
async def get_reminder_statements(
    branch_id: Optional[str] = None,
    only_pending: bool = True,
    min_balance: float = 0.0,
    user: dict = Depends(get_current_user)
):
    target_branch = branch_id or (user.get("branch_id") if user.get("role") != "Admin" else None)
    
    cust_query = {}
    if target_branch:
        cust_query["branch_id"] = target_branch
    customers = await db.customers.find(cust_query, {"_id": 0}).sort("name", 1).to_list(1000)
    
    if target_branch:
        batch_stats = await db.query("""
            SELECT 
                customer_id::text,
                COALESCE(SUM(bill_amount), 0)::float as total_billed
            FROM public.batches
            WHERE branch_id::text = %s
            GROUP BY customer_id
        """, [target_branch])
        
        payment_stats = await db.query("""
            SELECT 
                customer_id::text,
                COALESCE(SUM(amount), 0)::float as total_payments
            FROM public.payments
            WHERE branch_id::text = %s
            GROUP BY customer_id
        """, [target_branch])
    else:
        batch_stats = await db.query("""
            SELECT 
                customer_id::text,
                COALESCE(SUM(bill_amount), 0)::float as total_billed
            FROM public.batches
            GROUP BY customer_id
        """)
        
        payment_stats = await db.query("""
            SELECT 
                customer_id::text,
                COALESCE(SUM(amount), 0)::float as total_payments
            FROM public.payments
            GROUP BY customer_id
        """)
        
    b_map = {row["customer_id"]: float(row["total_billed"]) for row in batch_stats}
    p_map = {row["customer_id"]: float(row["total_payments"]) for row in payment_stats}
    
    branches = {b["id"]: b["name"] for b in await db.branches.find({}, {"_id": 0}).to_list(100)}
    
    result = []
    for c in customers:
        cid = str(c["id"])
        billed = b_map.get(cid, 0.0)
        paid = p_map.get(cid, 0.0)
        balance = round(billed - paid, 2)
        
        if only_pending and balance <= min_balance:
            continue
            
        c_branch = branches.get(c.get("branch_id"), "Factory")
        
        result.append({
            "customer_id": cid,
            "name": c.get("name", "Customer"),
            "code": c.get("code", ""),
            "mobile": c.get("mobile", ""),
            "village": c.get("village", ""),
            "branch_id": c.get("branch_id"),
            "branch_name": c_branch,
            "total_billed": round(billed, 2),
            "total_received": round(paid, 2),
            "balance_due": balance,
        })
        
    result.sort(key=lambda x: x["balance_due"], reverse=True)
    return result


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
    if start and start.lower() == "all":
        return "2020-01-01T00:00:00+00:00", "2035-12-31T23:59:59+00:00"
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
    no_cache: Optional[bool] = False,
):
    tstart, tend = _today_range()
    pstart, pend = _parse_range(start, end)
    
    role = user.get("role")
    ubid = user.get("branch_id")
    target_branch_id = None
    if branch_id:
        if role != "Admin" and ubid and ubid != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        target_branch_id = branch_id
    elif role != "Admin" and ubid:
        target_branch_id = ubid

    cache_key = f"dash:{target_branch_id or 'all'}:{pstart[:10]}:{pend[:10]}:{role}"
    if not no_cache:
        cached = fast_cache.get(cache_key)
        if cached:
            return cached

    batch_where = ["1=1"]
    batch_params = []
    pay_where = ["1=1"]
    pay_params = []
    exp_where = ["1=1"]
    exp_params = []
    cust_filter = {}
    machine_filter = {}

    if target_branch_id:
        batch_where.append("b.branch_id = %s")
        batch_params.append(target_branch_id)
        pay_where.append("p.branch_id = %s")
        pay_params.append(target_branch_id)
        exp_where.append("e.branch_id = %s")
        exp_params.append(target_branch_id)
        cust_filter["branch_id"] = target_branch_id
        machine_filter["branch_id"] = target_branch_id

    s_date = pstart[:10]
    e_date = pend[:10]

    # Fast single-pass SQL aggregation across the entire batches table
    batch_sql = f"""
        SELECT
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) THEN b.raw_weight ELSE 0 END), 0) AS period_received_weight,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) THEN b.bill_amount ELSE 0 END), 0) AS period_billed,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status = 'Delivered' AND (COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) < %s::date) THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS period_deliveries,
            COALESCE(SUM(CASE WHEN b.status = 'Delivered' AND (COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) < %s::date) THEN b.actual_dry_weight ELSE 0 END), 0) AS period_delivered_weight,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) THEN b.raw_weight ELSE 0 END), 0) AS today_in_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS today_in_count,
            COALESCE(SUM(CASE WHEN b.status = 'Delivered' AND (COALESCE(b.delivered_at::date, b.created_at::date) >= %s::date AND COALESCE(b.delivered_at::date, b.created_at::date) < %s::date) THEN b.actual_dry_weight ELSE 0 END), 0) AS today_out_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status = 'Delivered' AND (COALESCE(b.delivered_at::date, b.created_at::date) >= %s::date AND COALESCE(b.delivered_at::date, b.created_at::date) < %s::date) THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS today_out_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') THEN b.raw_weight ELSE 0 END), 0) AS processing_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status IN ('Loaded', 'Drying') THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS processing_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') THEN 1 ELSE 0 END), 0) AS processing_batches_count,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status IN ('Loaded', 'Drying') AND b.machine_id IS NOT NULL THEN b.machine_id ELSE NULL END), 0) AS processing_machines_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN b.raw_weight ELSE 0 END), 0) AS inhouse_processing_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status IN ('Loaded', 'Drying') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS inhouse_processing_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN 1 ELSE 0 END), 0) AS inhouse_processing_batches_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') AND m.is_outsourced IS TRUE THEN b.raw_weight ELSE 0 END), 0) AS outsourced_processing_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN b.status IN ('Loaded', 'Drying') AND m.is_outsourced IS TRUE THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS outsourced_processing_count,
            COALESCE(SUM(CASE WHEN b.status IN ('Loaded', 'Drying') AND m.is_outsourced IS TRUE THEN 1 ELSE 0 END), 0) AS outsourced_processing_batches_count,
            COALESCE(SUM(CASE WHEN b.status = 'Completed' THEN 1 ELSE 0 END), 0) AS drying_completed_count,
            COALESCE(SUM(CASE WHEN b.status = 'Completed' THEN b.raw_weight ELSE 0 END), 0) AS drying_completed_weight,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN b.raw_weight ELSE 0 END), 0) AS period_inhouse_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS period_inhouse_count,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) THEN 1 ELSE 0 END), 0) AS period_inhouse_batches_count,
            COALESCE(COUNT(DISTINCT CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND (m.is_outsourced IS FALSE OR m.is_outsourced IS NULL) AND b.machine_id IS NOT NULL THEN b.machine_id ELSE NULL END), 0) AS period_inhouse_machines_count,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND m.is_outsourced IS TRUE THEN b.raw_weight ELSE 0 END), 0) AS period_outsourced_weight,
            COALESCE(COUNT(DISTINCT CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND m.is_outsourced IS TRUE THEN COALESCE(b.parent_batch_id, b.id) ELSE NULL END), 0) AS period_outsourced_count,
            COALESCE(SUM(CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND m.is_outsourced IS TRUE THEN 1 ELSE 0 END), 0) AS period_outsourced_batches_count,
            COALESCE(COUNT(DISTINCT CASE WHEN (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date) AND b.status IN ('Loaded', 'Drying', 'Completed', 'Delivered') AND m.is_outsourced IS TRUE AND b.machine_id IS NOT NULL THEN b.machine_id ELSE NULL END), 0) AS period_outsourced_machines_count,
            COALESCE(SUM(b.balance_amount), 0) AS pending_payments,
            COALESCE(SUM(CASE WHEN b.balance_amount > 0 THEN 1 ELSE 0 END), 0) AS pending_payments_count
        FROM public.batches b
        LEFT JOIN public.machines m ON b.machine_id = m.id
        WHERE {" AND ".join(batch_where)}
    """
    ts_date = tstart[:10]
    te_date = tend[:10]
    full_batch_params = [
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        ts_date, te_date,
        ts_date, te_date,
        ts_date, te_date,
        ts_date, te_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
        s_date, e_date,
    ] + batch_params

    # Direct SQL sum on payments
    pay_where.append("p.created_at >= %s AND p.created_at < %s")
    pay_sql = f"""
        SELECT COALESCE(SUM(p.amount), 0) as total
        FROM public.payments p
        WHERE {" AND ".join(pay_where)}
    """
    full_pay_params = pay_params + [pstart, pend]

    # Direct SQL sum on expenses
    exp_where.append("e.created_at >= %s AND e.created_at < %s")
    exp_sql = f"""
        SELECT COALESCE(SUM(e.amount), 0) as total
        FROM public.expenses e
        WHERE {" AND ".join(exp_where)}
    """
    full_exp_params = exp_params + [pstart, pend]

    # Product-wise arrivals breakdown (only includes products that arrived in period)
    product_sql = f"""
        SELECT
            COALESCE(p.name, 'Other') AS product_name,
            COUNT(DISTINCT COALESCE(b.parent_batch_id, b.id)) AS batch_count,
            ROUND(COALESCE(SUM(b.raw_weight), 0)::numeric, 2) AS total_weight
        FROM public.batches b
        LEFT JOIN public.products p ON b.product_id = p.id
        WHERE {" AND ".join(batch_where)}
          AND (COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) < %s::date)
        GROUP BY p.name
        HAVING COALESCE(SUM(b.raw_weight), 0) > 0
        ORDER BY total_weight DESC
    """
    product_params = batch_params + [s_date, e_date]

    # Active in-branch stock by product (Received, Loaded, Drying, Completed)
    active_stock_sql = f"""
        SELECT
            COALESCE(p.name, 'Other') AS product_name,
            COUNT(DISTINCT COALESCE(b.parent_batch_id, b.id)) AS batch_count,
            ROUND(COALESCE(SUM(b.raw_weight), 0)::numeric, 2) AS total_weight
        FROM public.batches b
        LEFT JOIN public.products p ON b.product_id = p.id
        WHERE {" AND ".join(batch_where)}
          AND b.status IN ('Received', 'Loaded', 'Drying', 'Completed')
        GROUP BY p.name
        HAVING COALESCE(SUM(b.raw_weight), 0) > 0
        ORDER BY total_weight DESC
    """
    active_stock_params = list(batch_params)

    # Run all lightweight queries in parallel
    tasks = [
        db.query(batch_sql, full_batch_params),
        db.query(pay_sql, full_pay_params),
        db.query(exp_sql, full_exp_params),
        db.customers.count_documents(cust_filter),
        db.machines.find(machine_filter, {"_id": 0}).to_list(50),
        db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(15),
        db.query(product_sql, product_params),
        db.query(active_stock_sql, active_stock_params),
    ]

    results = await asyncio.gather(*tasks)

    batch_stats = results[0][0] if results[0] else {}
    pay_res = results[1][0] if results[1] else {}
    exp_res = results[2][0] if results[2] else {}
    period_customers = results[3]
    machines = results[4]
    recent = results[5]
    product_rows = results[6] if len(results) > 6 and results[6] else []
    active_stock_rows = results[7] if len(results) > 7 and results[7] else []

    product_arrivals = [
        {
            "product_name": str(r.get("product_name") or "Other"),
            "batch_count": int(r.get("batch_count") or 0),
            "total_weight": round(float(r.get("total_weight") or 0), 2),
        }
        for r in product_rows
    ]

    active_product_arrivals = [
        {
            "product_name": str(r.get("product_name") or "Other"),
            "batch_count": int(r.get("batch_count") or 0),
            "total_weight": round(float(r.get("total_weight") or 0), 2),
        }
        for r in active_stock_rows
    ]

    period_received_weight = round(float(batch_stats.get("period_received_weight") or 0), 2)
    period_billed = round(float(batch_stats.get("period_billed") or 0), 2)
    period_deliveries = int(batch_stats.get("period_deliveries") or 0)
    period_delivered_weight = round(float(batch_stats.get("period_delivered_weight") or 0), 2)
    
    today_in_weight = round(float(batch_stats.get("today_in_weight") or 0), 2)
    today_in_count = int(batch_stats.get("today_in_count") or 0)
    today_out_weight = round(float(batch_stats.get("today_out_weight") or 0), 2)
    today_out_count = int(batch_stats.get("today_out_count") or 0)
    
    processing_weight = round(float(batch_stats.get("processing_weight") or 0), 2)
    processing_count = int(batch_stats.get("processing_count") or 0)
    processing_batches_count = int(batch_stats.get("processing_batches_count") or 0)
    processing_machines_count = int(batch_stats.get("processing_machines_count") or 0)
    inhouse_processing_weight = round(float(batch_stats.get("inhouse_processing_weight") or 0), 2)
    inhouse_processing_count = int(batch_stats.get("inhouse_processing_count") or 0)
    inhouse_processing_batches_count = int(batch_stats.get("inhouse_processing_batches_count") or 0)
    outsourced_processing_weight = round(float(batch_stats.get("outsourced_processing_weight") or 0), 2)
    outsourced_processing_count = int(batch_stats.get("outsourced_processing_count") or 0)
    outsourced_processing_batches_count = int(batch_stats.get("outsourced_processing_batches_count") or 0)
    drying_completed_count = int(batch_stats.get("drying_completed_count") or 0)
    drying_completed_weight = round(float(batch_stats.get("drying_completed_weight") or 0), 2)
    pending_deliveries_count = drying_completed_count
    
    pending_payments = max(0.00, round(float(batch_stats.get("pending_payments") or 0), 2))
    pending_payments_count = int(batch_stats.get("pending_payments_count") or 0)

    period_collection = round(float(pay_res.get("total") or 0), 2)
    period_expense = round(float(exp_res.get("total") or 0), 2)

    machines_running = sum(1 for m in machines if m["status"] == "Running")
    machines_available = sum(1 for m in machines if m["status"] == "Available")
    machines_maintenance = sum(1 for m in machines if m["status"] in ("Maintenance", "Cleaning"))
    inhouse_machines_running = sum(1 for m in machines if m["status"] == "Running" and not m.get("is_outsourced"))
    outsourced_machines_running = sum(1 for m in machines if m["status"] == "Running" and m.get("is_outsourced"))

    period_inhouse_weight = round(float(batch_stats.get("period_inhouse_weight") or 0), 2)
    period_inhouse_count = int(batch_stats.get("period_inhouse_count") or 0)
    period_inhouse_batches_count = int(batch_stats.get("period_inhouse_batches_count") or 0)
    period_inhouse_machines_count = int(batch_stats.get("period_inhouse_machines_count") or 0)

    period_outsourced_weight = round(float(batch_stats.get("period_outsourced_weight") or 0), 2)
    period_outsourced_count = int(batch_stats.get("period_outsourced_count") or 0)
    period_outsourced_batches_count = int(batch_stats.get("period_outsourced_batches_count") or 0)
    period_outsourced_machines_count = int(batch_stats.get("period_outsourced_machines_count") or 0)

    res = {
        "range": {"start": pstart[:10], "end": (datetime.fromisoformat(pend) - timedelta(days=1)).isoformat()[:10]},
        "today_arrival": {
            "in_weight": today_in_weight, "in_count": today_in_count,
            "out_weight": today_out_weight, "out_count": today_out_count,
            "processing_weight": processing_weight, "processing_count": processing_count,
            "processing_batches_count": processing_batches_count,
            "processing_machines_count": processing_machines_count,
            "inhouse_processing_weight": inhouse_processing_weight,
            "inhouse_processing_count": inhouse_processing_count,
            "inhouse_processing_batches_count": inhouse_processing_batches_count,
            "outsourced_processing_weight": outsourced_processing_weight,
            "outsourced_processing_count": outsourced_processing_count,
            "outsourced_processing_batches_count": outsourced_processing_batches_count,
        },
        "period_drying": {
            "inhouse_weight": period_inhouse_weight,
            "inhouse_count": period_inhouse_count,
            "inhouse_batches_count": period_inhouse_batches_count,
            "inhouse_machines_count": period_inhouse_machines_count,
            "outsourced_weight": period_outsourced_weight,
            "outsourced_count": period_outsourced_count,
            "outsourced_batches_count": period_outsourced_batches_count,
            "outsourced_machines_count": period_outsourced_machines_count,
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
        "drying_completed_weight": drying_completed_weight,
        "pending_deliveries_count": pending_deliveries_count,
        "machines_running": machines_running,
        "machines_available": machines_available,
        "machines_maintenance": machines_maintenance,
        "inhouse_machines_running": inhouse_machines_running,
        "outsourced_machines_running": outsourced_machines_running,
        "total_machines": len(machines),
        "recent_activities": recent,
        "product_arrivals": product_arrivals,
        "active_product_arrivals": active_product_arrivals,
    }
    fast_cache.set(cache_key, res, ttl_seconds=8.0)
    return res


@api.get("/dashboard/arrivals")
async def dashboard_arrivals(
    user: dict = Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
    branch_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 150,
    no_cache: Optional[bool] = False,
):
    """List arrivals + processing + deliveries with customer + branch + weights."""
    target_bid = branch_id or user.get("branch_id")
    cache_key = f"dash_arr:{target_bid or 'all'}:{start or ''}:{end or ''}:{limit}"
    if no_cache:
        fast_cache.clear()
    elif not q:
        cached = fast_cache.get(cache_key)
        if cached:
            return cached
    # Scoping
    where_clauses = ["1=1"]
    params = []
    
    if branch_id:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != branch_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        where_clauses.append("b.branch_id = %s")
        params.append(branch_id)
    else:
        role = user.get("role")
        bid = user.get("branch_id")
        if role != "Admin" and bid:
            where_clauses.append("b.branch_id = %s")
            params.append(bid)

    if q:
        where_clauses.append("(b.batch_no ILIKE %s OR b.receipt_no ILIKE %s OR c.name ILIKE %s OR c.code ILIKE %s OR c.mobile ILIKE %s OR p.name ILIKE %s)")
        q_like = f"%{q}%"
        params.extend([q_like, q_like, q_like, q_like, q_like, q_like])
            
    where_str = " AND ".join(where_clauses)
    
    # 1. Fetch ins (arrivals)
    in_where = [where_str]
    in_params = list(params)
    if start and end:
        s_date = start[:10]
        e_date = end[:10]
        in_where.append("COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.arrival_date::date, b.created_at::date) <= %s::date")
        in_params.extend([s_date, e_date])
    elif start:
        s_date = start[:10]
        in_where.append("COALESCE(b.arrival_date::date, b.created_at::date) >= %s::date")
        in_params.append(s_date)
    elif end:
        e_date = end[:10]
        in_where.append("COALESCE(b.arrival_date::date, b.created_at::date) <= %s::date")
        in_params.append(e_date)

    in_sql = f"""
        SELECT 
            b.id::text as batch_id, b.batch_no, b.branch_id::text as branch_id,
            b.arrival_date, b.created_at, b.processing_started_at, b.processing_ended_at, b.raw_weight, b.rate_per_kg, b.bill_amount, b.total_paid, b.balance_amount, b.actual_dry_weight, b.status,
            b.delivered_at as delivery_date,
            b.is_split, b.parent_batch_id::text as parent_batch_id,
            c.name as customer_name, c.code as customer_code, c.mobile as customer_mobile,
            p.name as product_name,
            m.id::text as machine_id,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE {" AND ".join(in_where)}
        ORDER BY COALESCE(b.arrival_date, b.created_at) DESC, b.created_at DESC
        LIMIT %s
    """
    
    # 2. Fetch outs (deliveries)
    out_where = [where_str, "b.status = 'Delivered'"]
    out_params = list(params)
    if start and end:
        s_date = start[:10]
        e_date = end[:10]
        out_where.append("COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) >= %s::date AND COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) <= %s::date")
        out_params.extend([s_date, e_date])
    elif start:
        s_date = start[:10]
        out_where.append("COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) >= %s::date")
        out_params.append(s_date)
    elif end:
        e_date = end[:10]
        out_where.append("COALESCE(b.delivered_at::date, b.arrival_date::date, b.created_at::date) <= %s::date")
        out_params.append(e_date)

    out_sql = f"""
        SELECT 
            b.id::text as batch_id, b.batch_no, b.branch_id::text as branch_id,
            b.arrival_date, b.created_at, b.processing_started_at, b.processing_ended_at, b.raw_weight, b.rate_per_kg, b.bill_amount, b.total_paid, b.balance_amount, b.actual_dry_weight, b.status,
            b.delivered_at as delivery_date,
            b.is_split, b.parent_batch_id::text as parent_batch_id,
            c.name as customer_name, c.code as customer_code, c.mobile as customer_mobile,
            p.name as product_name,
            m.id::text as machine_id,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE {" AND ".join(out_where)}
        ORDER BY b.delivered_at DESC
        LIMIT %s
    """
    
    # 3. Fetch active processing batches (actively in dryers: Loaded or Drying)
    proc_sql = f"""
        SELECT 
            b.id::text as batch_id, b.batch_no, b.branch_id::text as branch_id,
            b.arrival_date, b.created_at, b.processing_started_at, b.processing_ended_at, b.raw_weight, b.rate_per_kg, b.bill_amount, b.total_paid, b.balance_amount, b.actual_dry_weight, b.status,
            b.delivered_at as delivery_date,
            b.is_split, b.parent_batch_id::text as parent_batch_id,
            c.name as customer_name, c.code as customer_code, c.mobile as customer_mobile,
            p.name as product_name,
            m.id::text as machine_id,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE {where_str} AND b.status IN ('Loaded', 'Drying')
        ORDER BY COALESCE(b.arrival_date, b.created_at) DESC, b.created_at DESC
        LIMIT %s
    """
    
    # 4. Fetch completed batches (processing finished, ready for delivery)
    comp_sql = f"""
        SELECT 
            b.id::text as batch_id, b.batch_no, b.branch_id::text as branch_id,
            b.arrival_date, b.created_at, b.processing_started_at, b.processing_ended_at, b.raw_weight, b.rate_per_kg, b.bill_amount, b.total_paid, b.balance_amount, b.actual_dry_weight, b.status,
            b.delivered_at as delivery_date,
            b.is_split, b.parent_batch_id::text as parent_batch_id,
            c.name as customer_name, c.code as customer_code, c.mobile as customer_mobile,
            p.name as product_name,
            m.id::text as machine_id,
            m.name as machine_name,
            br.name as branch_name
        FROM public.batches b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        LEFT JOIN public.products p ON b.product_id = p.id
        LEFT JOIN public.machines m ON b.machine_id = m.id
        LEFT JOIN public.branches br ON b.branch_id = br.id
        WHERE {where_str} AND b.status = 'Completed'
        ORDER BY b.updated_at DESC, COALESCE(b.arrival_date, b.created_at) DESC
        LIMIT %s
    """

    # Fetch in_rows, out_rows, proc_rows, comp_rows concurrently
    in_rows, out_rows, proc_rows, comp_rows = await asyncio.gather(
        db.query(in_sql, in_params + [limit]),
        db.query(out_sql, out_params + [limit]),
        db.query(proc_sql, list(params) + [limit]),
        db.query(comp_sql, list(params) + [limit]),
    )
    
    def format_row(r):
        d = dict(r)
        return {
            "batch_id": d["batch_id"],
            "batch_no": d["batch_no"],
            "customer_name": d.get("customer_name") or "",
            "customer_code": d.get("customer_code") or "",
            "customer_mobile": d.get("customer_mobile") or "",
            "product": d.get("product_name") or "",
            "machine_id": d.get("machine_id"),
            "machine_name": d.get("machine_name") or "",
            "branch_id": d.get("branch_id"),
            "branch_name": d.get("branch_name") or "-",
            "arrival_date": d.get("arrival_date") or d["created_at"],
            "processing_started_at": d.get("processing_started_at"),
            "processing_ended_at": d.get("processing_ended_at"),
            "raw_weight": float(d.get("raw_weight") or 0),
            "rate_per_kg": float(d.get("rate_per_kg") or 0),
            "bill_amount": float(d.get("bill_amount") or 0),
            "total_paid": float(d.get("total_paid") or 0),
            "balance_amount": float(d.get("balance_amount") or 0),
            "actual_dry_weight": float(d["actual_dry_weight"]) if d.get("actual_dry_weight") is not None else None,
            "delivery_date": d.get("delivery_date"),
            "status": d["status"],
            "is_split": bool(d.get("is_split")),
            "parent_batch_id": d.get("parent_batch_id"),
            "total_arrival_weight": float(d.get("raw_weight") or 0),
            "split_count": 1,
            "other_lots_summary": "",
        }
        
    # Consolidate arrivals: group split batches under their physical parent arrival
    arrival_groups = {}
    for r in in_rows:
        row = format_row(r)
        bno = str(row["batch_no"] or "")
        base_bno = bno.split("-")[0] if "-" in bno else bno
        
        # Primary parent identifier
        parent_key = row["parent_batch_id"] or row["batch_id"]
        # Fallback grouping by customer + base batch number if parent_batch_id was null
        if not row["parent_batch_id"] and "-" in bno:
            parent_key = f"{row['customer_code'] or row['customer_name']}_{base_bno}"

        if parent_key not in arrival_groups:
            arrival_groups[parent_key] = {
                **row,
                "_base_bno": base_bno,
                "raw_weight": 0.0,
                "bill_amount": 0.0,
                "total_paid": 0.0,
                "balance_amount": 0.0,
                "actual_dry_weight": 0.0 if row["actual_dry_weight"] is not None else None,
                "sub_batches": [],
                "_machines": set(),
                "_statuses": set(),
            }
        
        grp = arrival_groups[parent_key]
        grp["raw_weight"] = round(grp["raw_weight"] + row["raw_weight"], 2)
        grp["bill_amount"] = round(grp["bill_amount"] + (row["bill_amount"] or 0), 2)
        grp["total_paid"] = round(grp["total_paid"] + (row["total_paid"] or 0), 2)
        grp["balance_amount"] = round(grp["balance_amount"] + (row["balance_amount"] or 0), 2)
        if row["actual_dry_weight"] is not None:
            grp["actual_dry_weight"] = round((grp["actual_dry_weight"] or 0) + row["actual_dry_weight"], 2)
        if row.get("machine_name"):
            grp["_machines"].add(row["machine_name"])
        grp["_statuses"].add(row["status"])
        grp["sub_batches"].append({
            "batch_id": row["batch_id"],
            "batch_no": row["batch_no"],
            "raw_weight": row["raw_weight"],
            "machine_id": row.get("machine_id"),
            "machine_name": row.get("machine_name") or "Unassigned",
            "status": row["status"],
            "actual_dry_weight": row.get("actual_dry_weight"),
            "arrival_date": row.get("arrival_date"),
            "processing_started_at": row.get("processing_started_at"),
            "processing_ended_at": row.get("processing_ended_at"),
            "delivery_date": row.get("delivery_date"),
        })

    in_list = []
    for grp in arrival_groups.values():
        is_multi = len(grp["sub_batches"]) > 1
        if is_multi:
            grp["batch_no"] = f"{grp['_base_bno']} ({len(grp['sub_batches'])} Lots)"
            grp["is_split"] = True
        else:
            grp["batch_no"] = grp["sub_batches"][0]["batch_no"]
            grp["is_split"] = False
        
        if grp["_machines"]:
            grp["machine_name"] = " & ".join(sorted(grp["_machines"]))
        else:
            grp["machine_name"] = ""

        # Status priority: Drying > Loaded > Completed > Received
        if "Drying" in grp["_statuses"]:
            grp["status"] = "Drying"
        elif "Loaded" in grp["_statuses"]:
            grp["status"] = "Loaded"
        elif "Completed" in grp["_statuses"] and len(grp["_statuses"]) == 1:
            grp["status"] = "Completed"
        elif "Delivered" in grp["_statuses"] and len(grp["_statuses"]) == 1:
            grp["status"] = "Delivered"
        elif "Received" in grp["_statuses"] and len(grp["_statuses"]) == 1:
            grp["status"] = "Received"
        else:
            grp["status"] = "/".join(sorted(grp["_statuses"]))

        grp.pop("_machines", None)
        grp.pop("_statuses", None)
        grp.pop("_base_bno", None)
        in_list.append(grp)

    out_list = [format_row(r) for r in out_rows]
    proc_list = [format_row(r) for r in proc_rows]
    comp_list = [format_row(r) for r in comp_rows]

    # Enrich processing & completed lots with total arrival weight & sibling lots
    all_proc_comp = proc_list + comp_list
    split_candidates = [
        r for r in all_proc_comp
        if r.get("is_split") or ("-" in (r.get("batch_no") or "")) or r.get("parent_batch_id")
    ]
    if split_candidates:
        parent_ids = list({r["parent_batch_id"] for r in split_candidates if r.get("parent_batch_id")})
        base_bnos = list({(r["batch_no"].split("-")[0] + "%") for r in split_candidates if r.get("batch_no")})
        where_parts = []
        q_params = []
        if parent_ids:
            where_parts.append("b.parent_batch_id::text = ANY(%s) OR b.id::text = ANY(%s)")
            q_params.extend([parent_ids, parent_ids])
        if base_bnos:
            where_parts.append("b.batch_no LIKE ANY(%s)")
            q_params.append(base_bnos)
        if where_parts:
            siblings_sql = f"""
                SELECT b.id::text, b.batch_no, b.raw_weight, b.machine_id::text, m.name as machine_name,
                       b.status, b.parent_batch_id::text, b.customer_id::text
                FROM public.batches b
                LEFT JOIN public.machines m ON b.machine_id = m.id
                WHERE {" OR ".join(where_parts)}
            """
            s_rows = await db.query(siblings_sql, q_params)
            by_group = {}
            for sr in s_rows:
                bno = sr.get("batch_no") or ""
                base_bno = bno.split("-")[0] if "-" in bno else bno
                key = sr.get("parent_batch_id") or base_bno
                if key not in by_group:
                    by_group[key] = []
                by_group[key].append(sr)

            for row in all_proc_comp:
                bno = row.get("batch_no") or ""
                base_bno = bno.split("-")[0] if "-" in bno else bno
                key = row.get("parent_batch_id") or base_bno
                sibs = by_group.get(key) or by_group.get(base_bno) or []
                if len(sibs) > 1:
                    row["is_split"] = True
                    tot_w = round(sum(float(s.get("raw_weight") or 0) for s in sibs), 2)
                    row["total_arrival_weight"] = tot_w
                    row["split_count"] = len(sibs)
                    other_sibs = [s for s in sibs if s.get("id") != row.get("batch_id") and s.get("batch_no") != row.get("batch_no")]
                    other_machines = [f"{s.get('raw_weight')} kg in {s.get('machine_name') or 'Dryer'}" for s in other_sibs]
                    row["other_lots_summary"] = "Bal: " + ", ".join(other_machines) if other_machines else f"Bal: {round(tot_w - row['raw_weight'], 2)} kg in other dryers"
                else:
                    row["is_split"] = False
                    row["total_arrival_weight"] = row["raw_weight"]
                    row["split_count"] = 1
                    row["other_lots_summary"] = ""
    
    # Group active processing batches by machine
    machines_map = {}
    for row in proc_list:
        mid = row.get("machine_id") or "unassigned"
        mname = row.get("machine_name") or "Unassigned Machine"
        if mid not in machines_map:
            machines_map[mid] = {
                "machine_id": mid,
                "machine_name": mname,
                "total_weight": 0.0,
                "batch_count": 0,
                "batches": []
            }
        machines_map[mid]["total_weight"] = round(machines_map[mid]["total_weight"] + row["raw_weight"], 2)
        machines_map[mid]["batch_count"] += 1
        machines_map[mid]["batches"].append(row)

    # Attach consolidated machine load info to each processing row
    for row in proc_list:
        mid = row.get("machine_id") or "unassigned"
        row["machine_total_weight"] = machines_map[mid]["total_weight"]
        row["machine_batch_count"] = machines_map[mid]["batch_count"]

    proc_machines = list(machines_map.values())
    active_machines_count = len([m for m in proc_machines if m["machine_id"] != "unassigned"])
    
    total_in = round(sum(r["raw_weight"] for r in in_list), 2)
    total_out = round(sum((r["actual_dry_weight"] or 0) for r in out_list), 2)
    total_proc = round(sum(r["raw_weight"] for r in proc_list), 2)
    total_comp = round(sum((r["actual_dry_weight"] or 0) for r in comp_list), 2)
    
    range_start = start if start else "All"
    range_end = end if end else "Time"

    res = {
        "range": {"start": range_start, "end": range_end},
        "totals": {
            "in_weight": total_in, "out_weight": total_out, "processing_weight": total_proc,
            "in_count": len(in_list), "out_count": len(out_list), "processing_count": len(proc_list),
            "completed_count": len(comp_list), "completed_weight": total_comp,
            "processing_machine_count": active_machines_count,
        },
        "in": in_list,
        "out": out_list,
        "processing": proc_list,
        "completed": comp_list,
        "processing_machines": proc_machines,
    }
    if not q:
        fast_cache.set(cache_key, res, ttl_seconds=6.0)
    return res


@api.get("/reports/summary")
async def reports_summary(
    branch_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    target_branch = branch_id
    if target_branch:
        if user.get("role") != "Admin" and user.get("branch_id") and user.get("branch_id") != target_branch:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if user.get("role") != "Admin":
            target_branch = user.get("branch_id")

    b_where = "WHERE branch_id = %s" if target_branch else ""
    b_params = [target_branch] if target_branch else []

    p_where = "WHERE branch_id = %s" if target_branch else ""
    p_params = [target_branch] if target_branch else []

    e_where = "WHERE branch_id = %s" if target_branch else ""
    e_params = [target_branch] if target_branch else []

    m_filter = {"branch_id": target_branch} if target_branch else {}

    batch_totals_task = db.query(f"""
        SELECT 
            COALESCE(SUM(bill_amount), 0) as total_billed,
            COALESCE(SUM(CASE WHEN status != 'Delivered' THEN 1 ELSE 0 END), 0) as pending_deliveries,
            COUNT(*) as total_batches
        FROM public.batches
        {b_where}
    """, b_params)

    pay_total_task = db.query(f"""
        SELECT COALESCE(SUM(amount), 0) as total_collection 
        FROM public.payments
        {p_where}
    """, p_params)

    exp_summary_task = db.query(f"""
        SELECT category, COALESCE(SUM(amount), 0) as total 
        FROM public.expenses 
        {e_where}
        GROUP BY category
    """, e_params)

    machines_task = db.machines.find(m_filter, {"_id": 0}).to_list(50)

    u_where = "WHERE machine_id IS NOT NULL AND branch_id = %s" if target_branch else "WHERE machine_id IS NOT NULL"
    u_params = [target_branch] if target_branch else []
    util_task = db.query(f"""
        SELECT machine_id::text as machine_id, COUNT(*) as cnt 
        FROM public.batches 
        {u_where}
        GROUP BY machine_id
    """, u_params)

    b_res, p_res, exp_res, machines, u_res = await asyncio.gather(
        batch_totals_task, pay_total_task, exp_summary_task, machines_task, util_task
    )

    total_billed = round(float(b_res[0]["total_billed"] if b_res else 0), 2)
    pending_deliveries = int(b_res[0]["pending_deliveries"] if b_res else 0)
    total_batches = int(b_res[0]["total_batches"] if b_res else 0)
    total_collection = round(float(p_res[0]["total_collection"] if p_res else 0), 2)
    pending_payments = max(0.00, round(total_billed - total_collection, 2))

    cat_totals: Dict[str, float] = {}
    total_expense = 0.0
    for row in (exp_res or []):
        cat = row.get("category") or "General"
        amt = round(float(row.get("total") or 0), 2)
        cat_totals[cat] = amt
        total_expense += amt
    total_expense = round(total_expense, 2)

    machine_batch_counts = {r["machine_id"]: int(r["cnt"]) for r in (u_res or []) if r.get("machine_id")}
    util = []
    for m in (machines or []):
        cnt = machine_batch_counts.get(m["id"], 0)
        util.append({"name": m["name"], "batches": cnt, "status": m["status"]})

    # Outsourced processing summary
    out_machines = [m for m in (machines or []) if m.get("is_outsourced")]
    out_total_kg = 0.0
    out_total_cost = 0.0
    out_total_paid = 0.0
    out_details = []

    if out_machines:
        out_ids = [m["id"] for m in out_machines]
        b_out_where = "WHERE machine_id = ANY(%s)"
        b_out_params: list = [out_ids]
        if target_branch:
            b_out_where += " AND branch_id = %s"
            b_out_params.append(target_branch)

        b_out_rows = await db.query(f"""
            SELECT machine_id::text, COALESCE(SUM(raw_weight), 0) as total_kg, COUNT(*) as batch_cnt
            FROM public.batches
            {b_out_where}
            GROUP BY machine_id
        """, b_out_params)
        b_out_map = {r["machine_id"]: {"kg": float(r["total_kg"]), "cnt": int(r["batch_cnt"])} for r in (b_out_rows or [])}

        e_out_where = "WHERE category = 'Outsourced Drying'"
        e_out_params: list = []
        if target_branch:
            e_out_where += " AND branch_id = %s"
            e_out_params.append(target_branch)

        e_out_rows = await db.query(f"""
            SELECT machine_id::text, vendor, COALESCE(SUM(amount), 0) as paid
            FROM public.expenses
            {e_out_where}
            GROUP BY machine_id, vendor
        """, e_out_params)

        for m in out_machines:
            m_stat = b_out_map.get(m["id"], {"kg": 0.0, "cnt": 0})
            m_kg = m_stat["kg"]
            m_rate = float(m.get("vendor_rate_per_kg") or 0.0)
            m_cost = round(m_kg * m_rate, 2)
            m_paid = sum(
                float(r["paid"]) for r in (e_out_rows or [])
                if r.get("machine_id") == m["id"] or (m.get("vendor_name") and r.get("vendor") == m.get("vendor_name"))
            )
            m_paid = round(m_paid, 2)
            m_bal = max(0.0, round(m_cost - m_paid, 2))

            out_total_kg += m_kg
            out_total_cost += m_cost
            out_total_paid += m_paid
            out_details.append({
                "machine_id": m["id"],
                "machine_name": m["name"],
                "vendor_name": m.get("vendor_name") or m["name"],
                "vendor_phone": m.get("vendor_phone") or "",
                "rate_per_kg": m_rate,
                "processed_kg": m_kg,
                "batches_count": m_stat["cnt"],
                "total_cost": m_cost,
                "total_paid": m_paid,
                "balance_payable": m_bal,
            })

    outsourced_summary = {
        "total_kg": round(out_total_kg, 2),
        "total_cost": round(out_total_cost, 2),
        "total_paid": round(out_total_paid, 2),
        "balance_payable": max(0.0, round(out_total_cost - out_total_paid, 2)),
        "machines": out_details,
    }

    return {
        "total_collection": total_collection,
        "total_expense": total_expense,
        "profit": round(total_collection - total_expense, 2),
        "pending_payments": pending_payments,
        "pending_deliveries": pending_deliveries,
        "machine_utilization": util,
        "expense_by_category": cat_totals,
        "total_batches": total_batches,
        "outsourced_summary": outsourced_summary,
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
    cached = fast_cache.get("static_branches")
    if cached:
        return cached
    res = await db.branches.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    fast_cache.set("static_branches", res, ttl_seconds=60.0)
    return res


@api.post("/branches")
async def create_branch(body: BranchIn, user: dict = Depends(require_roles("Admin"))):
    b = {
        "id": str(uuid.uuid4()),
        "name": body.name, "address": body.address or "", "phone": body.phone or "",
        "report_phones": body.report_phones or "",
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
        "report_phones": body.report_phones or "",
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


# -----------------------------------------------------------------------------
# META WHATSAPP CLOUD API INTEGRATION
# -----------------------------------------------------------------------------
from whatsapp_service import send_whatsapp_template, send_whatsapp_text, clean_phone_number, get_config

class WhatsAppTestReq(BaseModel):
    phone: str

class WhatsAppArrivalReq(BaseModel):
    phone: str
    customer_name: str
    branch_name: str
    batch_no: str
    weight: float
    bags: int

class WhatsAppPaymentReq(BaseModel):
    phone: str
    customer_name: str
    amount: float
    date: str
    receipt_no: str
    balance: float

@api.get("/whatsapp/status")
async def whatsapp_status(user: dict = Depends(get_current_user)):
    """Fetch live Meta WhatsApp Cloud API connection details and templates"""
    cfg = get_config()
    token = cfg["token"]
    phone_id = cfg["phone_id"]
    waba_id = cfg["account_id"]

    if not token:
        return {"configured": False, "error": "META_WHATSAPP_TOKEN not configured"}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Phone number details
            phone_res = await client.get(
                f"https://graph.facebook.com/v21.0/{phone_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            # 2. Templates
            templates_res = await client.get(
                f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            phone_data = phone_res.json() if phone_res.status_code == 200 else {}
            templates_data = templates_res.json().get("data", []) if templates_res.status_code == 200 else []

            return {
                "configured": True,
                "verified_name": phone_data.get("verified_name"),
                "display_phone_number": phone_data.get("display_phone_number"),
                "quality_rating": phone_data.get("quality_rating"),
                "status": phone_data.get("code_verification_status"),
                "templates": [{"name": t.get("name"), "status": t.get("status"), "category": t.get("category")} for t in templates_data]
            }
    except Exception as e:
        return {"configured": True, "error": str(e)}

@api.post("/whatsapp/send-test")
async def whatsapp_send_test(body: WhatsAppTestReq, user: dict = Depends(get_current_user)):
    """Send test 'hello' template via Meta Cloud API"""
    res = await send_whatsapp_template(to_phone=body.phone, template_name="hello", parameters=None, language_code="en")
    return res

@api.post("/whatsapp/send-arrival")
async def whatsapp_send_arrival(body: WhatsAppArrivalReq, user: dict = Depends(get_current_user)):
    """Send stock arrival receipt notification via Meta Cloud API"""
    params = [
        body.customer_name,
        body.branch_name,
        body.batch_no,
        f"{body.weight:,.1f}",
        str(body.bags)
    ]
    res = await send_whatsapp_template(
        to_phone=body.phone,
        template_name="e3_arrival_alert",
        parameters=params,
        language_code="en"
    )
    return res

@api.post("/whatsapp/send-payment")
async def whatsapp_send_payment(body: WhatsAppPaymentReq, user: dict = Depends(get_current_user)):
    """Send payment receipt notification via Meta Cloud API"""
    params = [
        body.customer_name,
        f"{body.amount:,.2f}",
        body.date,
        body.receipt_no,
        f"{body.balance:,.2f}"
    ]
    res = await send_whatsapp_template(
        to_phone=body.phone,
        template_name="e3_payment_receipt",
        parameters=params,
        language_code="en"
    )
    return res


# -----------------------------------------------------------------------------
# AUTOMATED DAILY BRANCH-WISE WHATSAPP STATUS REPORTS
# -----------------------------------------------------------------------------

class DailyReportSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    send_time: Optional[str] = None
    admin_phones: Optional[str] = None
    include_financials: Optional[bool] = None

class DailyReportSendNowReq(BaseModel):
    branch_id: Optional[str] = None
    phone: Optional[str] = None
    admin_phones: Optional[str] = None
    target_date: Optional[str] = None

async def generate_branch_daily_summary(branch_id: str, target_date_str: Optional[str] = None) -> dict:
    """Calculates today's operational summary for a specific branch and builds a formatted WhatsApp message."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(timezone.utc).astimezone(ist_tz)
    
    cur_date_str = target_date_str if target_date_str else now_ist.strftime("%Y-%m-%d")
    
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        return {"error": "Branch not found"}
        
    branch_name = branch.get("name", "Branch")
    start_utc = f"{cur_date_str}T00:00:00+05:30"
    end_utc = f"{cur_date_str}T23:59:59+05:30"
    
    # 1. Arrivals Received Today
    arrivals_sql = """
        SELECT 
            COALESCE(p.name, 'Produce') as product_name,
            COUNT(b.id) as lot_count,
            COALESCE(SUM(b.raw_weight), 0) as total_weight,
            COALESCE(SUM(b.bags), 0) as total_bags
        FROM public.batches b
        LEFT JOIN public.products p ON b.product_id = p.id
        WHERE b.branch_id = %s::uuid
          AND COALESCE(b.arrival_date::date, b.created_at::date) = %s::date
        GROUP BY p.name
    """
    arrival_rows = await db.query(arrivals_sql, [branch_id, cur_date_str])
    
    total_arr_lots = sum(r.get("lot_count", 0) for r in arrival_rows)
    total_arr_weight = sum(float(r.get("total_weight", 0)) for r in arrival_rows)
    total_arr_bags = sum(int(r.get("total_bags", 0)) for r in arrival_rows)
    
    # 2. Dryer Processing Status
    running_sql = """
        SELECT 
            COUNT(DISTINCT b.machine_id) as running_machines,
            COALESCE(SUM(b.raw_weight), 0) as running_weight
        FROM public.batches b
        WHERE b.branch_id = %s::uuid
          AND b.status IN ('Loaded', 'Drying')
    """
    running_rows = await db.query(running_sql, [branch_id])
    running_row = running_rows[0] if running_rows else {}
    running_machines = running_row.get("running_machines", 0)
    running_weight = float(running_row.get("running_weight", 0.0))
    
    completed_sql = """
        SELECT 
            COUNT(b.id) as completed_lots,
            COALESCE(SUM(b.raw_weight), 0) as completed_wet_weight,
            COALESCE(SUM(b.actual_dry_weight), 0) as completed_dry_weight
        FROM public.batches b
        WHERE b.branch_id = %s::uuid
          AND b.status IN ('Completed', 'Delivered')
          AND (
            (b.processing_ended_at >= %s::timestamptz AND b.processing_ended_at <= %s::timestamptz)
            OR (b.updated_at >= %s::timestamptz AND b.updated_at <= %s::timestamptz AND b.actual_dry_weight IS NOT NULL)
          )
    """
    comp_rows = await db.query(completed_sql, [branch_id, start_utc, end_utc, start_utc, end_utc])
    comp_row = comp_rows[0] if comp_rows else {}
    comp_lots = comp_row.get("completed_lots", 0)
    comp_wet_weight = float(comp_row.get("completed_wet_weight", 0.0))
    comp_dry_weight = float(comp_row.get("completed_dry_weight", 0.0))
    yield_pct = ((comp_dry_weight / comp_wet_weight) * 100) if comp_wet_weight > 0 else 0.0
    
    machines_sql = """
        SELECT 
            COUNT(id) as total_machines,
            COUNT(CASE WHEN status = 'Available' THEN 1 END) as available_machines
        FROM public.machines
        WHERE branch_id = %s::uuid
    """
    mach_rows = await db.query(machines_sql, [branch_id])
    mach_row = mach_rows[0] if mach_rows else {}
    total_machines = mach_row.get("total_machines", 0)
    avail_machines = mach_row.get("available_machines", 0)
    
    # 3. Deliveries Today
    deliv_sql = """
        SELECT 
            COUNT(id) as delivered_lots,
            COALESCE(SUM(actual_dry_weight), 0) as delivered_dry_weight,
            COALESCE(SUM(bill_amount), 0) as delivered_billed
        FROM public.batches
        WHERE branch_id = %s::uuid
          AND status = 'Delivered'
          AND (
            (delivered_at >= %s::timestamptz AND delivered_at <= %s::timestamptz)
            OR (updated_at >= %s::timestamptz AND updated_at <= %s::timestamptz)
          )
    """
    deliv_rows = await db.query(deliv_sql, [branch_id, start_utc, end_utc, start_utc, end_utc])
    deliv_row = deliv_rows[0] if deliv_rows else {}
    deliv_lots = deliv_row.get("delivered_lots", 0)
    deliv_dry_weight = float(deliv_row.get("delivered_dry_weight", 0.0))
    deliv_billed = float(deliv_row.get("delivered_billed", 0.0))
    
    # 4. Collections Today
    pay_sql = """
        SELECT 
            COALESCE(SUM(amount), 0) as total_collected
        FROM public.payments
        WHERE branch_id = %s::uuid
          AND created_at >= %s::timestamptz AND created_at <= %s::timestamptz
    """
    pay_rows = await db.query(pay_sql, [branch_id, start_utc, end_utc])
    pay_row = pay_rows[0] if pay_rows else {}
    total_collected = float(pay_row.get("total_collected", 0.0))

    # Read Settings for Include Financials
    d_doc = await db.settings.find_one({"key": "daily_report_settings"})
    settings = (d_doc or {}).get("value") or {}
    inc_fin = settings.get("include_financials", True)

    dt_obj = datetime.strptime(cur_date_str, "%Y-%m-%d")
    date_display = dt_obj.strftime("%d-%b-%Y")
    time_display = now_ist.strftime("%I:%M %p")
    
    arr_lines = []
    for r in arrival_rows:
        arr_lines.append(f"   • {r.get('product_name')}: {float(r.get('total_weight', 0)):,.2f} KG ({r.get('lot_count')} Lots)")
    arr_breakdown = "\n".join(arr_lines) if arr_lines else "   • _(No new arrivals recorded today)_"

    financials_text = ""
    if inc_fin:
        financials_text = (
            f"\n💰 *4. BILLING & COLLECTIONS*\n"
            f"• Day Billing: *₹{deliv_billed:,.2f}*\n"
            f"• Day Collections: *₹{total_collected:,.2f}*\n"
        )

    message = (
        f"🌿 *E3 SPICES — DAILY SUMMARY*\n"
        f"📍 *Branch: {branch_name.upper()}*\n"
        f"📅 *Date: {date_display} ({time_display})*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📥 *1. ARRIVALS RECEIVED TODAY*\n"
        f"• Total Lots: *{total_arr_lots} Lots* ({total_arr_bags} Bags)\n"
        f"• Total Wet Weight: *{total_arr_weight:,.2f} KG*\n"
        f"{arr_breakdown}\n\n"
        f"🔥 *2. DRYER PROCESSING STATUS*\n"
        f"• Active Running: *{running_machines} Dryers* ({running_weight:,.2f} KG Wet)\n"
        f"• Completed Today: *{comp_lots} Batches* ({comp_dry_weight:,.2f} KG Dry)\n"
        f"• Machines: {total_machines - avail_machines} In-Use / {avail_machines} Available\n\n"
        f"📦 *3. DELIVERIES TODAY*\n"
        f"• Produce Delivered: *{deliv_lots} Batches*\n"
        f"• Dry Dispatched: *{deliv_dry_weight:,.2f} KG*\n"
        f"{financials_text}"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"_Auto-generated by E3 Management System_"
    )
    
    return {
        "branch_id": branch_id,
        "branch_name": branch_name,
        "date": cur_date_str,
        "total_arr_weight": total_arr_weight,
        "total_arr_lots": total_arr_lots,
        "running_machines": running_machines,
        "comp_dry_weight": comp_dry_weight,
        "deliv_dry_weight": deliv_dry_weight,
        "deliv_billed": deliv_billed,
        "total_collected": total_collected,
        "report_phones": branch.get("report_phones", ""),
        "message": message
    }


def generate_consolidated_daily_summary(summaries: list) -> dict:
    """Builds a single consolidated daily operational summary covering all branches."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(timezone.utc).astimezone(ist_tz)
    date_display = now_ist.strftime("%d-%b-%Y")
    time_display = now_ist.strftime("%I:%M %p")

    total_wet = sum(s.get("total_arr_weight", 0.0) for s in summaries)
    total_lots = sum(s.get("total_arr_lots", 0) for s in summaries)
    total_running = sum(s.get("running_machines", 0) for s in summaries)
    total_comp_dry = sum(s.get("comp_dry_weight", 0.0) for s in summaries)
    total_deliv_dry = sum(s.get("deliv_dry_weight", 0.0) for s in summaries)
    total_deliv_billed = sum(s.get("deliv_billed", 0.0) for s in summaries)
    total_collected = sum(s.get("total_collected", 0.0) for s in summaries)

    active_blocks = []
    inactive_branches = []

    for s in summaries:
        b_name = s.get("branch_name", "Branch")
        arr_wt = s.get("total_arr_weight", 0.0)
        arr_lts = s.get("total_arr_lots", 0)
        run_m = s.get("running_machines", 0)
        deliv_wt = s.get("deliv_dry_weight", 0.0)
        deliv_bill = s.get("deliv_billed", 0.0)
        col = s.get("total_collected", 0.0)

        # Only detail branches with actual operational activity
        if arr_wt > 0 or run_m > 0 or deliv_wt > 0 or deliv_bill > 0 or col > 0:
            lines = [f"📍 *{b_name.upper()}*"]
            if arr_wt > 0:
                lines.append(f"• Arrivals: *{arr_wt:,.1f} KG* ({arr_lts} Lots)")
            if run_m > 0:
                lines.append(f"• Dryers: *{run_m} Running*")
            if deliv_wt > 0:
                lines.append(f"• Delivered: *{deliv_wt:,.1f} KG Dry*")
            if deliv_bill > 0 or col > 0:
                lines.append(f"• Billing: ₹{deliv_bill:,.0f} | Recv: ₹{col:,.0f}")
            active_blocks.append("\n".join(lines))
        else:
            inactive_branches.append(b_name)

    body_parts = []
    if active_blocks:
        body_parts.append("\n\n".join(active_blocks))
    else:
        body_parts.append("_(No branch activity recorded today)_")

    if inactive_branches:
        body_parts.append(f"💤 *Idle Branches (0 activity):* {', '.join(inactive_branches)}")

    branches_text = "\n\n".join(body_parts)

    message = (
        f"🌿 *E3 SPICES — DAILY EXECUTIVE SUMMARY*\n"
        f"📅 *{date_display} ({time_display})*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📊 *CONSOLIDATED TOTALS*\n"
        f"• Wet Arrivals: *{total_wet:,.1f} KG ({total_lots} Lots)*\n"
        f"• Active Dryers: *{total_running} Running*\n"
        f"• Delivered: *{total_deliv_dry:,.1f} KG Dry*\n"
        f"• Day Billing: *₹{total_deliv_billed:,.0f}* | Recv: *₹{total_collected:,.0f}*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{branches_text}\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"_Auto-generated by E3 Management System_"
    )

    arr_summary = f"{total_wet:,.1f} KG ({total_lots} Lots)"
    dryers_summary = f"{total_running} Running ({total_comp_dry:,.1f} KG Dry Done)"
    deliv_summary = f"{total_deliv_dry:,.1f} KG Dry"
    fin_summary = f"Billed: Rs. {total_deliv_billed:,.0f} | Recv: Rs. {total_collected:,.0f}"

    return {
        "branch_id": "all",
        "branch_name": f"All Branches ({len(summaries)})",
        "date": date_display,
        "is_consolidated": True,
        "total_arr_weight": total_wet,
        "total_arr_lots": total_lots,
        "running_machines": total_running,
        "comp_dry_weight": total_comp_dry,
        "deliv_dry_weight": total_deliv_dry,
        "deliv_billed": total_deliv_billed,
        "total_collected": total_collected,
        "arr_summary": arr_summary,
        "dryers_summary": dryers_summary,
        "deliv_summary": deliv_summary,
        "fin_summary": fin_summary,
        "message": message
    }


async def dispatch_daily_reports(
    target_branch_id: Optional[str] = None,
    override_phone: Optional[str] = None,
    admin_phones_override: Optional[str] = None,
    target_date_str: Optional[str] = None
):
    d_doc = await db.settings.find_one({"key": "daily_report_settings"})
    settings = (d_doc or {}).get("value") or {}
    admin_phones_str = admin_phones_override if admin_phones_override is not None else settings.get("admin_phones", "")
    admin_phones = [clean_phone_number(p.strip()) for p in admin_phones_str.replace(";", ",").split(",") if p.strip()]

    # Case 1: Single specific branch requested
    if target_branch_id:
        b = await db.branches.find_one({"id": target_branch_id}, {"_id": 0})
        if not b:
            return []
        summary = await generate_branch_daily_summary(target_branch_id, target_date_str=target_date_str)
        msg = summary.get("message", "")
        if override_phone:
            phones = [clean_phone_number(override_phone)]
        else:
            b_phones = [clean_phone_number(p.strip()) for p in (b.get("report_phones") or "").replace(";", ",").split(",") if p.strip()]
            if not b_phones:
                try:
                    incharges = await db.query(
                        "SELECT mobile FROM public.profiles WHERE branch_id = %s AND role IN ('Store Incharge', 'Manager', 'Store Manager')",
                        (target_branch_id,)
                    )
                    b_phones = [clean_phone_number(inc.get("mobile", "")) for inc in (incharges or []) if clean_phone_number(inc.get("mobile", ""))]
                except Exception as e:
                    logger.warning(f"Could not fetch profile incharges: {e}")
            phones = list(dict.fromkeys([p for p in (b_phones + admin_phones) if p]))

        arr_summary = f"{summary.get('total_arr_weight', 0):,.1f} KG ({summary.get('total_arr_lots', 0)} Lots)"
        dryers_summary = f"{summary.get('running_machines', 0)} Active ({summary.get('comp_dry_weight', 0):,.1f} KG Dry)"
        deliv_summary = f"{summary.get('deliv_dry_weight', 0):,.1f} KG Dry"
        fin_summary = f"Billed: Rs. {summary.get('deliv_billed', 0):,.0f} | Recv: Rs. {summary.get('total_collected', 0):,.0f}"

        recipients = []
        for phone in phones:
            try:
                res = await send_daily_summary_whatsapp(
                    to_phone=phone,
                    branch_name=b.get("name", "Branch"),
                    date_display=summary.get("date", ""),
                    arr_summary=arr_summary,
                    dryers_summary=dryers_summary,
                    deliv_summary=deliv_summary,
                    fin_summary=fin_summary,
                    full_message_text=msg
                )
                recipients.append({"phone": phone, "result": res})
            except Exception as ex:
                recipients.append({"phone": phone, "error": str(ex)})
        return [{"branch_id": target_branch_id, "branch_name": b.get("name"), "recipients": recipients}]

    # Case 2: Multi-branch / All branches dispatch
    branches = await db.branches.find({}, {"_id": 0}).to_list(200)
    summaries = []
    results = []

    # 1. Collect individual branch summaries and send ONLY to that branch's manager (1 single msg per manager)
    for branch in branches:
        bid = branch["id"]
        summary = await generate_branch_daily_summary(bid, target_date_str=target_date_str)
        summaries.append(summary)

        manager_phones_str = branch.get("report_phones", "") or ""
        manager_phones = [clean_phone_number(p.strip()) for p in manager_phones_str.replace(";", ",").split(",") if p.strip()]

        # Auto-fallback: if report_phones is not configured on branch, lookup Store Incharge & Manager profiles
        if not manager_phones:
            try:
                incharges = await db.query(
                    "SELECT mobile FROM public.profiles WHERE branch_id = %s AND role IN ('Store Incharge', 'Manager', 'Store Manager')",
                    (bid,)
                )
                for inc in (incharges or []):
                    cleaned = clean_phone_number(inc.get("mobile", ""))
                    if cleaned and cleaned not in manager_phones:
                        manager_phones.append(cleaned)
            except Exception as e:
                logger.warning(f"Could not fetch profile incharges for branch {bid}: {e}")

        # Deduplicate & avoid sending to admin phones (admins receive the executive summary)
        target_managers = list(dict.fromkeys([p for p in manager_phones if p and p not in admin_phones]))
        if target_managers:
            msg = summary.get("message", "")
            arr_s = f"{summary.get('total_arr_weight', 0):,.1f} KG ({summary.get('total_arr_lots', 0)} Lots)"
            dry_s = f"{summary.get('running_machines', 0)} Active ({summary.get('comp_dry_weight', 0):,.1f} KG Dry)"
            del_s = f"{summary.get('deliv_dry_weight', 0):,.1f} KG Dry"
            fin_s = f"Billed: Rs. {summary.get('deliv_billed', 0):,.0f} | Recv: Rs. {summary.get('total_collected', 0):,.0f}"

            recipients = []
            for phone in target_managers:
                try:
                    res = await send_daily_summary_whatsapp(
                        to_phone=phone,
                        branch_name=branch.get("name", "Branch"),
                        date_display=summary.get("date", ""),
                        arr_summary=arr_s,
                        dryers_summary=dry_s,
                        deliv_summary=del_s,
                        fin_summary=fin_s,
                        full_message_text=msg
                    )
                    recipients.append({"phone": phone, "result": res})
                except Exception as ex:
                    recipients.append({"phone": phone, "error": str(ex)})
            results.append({"branch_id": bid, "branch_name": branch.get("name"), "type": "branch_manager", "recipients": recipients})

    # 2. For Owner / Executives: Send ONE SINGLE consolidated message combining all branches!
    raw_exec_phones = [clean_phone_number(override_phone)] if override_phone else admin_phones
    exec_phones = list(dict.fromkeys([p for p in raw_exec_phones if p]))
    if exec_phones and summaries:
        consolidated = generate_consolidated_daily_summary(summaries)
        c_msg = consolidated["message"]
        recipients = []
        for phone in exec_phones:
            try:
                res = await send_daily_summary_whatsapp(
                    to_phone=phone,
                    branch_name="All Branches",
                    date_display=consolidated["date"],
                    arr_summary=consolidated["arr_summary"],
                    dryers_summary=consolidated["dryers_summary"],
                    deliv_summary=consolidated["deliv_summary"],
                    fin_summary=consolidated["fin_summary"],
                    full_message_text=c_msg
                )
                recipients.append({"phone": phone, "result": res})
            except Exception as ex:
                recipients.append({"phone": phone, "error": str(ex)})
        results.append({
            "branch_id": "all",
            "branch_name": "All Branches (Consolidated)",
            "type": "executive_consolidated",
            "recipients": recipients
        })

    return results

@api.get("/reports/daily-whatsapp/settings")
async def get_daily_whatsapp_settings(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"key": "daily_report_settings"}, {"_id": 0})
    val = (doc or {}).get("value") or {
        "enabled": True,
        "send_time": "21:00",
        "admin_phones": "",
        "include_financials": True,
        "last_sent_date": ""
    }
    return val

@api.put("/reports/daily-whatsapp/settings")
async def update_daily_whatsapp_settings(body: DailyReportSettingsUpdate, user: dict = Depends(require_roles("Admin"))):
    doc = await db.settings.find_one({"key": "daily_report_settings"}, {"_id": 0})
    cur = (doc or {}).get("value") or {
        "enabled": True,
        "send_time": "21:00",
        "admin_phones": "",
        "include_financials": True,
        "last_sent_date": ""
    }
    if body.enabled is not None:
        cur["enabled"] = body.enabled
    if body.send_time is not None:
        cur["send_time"] = body.send_time.strip()
    if body.admin_phones is not None:
        cur["admin_phones"] = body.admin_phones.strip()
    if body.include_financials is not None:
        cur["include_financials"] = body.include_financials

    await db.settings.update_one(
        {"key": "daily_report_settings"},
        {"$set": {"value": cur}},
        upsert=True
    )
    return cur

@api.get("/reports/daily-whatsapp/preview")
async def preview_daily_whatsapp(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if branch_id:
        return [await generate_branch_daily_summary(branch_id)]
    branches = await db.branches.find({}, {"_id": 0}).to_list(200)
    summaries = []
    for b in branches:
        s = await generate_branch_daily_summary(b["id"])
        summaries.append(s)
    if summaries:
        consolidated = generate_consolidated_daily_summary(summaries)
        return [consolidated] + summaries
    return []

@api.post("/reports/daily-whatsapp/send-now")
async def send_daily_whatsapp_now(body: DailyReportSendNowReq, user: dict = Depends(require_roles("Admin"))):
    if body.admin_phones is not None:
        d_doc = await db.settings.find_one({"key": "daily_report_settings"}, {"_id": 0})
        cur = (d_doc or {}).get("value") or {}
        cur["admin_phones"] = body.admin_phones.strip()
        await db.settings.update_one(
            {"key": "daily_report_settings"},
            {"$set": {"value": cur}},
            upsert=True
        )

    results = await dispatch_daily_reports(
        target_branch_id=body.branch_id,
        override_phone=body.phone,
        admin_phones_override=body.admin_phones,
        target_date_str=body.target_date
    )
    return {"success": True, "results": results}


class SendSmsReq(BaseModel):
    phone: str
    message: str


@api.get("/sms/wallet")
async def get_sms_wallet(user: dict = Depends(require_roles("Admin"))):
    return await check_sms_wallet()


@api.post("/sms/send")
async def send_custom_sms(body: SendSmsReq, user: dict = Depends(require_roles("Admin"))):
    return await send_sms(body.phone, body.message)


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
