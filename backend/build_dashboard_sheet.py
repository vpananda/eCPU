import sys
import os
import gspread

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from google_sheets_service import get_sheets_client

def build_dashboard():
    sh = get_sheets_client()
    title = "📊 Executive Dashboard"
    
    # 1. Ensure sheet exists at index 0
    try:
        ws = sh.worksheet(title)
        ws.clear()
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=title, rows=65, cols=10, index=0)

    # Move to index 0 if not already
    try:
        ws.update_index(0)
    except Exception:
        pass

    # 2. Build grid of 45 rows x 8 cols
    grid = [["" for _ in range(8)] for _ in range(45)]

    # Row 1-2: Title Header
    grid[0][0] = "🌿 E3 AGRO — OPERATIONS & FINANCIAL EXECUTIVE DASHBOARD"
    grid[1][0] = "Auto-updating live statistics based on Arrivals, Drying Batches, Deliveries, Payments & Customers"

    # Row 4-5: KPI Summary Cards
    grid[3][0] = "TOTAL WET INBOUND (KG)"
    grid[3][2] = "TOTAL DRY OUTTURN (KG)"
    grid[3][4] = "PLANT WET : DRY RATIO"
    grid[3][5] = "TOTAL BILLED (₹)"
    grid[3][6] = "TOTAL COLLECTED (₹)"
    grid[3][7] = "BALANCE DUE (₹)"

    grid[4][0] = "=SUM(Arrivals!J2:J)"
    grid[4][1] = '="Lots: " & TEXT(COUNTA(Arrivals!D2:D), "#,##0")'
    grid[4][2] = "=SUM(Deliveries!H2:H)"
    grid[4][3] = '="Batches: " & TEXT(COUNTA(Deliveries!C2:C), "#,##0")'
    grid[4][4] = '=IF(C5>0, ROUND(A5/C5, 2) & " : 1", "-")'
    grid[4][5] = "=SUM(Deliveries!J2:J)"
    grid[4][6] = "=SUM(Payments!G2:G)"
    grid[4][7] = "=F5 - G5"

    # Row 8-13: Section 1 - Branch-wise
    grid[7][0] = "🏢 1. BRANCH-WISE OPERATIONAL & FINANCIAL PERFORMANCE"
    grid[8] = ["Branch Name", "Arrival Lots", "Wet Handled (KG)", "Dry Output (KG)", "Wet:Dry Ratio", "Billed Revenue (₹)", "Collections (₹)", "Outstanding Due (₹)"]

    branches = ["BSCFPC Bodi", "Durai Dryer Kajanaparai", "Moolathurai"]
    for i, b in enumerate(branches):
        rn = 10 + i
        grid[9+i] = [
            b,
            f"=COUNTIF(Arrivals!C2:C, A{rn})",
            f"=SUMIF(Arrivals!C2:C, A{rn}, Arrivals!J2:J)",
            f"=SUMIF(Deliveries!B2:B, A{rn}, Deliveries!H2:H)",
            f'=IF(D{rn}>0, ROUND(C{rn}/D{rn}, 2) & " : 1", "-")',
            f"=SUMIF(Deliveries!B2:B, A{rn}, Deliveries!J2:J)",
            f"=SUMIF(Payments!B2:B, A{rn}, Payments!G2:G)",
            f"=F{rn} - G{rn}"
        ]

    grid[12] = [
        "TOTAL",
        "=SUM(B10:B12)",
        "=SUM(C10:C12)",
        "=SUM(D10:D12)",
        '=IF(D13>0, ROUND(C13/D13, 2) & " : 1", "-")',
        "=SUM(F10:F12)",
        "=SUM(G10:G12)",
        "=SUM(H10:H12)"
    ]

    # Row 15-21: Section 2 - Product Breakdown
    grid[14][0] = "🌿 2. COMMODITY / SPICE BREAKDOWN"
    grid[15][:6] = ["Produce / Spice", "Arrival Lots", "Wet Received (KG)", "Dry Output (KG)", "Avg Wet:Dry Ratio", "Revenue Billed (₹)"]

    products = ["Cardamom", "Coffee", "Pepper", "Turmeric"]
    for i, p in enumerate(products):
        rn = 17 + i
        grid[16+i][:6] = [
            p,
            f"=COUNTIF(Arrivals!I2:I, A{rn})",
            f"=SUMIF(Arrivals!I2:I, A{rn}, Arrivals!J2:J)",
            f"=SUMIF(Deliveries!G2:G, A{rn}, Deliveries!H2:H)",
            f'=IF(D{rn}>0, ROUND(C{rn}/D{rn}, 2) & " : 1", "-")',
            f"=SUMIF(Deliveries!G2:G, A{rn}, Deliveries!J2:J)"
        ]

    grid[20][:6] = [
        "TOTAL",
        "=SUM(B17:B20)",
        "=SUM(C17:C20)",
        "=SUM(D17:D20)",
        '=IF(D21>0, ROUND(C21/D21, 2) & " : 1", "-")',
        "=SUM(F17:F20)"
    ]

    # Row 23-42: Section 3 - Top Customer Leaderboard
    grid[22][0] = "👥 3. TOP CUSTOMER LEADERBOARD (Top 15 Ranked by Volume & Activity)"
    grid[23] = ["Customer Code", "Customer Name", "Mobile", "Branch", "Total Arrivals", "Total Billed (₹)", "Total Paid (₹)", "Balance Due (₹)"]
    grid[24][0] = '=QUERY(Customers!A2:L, "SELECT A, B, C, E, I, J, K, L WHERE A IS NOT NULL ORDER BY I DESC LIMIT 15", 0)'

    # 3. Push data and formulas to worksheet
    ws.update(grid, value_input_option="USER_ENTERED")

    # 4. Apply Professional Visual Styling
    try:
        # Title Banner styling
        ws.format("A1:H1", {
            "textFormat": {"bold": True, "fontSize": 14, "foregroundColor": {"red": 0.08, "green": 0.35, "blue": 0.15}},
            "backgroundColor": {"red": 0.92, "green": 0.98, "blue": 0.93}
        })
        ws.format("A2:H2", {
            "textFormat": {"italic": True, "fontSize": 10, "foregroundColor": {"red": 0.4, "green": 0.45, "blue": 0.5}}
        })

        # KPI Card Headers (Row 4)
        ws.format("A4:H4", {
            "textFormat": {"bold": True, "fontSize": 9, "foregroundColor": {"red": 0.3, "green": 0.35, "blue": 0.4}},
            "backgroundColor": {"red": 0.94, "green": 0.96, "blue": 0.98},
            "horizontalAlignment": "CENTER"
        })
        # KPI Card Values (Row 5)
        ws.format("A5:H5", {
            "textFormat": {"bold": True, "fontSize": 12, "foregroundColor": {"red": 0.05, "green": 0.2, "blue": 0.1}},
            "horizontalAlignment": "CENTER"
        })

        # Section 1 Header (Row 8)
        ws.format("A8:H8", {
            "textFormat": {"bold": True, "fontSize": 11, "foregroundColor": {"red": 0.1, "green": 0.2, "blue": 0.4}},
            "backgroundColor": {"red": 0.9, "green": 0.93, "blue": 0.98}
        })
        # Table 1 Column Headers (Row 9)
        ws.format("A9:H9", {
            "textFormat": {"bold": True, "fontSize": 10},
            "backgroundColor": {"red": 0.95, "green": 0.96, "blue": 0.98}
        })
        # Table 1 Total Row (Row 13)
        ws.format("A13:H13", {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.93, "green": 0.97, "blue": 0.93}
        })

        # Section 2 Header (Row 15)
        ws.format("A15:F15", {
            "textFormat": {"bold": True, "fontSize": 11, "foregroundColor": {"red": 0.1, "green": 0.35, "blue": 0.2}},
            "backgroundColor": {"red": 0.92, "green": 0.97, "blue": 0.93}
        })
        # Table 2 Column Headers (Row 16)
        ws.format("A16:F16", {
            "textFormat": {"bold": True, "fontSize": 10},
            "backgroundColor": {"red": 0.95, "green": 0.97, "blue": 0.95}
        })
        # Table 2 Total Row (Row 21)
        ws.format("A21:F21", {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.93, "green": 0.97, "blue": 0.93}
        })

        # Section 3 Header (Row 23)
        ws.format("A23:H23", {
            "textFormat": {"bold": True, "fontSize": 11, "foregroundColor": {"red": 0.3, "green": 0.15, "blue": 0.45}},
            "backgroundColor": {"red": 0.96, "green": 0.93, "blue": 0.98}
        })
        # Table 3 Column Headers (Row 24)
        ws.format("A24:H24", {
            "textFormat": {"bold": True, "fontSize": 10},
            "backgroundColor": {"red": 0.97, "green": 0.95, "blue": 0.98}
        })

        # Number formats for currency and weights
        # Branch table weights (C10:D13) and currency (F10:H13)
        ws.format("C10:D13", {"numberFormat": {"type": "NUMBER", "pattern": "#,##0.00"}})
        ws.format("F10:H13", {"numberFormat": {"type": "CURRENCY", "pattern": "₹#,##0.00"}})

        # Product table weights (C17:D21) and currency (F17:F21)
        ws.format("C17:D21", {"numberFormat": {"type": "NUMBER", "pattern": "#,##0.00"}})
        ws.format("F17:F21", {"numberFormat": {"type": "CURRENCY", "pattern": "₹#,##0.00"}})

        # Customer table currency (F25:H40)
        ws.format("F25:H40", {"numberFormat": {"type": "CURRENCY", "pattern": "₹#,##0.00"}})

    except Exception as ex:
        print(f"Formatting warning: {ex}")

    print("✅ Dashboard built and formatted successfully!")

if __name__ == "__main__":
    build_dashboard()
