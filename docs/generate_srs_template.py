"""
Generate a clean, reusable, annotated SRS Template document (IEEE Std 830-1998 / ISO/IEC/IEEE 29148 & Ian Sommerville 10th Ed)
with guidelines in each section on what to write and how to write it.
"""
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def style_table(table, col_widths=None, header_bg="2B6CB0", alt_bg="F7FAFC"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for cell in table.rows[0].cells:
        set_cell_background(cell, header_bg)
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                run.font.name = "Calibri"
                run.font.size = Pt(9.5)
    for r_idx, row in enumerate(table.rows[1:], start=1):
        bg = alt_bg if r_idx % 2 == 1 else "FFFFFF"
        for cell in row.cells:
            set_cell_background(cell, bg)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.name = "Calibri"
                    run.font.size = Pt(9)
                    run.font.color.rgb = RGBColor(45, 55, 72)
    if col_widths:
        for row in table.rows:
            for idx, width in enumerate(col_widths):
                if idx < len(row.cells):
                    row.cells[idx].width = width

def add_instruction_callout(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.right_indent = Inches(0.25)
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(6)
    r_tag = p.add_run("ℹ [Template Instruction / Sommerville Guidance]: ")
    r_tag.font.bold = True
    r_tag.font.size = Pt(9)
    r_tag.font.color.rgb = RGBColor(43, 108, 176)
    r_body = p.add_run(text)
    r_body.font.size = Pt(9)
    r_body.font.italic = True
    r_body.font.color.rgb = RGBColor(113, 128, 150)

def generate_template(output_path):
    doc = Document()
    for s in doc.sections:
        s.top_margin = Inches(1.0)
        s.bottom_margin = Inches(1.0)
        s.left_margin = Inches(1.0)
        s.right_margin = Inches(1.0)

    # Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(50)
    p_title.paragraph_format.space_after = Pt(8)
    r_title = p_title.add_run("Software Requirements Specification (SRS) Template")
    r_title.font.size = Pt(24)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(26, 54, 93)
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_after = Pt(20)
    r_sub = p_sub.add_run("Standardized According to IEEE Std 830-1998, ISO/IEC/IEEE 29148:2018 & Ian Sommerville (10th Ed.)")
    r_sub.font.size = Pt(11)
    r_sub.font.italic = True
    r_sub.font.color.rgb = RGBColor(74, 85, 104)
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Project metadata placeholder table
    tbl = doc.add_table(rows=6, cols=2)
    meta = [
        ("Project Name", "<Insert Project Title>"),
        ("Prepared By", "<Insert Author / Team Name>"),
        ("Organization", "<Insert Department / College / Enterprise>"),
        ("Version & Status", "Version 1.0 (Draft / Approved)"),
        ("Date", "<Insert Date>"),
        ("Supervised By", "<Insert Project Guide / Faculty Advisor>")
    ]
    for idx, (k, v) in enumerate(meta):
        tbl.rows[idx].cells[0].paragraphs[0].text = k
        tbl.rows[idx].cells[1].paragraphs[0].text = v
    style_table(tbl, [Inches(2.2), Inches(4.3)])

    doc.add_page_break()

    # Preface & Revision History
    doc.add_heading("Preface & Revision History", level=1)
    add_instruction_callout(doc, "Sommerville Ch. 4 §4.5: State the expected readership of this document, version history, and reasons for each revision.")
    doc.add_paragraph("<Insert brief summary of document purpose and intended readers>")

    doc.add_heading("Revision History Table", level=2)
    tbl_rev = doc.add_table(rows=4, cols=4)
    for i, h in enumerate(["Version", "Date", "Author", "Summary of Changes"]):
        tbl_rev.rows[0].cells[i].paragraphs[0].text = h
    tbl_rev.rows[1].cells[0].paragraphs[0].text = "0.1"
    tbl_rev.rows[1].cells[1].paragraphs[0].text = "<Date>"
    tbl_rev.rows[1].cells[2].paragraphs[0].text = "<Author>"
    tbl_rev.rows[1].cells[3].paragraphs[0].text = "Initial draft of requirements and user stories."
    style_table(tbl_rev, [Inches(0.8), Inches(1.0), Inches(1.5), Inches(3.2)])

    # Section 1
    doc.add_heading("1. Introduction", level=1)
    doc.add_heading("1.1 Purpose", level=2)
    add_instruction_callout(doc, "Identify the product whose software requirements are specified in this document. Explain whether this SRS covers the entire system or only a specific subsystem.")
    doc.add_paragraph("<Insert Purpose statement>")

    doc.add_heading("1.2 Document Conventions", level=2)
    add_instruction_callout(doc, "Describe any standards or typographical conventions used (e.g. bolding, requirement priority tags like [High], [Medium], [Low], or ID naming conventions FR-XXX).")
    doc.add_paragraph("<Insert Document Conventions>")

    doc.add_heading("1.3 Intended Audience & Reading Suggestions", level=2)
    add_instruction_callout(doc, "List the different types of readers (developers, testers, project managers, evaluators) and suggest which sections each reader should focus on.")
    doc.add_paragraph("<Insert Intended Audience>")

    doc.add_heading("1.4 Product Scope", level=2)
    add_instruction_callout(doc, "Provide a high-level description of what the software will and will not do. Link the software's goals to specific business or operational benefits.")
    doc.add_paragraph("<Insert Product Scope>")

    doc.add_heading("1.5 References", level=2)
    add_instruction_callout(doc, "List all documents, standards (IEEE 830, ISO 29148), textbooks (Sommerville 10th Ed), or external APIs referenced in this SRS.")
    doc.add_paragraph("<Insert References>")

    # Section 2
    doc.add_heading("2. Overall Description", level=1)
    doc.add_heading("2.1 Product Perspective", level=2)
    add_instruction_callout(doc, "Sommerville Ch. 6: Describe the context of the product. Is it standalone or part of a larger system? Include a high-level block diagram or context model.")
    doc.add_paragraph("<Insert Product Perspective & Architectural Tier overview>")

    doc.add_heading("2.2 Product Functions", level=2)
    add_instruction_callout(doc, "Provide a summarized list or high-level table of the major functions the software performs. Keep technical details for Section 4.")
    doc.add_paragraph("<Insert Summary of Product Functions>")

    doc.add_heading("2.3 User Classes and Characteristics", level=2)
    add_instruction_callout(doc, "Identify the user classes/roles (e.g. Admin, Manager, Operator) that will interact with the system, their technical expertise, and permissions.")
    doc.add_paragraph("<Insert User Classes & Role Hierarchy>")

    doc.add_heading("2.4 Operating Environment", level=2)
    add_instruction_callout(doc, "Specify the hardware platform, operating system versions, runtime environment, web browsers, and database engines required.")
    doc.add_paragraph("<Insert Operating Environment>")

    doc.add_heading("2.5 Design and Implementation Constraints", level=2)
    add_instruction_callout(doc, "List items that limit the developer's options: regulatory policies, hardware limitations, required languages/frameworks, security standards.")
    doc.add_paragraph("<Insert Constraints>")

    doc.add_heading("2.6 Assumptions and Dependencies", level=2)
    add_instruction_callout(doc, "State factors that are assumed to be true or external components on which the software depends (e.g. third-party APIs, network availability).")
    doc.add_paragraph("<Insert Assumptions & Dependencies>")

    # Section 3
    doc.add_heading("3. External Interface Requirements", level=1)
    doc.add_heading("3.1 User Interfaces", level=2)
    add_instruction_callout(doc, "Describe the user interface style, screen layouts, navigation schemes, error display standards, and usability requirements.")
    doc.add_paragraph("<Insert UI requirements and wireframe references>")

    doc.add_heading("3.2 Hardware Interfaces", level=2)
    add_instruction_callout(doc, "Specify any hardware interaction (printers, barcode scanners, camera, sensors) and supported communication protocols.")
    doc.add_paragraph("<Insert Hardware Interfaces>")

    doc.add_heading("3.3 Software Interfaces", level=2)
    add_instruction_callout(doc, "Detail connections to other software components: databases, operating system services, external cloud APIs, or libraries.")
    doc.add_paragraph("<Insert Software Interfaces>")

    doc.add_heading("3.4 Communications Interfaces", level=2)
    add_instruction_callout(doc, "Specify communication protocols: HTTP/HTTPS, WebSockets, REST JSON formats, security encryption (TLS), authentication headers.")
    doc.add_paragraph("<Insert Communications Interfaces>")

    # Section 4
    doc.add_heading("4. System Features & Functional Requirements", level=1)
    add_instruction_callout(doc, "Sommerville Ch. 4 §4.2: Organize by major feature or use case. For EACH feature, include Description, Priority, Stimulus/Response sequences, Preconditions, Postconditions, and detailed Functional Requirements (FR-XXX).")
    
    doc.add_heading("4.1 Feature 1: <Name of Feature>", level=2)
    doc.add_paragraph("Priority: [High / Medium / Low]\nDescription: <Detailed description of feature>")
    doc.add_paragraph("Stimulus / Response Sequences:\n• User action / Event: <Trigger>\n• System response: <Response>\n• Preconditions: <What must be true before>\n• Postconditions: <State of the system after>")
    
    tbl_f = doc.add_table(rows=3, cols=2)
    tbl_f.rows[0].cells[0].paragraphs[0].text = "Requirement ID"
    tbl_f.rows[0].cells[1].paragraphs[0].text = "Functional Specification (SHALL statements)"
    tbl_f.rows[1].cells[0].paragraphs[0].text = "FR-01.1"
    tbl_f.rows[1].cells[1].paragraphs[0].text = "The system SHALL <perform specific action>."
    tbl_f.rows[2].cells[0].paragraphs[0].text = "FR-01.2"
    tbl_f.rows[2].cells[1].paragraphs[0].text = "If <exception occurs>, the system SHALL <handle gracefully>."
    style_table(tbl_f, [Inches(1.8), Inches(4.7)])

    # Section 5
    doc.add_heading("5. Non-Functional Requirements (Sommerville Metrics)", level=1)
    add_instruction_callout(doc, "Sommerville Ch. 4 §4.3 & Table 4.5: Non-functional requirements MUST be quantitatively measurable. Avoid vague terms like 'robust' or 'user friendly'.")
    
    tbl_nfr = doc.add_table(rows=7, cols=3)
    tbl_nfr.rows[0].cells[0].paragraphs[0].text = "Sommerville Property"
    tbl_nfr.rows[0].cells[1].paragraphs[0].text = "Metric / Measurement Standard"
    tbl_nfr.rows[0].cells[2].paragraphs[0].text = "Target Quantitative Value"
    nfr_examples = [
        ("Speed (Performance)", "Response time to user inputs / REST API latency", "< 100 ms average latency"),
        ("Size", "Memory footprint / binary package size", "< 200 MB server memory"),
        ("Ease of Use", "Time required to train a novice user", "< 30 minutes training"),
        ("Reliability", "Mean Time Between Failures (MTBF) / Rate of failure occurrence", "< 1 failure per 1,000 transactions"),
        ("Robustness", "Time to restart after failure / Data recovery percentage", "100% atomic recovery"),
        ("Portability", "Percentage of target-dependent code / Number of target platforms", "Cross-platform Linux/Win/macOS")
    ]
    for idx, (p, m, t) in enumerate(nfr_examples, start=1):
        tbl_nfr.rows[idx].cells[0].paragraphs[0].text = p
        tbl_nfr.rows[idx].cells[1].paragraphs[0].text = m
        tbl_nfr.rows[idx].cells[2].paragraphs[0].text = t
    style_table(tbl_nfr, [Inches(1.8), Inches(2.7), Inches(2.0)])

    # Section 6
    doc.add_heading("6. System Models & UML Specifications", level=1)
    add_instruction_callout(doc, "Sommerville Ch. 5: Integrate system models representing the 4 core perspectives: Context models, Interaction models (Use Case & Sequence), Structural models (Class & ERD), and Behavioral models (State Machine & Activity).")
    doc.add_heading("6.1 Context Models (DFD Level 0 & Level 1)", level=2)
    doc.add_paragraph("<Embed DFD Context diagram and decomposition>")
    doc.add_heading("6.2 Interaction Models (Use Cases & Sequence Diagrams)", level=2)
    doc.add_paragraph("<Embed Use Case diagrams with tabular specs and Sequence diagrams>")
    doc.add_heading("6.3 Structural Models (Class Diagram & Relational Schema)", level=2)
    doc.add_paragraph("<Embed Class Diagram with 3 compartments and ERD with Crow's Foot>")
    doc.add_heading("6.4 Behavioral Models (Statechart & Activity Diagrams)", level=2)
    doc.add_paragraph("<Embed State Machine diagram for entity lifecycle and Activity diagram with swimlanes>")

    # Section 7
    doc.add_heading("7. System Evolution & Anticipated Changes", level=1)
    add_instruction_callout(doc, "Sommerville Ch. 9: Explicitly document anticipated hardware shifts, software upgrades, or evolving user requirements to ensure maintainability.")
    doc.add_paragraph("<Insert System Evolution roadmap>")

    # Appendices
    doc.add_heading("Appendix A: Glossary of Terms", level=1)
    doc.add_paragraph("<Insert definitions of technical acronyms, domain terms, and abbreviations>")
    doc.add_heading("Appendix B: Requirements Traceability Matrix (RTM)", level=1)
    add_instruction_callout(doc, "Map every functional requirement to its design diagram, implementation module, and test case.")
    doc.add_paragraph("<Insert RTM table>")

    doc.save(output_path)
    print(f"Successfully generated SRS Template at: {output_path}")

if __name__ == "__main__":
    out_file = r"c:\Users\asus\Desktop\code\Git\bizai\docs\SRS_Template_Ian_Sommerville_IEEE830.docx"
    generate_template(out_file)
