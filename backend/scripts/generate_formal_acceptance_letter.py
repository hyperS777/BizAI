"""
Generate a 1-page Formal Project Acceptance Letter (both .docx and .pdf)
modeled directly on Acceptance Letter.pdf, written from Client Amber Abbas
(REIHH Studio) to Team YATRI, including SRS verification and payment milestone confirmation.
"""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


TEAM_MEMBERS = [
    "Mohammad Ibad Hussain",
    "Yash Narang",
    "Ashutosh Yadav",
    "Tushar",
    "Ramji",
    "Development Team, Team YATRI (BizAI Software)",
]

DATE_TEXT = "November 27, 2026"
SUBJECT_TEXT = "Formal Project Acceptance and Final Sign-Off – REIHH Studio BizAI Commerce Platform"

INTRO_TEXT = (
    'We are writing to formally confirm the successful completion and final delivery of the '
    '"BizAI – Fashion ERP & Commerce Platform (REIHH Studio Commerce OS)", designed to streamline '
    'apparel operations, multi-location inventory control, order fulfillment, and customer storefront '
    'workflows. The delivered system comprises customer relationship management (CRM), product & variant '
    'catalog management, order and Delhivery AWB tracking, GST invoicing and recurring expenses, '
    'role-based access control, AI business analytics, and the live customer storefront.'
)

BULLETS = [
    "All functional specifications and SRS requirements have been successfully satisfied, with the complete application deployed and verified on live production hosts (Vercel & Microsoft Azure App Service).",
    "Inventory, catalog, and financial management — including garment variants, metafields, multi-location warehouses, order lifecycle controls, automated GST invoices, recurring expenses, and GSTR-1/P&L exports — have been validated and accepted.",
    "Role-Based Access Control (RBAC) with distinct permissions for Admins, Managers, Employees, and Accountants, together with the AI Business Advisor, Discounts, Gift Cards, and live Razorpay storefront checkout, has passed all verification checks.",
    "Regarding agreed commercial payment terms, we confirm that ₹1,00,000 (One Lakh Rupees) has already been paid to the development team, and the remaining balance of ₹1,00,000 (One Lakh Rupees) will be paid upon final handover.",
    "The platform is hereby officially approved and handed over into active production and operational status.",
]

CLOSING_1 = (
    "We commend the development team for delivering a robust architecture, maintaining high "
    "codebase maintainability, and adhering strictly to the project delivery timeline."
)
CLOSING_2 = (
    "Thank you for your exceptional professionalism and dedication throughout the lifecycle of this project."
)


def build_docx(paths: list[Path]):
    doc = Document()
    for sec in doc.sections:
        sec.top_margin = Inches(0.85)
        sec.bottom_margin = Inches(0.85)
        sec.left_margin = Inches(0.95)
        sec.right_margin = Inches(0.95)

    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor(0x11, 0x18, 0x27)

    # Date
    p_date = doc.add_paragraph()
    p_date.paragraph_format.space_after = Pt(12)
    r_lbl = p_date.add_run("Date: ")
    r_lbl.bold = True
    p_date.add_run(DATE_TEXT)

    # To block
    p_to_lbl = doc.add_paragraph()
    p_to_lbl.paragraph_format.space_after = Pt(2)
    r_to = p_to_lbl.add_run("To:")
    r_to.bold = True

    p_to = doc.add_paragraph("\n".join(TEAM_MEMBERS))
    p_to.paragraph_format.space_after = Pt(12)
    p_to.paragraph_format.line_spacing = 1.15

    # Subject
    p_subj = doc.add_paragraph()
    p_subj.paragraph_format.space_after = Pt(10)
    r_sl = p_subj.add_run("Subject: ")
    r_sl.bold = True
    r_st = p_subj.add_run(SUBJECT_TEXT)
    r_st.bold = True

    # Salutation
    p_sal = doc.add_paragraph("Dear Development Team,")
    p_sal.paragraph_format.space_after = Pt(8)

    # Intro
    p_intro = doc.add_paragraph(INTRO_TEXT)
    p_intro.paragraph_format.space_after = Pt(8)
    p_intro.paragraph_format.line_spacing = 1.18

    # Bullets lead-in
    p_lead = doc.add_paragraph("Following comprehensive evaluation, we formally confirm the following:")
    p_lead.paragraph_format.space_after = Pt(6)

    for b in BULLETS:
        pb = doc.add_paragraph(style="List Bullet")
        pb.paragraph_format.space_after = Pt(5)
        pb.paragraph_format.line_spacing = 1.15
        pb.add_run(b)

    # Closings
    p_c1 = doc.add_paragraph(CLOSING_1)
    p_c1.paragraph_format.space_before = Pt(6)
    p_c1.paragraph_format.space_after = Pt(8)
    p_c1.paragraph_format.line_spacing = 1.18

    p_c2 = doc.add_paragraph(CLOSING_2)
    p_c2.paragraph_format.space_after = Pt(12)

    p_sinc = doc.add_paragraph("Sincerely,")
    p_sinc.paragraph_format.space_after = Pt(34)

    p_sig = doc.add_paragraph()
    p_sig.paragraph_format.space_after = Pt(0)
    r_name = p_sig.add_run("Amber Abbas\n")
    r_name.bold = True
    p_sig.add_run("REIHH Studio")

    for out in paths:
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            doc.save(out)
        except PermissionError:
            alt = out.with_name(f"{out.stem}_New{out.suffix}")
            doc.save(alt)
            print(f"Note: {out.name} locked; saved to {alt}")


def build_pdf(paths: list[Path]):
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "LetterBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14.5,
        textColor="#111827",
    )
    bullet_style = ParagraphStyle(
        "LetterBullet",
        parent=body,
        leftIndent=18,
        firstLineIndent=-10,
        spaceAfter=5,
    )

    for out in paths:
        out.parent.mkdir(parents=True, exist_ok=True)
        doc = SimpleDocTemplate(
            str(out),
            pagesize=A4,
            leftMargin=0.9 * inch,
            rightMargin=0.9 * inch,
            topMargin=0.8 * inch,
            bottomMargin=0.75 * inch,
        )
        story = []
        story.append(Paragraph(f"<b>Date:</b> {DATE_TEXT}", body))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>To:</b><br/>" + "<br/>".join(TEAM_MEMBERS), body))
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"<b>Subject: {SUBJECT_TEXT}</b>", body))
        story.append(Spacer(1, 10))
        story.append(Paragraph("Dear Development Team,", body))
        story.append(Spacer(1, 8))
        story.append(Paragraph(INTRO_TEXT, body))
        story.append(Spacer(1, 8))
        story.append(Paragraph("Following comprehensive evaluation, we formally confirm the following:", body))
        story.append(Spacer(1, 6))

        for b in BULLETS:
            # Use Rs. cleanly in standard Helvetica PDF font (or ₹ if needed, Helvetica doesn't have ₹ glyph by default!)
            b_pdf = b.replace("₹", "Rs. ")
            story.append(Paragraph(f"&bull;&nbsp;&nbsp;{b_pdf}", bullet_style))

        story.append(Spacer(1, 6))
        story.append(Paragraph(CLOSING_1, body))
        story.append(Spacer(1, 8))
        story.append(Paragraph(CLOSING_2, body))
        story.append(Spacer(1, 12))
        story.append(Paragraph("Sincerely,", body))
        story.append(Spacer(1, 34))
        story.append(Paragraph("<b>Amber Abbas</b><br/>REIHH Studio", body))
        doc.build(story)


if __name__ == "__main__":
    repo = Path(__file__).resolve().parent.parent.parent
    downloads = Path(r"C:\Users\asus\Downloads")

    docx_paths = [
        repo / "BizAI_Formal_Acceptance_Letter.docx",
        downloads / "BizAI_Formal_Acceptance_Letter.docx",
    ]
    pdf_paths = [
        repo / "BizAI_Formal_Acceptance_Letter.pdf",
        downloads / "BizAI_Formal_Acceptance_Letter.pdf",
    ]
    build_docx(docx_paths)
    build_pdf(pdf_paths)
    for p in docx_paths + pdf_paths:
        print(f"Saved: {p} ({p.stat().st_size} bytes)")
