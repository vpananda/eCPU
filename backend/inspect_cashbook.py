import asyncio, os, sys, openpyxl, re
sys.path.insert(0, os.path.abspath('backend'))
from server import db

async def run():
    await db.open()
    
    # 1. Expenses columns & sample
    e_cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses'")
    print('Expenses columns:', [c['column_name'] for c in e_cols])
    
    # 2. Check 2026 payments in DB
    p_2026 = await db.query("SELECT id, customer_id, amount, mode, remarks, created_at FROM public.payments WHERE created_at >= '2026-01-01' ORDER BY created_at")
    print(f'Total 2026 payments in DB: {len(p_2026)}, sum: {sum(float(p["amount"]) for p in p_2026):,.2f}')
    for p in p_2026[:5]:
        print('  Pay:', p['created_at'], p['amount'], p['remarks'])

    # 3. Check 2026 expenses in DB
    e_2026 = await db.query("SELECT * FROM public.expenses WHERE created_at >= '2026-01-01' OR expense_date >= '2026-01-01' ORDER BY expense_date")
    print(f'Total 2026 expenses in DB: {len(e_2026)}, sum: {sum(float(e["amount"]) for e in e_2026):,.2f}')
    for e in e_2026[:5]:
        print('  Exp:', e.get('expense_date'), e.get('amount'), e.get('category'), e.get('description'))

    # 4. Check Excel Cash Book
    wb = openpyxl.load_workbook(r'C:\Users\AnandVenkateshPandia\Downloads\E3_eCPU_2026_ExecutiveDasboard.xlsx', data_only=True)
    ws = wb['Cash Book']
    rows = [r[:5] for r in ws.iter_rows(min_row=2, values_only=True) if any(r[:5])]
    print(f'\nTotal Excel Cash Book rows: {len(rows)}')
    
    incomes = [r for r in rows if r[4] is not None and str(r[4]).strip() != '']
    expenses = [r for r in rows if r[3] is not None and str(r[3]).strip() != '']
    print(f'Excel Income rows: {len(incomes)}, sum: {sum(float(r[4]) for r in incomes if isinstance(r[4], (int, float))):,.2f}')
    print(f'Excel Expense rows: {len(expenses)}, sum: {sum(float(r[3]) for r in expenses if isinstance(r[3], (int, float))):,.2f}')

    await db.close()

if __name__ == '__main__':
    asyncio.run(run())
