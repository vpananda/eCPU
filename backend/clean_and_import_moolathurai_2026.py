import asyncio, os, sys, openpyxl, re, uuid, json
from datetime import datetime, timezone, timedelta, date

sys.path.insert(0, os.path.abspath('backend'))
from server import db

EXCEL_PATH = r'C:\Users\AnandVenkateshPandia\Downloads\E3_eCPU_2026_Details.xlsx'
MOOLATHURAI_BRANCH_ID = '7b553d0b-9084-4c94-a70a-de1bccab9a71'
ADMIN_ID = '736f815d-1db3-427e-a01b-42b5003fa398'
PRODUCT_CARDAMOM_ID = 'd9461e14-7a2d-4635-b4c5-fafc0d5fdaa8'

CATEGORY_MAP = {
    'fuel': 'Diesel',
    'power charge': 'Electricity',
    'washing': 'Labor',
    'mc operation amount': 'Labor',
    'maintanence': 'Machine Maintenance',
    'transport': 'Transport',
    'trasport': 'Transport',
    'printing & stationery': 'Office Expense',
    'pooja': 'Miscellaneous',
    'dryer payment': 'Repair',
    'donation': 'Miscellaneous',
    'other expenses': 'Miscellaneous',
    'e three agro': 'Company Transfer',
    'other income': 'Other Income',
}

def clean_str(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s).strip())

def parse_date(d_val):
    if isinstance(d_val, datetime):
        return d_val.date().isoformat()
    if isinstance(d_val, date):
        return d_val.isoformat()
    s = str(d_val).strip()[:10]
    return s

async def main():
    print("=== STARTING CLEAN & RE-IMPORT FOR MOOLATHURAI BRANCH (JUNE 2026 ONWARDS) ===")
    await db.open()

    if not os.path.exists(EXCEL_PATH):
        raise FileNotFoundError(f"Excel file not found at {EXCEL_PATH}")

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws_det = wb['Details']
    ws_cb = wb['Cash Book']

    db_custs = await db.customers.find({}).to_list(1000)
    cust_map = {}
    for c in db_custs:
        cust_map[clean_str(c['name']).lower()] = c

    locations = ['moolathurai', 'kajanaparai', 'kajanapparai', 'korambarai', 'koramparai', 'waynadu', 'periyakanal', 'pethotti', 'bodi', 'vakkodacity', 'kolaparchichal']

    def resolve_customer_name(raw_name):
        c_clean = clean_str(raw_name)
        c_lower = c_clean.lower()
        if not c_lower:
            return None
        if c_lower in cust_map:
            return cust_map[c_lower]
        for loc in locations:
            for sp in [' ' + loc, '-' + loc, ' - ' + loc, ' (' + loc + ')', '(' + loc + ')']:
                if c_lower.endswith(sp):
                    prefix = clean_str(c_lower[:-len(sp)])
                    if prefix in cust_map:
                        return cust_map[prefix]
        for db_n, c_obj in cust_map.items():
            if len(db_n) >= 4 and (c_lower.startswith(db_n + ' ') or c_lower.startswith(db_n + '-') or c_lower.startswith(db_n + '(')):
                return c_obj
        return None

    aliases = {
        'vkg ganesan': 'ganesan k moolathurai (vkg)',
        'saravanan (koodalingam)': 'koodalingam moolathurai(saravanan)',
        'prabhu (ravi moolathurai)': 'prabhu (ravi moolathurai)',
        'vasantha moolathurai': 'vasantha',
        'venkatesan': 'venkatesan kajanaparai',
        'kajanaparai': 'kajanaparai collection',
        'kajanaparai ': 'kajanaparai collection'
    }

    db_machines = await db.machines.find({"branch_id": MOOLATHURAI_BRANCH_ID}).to_list(50)
    mach_map = {}
    for m in db_machines:
        m_name = m['name'].lower()
        nums = re.findall(r'\d+', m_name)
        if nums:
            mach_map[int(nums[0])] = m['id']
            mach_map[str(nums[0])] = m['id']

    # STEP 1: CLEAN / WIPE EXISTING JUNE 2026+ MOOLATHURAI DATA
    print("\n--- STEP 1: Cleaning existing June 2026+ data for Moolathurai branch ---")
    del_pays = await db.query("""
        DELETE FROM public.payments
        WHERE branch_id = %s AND created_at >= '2026-06-01'
        RETURNING id
    """, [MOOLATHURAI_BRANCH_ID])
    print(f"Deleted {len(del_pays)} existing 2026 payments.")

    del_exps = await db.query("""
        DELETE FROM public.expenses
        WHERE branch_id = %s AND (expense_date >= '2026-06-01' OR created_at >= '2026-06-01')
        RETURNING id
    """, [MOOLATHURAI_BRANCH_ID])
    print(f"Deleted {len(del_exps)} existing 2026 expenses.")

    del_batches = await db.query("""
        DELETE FROM public.batches
        WHERE branch_id = %s AND arrival_date >= '2026-06-01'
        RETURNING id
    """, [MOOLATHURAI_BRANCH_ID])
    print(f"Deleted {len(del_batches)} existing 2026 batches.")

    # STEP 2: PREPARE & INSERT BATCHES (FAST BATCHING)
    print("\n--- STEP 2: Importing Details batches from Excel ---")
    max_b = await db.query("SELECT batch_no FROM public.batches WHERE batch_no ~ '^B[0-9]+$' ORDER BY cast(substring(batch_no from 2) as integer) DESC LIMIT 1")
    start_num = int(max_b[0]['batch_no'][1:]) + 1 if max_b else 1000
    print(f"Starting next batch sequence: B{start_num:05d}")

    batches_to_insert = []
    b_num = start_num

    for row in ws_det.iter_rows(min_row=2, max_row=650, values_only=True):
        sl, dt, cust, mach, kg, rate, amt, recv = row[:8]
        if not dt or not cust or not kg or float(kg or 0) <= 0:
            continue
        iso_date = parse_date(dt)
        if iso_date < '2026-06-01':
            continue

        cust_str = clean_str(cust)
        c_lookup = aliases.get(cust_str.lower(), cust_str)
        c_obj = resolve_customer_name(c_lookup)
        if not c_obj:
            new_id = str(uuid.uuid4())
            mob = f"9000{len(cust_map)+1:06d}"
            await db.execute("""
                INSERT INTO public.customers (id, name, mobile, branch_id, created_at, created_by, updated_at, updated_by)
                VALUES (%s, %s, %s, %s, now(), %s, now(), %s)
            """, [new_id, cust_str, mob, MOOLATHURAI_BRANCH_ID, ADMIN_ID, ADMIN_ID])
            c_obj = {"id": new_id, "name": cust_str, "mobile": mob, "branch_id": MOOLATHURAI_BRANCH_ID}
            cust_map[cust_str.lower()] = c_obj
            print(f"Created customer: {cust_str}")

        kg_val = float(kg or 0)
        rate_val = float(rate or 10)
        amt_val = float(amt or (kg_val * rate_val))

        arr_dt = datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)
        del_dt = arr_dt + timedelta(days=2)

        mach_id = None
        if mach is not None and str(mach).strip():
            m_key = str(mach).strip()
            mach_id = mach_map.get(m_key) or mach_map.get(int(float(m_key)) if m_key.replace('.','',1).isdigit() else None)

        b_id = str(uuid.uuid4())
        batch_no = f"B{b_num:05d}"
        receipt_no = f"R{b_num:05d}"
        del_meta = json.dumps({
            "delivery_date": del_dt.isoformat(),
            "actual_dry_weight": kg_val,
            "processed_bags": 0,
            "weight_loss": 0.0,
            "received_by_phone": "",
            "signature": "",
            "delivery_remarks": ""
        })

        batches_to_insert.append({
            "id": b_id,
            "batch_no": batch_no,
            "receipt_no": receipt_no,
            "qr_code": b_id,
            "customer_id": c_obj['id'],
            "product_id": PRODUCT_CARDAMOM_ID,
            "raw_weight": kg_val,
            "estimated_dry_weight": kg_val,
            "moisture": 0.0,
            "bags": 1,
            "bag_weight": 0.0,
            "machine_id": mach_id,
            "rate_per_kg": rate_val,
            "loading_charges": 0.0,
            "discount": 0.0,
            "advance_paid": 0.0,
            "arrival_date": arr_dt.isoformat(),
            "status": "Delivered",
            "remarks": "",
            "photos": "[]",
            "received_from": "",
            "branch_id": MOOLATHURAI_BRANCH_ID,
            "bill_amount": amt_val,
            "total_paid": 0.0,
            "balance_amount": amt_val,
            "actual_dry_weight": kg_val,
            "processed_bags": 0,
            "weight_loss": 0.0,
            "delivered_at": del_dt.isoformat(),
            "created_at": arr_dt.isoformat(),
            "created_by": ADMIN_ID,
            "updated_at": arr_dt.isoformat(),
            "updated_by": ADMIN_ID,
            "delivery": del_meta
        })
        b_num += 1

    print(f"Inserting {len(batches_to_insert)} batches. Total KG: {sum(b['raw_weight'] for b in batches_to_insert):,.2f}")

    insert_batch_sql = """
        INSERT INTO public.batches (
            id, batch_no, receipt_no, qr_code, customer_id, product_id,
            raw_weight, estimated_dry_weight, moisture, bags, bag_weight,
            machine_id, rate_per_kg, loading_charges, discount, advance_paid,
            arrival_date, status, remarks, photos, received_from, branch_id,
            bill_amount, total_paid, balance_amount, actual_dry_weight,
            processed_bags, weight_loss, delivered_at, created_at, created_by,
            updated_at, updated_by
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s::batch_status, %s, ARRAY[]::text[], %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s
        )
    """
    for b in batches_to_insert:
        await db.execute(insert_batch_sql, [
            b["id"], b["batch_no"], b["receipt_no"], b["qr_code"], b["customer_id"], b["product_id"],
            b["raw_weight"], b["estimated_dry_weight"], b["moisture"], b["bags"], b["bag_weight"],
            b["machine_id"], b["rate_per_kg"], b["loading_charges"], b["discount"], b["advance_paid"],
            b["arrival_date"], b["status"], b["remarks"], b["received_from"], b["branch_id"],
            b["bill_amount"], b["total_paid"], b["balance_amount"], b["actual_dry_weight"],
            b["processed_bags"], b["weight_loss"], b["delivered_at"], b["created_at"], b["created_by"],
            b["updated_at"], b["updated_by"]
        ])
    print("Batches inserted successfully.")

    # STEP 3: READ CASH BOOK
    print("\n--- STEP 3: Importing Cash Book (Payments & Expenses) ---")
    payments_to_insert = []
    expenses_to_insert = []

    for row in ws_cb.iter_rows(min_row=2, max_row=250, values_only=True):
        dt, det, led, exp, inc = row[:5]
        if not dt or (not exp and not inc):
            continue
        iso_date = parse_date(dt)
        if iso_date < '2026-06-01':
            continue

        det_str = clean_str(det)
        led_str = clean_str(led)

        # Inflow (Drying payments)
        if inc is not None and isinstance(inc, (int, float)) and inc > 0:
            if 'drying' in led_str.lower() or 'drying income' in led_str.lower():
                c_lookup = aliases.get(det_str.lower(), det_str)
                c_obj = resolve_customer_name(c_lookup)
                if not c_obj:
                    c_obj = cust_map.get("kajanaparai collection")
                if c_obj:
                    pay_dt = datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)
                    payments_to_insert.append({
                        "id": str(uuid.uuid4()),
                        "customer_id": c_obj['id'],
                        "amount": float(inc),
                        "date": pay_dt.isoformat(),
                        "remarks": f"Drying Income - {det_str}"
                    })

        # Outflow (Expenses)
        if exp is not None and isinstance(exp, (int, float)) and exp > 0:
            exp_cat = CATEGORY_MAP.get(led_str.lower(), 'Miscellaneous')
            exp_dt = datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)
            expenses_to_insert.append({
                "id": str(uuid.uuid4()),
                "branch_id": MOOLATHURAI_BRANCH_ID,
                "amount": float(exp),
                "category": exp_cat,
                "expense_date": iso_date,
                "vendor": det_str,
                "remarks": f"{det_str} ({led_str})",
                "created_at": exp_dt.isoformat(),
                "created_by": ADMIN_ID,
                "updated_at": exp_dt.isoformat(),
                "updated_by": ADMIN_ID,
            })

    print(f"Found {len(payments_to_insert)} customer receipts totaling Rs. {sum(p['amount'] for p in payments_to_insert):,.2f}")
    print(f"Found {len(expenses_to_insert)} expense records totaling Rs. {sum(e['amount'] for e in expenses_to_insert):,.2f}")

    # Insert Expenses
    insert_exp_sql = """
        INSERT INTO public.expenses (
            id, branch_id, amount, category, expense_date, vendor, remarks,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s
        )
    """
    for e in expenses_to_insert:
        await db.execute(insert_exp_sql, [
            e["id"], e["branch_id"], e["amount"], e["category"], e["expense_date"], e["vendor"], e["remarks"],
            e["created_at"], e["created_by"], e["updated_at"], e["updated_by"]
        ])
    print(f"Inserted all {len(expenses_to_insert)} expenses into public.expenses.")

    # Group batches by customer to allocate payments
    batches_by_cust = {}
    for b in batches_to_insert:
        cid = b["customer_id"]
        batches_by_cust.setdefault(cid, []).append(b)

    insert_pay_sql = """
        INSERT INTO public.payments (
            id, batch_id, customer_id, branch_id, amount, mode, remarks,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            %s, %s, %s, %s, %s, %s::payment_mode, %s,
            %s, %s, %s, %s
        )
    """
    for p in payments_to_insert:
        cid = p["customer_id"]
        cust_b = batches_by_cust.get(cid, [])
        batch_id_link = cust_b[0]["id"] if cust_b else None
        for b in cust_b:
            if b["arrival_date"] <= p["date"]:
                batch_id_link = b["id"]

        await db.execute(insert_pay_sql, [
            p["id"], batch_id_link, cid, MOOLATHURAI_BRANCH_ID, p["amount"], "Cash", p["remarks"],
            p["date"], ADMIN_ID, p["date"], ADMIN_ID
        ])
    print(f"Inserted all {len(payments_to_insert)} payments into public.payments.")

    # Reallocate customer balances
    print("Allocating customer payment amounts to batch balances...")
    for cid, b_list in batches_by_cust.items():
        cust_pays = [p["amount"] for p in payments_to_insert if p["customer_id"] == cid]
        rem_pay = sum(cust_pays)
        for b in b_list:
            if rem_pay <= 0:
                break
            alloc = min(b["bill_amount"], rem_pay)
            b["total_paid"] = alloc
            b["balance_amount"] = b["bill_amount"] - alloc
            rem_pay -= alloc
            await db.execute("""
                UPDATE public.batches
                SET total_paid = %s, balance_amount = %s
                WHERE id = %s
            """, [b["total_paid"], b["balance_amount"], b["id"]])

    # Advance sequences
    await db.execute("SELECT setval('public.batch_no_seq', %s, true)", [b_num - 1])
    await db.execute("SELECT setval('public.receipt_no_seq', %s, true)", [b_num - 1])

    # Summary
    res = await db.query("""
        SELECT 
            (SELECT count(*) FROM public.batches WHERE branch_id = %s AND arrival_date >= '2026-06-01') as batch_count,
            (SELECT sum(raw_weight) FROM public.batches WHERE branch_id = %s AND arrival_date >= '2026-06-01') as total_kg,
            (SELECT sum(bill_amount) FROM public.batches WHERE branch_id = %s AND arrival_date >= '2026-06-01') as billed,
            (SELECT sum(amount) FROM public.payments WHERE branch_id = %s AND created_at >= '2026-06-01') as paid,
            (SELECT sum(amount) FROM public.expenses WHERE branch_id = %s AND expense_date >= '2026-06-01') as exp
    """, [MOOLATHURAI_BRANCH_ID, MOOLATHURAI_BRANCH_ID, MOOLATHURAI_BRANCH_ID, MOOLATHURAI_BRANCH_ID, MOOLATHURAI_BRANCH_ID])

    row = res[0]
    print("\n=== RE-IMPORT VERIFICATION FOR MOOLATHURAI ===")
    print(f"Batches (June-Nov 2026): {row['batch_count']}")
    print(f"Total KG: {float(row['total_kg'] or 0):,.2f}")
    print(f"Total Billed: Rs. {float(row['billed'] or 0):,.2f}")
    print(f"Total Receipts (Cash In): Rs. {float(row['paid'] or 0):,.2f}")
    print(f"Total Expenses (Cash Out): Rs. {float(row['exp'] or 0):,.2f}")
    net = float(row['paid'] or 0) - float(row['exp'] or 0)
    print(f"Net Branch Cash Flow: Rs. {net:,.2f}")

    await db.close()

if __name__ == '__main__':
    asyncio.run(main())
