import os
import glob
import json
import base64
import logging
from typing import Dict, Any, List, Optional
import gspread

logger = logging.getLogger("ethree.sheets")

TAB_HEADERS = {
    "Arrivals": [
        "Arrival Date",
        "Time",
        "Branch",
        "Batch No",
        "Receipt No",
        "Customer Name",
        "Customer Code",
        "Mobile",
        "Spice / Produce",
        "Wet Weight (KG)",
        "Bags",
        "Rate / KG (₹)",
        "Status",
        "Received From",
        "Created At"
    ],
    "Drying Batches": [
        "Batch No",
        "Branch",
        "Customer Name",
        "Customer Code",
        "Spice",
        "Machine / Dryer",
        "Status",
        "Loaded Wet Weight (KG)",
        "Unloaded Dry Weight (KG)",
        "Wet to Dry Ratio",
        "Processing Started",
        "Processing Ended",
        "Total Hours"
    ],
    "Deliveries": [
        "Delivery Date",
        "Branch",
        "Batch No",
        "Customer Name",
        "Customer Code",
        "Mobile",
        "Spice",
        "Delivered Dry Weight (KG)",
        "Delivered To",
        "Bill Amount (₹)",
        "Total Paid (₹)",
        "Balance Due (₹)",
        "Status"
    ],
    "Payments": [
        "Payment Date",
        "Branch",
        "Receipt / Ref No",
        "Customer Name",
        "Customer Code",
        "Mobile",
        "Amount Paid (₹)",
        "Payment Mode",
        "Batch Ref",
        "Remarks",
        "Recorded By",
        "Created At"
    ],
    "Expenses": [
        "Expense Date",
        "Branch",
        "Category",
        "Description",
        "Amount (₹)",
        "Paid To",
        "Payment Mode",
        "Receipt / Ref",
        "Recorded By",
        "Created At"
    ],
    "Customers": [
        "Customer Code",
        "Customer Name",
        "Mobile",
        "Alt Mobile",
        "Branch",
        "Village",
        "Taluk",
        "District",
        "Total Arrivals",
        "Total Billed (₹)",
        "Total Paid (₹)",
        "Balance Due (₹)",
        "WhatsApp Alerts",
        "Registered Date",
        "Remarks"
    ]
}


def find_credentials_file() -> Optional[str]:
    """Find service account json in backend root."""
    explicit = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    if explicit and os.path.exists(explicit):
        return explicit
    
    # Search common patterns in backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = glob.glob(os.path.join(backend_dir, "*e3-agro*.json")) + \
                 glob.glob(os.path.join(backend_dir, "*service_account*.json")) + \
                 glob.glob(os.path.join(backend_dir, "google_credentials.json"))
    if candidates:
        return candidates[0]
    return None


def get_sheets_client(service_account_info: Optional[Dict[str, Any]] = None, sheet_id: Optional[str] = None) -> Optional[gspread.Spreadsheet]:
    """Get authenticated gspread Spreadsheet instance from dict, env, or credentials file."""
    target_sheet_id = (sheet_id or os.getenv("GOOGLE_SHEET_ID", "1iEJ2YnB47crLOiOtRr3qowWCBeLV4BslRGg4JNDUC-E")).strip()
    if not target_sheet_id:
        logger.debug("GOOGLE_SHEET_ID not set")
        return None

    try:
        # 1. Direct dictionary passed
        if service_account_info:
            gc = gspread.service_account_from_dict(service_account_info)
            return gc.open_by_key(target_sheet_id)

        # 2. Raw JSON string in GOOGLE_SERVICE_ACCOUNT_JSON env var
        env_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
        if env_json:
            try:
                info = json.loads(env_json)
                gc = gspread.service_account_from_dict(info)
                return gc.open_by_key(target_sheet_id)
            except Exception as ex:
                logger.warning(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: {ex}")

        # 3. Base64-encoded JSON in GOOGLE_SERVICE_ACCOUNT_BASE64 env var
        env_b64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_BASE64", "").strip()
        if env_b64:
            try:
                decoded = base64.b64decode(env_b64).decode("utf-8")
                info = json.loads(decoded)
                gc = gspread.service_account_from_dict(info)
                return gc.open_by_key(target_sheet_id)
            except Exception as ex:
                logger.warning(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_BASE64: {ex}")

        # 4. Search local credentials file on disk
        creds_path = find_credentials_file()
        if creds_path:
            gc = gspread.service_account(filename=creds_path)
            return gc.open_by_key(target_sheet_id)

        # 5. Database fallback: Load credentials securely from public.settings table
        global _cached_service_account_info
        if "_cached_service_account_info" in globals() and _cached_service_account_info:
            gc = gspread.service_account_from_dict(_cached_service_account_info)
            return gc.open_by_key(target_sheet_id)

        db_url = os.getenv("DATABASE_URL")
        if db_url:
            try:
                import psycopg
                from psycopg.rows import dict_row
                with psycopg.connect(db_url, row_factory=dict_row) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT value FROM public.settings WHERE key = 'google_service_account' LIMIT 1")
                        row = cur.fetchone()
                        if row and row.get("value"):
                            info = row["value"] if isinstance(row["value"], dict) else json.loads(row["value"])
                            _cached_service_account_info = info
                            gc = gspread.service_account_from_dict(info)
                            return gc.open_by_key(target_sheet_id)
            except Exception as db_err:
                logger.debug(f"Failed to load service account from DB: {db_err}")

        logger.debug("Google service account credentials not found in env, file, or DB settings")
        return None
    except Exception as e:
        logger.error(f"Failed to connect to Google Sheet {target_sheet_id}: {e}")
        return None


def ensure_worksheet(sh: gspread.Spreadsheet, title: str, headers: List[str]) -> gspread.Worksheet:
    """Ensure worksheet exists with properly formatted headers."""
    try:
        ws = sh.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=title, rows=1000, cols=len(headers) + 2)
        # Delete default 'Sheet1' if it exists and is empty
        try:
            default_ws = sh.worksheet("Sheet1")
            if default_ws.row_count <= 100 and default_ws.get_all_values() == []:
                sh.del_worksheet(default_ws)
        except Exception:
            pass

    # Ensure header row
    existing_headers = ws.row_values(1)
    if not existing_headers:
        ws.append_row(headers)
        # Format top row bold
        try:
            ws.format("A1:Z1", {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.9, "green": 0.95, "blue": 0.9}
            })
            ws.freeze(rows=1)
        except Exception:
            pass
    return ws


async def append_row_async(tab_name: str, row_values: List[Any]) -> bool:
    """Append row into specific tab in background."""
    try:
        sh = get_sheets_client()
        if not sh:
            return False
        headers = TAB_HEADERS.get(tab_name, [])
        ws = ensure_worksheet(sh, tab_name, headers)
        # Clean values for JSON serializability
        clean_row = ["" if v is None else str(v) for v in row_values]
        ws.append_row(clean_row, value_input_option="USER_ENTERED")
        logger.info(f"Appended row to Google Sheet tab '{tab_name}': {clean_row[:3]}")
        return True
    except Exception as ex:
        logger.error(f"Failed to append to Google Sheet tab '{tab_name}': {ex}")
        return False


# ---------------------------- SPECIALIZED SYNC HELPERS ----------------------------

async def sync_arrival_to_sheets(batch: dict, branch_name: str = "", customer: dict = None, product_name: str = ""):
    """Sync an arrival batch record to Google Sheets."""
    c_name = (customer or {}).get("name") or batch.get("customer_name") or ""
    c_code = (customer or {}).get("code") or batch.get("customer_code") or ""
    c_mob = (customer or {}).get("mobile") or batch.get("customer_mobile") or ""
    
    arr_date = str(batch.get("arrival_date") or batch.get("created_at") or "")[:10]
    arr_time = str(batch.get("arrival_date") or batch.get("created_at") or "")[11:16]
    
    row = [
        arr_date,
        arr_time,
        branch_name or batch.get("branch_name") or "",
        batch.get("batch_no") or "",
        batch.get("receipt_no") or "",
        c_name,
        c_code,
        c_mob,
        product_name or batch.get("product_name") or "Cardamom",
        batch.get("raw_weight", 0),
        batch.get("bags", 0),
        batch.get("rate_per_kg", 12),
        batch.get("status", "Received"),
        batch.get("received_from") or c_name,
        str(batch.get("created_at") or "")[:19]
    ]
    return await append_row_async("Arrivals", row)


async def mark_arrival_deleted_in_sheets(batch_no: str, user_name: str = "", deleted_at: str = "") -> bool:
    """Find row matching batch_no in 'Arrivals' tab and update Status to 'DELETED' (Option A)."""
    try:
        sh = get_sheets_client()
        if not sh:
            return False
        
        headers = TAB_HEADERS.get("Arrivals", [])
        ws = ensure_worksheet(sh, "Arrivals", headers)

        def _update_sheet():
            found = False
            # Find matching cell in Column 4 (Batch No)
            try:
                cell = ws.find(batch_no, in_column=4)
            except Exception:
                cell = None
            if not cell:
                try:
                    cell = ws.find(batch_no)
                except Exception:
                    cell = None

            if cell:
                # Status is column 13 (M)
                del_tag = f"DELETED ({user_name})" if user_name else "DELETED"
                ws.update_cell(cell.row, 13, del_tag)
                try:
                    # Strike-through row with subtle red highlight
                    ws.format(f"A{cell.row}:O{cell.row}", {
                        "backgroundColor": {"red": 1.0, "green": 0.93, "blue": 0.93},
                        "textFormat": {"strikethrough": True, "foregroundColor": {"red": 0.7, "green": 0.1, "blue": 0.1}}
                    })
                except Exception as fmt_err:
                    logger.debug(f"Row format skipped: {fmt_err}")
                logger.info(f"Marked batch {batch_no} as DELETED in Google Sheets Arrivals tab at row {cell.row}")
                found = True

            # Also check Drying Batches tab if it was loaded
            try:
                d_headers = TAB_HEADERS.get("Drying Batches", [])
                d_ws = ensure_worksheet(sh, "Drying Batches", d_headers)
                d_cell = d_ws.find(batch_no, in_column=1)
                if d_cell:
                    d_ws.update_cell(d_cell.row, 7, f"DELETED ({user_name})" if user_name else "DELETED")
                    try:
                        d_ws.format(f"A{d_cell.row}:M{d_cell.row}", {
                            "backgroundColor": {"red": 1.0, "green": 0.93, "blue": 0.93},
                            "textFormat": {"strikethrough": True}
                        })
                    except Exception:
                        pass
            except Exception as d_ex:
                logger.debug(f"Drying sheet check skipped: {d_ex}")

            return found

        return await asyncio.to_thread(_update_sheet)
    except Exception as ex:
        logger.error(f"Failed to mark batch {batch_no} as DELETED in Google Sheets: {ex}")
        return False


async def sync_drying_batch_to_sheets(batch: dict, branch_name: str = "", customer: dict = None, machine_name: str = ""):
    """Sync drying batch processing row to Google Sheets."""
    c_name = (customer or {}).get("name") or batch.get("customer_name") or ""
    c_code = (customer or {}).get("code") or batch.get("customer_code") or ""
    
    raw_wt = float(batch.get("raw_weight") or 0)
    dry_wt = float(batch.get("actual_dry_weight") or 0)
    ratio_str = f"{(raw_wt / dry_wt):.1f}" if raw_wt > 0 and dry_wt > 0 else ""
    
    st_time = str(batch.get("processing_started_at") or "")[:16]
    end_time = str(batch.get("processing_ended_at") or "")[:16]
    
    row = [
        batch.get("batch_no") or "",
        branch_name or batch.get("branch_name") or "",
        c_name,
        c_code,
        batch.get("product_name") or "Cardamom",
        machine_name or batch.get("machine_name") or "",
        batch.get("status") or "Drying",
        raw_wt,
        dry_wt if dry_wt > 0 else "",
        ratio_str,
        st_time,
        end_time,
        batch.get("drying_hours") or ""
    ]
    return await append_row_async("Drying Batches", row)


async def sync_delivery_to_sheets(batch: dict, branch_name: str = "", customer: dict = None):
    """Sync delivery event to Google Sheets."""
    c_name = (customer or {}).get("name") or batch.get("customer_name") or ""
    c_code = (customer or {}).get("code") or batch.get("customer_code") or ""
    c_mob = (customer or {}).get("mobile") or batch.get("customer_mobile") or ""
    deliv_date = str(batch.get("delivered_at") or batch.get("arrival_date") or "")[:10]
    
    row = [
        deliv_date,
        branch_name or batch.get("branch_name") or "",
        batch.get("batch_no") or "",
        c_name,
        c_code,
        c_mob,
        batch.get("product_name") or "Cardamom",
        batch.get("actual_dry_weight") or 0,
        batch.get("delivered_to") or c_name,
        batch.get("bill_amount") or 0,
        batch.get("total_paid") or 0,
        batch.get("balance_amount") or 0,
        batch.get("status") or "Delivered"
    ]
    return await append_row_async("Deliveries", row)


async def sync_payment_to_sheets(payment: dict, branch_name: str = "", customer: dict = None, recorder_name: str = ""):
    """Sync payment receipt to Google Sheets."""
    c_name = (customer or {}).get("name") or payment.get("customer_name") or ""
    c_code = (customer or {}).get("code") or payment.get("customer_code") or ""
    c_mob = (customer or {}).get("mobile") or payment.get("customer_mobile") or ""
    p_date = str(payment.get("payment_date") or payment.get("created_at") or "")[:10]
    
    row = [
        p_date,
        branch_name or payment.get("branch_name") or "",
        payment.get("receipt_no") or "",
        c_name,
        c_code,
        c_mob,
        payment.get("amount") or 0,
        payment.get("mode") or "Cash",
        payment.get("batch_no") or payment.get("batch_id") or "",
        payment.get("remarks") or "",
        recorder_name or payment.get("recorded_by") or "",
        str(payment.get("created_at") or "")[:19]
    ]
    return await append_row_async("Payments", row)


async def sync_expense_to_sheets(expense: dict, branch_name: str = "", recorder_name: str = ""):
    """Sync business expense to Google Sheets."""
    e_date = str(expense.get("expense_date") or expense.get("date") or expense.get("created_at") or "")[:10]
    
    row = [
        e_date,
        branch_name or expense.get("branch_name") or "",
        expense.get("category") or "General",
        expense.get("description") or "",
        expense.get("amount") or 0,
        expense.get("paid_to") or "",
        expense.get("mode") or "Cash",
        expense.get("receipt_no") or expense.get("reference") or "",
        recorder_name or expense.get("recorded_by") or "",
        str(expense.get("created_at") or "")[:19]
    ]
    return await append_row_async("Expenses", row)


async def sync_customer_to_sheets(customer: dict, branch_name: str = ""):
    """Sync new customer to Google Sheets Customers tab."""
    c_date = str(customer.get("created_at") or "")[:10]
    row = [
        customer.get("code") or "",
        customer.get("name") or "",
        customer.get("mobile") or "",
        customer.get("alt_mobile") or "",
        branch_name or customer.get("branch_name") or "",
        customer.get("village") or "",
        customer.get("taluk") or "",
        customer.get("district") or "",
        customer.get("total_arrivals") or 0,
        customer.get("total_amount") or 0,
        customer.get("amount_received") or 0,
        (customer.get("total_amount") or 0) - (customer.get("amount_received") or 0),
        "Yes" if customer.get("whatsapp_enabled") else "No",
        c_date,
        customer.get("remarks") or ""
    ]
    return await append_row_async("Customers", row)


# ---------------------------- FULL BULK BACKFILL ----------------------------

async def bulk_sync_all_database_to_sheets(db, service_account_info: Optional[Dict[str, Any]] = None, sheet_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Export all existing records from Supabase/Postgres database
    directly into Google Sheets tabs (Arrivals, Drying, Deliveries, Payments, Expenses).
    """
    sh = get_sheets_client(service_account_info=service_account_info, sheet_id=sheet_id)
    if not sh:
        return {"success": False, "error": "Could not connect to Google Sheets with configured credentials."}

    counts = {"arrivals": 0, "drying": 0, "deliveries": 0, "payments": 0, "expenses": 0}

    # Fetch lookup maps
    branches_raw = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b.get("name", "Branch") for b in branches_raw}

    customers_raw = await db.customers.find({}, {"_id": 0}).to_list(5000)
    customer_map = {c["id"]: c for c in customers_raw}

    products_raw = await db.products.find({}, {"_id": 0}).to_list(100)
    product_map = {p["id"]: p.get("name", "Produce") for p in products_raw}

    machines_raw = await db.machines.find({}, {"_id": 0}).to_list(100)
    machine_map = {m["id"]: m.get("name", "Dryer") for m in machines_raw}

    # 1. Backfill Arrivals & Drying & Deliveries from Batches
    batches = await db.batches.find({}, {"_id": 0}).to_list(10000)
    
    arr_rows = []
    dry_rows = []
    del_rows = []

    for b in batches:
        bid = b.get("branch_id")
        b_name = branch_map.get(bid, "Main")
        cust = customer_map.get(b.get("customer_id"), {})
        c_name = cust.get("name") or b.get("customer_name") or ""
        c_code = cust.get("code") or b.get("customer_code") or ""
        c_mob = cust.get("mobile") or b.get("customer_mobile") or ""
        p_name = product_map.get(b.get("product_id"), "Cardamom")
        m_name = machine_map.get(b.get("machine_id"), "")

        # Arrival row
        arr_date = str(b.get("arrival_date") or b.get("created_at") or "")[:10]
        arr_time = str(b.get("arrival_date") or b.get("created_at") or "")[11:16]
        arr_rows.append([
            arr_date,
            arr_time,
            b_name,
            b.get("batch_no") or "",
            b.get("receipt_no") or "",
            c_name,
            c_code,
            c_mob,
            p_name,
            b.get("raw_weight", 0),
            b.get("bags", 0),
            b.get("rate_per_kg", 12),
            b.get("status", "Received"),
            b.get("received_from") or c_name,
            str(b.get("created_at") or "")[:19]
        ])

        # Drying row (if processed or loaded)
        raw_wt = float(b.get("raw_weight") or 0)
        dry_wt = float(b.get("actual_dry_weight") or 0)
        ratio_str = f"{(raw_wt / dry_wt):.1f}" if raw_wt > 0 and dry_wt > 0 else ""
        if b.get("status") in ("Loaded", "Drying", "Completed", "Delivered") or dry_wt > 0 or m_name:
            dry_rows.append([
                b.get("batch_no") or "",
                b_name,
                c_name,
                c_code,
                p_name,
                m_name,
                b.get("status") or "Drying",
                raw_wt,
                dry_wt if dry_wt > 0 else "",
                ratio_str,
                str(b.get("processing_started_at") or "")[:16],
                str(b.get("processing_ended_at") or "")[:16],
                b.get("drying_hours") or ""
            ])

        # Delivery row (if delivered)
        if b.get("status") == "Delivered" or b.get("delivered_at"):
            deliv_date = str(b.get("delivered_at") or b.get("arrival_date") or "")[:10]
            del_rows.append([
                deliv_date,
                b_name,
                b.get("batch_no") or "",
                c_name,
                c_code,
                c_mob,
                p_name,
                dry_wt,
                b.get("delivered_to") or c_name,
                b.get("bill_amount") or 0,
                b.get("total_paid") or 0,
                b.get("balance_amount") or 0,
                b.get("status") or "Delivered"
            ])

    # Helper to clean and overwrite worksheet data without leaving stale duplicates
    def overwrite_worksheet(ws: gspread.Worksheet, headers: List[str], rows: List[List[Any]]):
        ws.clear()
        clean_rows = [[("" if v is None else str(v)) for v in r] for r in rows]
        ws.update([headers] + clean_rows, value_input_option="USER_ENTERED")
        try:
            ws.freeze(rows=1)
            ws.format("A1:Z1", {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.9, "green": 0.95, "blue": 0.9}
            })
        except Exception:
            pass

    # Delete default Sheet1 if present
    try:
        s1 = sh.worksheet("Sheet1")
        sh.del_worksheet(s1)
    except Exception:
        pass

    # Populate Arrivals
    ws_arr = ensure_worksheet(sh, "Arrivals", TAB_HEADERS["Arrivals"])
    overwrite_worksheet(ws_arr, TAB_HEADERS["Arrivals"], arr_rows)
    counts["arrivals"] = len(arr_rows)

    # Populate Drying Batches
    ws_dry = ensure_worksheet(sh, "Drying Batches", TAB_HEADERS["Drying Batches"])
    overwrite_worksheet(ws_dry, TAB_HEADERS["Drying Batches"], dry_rows)
    counts["drying"] = len(dry_rows)

    # Populate Deliveries
    ws_del = ensure_worksheet(sh, "Deliveries", TAB_HEADERS["Deliveries"])
    overwrite_worksheet(ws_del, TAB_HEADERS["Deliveries"], del_rows)
    counts["deliveries"] = len(del_rows)

    # 2. Backfill Payments
    payments = await db.payments.find({}, {"_id": 0}).to_list(10000)
    pay_rows = []
    for p in payments:
        b_name = branch_map.get(p.get("branch_id"), "Main")
        cust = customer_map.get(p.get("customer_id"), {})
        c_name = cust.get("name") or p.get("customer_name") or ""
        c_code = cust.get("code") or p.get("customer_code") or ""
        c_mob = cust.get("mobile") or p.get("customer_mobile") or ""
        p_date = str(p.get("payment_date") or p.get("created_at") or "")[:10]
        pay_rows.append([
            p_date,
            b_name,
            p.get("receipt_no") or "",
            c_name,
            c_code,
            c_mob,
            p.get("amount") or 0,
            p.get("mode") or "Cash",
            p.get("batch_no") or p.get("batch_id") or "",
            p.get("remarks") or "",
            p.get("recorded_by") or "",
            str(p.get("created_at") or "")[:19]
        ])

    ws_pay = ensure_worksheet(sh, "Payments", TAB_HEADERS["Payments"])
    overwrite_worksheet(ws_pay, TAB_HEADERS["Payments"], pay_rows)
    counts["payments"] = len(pay_rows)

    # 3. Backfill Expenses
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(10000)
    exp_rows = []
    for e in expenses:
        b_name = branch_map.get(e.get("branch_id"), "Main")
        e_date = str(e.get("expense_date") or e.get("date") or e.get("created_at") or "")[:10]
        exp_rows.append([
            e_date,
            b_name,
            e.get("category") or "General",
            e.get("description") or "",
            e.get("amount") or 0,
            e.get("paid_to") or "",
            e.get("mode") or "Cash",
            e.get("receipt_no") or e.get("reference") or "",
            e.get("recorded_by") or "",
            str(e.get("created_at") or "")[:19]
        ])

    ws_exp = ensure_worksheet(sh, "Expenses", TAB_HEADERS["Expenses"])
    overwrite_worksheet(ws_exp, TAB_HEADERS["Expenses"], exp_rows)
    counts["expenses"] = len(exp_rows)

    # 4. Backfill Customers
    cust_rows = []
    for c in customers_raw:
        c_bid = c.get("branch_id")
        b_name = branch_map.get(c_bid, "Main")
        c_date = str(c.get("created_at") or "")[:10]
        tot_arr = c.get("total_arrivals") or 0
        tot_bill = c.get("total_amount") or 0
        tot_paid = c.get("amount_received") or 0
        bal = tot_bill - tot_paid
        cust_rows.append([
            c.get("code") or "",
            c.get("name") or "",
            c.get("mobile") or "",
            c.get("alt_mobile") or "",
            b_name,
            c.get("village") or "",
            c.get("taluk") or "",
            c.get("district") or "",
            tot_arr,
            tot_bill,
            tot_paid,
            bal,
            "Yes" if c.get("whatsapp_enabled") else "No",
            c_date,
            c.get("remarks") or ""
        ])

    ws_cust = ensure_worksheet(sh, "Customers", TAB_HEADERS["Customers"])
    overwrite_worksheet(ws_cust, TAB_HEADERS["Customers"], cust_rows)
    counts["customers"] = len(cust_rows)

    # 5. Ensure Executive Dashboard Tab
    try:
        from build_dashboard_sheet import build_dashboard
        build_dashboard()
        counts["dashboard"] = True
    except Exception as ex:
        logger.warning(f"Failed to ensure dashboard tab: {ex}")

    logger.info(f"Bulk sync complete to Google Sheet: {counts}")
    return {"success": True, "sheet_title": sh.title, "counts": counts}

