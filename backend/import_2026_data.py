import asyncio, os, sys, openpyxl, re, uuid, json
from datetime import datetime, timezone, timedelta
sys.path.insert(0, os.path.abspath('backend'))
from server import db

def clean(s):
    if not s: return ''
    return re.sub(r'\s+', ' ', str(s).strip())

async def run_import():
    await db.open()
    admin_id = '736f815d-1db3-427e-a01b-42b5003fa398'
    branch_id = '7b553d0b-9084-4c94-a70a-de1bccab9a71' # Moolathurai
    product_id = 'd9461e14-7a2d-4635-b4c5-fafc0d5fdaa8' # Cardamom

    print("=== STARTING 2026 DATA IMPORT ===")
    
    # 1. Existing Customers
    db_custs = await db.customers.find({}).to_list(300)
    db_map = {}
    for c in db_custs:
        db_map[clean(c['name']).lower()] = c

    locations = ['moolathurai', 'kajanaparai', 'kajanapparai', 'korambarai', 'koramparai', 'waynadu', 'periyakanal', 'pethotti', 'bodi']

    def resolve_customer(name):
        c_clean = clean(name)
        c_lower = c_clean.lower()
        if c_lower in db_map:
            return db_map[c_lower]
        for loc in locations:
            for sp in [' ' + loc, '-' + loc, ' - ' + loc]:
                if c_lower.endswith(sp):
                    prefix = clean(c_lower[:-len(sp)])
                    if prefix in db_map:
                        return db_map[prefix]
        for db_n, c_obj in db_map.items():
            if len(db_n) >= 4 and (c_lower.startswith(db_n + ' ') or c_lower.startswith(db_n + '-')):
                return c_obj
        return None

    # 2. Add New Customers if missing
    new_customers_to_add = [
        {"name": "Vasantha", "mobile": "9000100099"},
        {"name": "Prabhu (Ravi Moolathurai)", "mobile": "9000100100"},
        {"name": "Kajanaparai Collection", "mobile": "9000100101"}
    ]
    for nc in new_customers_to_add:
        if clean(nc['name']).lower() not in db_map:
            cid = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO public.customers (id, name, mobile, branch_id, created_at, created_by, updated_at, updated_by)
                VALUES (%s, %s, %s, %s, now(), %s, now(), %s)
            """, [cid, nc['name'], nc['mobile'], branch_id, admin_id, admin_id])
            new_obj = {"id": cid, "name": nc['name'], "mobile": nc['mobile'], "branch_id": branch_id}
            db_map[clean(nc['name']).lower()] = new_obj
            print(f"Created new customer: {nc['name']} ({cid})")

    # Re-fetch customers
    db_custs = await db.customers.find({}).to_list(300)
    for c in db_custs:
        db_map[clean(c['name']).lower()] = c

    # 3. Machines map
    db_machines = await db.machines.find({}).to_list(50)
    mach_map = {}
    for m in db_machines:
        m_name = m['name'].lower()
        if 'dryer' in m_name:
            nums = re.findall(r'\d+', m_name)
            if nums:
                mach_map[int(nums[0])] = m['id']

    # 4. Read Excel Details
    excel_path = r'C:\Users\AnandVenkateshPandia\Downloads\E3_eCPU_2026_ExecutiveDasboard.xlsx'
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    ws = wb['Details']

    max_b = await db.query("SELECT batch_no FROM public.batches WHERE batch_no ~ '^B[0-9]+$' ORDER BY cast(substring(batch_no from 2) as integer) DESC LIMIT 1")
    start_num = int(max_b[0]['batch_no'][1:]) + 1 if max_b else 1
    print(f"Starting next batch number: B{start_num:05d}")

    batch_records = []
    b_num = start_num
    
    for row in ws.iter_rows(min_row=2, max_row=520, values_only=True):
        sl, dt, cust, mach, kg, rate, amt, recv = row[:8]
        if not dt or not cust or not kg or float(kg or 0) <= 0:
            continue
        cust_str = clean(cust)
        c_obj = resolve_customer(cust_str)
        if not c_obj:
            if 'vasantha' in cust_str.lower():
                c_obj = db_map.get("vasantha")
            elif 'prabhu' in cust_str.lower():
                c_obj = db_map.get("prabhu (ravi moolathurai)")
            else:
                raise RuntimeError(f"Could not resolve customer: {cust_str}")

        kg_val = float(kg or 0)
        rate_val = float(rate or 10)
        amt_val = float(amt or (kg_val * rate_val))

        # Date handling
        if isinstance(dt, datetime):
            arr_dt = dt.replace(tzinfo=timezone.utc)
        else:
            arr_dt = datetime.strptime(str(dt)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        
        del_dt = arr_dt + timedelta(days=2)

        mach_id = None
        if mach and isinstance(mach, (int, float)):
            mach_id = mach_map.get(int(mach))

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

        batch_records.append({
            "id": b_id,
            "batch_no": batch_no,
            "receipt_no": receipt_no,
            "qr_code": b_id,
            "customer_id": c_obj['id'],
            "product_id": product_id,
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
            "branch_id": branch_id,
            "bill_amount": amt_val,
            "total_paid": 0.0,
            "balance_amount": amt_val,
            "actual_dry_weight": kg_val,
            "processed_bags": 0,
            "weight_loss": 0.0,
            "delivered_at": del_dt.isoformat(),
            "created_at": arr_dt.isoformat(),
            "created_by": admin_id,
            "updated_at": arr_dt.isoformat(),
            "updated_by": admin_id,
            "delivery": del_meta
        })
        b_num += 1

    print(f"Inserting {len(batch_records)} batches into public.batches...")
    insert_sql = """
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
    for b in batch_records:
        await db.execute(insert_sql, [
            b["id"], b["batch_no"], b["receipt_no"], b["qr_code"], b["customer_id"], b["product_id"],
            b["raw_weight"], b["estimated_dry_weight"], b["moisture"], b["bags"], b["bag_weight"],
            b["machine_id"], b["rate_per_kg"], b["loading_charges"], b["discount"], b["advance_paid"],
            b["arrival_date"], b["status"], b["remarks"], b["received_from"], b["branch_id"],
            b["bill_amount"], b["total_paid"], b["balance_amount"], b["actual_dry_weight"],
            b["processed_bags"], b["weight_loss"], b["delivered_at"], b["created_at"], b["created_by"],
            b["updated_at"], b["updated_by"]
        ])
    print(f"Successfully inserted all {len(batch_records)} batches.")

    # 5. Read Cash Book Payments
    ws_cb = wb['Cash Book']
    payments_to_insert = []
    total_cust_payments = 0

    for row in ws_cb.iter_rows(min_row=2, values_only=True):
        dt, det, led, exp, inc = row[:5]
        if inc is not None and isinstance(inc, (int, float)) and inc > 0:
            led_str = str(led or '').strip().lower()
            if 'drying' in led_str or 'drying income' in str(led or '').lower():
                det_str = clean(det)
                c_obj = resolve_customer(det_str)
                if not c_obj and 'kajanaparai' in det_str.lower():
                    c_obj = db_map.get("kajanaparai collection")
                
                if c_obj:
                    if isinstance(dt, datetime):
                        pay_dt = dt.replace(tzinfo=timezone.utc)
                    else:
                        pay_dt = datetime.strptime(str(dt)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    
                    payments_to_insert.append({
                        "id": str(uuid.uuid4()),
                        "customer_id": c_obj['id'],
                        "amount": float(inc),
                        "date": pay_dt.isoformat(),
                        "remarks": f"Drying Income - {det_str}"
                    })
                    total_cust_payments += float(inc)

    print(f"Found {len(payments_to_insert)} customer payments totaling ₹{total_cust_payments:,.2f}")

    # Map payments to customer batches and insert into public.payments
    pay_sql = """
        INSERT INTO public.payments (
            id, batch_id, customer_id, branch_id, amount, mode, remarks,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            %s, %s, %s, %s, %s, %s::payment_mode, %s,
            %s, %s, %s, %s
        )
    """

    # Group batches by customer to allocate payment to batch_id
    batches_by_cust = {}
    for b in batch_records:
        cid = b["customer_id"]
        batches_by_cust.setdefault(cid, []).append(b)

    for p in payments_to_insert:
        cid = p["customer_id"]
        cust_b = batches_by_cust.get(cid, [])
        # Find first batch of this customer that arrived on or before or nearest
        batch_id_link = cust_b[0]["id"] if cust_b else None
        for b in cust_b:
            if b["arrival_date"] <= p["date"]:
                batch_id_link = b["id"]

        await db.execute(pay_sql, [
            p["id"], batch_id_link, cid, branch_id, p["amount"], "Cash", p["remarks"],
            p["date"], admin_id, p["date"], admin_id
        ])

    print("Payments inserted into public.payments.")

    # 6. Allocate payment amounts to batch total_paid and balance_amount
    print("Allocating customer payment amounts to batch balances...")
    for cid, b_list in batches_by_cust.items():
        # Get total payments for this customer in 2026
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

    print("Batch balances successfully allocated.")

    # Advance sequences
    await db.execute("SELECT setval('public.batch_no_seq', %s, true)", [b_num - 1])
    await db.execute("SELECT setval('public.receipt_no_seq', %s, true)", [b_num - 1])
    print(f"Updated batch_no_seq and receipt_no_seq to {b_num - 1}.")
    total_db_batches = await db.query("SELECT count(*), sum(raw_weight) as kg, sum(bill_amount) as billed, sum(total_paid) as paid, sum(balance_amount) as bal FROM public.batches")
    print("\n=== IMPORT COMPLETE ===")
    print("New Total Batches in DB:", total_db_batches[0]['count'])
    print("New Total KG in DB:", total_db_batches[0]['kg'])
    print("New Total Billed in DB: ₹", total_db_batches[0]['billed'])
    print("New Total Paid in DB: ₹", total_db_batches[0]['paid'])
    print("New Total Balance in DB: ₹", total_db_batches[0]['bal'])

    await db.close()

if __name__ == '__main__':
    asyncio.run(run_import())
