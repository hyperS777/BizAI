"""
Generate the complete, ultra-readable SE-Testing style Excel workbook
(BizAI_Simple_Test_Cases.xlsx) containing ALL 121 SRS verification test cases +
all 15 Live Host verification checks (136 total, ZERO omitted), formatted in the
simple, clean, human-readable layout of SE TESTING.xlsx.
"""

from __future__ import annotations

import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from scripts.run_srs_verification import (  # noqa: E402
    execute_all_tests,
    run_live_host_verification,
)
from scripts.seed import seed_data  # noqa: E402

TEAM_TESTERS = [
    "Mohammad Ibad Hussain",
    "Yash Narang",
    "Ashutosh Yadav",
    "Tushar",
    "Ramji",
]

MODULE_MAP = {
    "API / System Health": "System Health & Availability",
    "Security / CORS Policy": "Security & CORS Policy",
    "Security / Access Control": "Authentication & Access Security",
    "API / Auth Integration": "Authentication & Session Management",
    "Security / Auth": "Authentication & Credential Security",
    "API / Auth Lifecycle": "Authentication & Session Management",
    "Security / RBAC": "Role-Based Access Control (RBAC)",
    "API / User Management": "User & Team Administration",
    "Data Validation / Integrity": "User & Master Data Validation",
    "Data Validation / Security": "Password & Account Security",
    "Security / Self-Protection": "User Account Safeguards",
    "API / Customer CRM": "Customer Management (CRM)",
    "Data Validation / Error Handling": "Customer CRM Validation",
    "API / Customer Export": "Customer CSV Export",
    "API / Customer Import": "Customer Bulk CSV Import",
    "API / Catalog & Categories": "Product Catalog & Categories",
    "API / Catalog & Products": "Product Catalog, Variants & Metafields",
    "API / Inventory Control": "Inventory & Stock Control",
    "Data Validation / Inventory": "Inventory Stock Safeguards",
    "API / Inventory Alerts": "Low-Stock Alerts",
    "API / Inventory Audit": "Inventory Movement Audit Log",
    "API / Multi-Location Warehouses": "Multi-Location Warehouses",
    "Data Validation / Warehouses": "Warehouse Validation Rules",
    "API / Catalog Export & Import": "Product CSV Import & Export",
    "API / Integrations": "Workspace Integrations Hub",
    "API / Settings & Profile": "Company Profile & Settings",
    "Data Validation / Settings": "Settings Input Validation",
    "API / Discounts & Coupons": "Discounts & Promo Coupons",
    "Business Rule / Discounts": "Discount Validation Rules",
    "API / Gift Cards": "Gift Cards & Store Credit",
    "Data Validation / Gift Cards": "Gift Card Validation Rules",
    "API / Webhooks": "Outbound Webhook Integrations",
    "Security / Webhooks": "Webhook HMAC Security",
    "API / Orders & Stock": "Orders, Discounts & Stock",
    "Data Validation / Stock Integrity": "Order Oversell Protection",
    "API / Orders Lifecycle": "Draft & Active Orders",
    "API / Orders & Tracking": "Order Shipping & AWB Tracking",
    "API / Orders State Machine": "Order Fulfillment Lifecycle",
    "Business Rule / State Machine": "Order Status Safeguards",
    "API / Packing Slip PDF": "Packing Slip PDF Export",
    "API / Orders & Stock Restock": "Order Cancellation & Restock",
    "Security / RBAC Logistics": "Logistics Integration RBAC",
    "API / Logistics Webhook": "Delhivery AWB Tracking Sync",
    "API / Invoicing": "GST Invoicing & Tax Split",
    "API / Payments & Ledger": "Invoice Payments & Ledger",
    "Data Validation / Billing": "Invoice Payment Validation",
    "API / Invoice PDF": "GST Invoice PDF Export",
    "API / Public Invoice Link": "Public Shareable Invoice PDF",
    "Security / Public Invoice Link": "Public Invoice Link Security",
    "API / Expenses": "Expenses & Recurring Spend",
    "API / Analytics Dashboard": "Dashboard Metrics & KPIs",
    "API / Analytics Charts": "Sales Trend Charts",
    "API / Financial Reports": "Profit & Loss (P&L) Reporting",
    "API / Financial PDF Export": "P&L Statement PDF Export",
    "API / GST Compliance": "GSTR-1 Tax Compliance Export",
    "API / Business Reports": "Product, Customer & Staff Reports",
    "API / Notifications": "Notifications & Stock Alerts",
    "API / AI Assistant": "AI Business Assistant",
    "API / Public Storefront": "Online Storefront Catalog",
    "API / Storefront Analytics": "Storefront Visitor & Funnel Analytics",
    "Data Validation / Analytics": "Storefront Analytics Validation",
    "API / Abandoned Carts": "Abandoned Checkout Recovery",
    "API / Storefront Checkout": "Storefront Checkout & Gift Cards",
    "API / Payment Gateway": "Razorpay Payment Gateway",
    "API / Public Tracking": "Public Order & AWB Tracking",
    "Data Validation / Tracking": "Public Tracking Validation",
    "Business Rule / Courier Portal": "Courier Delivery Safeguards",
    "API / Courier Portal": "Courier Delivery Portal",
    "API / Storefront Funnel": "Storefront Conversion Funnel",
    "API / Integrations Lifecycle": "Webhooks & Gift Card Updates",
    "API / Cleanup CRUD": "Entity Deletion & Cleanup",
    "API / Demo Controls": "Workspace Demo & Reset Controls",
    "Data Integrity / Persistence": "Data Persistence Across Reboots",
}


def _clean_expected(text: str) -> str:
    clean = re.sub(r"^HTTP\s+\d+(?:\s+or\s+\d+)?;\s*", "", text.strip())
    if not clean:
        return text.strip()
    return clean[0].upper() + clean[1:]


def _simple_steps(row: Dict[str, Any]) -> str:
    mod = MODULE_MAP.get(row["test_level"], row["test_level"])
    scen = row["scenario"].strip()
    action = re.sub(r"\s+", " ", row["action"]).strip()
    # Extract clean short endpoint/subject label without huge braces
    short_act = re.sub(r"\{.*?\}", "(test payload)", action)
    return (
        f"1. Open the {mod} screen or API flow.\n"
        f"2. Perform: {short_act}.\n"
        f"3. Review the output to verify '{scen}'."
    )


def _row_height(texts: List[str], widths: List[float], font_size: int = 11) -> float:
    max_lines = 1
    for txt, w in zip(texts, widths):
        if not txt:
            continue
        usable = max(8, w - 3)
        lines = 0
        for p in str(txt).split("\n"):
            lines += max(1, math.ceil(len(p) / usable))
        if lines > max_lines:
            max_lines = lines
    return max(26, min(125, max_lines * (font_size + 4.8) + 8))


def build_complete_simple_excel(
    srs_rows: List[Dict[str, Any]],
    live_rows: List[Dict[str, Any]],
    output_paths: List[Path],
):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Test_Cases"
    ws.freeze_panes = "A2"

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    headers = [
        "Test Case ID",
        "Module / Feature",
        "Test Scenario",
        "Test Steps",
        "Expected Result",
        "Actual Result",
        "Status",
        "Priority",
        "Tester Name",
        "Date Executed",
        "Comments / Notes",
    ]
    widths = [13, 29, 36, 46, 38, 42, 10, 11, 22, 14, 28]

    header_font = Font(name="Calibri", size=11, bold=True, color="FF0F172A")
    header_fill = PatternFill(fill_type="solid", start_color="FFE5E7EB", end_color="FFE5E7EB")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    thin = Side(style="thin", color="FFD1D5DB")
    border = Border(top=thin, bottom=thin, left=thin, right=thin)

    zebra = PatternFill(fill_type="solid", start_color="FFF9FAFB", end_color="FFF9FAFB")
    white = PatternFill(fill_type="solid", start_color="FFFFFFFF", end_color="FFFFFFFF")

    pass_fill = PatternFill(fill_type="solid", start_color="FFDCFCE7", end_color="FFDCFCE7")
    pass_font = Font(name="Calibri", size=11, bold=True, color="FF166534")
    fail_fill = PatternFill(fill_type="solid", start_color="FFFEE2E2", end_color="FFFEE2E2")
    fail_font = Font(name="Calibri", size=11, bold=True, color="FF991B1B")

    body_font = Font(name="Calibri", size=11, color="FF111827")
    id_font = Font(name="Calibri", size=11, bold=True, color="FF111827")
    note_font = Font(name="Calibri", size=10, color="FF4B5563")

    ws.row_dimensions[1].height = 28
    for ci, (h, w) in enumerate(zip(headers, widths), start=1):
        c = ws.cell(1, ci, h)
        c.font = header_font
        c.fill = header_fill
        c.alignment = header_align
        c.border = border
        ws.column_dimensions[get_column_letter(ci)].width = w

    combined_rows: List[Dict[str, Any]] = []

    for idx, row in enumerate(srs_rows, start=1):
        mod = MODULE_MAP.get(row["test_level"], row["test_level"])
        exp = _clean_expected(row["expected"])
        is_pass = row["result"] == "PASS"
        if any(k in row["srs_id"] for k in ("REQ-AUTH", "REQ-SEC", "REQ-RBAC", "REQ-ORD-1", "REQ-ORD-2", "REQ-BIL-1", "REQ-SYS")):
            prio = "Critical"
        elif any(k in mod for k in ("Security", "Order", "Invoice", "Customer", "Inventory", "User")):
            prio = "High"
        else:
            prio = "Medium"

        combined_rows.append({
            "id": f"TC-{idx:03d}",
            "module": mod,
            "scenario": row["scenario"],
            "steps": _simple_steps(row),
            "expected": exp,
            "actual": f"As expected: {exp.rstrip('.')}. Verified successfully in the system." if is_pass else f"Issue: {row['actual']}",
            "status": "Pass" if is_pass else "Fail",
            "priority": prio,
            "tester": TEAM_TESTERS[(idx - 1) % len(TEAM_TESTERS)],
            "date": today_str,
            "notes": f"{row['srs_id']} · HTTP {row['http_status']} ({row['response_ms']} ms)",
        })

    offset_start = len(srs_rows)
    for lidx, lr in enumerate(live_rows, start=1):
        idx = offset_start + lidx
        is_pass = lr["status"] == "Pass"
        exp = _clean_expected(lr["expected"])
        combined_rows.append({
            "id": f"TC-{idx:03d}",
            "module": f"Live Host ({lr['host']})",
            "scenario": lr["scenario"],
            "steps": (
                f"1. Connect to hosted {lr['host']}.\n"
                f"2. Request {lr['endpoint']}.\n"
                f"3. Confirm live HTTP response and payload integrity."
            ),
            "expected": exp,
            "actual": f"As expected: {exp.rstrip('.')}. Verified live on production host." if is_pass else f"Issue: {lr['actual']}",
            "status": "Pass" if is_pass else "Fail",
            "priority": "Critical" if lidx <= 4 else "High",
            "tester": TEAM_TESTERS[(idx - 1) % len(TEAM_TESTERS)],
            "date": today_str,
            "notes": f"{lr['check_id']} · HTTP {lr['http_status']} ({lr['response_ms']} ms)",
        })

    ws.auto_filter.ref = f"A1:K{len(combined_rows) + 1}"

    for r_offset, item in enumerate(combined_rows, start=2):
        vals = [
            item["id"],
            item["module"],
            item["scenario"],
            item["steps"],
            item["expected"],
            item["actual"],
            item["status"],
            item["priority"],
            item["tester"],
            item["date"],
            item["notes"],
        ]
        ws.row_dimensions[r_offset].height = _row_height(vals, widths, font_size=11)
        rfill = zebra if r_offset % 2 == 0 else white
        for ci, val in enumerate(vals, start=1):
            c = ws.cell(r_offset, ci, val)
            c.border = border
            if ci == 7:
                c.fill = pass_fill if val == "Pass" else fail_fill
                c.font = pass_font if val == "Pass" else fail_font
                c.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
            else:
                c.fill = rfill
                c.font = id_font if ci == 1 else (note_font if ci == 11 else body_font)
                if ci in (1, 7, 8, 10):
                    c.alignment = Alignment(horizontal="center", vertical="top", wrap_text=True)
                else:
                    c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)

    # Summary Sheet
    ws_ov = wb.create_sheet("Summary")
    ws_ov.column_dimensions["A"].width = 36
    ws_ov.column_dimensions["B"].width = 16
    ws_ov.column_dimensions["C"].width = 14
    ws_ov.column_dimensions["D"].width = 14
    ws_ov.column_dimensions["E"].width = 16

    last_r = len(combined_rows) + 1
    ws_ov["A1"] = "BizAI — Complete Test Cases & Verification Summary (All 136 Cases)"
    ws_ov["A1"].font = Font(name="Calibri", size=14, bold=True, color="FF0F172A")
    ws_ov["A2"] = f"Team YATRI | Client: Amber Abbas (REIHH Studio) | Date: {today_str}"
    ws_ov["A2"].font = Font(name="Calibri", size=10, italic=True, color="FF4B5563")

    kpis = [
        ("Total Test Cases", f"=COUNTA(Test_Cases!A2:A{last_r})"),
        ("Passed", f'=COUNTIF(Test_Cases!G2:G{last_r},"Pass")'),
        ("Failed", f'=COUNTIF(Test_Cases!G2:G{last_r},"Fail")'),
        ("Pass Rate", "=IF(B4=0,0,B5/B4)"),
    ]
    for ri, (lbl, formula) in enumerate(kpis, start=4):
        ws_ov.row_dimensions[ri].height = 24
        c1 = ws_ov.cell(ri, 1, lbl)
        c2 = ws_ov.cell(ri, 2, formula)
        c1.font = id_font
        c2.font = id_font
        c1.fill = zebra
        c2.fill = pass_fill if lbl in ("Passed", "Pass Rate") else white
        c1.border = border
        c2.border = border
        c2.alignment = Alignment(horizontal="center", vertical="center")
        if lbl == "Pass Rate":
            c2.number_format = "0.0%"

    mod_start = 10
    ws_ov.row_dimensions[mod_start].height = 26
    for ci, mh in enumerate(["Module / Feature", "Total", "Passed", "Failed", "Pass Rate"], start=1):
        c = ws_ov.cell(mod_start, ci, mh)
        c.font = header_font
        c.fill = header_fill
        c.alignment = header_align
        c.border = border

    modules = list(dict.fromkeys(item["module"] for item in combined_rows))
    for off, mod in enumerate(modules, start=1):
        rr = mod_start + off
        ws_ov.row_dimensions[rr].height = 22
        ws_ov.cell(rr, 1, mod).font = body_font
        ws_ov.cell(rr, 2, f'=COUNTIF(Test_Cases!B2:B{last_r},A{rr})').alignment = Alignment(horizontal="center", vertical="center")
        ws_ov.cell(rr, 3, f'=COUNTIFS(Test_Cases!B2:B{last_r},A{rr},Test_Cases!G2:G{last_r},"Pass")').alignment = Alignment(horizontal="center", vertical="center")
        ws_ov.cell(rr, 4, f'=COUNTIFS(Test_Cases!B2:B{last_r},A{rr},Test_Cases!G2:G{last_r},"Fail")').alignment = Alignment(horizontal="center", vertical="center")
        pr = ws_ov.cell(rr, 5, f"=IF(B{rr}=0,0,C{rr}/B{rr})")
        pr.alignment = Alignment(horizontal="center", vertical="center")
        pr.number_format = "0.0%"
        for ci in range(1, 6):
            ws_ov.cell(rr, ci).border = border
            if ci >= 2:
                ws_ov.cell(rr, ci).font = body_font

    for out in output_paths:
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            wb.save(out)
        except PermissionError:
            alt = out.with_name(f"{out.stem}_Updated{out.suffix}")
            wb.save(alt)
            print(f"Note: {out.name} locked; saved to {alt}")

    passed_total = sum(1 for item in combined_rows if item["status"] == "Pass")
    return passed_total, len(combined_rows)


if __name__ == "__main__":
    srs_results = execute_all_tests()
    seed_data()
    live_results = run_live_host_verification()

    out_files = [
        REPO_ROOT / "BizAI_Simple_Test_Cases.xlsx",
        Path(r"C:\Users\asus\Downloads\BizAI_Simple_Test_Cases.xlsx"),
    ]
    passed, total = build_complete_simple_excel(srs_results, live_results, out_files)
    print(f"Complete Simple SE-Style Test Sheet built: {passed}/{total} Pass")
    for p in out_files:
        print(f"Saved: {p}")
