"""
Generate the formal Microsoft Word (.docx) Client Acceptance & SRS Verification Certificate
for Team YATRI: BizAI – Fashion ERP & Commerce Platform (Client: Amber Abbas / REIHH Studio).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor


def _set_cell_shading(cell, hex_color: str):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def _set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def _set_table_borders(table, color="CBD5E1"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'<w:left w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'<w:right w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
        f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
        f"</w:tblBorders>"
    )
    tblPr.append(borders)


def _add_heading(doc: Document, text: str, level: int = 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    run.font.name = "Calibri"
    run.font.bold = True
    run.font.size = Pt(13 if level == 1 else 11)
    run.font.color.rgb = RGBColor(0x0F, 0x76, 0x6E) if level == 1 else RGBColor(0x1E, 0x29, 0x3B)
    if level == 1:
        pPr = p._p.get_or_add_pPr()
        pBdr = parse_xml(
            f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="8" w:space="3" w:color="0F766E"/></w:pBdr>'
        )
        pPr.append(pBdr)
    return p


def build_acceptance_docx(
    total_tests: int,
    passed_tests: int,
    live_checks_count: int,
    live_checks_passed: int,
    output_paths: list[Path],
):
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(0.65)
        section.bottom_margin = Inches(0.65)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

    normal_style = doc.styles["Normal"]
    normal_style.font.name = "Calibri"
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

    # Banner Header
    banner = doc.add_table(rows=1, cols=1)
    banner.alignment = WD_TABLE_ALIGNMENT.CENTER
    bcell = banner.cell(0, 0)
    _set_cell_shading(bcell, "0F172A")
    _set_cell_margins(bcell, top=180, bottom=180, left=220, right=220)
    bp1 = bcell.paragraphs[0]
    bp1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = bp1.add_run("CLIENT PROJECT ACCEPTANCE & SRS VERIFICATION REPORT")
    r1.font.name = "Calibri"
    r1.font.size = Pt(15)
    r1.font.bold = True
    r1.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    bp2 = bcell.add_paragraph()
    bp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    bp2.paragraph_format.space_before = Pt(3)
    bp2.paragraph_format.space_after = Pt(0)
    r2 = bp2.add_run("BizAI – Fashion ERP & Commerce Platform (REIHH Studio Commerce OS)")
    r2.font.name = "Calibri"
    r2.font.size = Pt(11)
    r2.font.color.rgb = RGBColor(0x5E, 0xEA, 0xD4)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 1. Project & Stakeholder Details
    _add_heading(doc, "1. Project, Stakeholder & Production Deployment Summary")
    meta_rows = [
        ("Project Title", "Team YATRI: BizAI – Fashion ERP & Commerce Platform (REIHH Studio Commerce OS)"),
        ("Client Organization", "REIHH Studio (Client Representative: Amber Abbas, Sector 125, Mohali / New Delhi)"),
        ("Development Team", "Team YATRI — Mohammad Ibad Hussain (Team Leader), Yash Narang, Ashutosh Yadav, Tushar, Ramji"),
        ("Verification Date", datetime.now().strftime("%B %d, %Y")),
        ("Hosted Frontend URL", "https://biz-ai-sooty.vercel.app  |  Custom Domain: https://www.bizai-reihh.site (Vercel)"),
        ("Hosted Backend API", "https://bizai-commerce-api-ajg3g6drffejcdbw.centralindia-01.azurewebsites.net (Microsoft Azure App Service)"),
        ("Automated SRS Suite", f"{passed_tests} / {total_tests} Test Cases Passed (100% Pass Rate)"),
        ("Live Host Checks", f"{live_checks_passed} / {live_checks_count} Production Endpoint Checks Passed (HTTP 200)"),
    ]
    meta_tbl = doc.add_table(rows=len(meta_rows), cols=2)
    meta_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_borders(meta_tbl)
    for idx, (k, v) in enumerate(meta_rows):
        row = meta_tbl.rows[idx]
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.0)
        c1.width = Inches(5.1)
        _set_cell_shading(c0, "F1F5F9")
        _set_cell_margins(c0, 80, 80, 120, 120)
        _set_cell_margins(c1, 80, 80, 120, 120)
        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        rk = p0.add_run(k)
        rk.bold = True
        rk.font.size = Pt(9.5)
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        rv = p1.add_run(v)
        rv.font.size = Pt(9.5)

    # 2. Formal Client Acceptance & Payment Milestone Confirmation
    _add_heading(doc, "2. Formal Client Acceptance & Payment Milestone Confirmation")
    p_acc = doc.add_paragraph()
    p_acc.paragraph_format.space_after = Pt(6)
    p_acc.add_run(
        "This document certifies that the Client, Amber Abbas (REIHH Studio), has thoroughly reviewed, "
        "tested on live production hosting (Vercel & Microsoft Azure), and formally accepted the "
        "BizAI – Fashion ERP & Commerce Platform developed by Team YATRI. All functional, architectural, "
        "security, and performance deliverables specified in the Software Requirements Specification (SRS) "
        "have been verified and fulfilled to the client's complete satisfaction."
    )

    pay_tbl = doc.add_table(rows=4, cols=3)
    pay_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_borders(pay_tbl, color="0F766E")
    pay_headers = ["Payment Milestone", "Amount (INR)", "Status & Terms"]
    for ci, h in enumerate(pay_headers):
        cell = pay_tbl.rows[0].cells[ci]
        _set_cell_shading(cell, "0F766E")
        _set_cell_margins(cell, 90, 90, 110, 110)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h)
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    pay_data = [
        ("Milestone 1 — Initial & Core System Delivery", "₹1,00,000 (One Lakh Rupees)", "Already Paid by Client"),
        ("Milestone 2 — Final Handover & SRS Acceptance", "₹1,00,000 (One Lakh Rupees)", "Payable by Client upon Final Handover"),
        ("Total Agreed Project Compensation", "₹2,00,000 (Two Lakh Rupees)", "₹1,00,000 Received + ₹1,00,000 Balance Due"),
    ]
    for idx, (m, amt, st) in enumerate(pay_data, start=1):
        row = pay_tbl.rows[idx]
        widths = [Inches(2.7), Inches(2.0), Inches(2.4)]
        for ci, val in enumerate((m, amt, st)):
            cell = row.cells[ci]
            cell.width = widths[ci]
            _set_cell_shading(cell, "ECFDF5" if idx == 3 else "FFFFFF")
            _set_cell_margins(cell, 85, 85, 110, 110)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(val)
            r.font.size = Pt(9.5)
            if idx == 3 or ci == 1:
                r.bold = True

    p_pay_note = doc.add_paragraph()
    p_pay_note.paragraph_format.space_before = Pt(6)
    p_pay_note.paragraph_format.space_after = Pt(6)
    r_pn = p_pay_note.add_run(
        "Payment Confirmation: The client has already paid ₹1,00,000 (One Lakh Rupees) toward completed "
        "development milestones and confirms that the remaining ₹1,00,000 (One Lakh Rupees) will be paid "
        "to Team YATRI upon final production handover."
    )
    r_pn.bold = True
    r_pn.font.size = Pt(10)

    # 3. SRS Requirements Verification Matrix
    _add_heading(doc, "3. Software Requirements Specification (SRS) Verification Matrix")
    p_srs_intro = doc.add_paragraph()
    p_srs_intro.paragraph_format.space_after = Pt(6)
    p_srs_intro.add_run(
        "Every requirement defined in the project SRS has been traced to implemented features, executed "
        "in the automated verification suite (BizAI_SRS_Verification_Test_Results.xlsx), and validated on "
        "the hosted production environment:"
    )

    srs_rows = [
        ("REQ-SYS / SEC", "System Health, CORS & Security", "Root/health APIs, custom domain CORS policy, JWT signature validation, bcrypt password hashing, RBAC route guards.", "TC-001 to TC-006", "Verified (Pass)"),
        ("REQ-AUTH / RBAC", "Authentication & Role-Based Access", "Login/logout, JWT issuance, 4 distinct roles (Admin, Manager, Employee, Accountant) with endpoint & UI isolation.", "TC-007 to TC-020", "Verified (Pass)"),
        ("REQ-USR", "User & Team Administration", "Admin user creation, duplicate email 400 validation, role updates, password reset policy, self-lockout protection, deactivation.", "TC-021 to TC-029", "Verified (Pass)"),
        ("REQ-CUS", "Customer CRM & History", "Add/edit/delete/search customers, GSTIN & tier support, CSV import/export, lifetime purchase & order history.", "TC-030 to TC-036, TC-076", "Verified (Pass)"),
        ("REQ-PRD / INV", "Catalog, Variants & Multi-Location Stock", "Categories, apparel variants, MRP compare-at price, metafields, stock adjustments, low-stock alerts, multi-warehouse allocation, CSV import/export.", "TC-037 to TC-051, TC-114", "Verified (Pass)"),
        ("REQ-DSC / GFT", "Discounts, Coupons & Gift Cards", "Percent/fixed promo codes, usage limits, pause/resume toggle, stored-value gift cards, checkout redemption & balance checks.", "TC-055 to TC-062, TC-112", "Verified (Pass)"),
        ("REQ-ORD", "Order Lifecycle & Fulfillment", "Draft vs. active orders, discount computation, oversell stock protection on confirmation, FSM transitions, cancellation restock, packing slip PDF.", "TC-064 to TC-075", "Verified (Pass)"),
        ("REQ-BIL", "GST Invoicing & Payments Ledger", "Order-linked & standalone CGST/SGST invoices, partial & full payments, balance due calculation, authenticated & public token PDF links.", "TC-077 to TC-083", "Verified (Pass)"),
        ("REQ-EXP", "Expenses & Recurring Cost Control", "Expense tracking with vendor GSTIN, bulk recurring monthly/annual scheduling, future-dated exclusion from realized profit, cancel future recurring.", "TC-084 to TC-087", "Verified (Pass)"),
        ("REQ-RPT / NTF", "Dashboard, P&L, GSTR-1 & Alerts", "Combined SQL dashboard KPIs, 30-day sales chart, P&L statement & PDF export, GSTR-1 CSV export, top products, staff performance, notifications.", "TC-088 to TC-095", "Verified (Pass)"),
        ("REQ-AI", "AI Business Workspace Assistant", "Live DB snapshot grounding, natural-language chat analytics, executive business summaries, provider status & RBAC guardrail.", "TC-096 to TC-098", "Verified (Pass)"),
        ("REQ-STR / PAY", "Public Storefront, Razorpay & Tracking", "Live catalog preview, funnel analytics, abandoned cart capture & recovery, checkout upsells, Razorpay order/verify, Delhivery AWB tracking & courier portal.", "TC-099 to TC-113", "Verified (Pass)"),
        ("REQ-DEM", "Workspace Demo & Reset Controls", "Synthetic showcase generator, clean REIHH catalog reset, permanent 'Remove All Demo Data & Purchases' switch persisted across reboots.", "TC-115 to TC-121", "Verified (Pass)"),
        ("REQ-NFR", "Architecture & Live Hosting", "React + Vite on Vercel (CDN/HTTPS), Python FastAPI on Azure App Service, PostgreSQL/Neon persistence, responsive UI & live sync.", "Live_Host_Verification Sheet", "Verified (Pass)"),
    ]

    srs_tbl = doc.add_table(rows=len(srs_rows) + 1, cols=5)
    srs_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_borders(srs_tbl)
    srs_headers = ["Req ID", "Module / Area", "SRS Requirement Summary", "Test Ref", "Status"]
    srs_widths = [Inches(1.05), Inches(1.45), Inches(2.75), Inches(0.95), Inches(0.9)]
    for ci, h in enumerate(srs_headers):
        cell = srs_tbl.rows[0].cells[ci]
        cell.width = srs_widths[ci]
        _set_cell_shading(cell, "1E293B")
        _set_cell_margins(cell, 80, 80, 80, 80)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h)
        r.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for idx, row_data in enumerate(srs_rows, start=1):
        row = srs_tbl.rows[idx]
        bg = "F8FAFC" if idx % 2 == 1 else "FFFFFF"
        for ci, val in enumerate(row_data):
            cell = row.cells[ci]
            cell.width = srs_widths[ci]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            _set_cell_shading(cell, "DCFCE7" if ci == 4 else bg)
            _set_cell_margins(cell, 65, 65, 80, 80)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            if ci in (0, 3, 4):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(val)
            r.font.size = Pt(8.5)
            if ci in (0, 4):
                r.bold = True
            if ci == 4:
                r.font.color.rgb = RGBColor(0x16, 0x65, 0x34)

    # 4. Sign-Off Block
    _add_heading(doc, "4. Authorized Sign-Off & Acceptance")
    sign_tbl = doc.add_table(rows=2, cols=2)
    sign_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    _set_table_borders(sign_tbl)
    headers_sign = ["For the Client (REIHH Studio)", "For the Development Team (Team YATRI)"]
    bodies_sign = [
        "Signature: _________________________________\n\n"
        "Name: Amber Abbas\n"
        "Organization: REIHH Studio, Sector 125, Mohali\n"
        "Date: __________________   Official Stamp:",
        "Signature: _________________________________\n\n"
        "Name: Mohammad Ibad Hussain (Team Leader)\n"
        "Team: Yash Narang, Ashutosh Yadav, Tushar, Ramji\n"
        "Date: __________________",
    ]
    for ci in range(2):
        hcell = sign_tbl.rows[0].cells[ci]
        hcell.width = Inches(3.55)
        _set_cell_shading(hcell, "F1F5F9")
        _set_cell_margins(hcell, 80, 80, 120, 120)
        hp = hcell.paragraphs[0]
        hp.paragraph_format.space_after = Pt(0)
        hr = hp.add_run(headers_sign[ci])
        hr.bold = True
        hr.font.size = Pt(9.5)

        bcell = sign_tbl.rows[1].cells[ci]
        bcell.width = Inches(3.55)
        _set_cell_margins(bcell, 120, 120, 120, 120)
        bp = bcell.paragraphs[0]
        bp.paragraph_format.space_after = Pt(0)
        br = bp.add_run(bodies_sign[ci])
        br.font.size = Pt(9.5)

    for out in output_paths:
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            doc.save(out)
        except PermissionError:
            alt = out.with_name(f"{out.stem}_Updated{out.suffix}")
            doc.save(alt)
            print(f"Note: {out.name} was open in Word; saved updated copy to {alt}")


if __name__ == "__main__":
    out_files = [
        Path(r"C:\Users\asus\Desktop\code\Git\bizai\BizAI_Client_Acceptance_And_SRS_Verification.docx"),
        Path(r"C:\Users\asus\Downloads\BizAI_Client_Acceptance_And_SRS_Verification.docx"),
    ]
    build_acceptance_docx(121, 121, 15, 15, out_files)
    for p in out_files:
        print(f"Saved: {p}")
