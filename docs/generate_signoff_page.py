"""
Generate a crisp, professional 1-page Software Requirements Specification (SRS) Sign-Off & Acceptance Sheet.
Standard academic and IEEE 830 format:
  - Authored by Team YATRI for BizAI v1.0
  - Reviewed and Accepted by Client (Amber Abbas, Reihh)
  - Not pretending to be an external corporate contract; 100% legitimate project review sheet.

Outputs:
  - docs/SRS_Client_Signoff_Page.docx
  - docs/SRS_Client_Signoff_Page.pdf
"""
import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

FONT_NAME = "Times New Roman"
COLOR_BLACK = RGBColor(0, 0, 0)
COLOR_MUTED = RGBColor(90, 90, 90)
HEX_HEADER_BG = "F4F5F7"
HEX_ALT_ROW = "FAFAFA"
HEX_BORDER = "C8C8C8"


def set_cell_bg(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def set_cell_margins(cell, top=70, bottom=70, left=100, right=100):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)


def set_table_borders(table, color=HEX_BORDER, sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)


def style_table(table, col_widths=None):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table)

    header_row = table.rows[0]
    for cell in header_row.cells:
        set_cell_bg(cell, HEX_HEADER_BG)
        set_cell_margins(cell, 80, 80, 100, 100)
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.bold = True
                r.font.name = FONT_NAME
                r.font.size = Pt(9.5)
                r.font.color.rgb = COLOR_BLACK

    for r_idx, row in enumerate(table.rows[1:], start=1):
        bg = HEX_ALT_ROW if r_idx % 2 == 1 else "FFFFFF"
        for cell in row.cells:
            set_cell_bg(cell, bg)
            set_cell_margins(cell, 60, 60, 100, 100)
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.name = FONT_NAME
                    r.font.size = Pt(9.0)
                    r.font.color.rgb = COLOR_BLACK

    if col_widths:
        for row in table.rows:
            for idx, width in enumerate(col_widths):
                if idx < len(row.cells):
                    row.cells[idx].width = width

    for row in table.rows:
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))


def build_signoff_page(output_docx):
    doc = Document()

    # Compact 0.5" margins for clean, strict single-page fit
    sec = doc.sections[0]
    sec.top_margin = Inches(0.5)
    sec.bottom_margin = Inches(0.5)
    sec.left_margin = Inches(0.6)
    sec.right_margin = Inches(0.6)

    # Empty header
    sec.header.paragraphs[0].text = ""

    # Header / Title Block
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_inst.paragraph_format.space_before = Pt(0)
    p_inst.paragraph_format.space_after = Pt(1)
    r_inst = p_inst.add_run("SOFTWARE REQUIREMENTS SPECIFICATION (SRS)")
    r_inst.font.name = FONT_NAME
    r_inst.font.size = Pt(10.5)
    r_inst.font.bold = True
    r_inst.font.color.rgb = COLOR_MUTED

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(1)
    p_title.paragraph_format.space_after = Pt(1)
    r_title = p_title.add_run("Requirements Verification & Client Sign-Off Sheet")
    r_title.font.name = FONT_NAME
    r_title.font.size = Pt(16)
    r_title.font.bold = True
    r_title.font.color.rgb = COLOR_BLACK

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(8)
    r_sub = p_sub.add_run("BizAI Enterprise Platform (Version 1.0 Baseline) | Conforming to IEEE Std 830-1998")
    r_sub.font.name = FONT_NAME
    r_sub.font.size = Pt(9.5)
    r_sub.font.italic = True
    r_sub.font.color.rgb = COLOR_MUTED

    # Project & Stakeholder Metadata Table
    meta_table = doc.add_table(rows=5, cols=2)
    meta_data = [
        ("Project Name & Version:", "BizAI Enterprise ERP & Operations Assistant — Version 1.0 (Approved Baseline)"),
        ("Client Organization:", "Reihh (Sector 125, Mohali, Punjab) — SME Commercial Distribution & Wholesale"),
        ("Client Representative:", "Amber Abbas — Business Head & Operations Lead"),
        ("Engineering Team:", "Team YATRI — Department of Computer Science & Engineering (Capstone Project)"),
        ("Lead Architect / TL:", "Mohammad Ibad Hussain (Roll No.: 24/11/EC/067)"),
    ]
    for i, (k, v) in enumerate(meta_data):
        row = meta_table.rows[i]
        p_k = row.cells[0].paragraphs[0]
        p_k.paragraph_format.space_after = Pt(1)
        r_k = p_k.add_run(k)
        r_k.font.name = FONT_NAME
        r_k.font.bold = True
        r_k.font.size = Pt(9.0)

        p_v = row.cells[1].paragraphs[0]
        p_v.paragraph_format.space_after = Pt(1)
        r_v = p_v.add_run(v)
        r_v.font.name = FONT_NAME
        r_v.font.size = Pt(9.0)

    style_table(meta_table, [Inches(1.9), Inches(5.3)])
    doc.add_paragraph().paragraph_format.space_after = Pt(3)

    # Acceptance Statement Box
    p_stmt_head = doc.add_paragraph()
    p_stmt_head.paragraph_format.space_before = Pt(2)
    p_stmt_head.paragraph_format.space_after = Pt(1)
    r_sh = p_stmt_head.add_run("1. Statement of Acceptance & Scope Verification")
    r_sh.font.name = FONT_NAME
    r_sh.font.size = Pt(10.5)
    r_sh.font.bold = True

    p_stmt = doc.add_paragraph()
    p_stmt.paragraph_format.space_after = Pt(5)
    p_stmt.paragraph_format.line_spacing = 1.10
    r_st = p_stmt.add_run(
        "By signing below, the Client Representative and the Engineering Team Leader verify that the technical specifications, "
        "functional requirements, database schemas, and interface workflows documented in the BizAI Software Requirements "
        "Specification (SRS v1.0) have been mutually reviewed and baselined. The specified features accurately represent the "
        "operational requirements of Reihh for order processing, inventory governance, automated PDF invoicing, credit ledger "
        "tracking, and context-grounded AI assistant capabilities."
    )
    r_st.font.name = FONT_NAME
    r_st.font.size = Pt(9.0)

    # Team Members Table
    p_team_head = doc.add_paragraph()
    p_team_head.paragraph_format.space_before = Pt(2)
    p_team_head.paragraph_format.space_after = Pt(1)
    r_th = p_team_head.add_run("2. Development Team Roll Call (Team YATRI)")
    r_th.font.name = FONT_NAME
    r_th.font.size = Pt(10.5)
    r_th.font.bold = True

    team_tbl = doc.add_table(rows=6, cols=3)
    team_data = [
        ["Member Name", "University Roll Number", "Assigned System Responsibilities"],
        ["Mohammad Ibad Hussain", "24/11/EC/067", "Team Leader, System Architecture, State Machines & Groq AI"],
        ["Yash Narang", "24/11/EC/043", "Full-Stack Development, Security & Multi-Tenant Authentication"],
        ["Ashutosh Yadav", "24/11/EC/014", "ReportLab Vector Invoicing & Executive Analytics Subsystem"],
        ["Tushar", "24/11/EC/013", "Stock Adjustment Subsystem, Audit Trails & Edge Case Validation"],
        ["Ramji", "24/11/EC/025", "CRM Customer Ledger, Database Optimization & REST Endpoints"],
    ]
    for r_idx, row in enumerate(team_data):
        for c_idx, val in enumerate(row):
            p_cell = team_tbl.rows[r_idx].cells[c_idx].paragraphs[0]
            p_cell.paragraph_format.space_after = Pt(0)
            p_cell.text = val
    style_table(team_tbl, [Inches(1.9), Inches(1.8), Inches(3.5)])
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # Formal Physical Signature Blocks
    p_sig_head = doc.add_paragraph()
    p_sig_head.paragraph_format.space_before = Pt(2)
    p_sig_head.paragraph_format.space_after = Pt(2)
    r_sgh = p_sig_head.add_run("3. Approvals & Signatures")
    r_sgh.font.name = FONT_NAME
    r_sgh.font.size = Pt(10.5)
    r_sgh.font.bold = True

    sig_tbl = doc.add_table(rows=1, cols=2)
    sig_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(sig_tbl, color="B0B0B0", sz="6")

    # Cell 1: Client
    c1 = sig_tbl.rows[0].cells[0]
    set_cell_bg(c1, "FAFAFA")
    set_cell_margins(c1, 80, 80, 100, 100)
    p1 = c1.paragraphs[0]
    p1.paragraph_format.space_after = Pt(1)
    r = p1.add_run("ON BEHALF OF CLIENT (REIHH):\n")
    r.font.name = FONT_NAME
    r.font.bold = True
    r.font.size = Pt(9.5)

    p1_body = c1.add_paragraph()
    p1_body.paragraph_format.space_before = Pt(20)
    p1_body.paragraph_format.space_after = Pt(1)
    r_sig1 = p1_body.add_run("Signature: ______________________________\n")
    r_sig1.font.name = FONT_NAME
    r_sig1.font.bold = True
    r_sig1.font.size = Pt(9.0)

    r_c1_info = p1_body.add_run(
        "Name: Amber Abbas\n"
        "Designation: Business Head / Representative\n"
        "Organization: Reihh, Sector 125, Mohali, Punjab\n"
        "Date: ________________________"
    )
    r_c1_info.font.name = FONT_NAME
    r_c1_info.font.size = Pt(8.5)

    # Cell 2: Team Leader
    c2 = sig_tbl.rows[0].cells[1]
    set_cell_bg(c2, "FAFAFA")
    set_cell_margins(c2, 80, 80, 100, 100)
    p2 = c2.paragraphs[0]
    p2.paragraph_format.space_after = Pt(1)
    r = p2.add_run("ON BEHALF OF TEAM YATRI:\n")
    r.font.name = FONT_NAME
    r.font.bold = True
    r.font.size = Pt(9.5)

    p2_body = c2.add_paragraph()
    p2_body.paragraph_format.space_before = Pt(20)
    p2_body.paragraph_format.space_after = Pt(1)
    r_sig2 = p2_body.add_run("Signature: ______________________________\n")
    r_sig2.font.name = FONT_NAME
    r_sig2.font.bold = True
    r_sig2.font.size = Pt(9.0)

    r_c2_info = p2_body.add_run(
        "Name: Mohammad Ibad Hussain\n"
        "Designation: Lead Architect & Team Leader\n"
        "Department: Computer Science & Engineering\n"
        "Date: ________________________"
    )
    r_c2_info.font.name = FONT_NAME
    r_c2_info.font.size = Pt(8.5)

    c1.width = Inches(3.6)
    c2.width = Inches(3.6)

    doc.save(output_docx)
    print(f"Generated clean 1-page SRS Sign-Off Sheet: {output_docx}")


if __name__ == "__main__":
    docs_dir = os.path.dirname(os.path.abspath(__file__))
    docx_path = os.path.join(docs_dir, "SRS_Client_Signoff_Page.docx")
    build_signoff_page(docx_path)
