"""PDF generation for Invoices, Delhivery Packing Slips, and P&L Statements."""

from io import BytesIO
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

COMPANY_NAME = "REIHH Studio"
COMPANY_LEGAL = "Reihh Luxury Apparel Private Limited"
COMPANY_GSTIN = "07AAACR1234F1Z5"
COMPANY_ADDRESS = "Plot 42, Okhla Phase III, New Delhi 110020"
COMPANY_PHONE = "+91 98100 12345"


def build_invoice_pdf(invoice) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    order = getattr(invoice, "order", None)
    customer = (order.customer if order else None) or getattr(invoice, "customer", None)

    # Header & Brand
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, height - 25 * mm, COMPANY_NAME)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, height - 30 * mm, f"{COMPANY_LEGAL} · GSTIN: {COMPANY_GSTIN}")
    pdf.drawString(20 * mm, height - 34 * mm, f"{COMPANY_ADDRESS} · Phone: {COMPANY_PHONE}")

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(width - 20 * mm, height - 25 * mm, "TAX INVOICE")
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(width - 20 * mm, height - 31 * mm, f"#{invoice.invoice_number}")
    pdf.drawRightString(width - 20 * mm, height - 36 * mm, f"Status: {invoice.status.upper()}")
    pdf.drawRightString(width - 20 * mm, height - 41 * mm, f"Date: {invoice.created_at.strftime('%d %b %Y') if invoice.created_at else str(date.today())}")

    # Divider
    pdf.setStrokeColorRGB(0.8, 0.8, 0.8)
    pdf.setLineWidth(0.5)
    pdf.line(20 * mm, height - 46 * mm, width - 20 * mm, height - 46 * mm)

    # Bill To
    y = height - 54 * mm
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(20 * mm, y, "BILLED TO:")
    pdf.setFont("Helvetica", 10)
    y -= 5 * mm
    if customer:
        pdf.drawString(20 * mm, y, customer.name)
        y -= 4.5 * mm
        if getattr(customer, "company", None):
            pdf.drawString(20 * mm, y, customer.company)
            y -= 4.5 * mm
        if getattr(customer, "address", None):
            pdf.drawString(20 * mm, y, customer.address[:80])
            y -= 4.5 * mm
        if getattr(customer, "gstin", None):
            pdf.drawString(20 * mm, y, f"Customer GSTIN: {customer.gstin}")
            y -= 4.5 * mm
        if getattr(customer, "email", None) or getattr(customer, "phone", None):
            contact = " · ".join(filter(None, [customer.email, customer.phone]))
            pdf.drawString(20 * mm, y, contact)
            y -= 4.5 * mm
    else:
        pdf.drawString(20 * mm, y, "Direct Counter Sale")
        y -= 5 * mm

    # Items table header
    y -= 6 * mm
    pdf.setFillColorRGB(0.95, 0.96, 0.96)
    pdf.rect(20 * mm, y - 2 * mm, width - 40 * mm, 7 * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(22 * mm, y + 2 * mm, "ITEM / DESCRIPTION")
    pdf.drawString(105 * mm, y + 2 * mm, "QTY")
    pdf.drawString(125 * mm, y + 2 * mm, "RATE (INR)")
    pdf.drawRightString(width - 22 * mm, y + 2 * mm, "AMOUNT (INR)")

    y -= 6 * mm
    pdf.setFont("Helvetica", 9)
    if order and order.items:
        for item in order.items:
            name = item.product.name if item.product else f"Product #{item.product_id}"
            opt = []
            if item.option1:
                opt.append(item.option1)
            if item.option2:
                opt.append(item.option2)
            desc = f"{name} ({'/'.join(opt)})" if opt else name
            pdf.drawString(22 * mm, y, desc[:45])
            pdf.drawString(105 * mm, y, str(item.quantity))
            pdf.drawString(125 * mm, y, f"{item.unit_price:,.2f}")
            pdf.drawRightString(width - 22 * mm, y, f"{item.total_price:,.2f}")
            y -= 5.5 * mm
    else:
        desc = invoice.notes or "Apparel & Garments Delivery"
        pdf.drawString(22 * mm, y, desc[:45])
        pdf.drawString(105 * mm, y, "1")
        pdf.drawString(125 * mm, y, f"{invoice.total_amount:,.2f}")
        pdf.drawRightString(width - 22 * mm, y, f"{invoice.total_amount:,.2f}")
        y -= 5.5 * mm

    # Totals and GST breakdown
    y -= 6 * mm
    pdf.setStrokeColorRGB(0.85, 0.85, 0.85)
    pdf.line(20 * mm, y, width - 20 * mm, y)
    y -= 6 * mm

    # Calculate GST (18% inclusive or breakdown)
    taxable = round(invoice.total_amount / 1.18, 2)
    cgst = round((invoice.total_amount - taxable) / 2, 2)
    sgst = cgst

    pdf.setFont("Helvetica", 9)
    pdf.drawString(105 * mm, y, "Taxable Value:")
    pdf.drawRightString(width - 22 * mm, y, f"INR {taxable:,.2f}")
    y -= 4.5 * mm
    pdf.drawString(105 * mm, y, "CGST (9%):")
    pdf.drawRightString(width - 22 * mm, y, f"INR {cgst:,.2f}")
    y -= 4.5 * mm
    pdf.drawString(105 * mm, y, "SGST (9%):")
    pdf.drawRightString(width - 22 * mm, y, f"INR {sgst:,.2f}")
    y -= 6 * mm

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(105 * mm, y, "Total Amount:")
    pdf.drawRightString(width - 22 * mm, y, f"INR {invoice.total_amount:,.2f}")
    y -= 5 * mm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(105 * mm, y, "Amount Paid:")
    pdf.drawRightString(width - 22 * mm, y, f"INR {invoice.paid_amount:,.2f}")
    y -= 4.5 * mm
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(105 * mm, y, "Balance Due:")
    pdf.drawRightString(width - 22 * mm, y, f"INR {invoice.balance_due:,.2f}")

    # Footer note
    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.4, 0.4, 0.4)
    pdf.drawString(20 * mm, 20 * mm, "Thank you for partnering with REIHH Studio. For questions, reach out to contact@reihh.com.")
    pdf.drawRightString(width - 20 * mm, 20 * mm, "Computer Generated Tax Invoice · No Signature Required")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()


def build_packing_slip_pdf(order) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    customer = order.customer

    # Header with Delhivery courier badge
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, height - 25 * mm, COMPANY_NAME)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, height - 30 * mm, f"Order Fulfillment Center · {COMPANY_ADDRESS}")

    pdf.setStrokeColorRGB(0.1, 0.5, 0.4)
    pdf.setFillColorRGB(0.92, 0.97, 0.95)
    pdf.rect(width - 70 * mm, height - 36 * mm, 50 * mm, 14 * mm, fill=1, stroke=1)
    pdf.setFillColorRGB(0.05, 0.35, 0.3)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(width - 25 * mm, height - 27 * mm, "DELHIVERY AIR")
    pdf.setFont("Helvetica", 8)
    tracking = order.tracking_number or "AWB-PENDING"
    pdf.drawRightString(width - 25 * mm, height - 32 * mm, f"AWB: {tracking}")

    # Order Meta
    y = height - 48 * mm
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(20 * mm, y, f"PACKING SLIP · #{order.order_number}")
    y -= 5 * mm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, y, f"Date: {order.created_at.strftime('%d %b %Y, %I:%M %p') if order.created_at else str(date.today())}")

    # Shipping Address Box
    y -= 8 * mm
    pdf.setFillColorRGB(0.97, 0.97, 0.97)
    pdf.rect(20 * mm, y - 26 * mm, width - 40 * mm, 28 * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(24 * mm, y - 2 * mm, "SHIP TO:")
    pdf.setFont("Helvetica", 9)
    ship_to_name = customer.name if customer else "Customer"
    pdf.drawString(24 * mm, y - 7 * mm, ship_to_name)
    ship_addr = order.shipping_address or (customer.address if customer else "Delivery address on file")
    pdf.drawString(24 * mm, y - 12 * mm, ship_addr[:75])
    contact = f"Phone: {customer.phone or 'N/A'} · Email: {customer.email or 'N/A'}" if customer else ""
    pdf.drawString(24 * mm, y - 17 * mm, contact)
    pdf.drawString(24 * mm, y - 22 * mm, f"Carrier: {order.tracking_company or 'Delhivery Logistics'} · Status: {order.status.upper()}")

    # Items table
    y -= 36 * mm
    pdf.setFillColorRGB(0.95, 0.96, 0.96)
    pdf.rect(20 * mm, y - 2 * mm, width - 40 * mm, 7 * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(22 * mm, y + 2 * mm, "SKU")
    pdf.drawString(55 * mm, y + 2 * mm, "PRODUCT / VARIANT")
    pdf.drawString(145 * mm, y + 2 * mm, "QTY")
    pdf.drawRightString(width - 22 * mm, y + 2 * mm, "VERIFIED")

    y -= 6 * mm
    pdf.setFont("Helvetica", 9)
    for item in (order.items or []):
        sku = item.sku or (item.product.sku if item.product else "SKU-N/A")
        name = item.product.name if item.product else f"Product #{item.product_id}"
        variant_desc = f"{item.option1 or ''} {item.option2 or ''}".strip()
        display = f"{name} ({variant_desc})" if variant_desc else name

        pdf.drawString(22 * mm, y, sku[:16])
        pdf.drawString(55 * mm, y, display[:48])
        pdf.drawString(145 * mm, y, str(item.quantity))
        # Checkbox for warehouse picking
        pdf.rect(width - 30 * mm, y - 1 * mm, 3.5 * mm, 3.5 * mm, fill=0, stroke=1)
        y -= 6 * mm

    # Barcode simulated box
    y -= 12 * mm
    pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
    pdf.rect(20 * mm, y - 16 * mm, 80 * mm, 16 * mm, fill=0, stroke=1)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(24 * mm, y - 5 * mm, f"DELHIVERY TRACKING ID")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(24 * mm, y - 12 * mm, f"||||||  {tracking}  ||||||")

    # Instructions
    pdf.setFont("Helvetica", 8)
    pdf.drawString(110 * mm, y - 5 * mm, "Return Policy: 7 days hassle-free exchange.")
    pdf.drawString(110 * mm, y - 9 * mm, "Questions? WhatsApp concierge at +91 98100 12345.")
    pdf.drawString(110 * mm, y - 13 * mm, "Packer Signature: _______________________")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()


def build_pnl_pdf(pnl_data: dict) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, height - 25 * mm, COMPANY_NAME)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, height - 30 * mm, f"{COMPANY_LEGAL} · GSTIN: {COMPANY_GSTIN}")

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(width - 20 * mm, height - 25 * mm, "PROFIT & LOSS STATEMENT")
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(width - 20 * mm, height - 31 * mm, f"Period: {pnl_data.get('period', 'Current Fiscal Year')}")
    pdf.drawRightString(width - 20 * mm, height - 36 * mm, f"Generated: {date.today().strftime('%d %b %Y')}")

    pdf.setStrokeColorRGB(0.8, 0.8, 0.8)
    pdf.line(20 * mm, height - 42 * mm, width - 20 * mm, height - 42 * mm)

    y = height - 52 * mm
    revenue = float(pnl_data.get("gross_sales", 0.0))
    cogs = float(pnl_data.get("cogs", 0.0))
    gross_profit = float(pnl_data.get("gross_profit", 0.0))
    expenses = float(pnl_data.get("operating_expenses", 0.0))
    net_profit = float(pnl_data.get("net_profit", 0.0))

    # Revenue Section
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "1. REVENUE")
    pdf.drawRightString(width - 20 * mm, y, f"INR {revenue:,.2f}")
    y -= 5 * mm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(26 * mm, y, f"Gross Sales ({pnl_data.get('total_orders', 0)} fulfilled orders)")
    pdf.drawRightString(width - 20 * mm, y, f"INR {revenue:,.2f}")
    y -= 7 * mm

    # COGS Section
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "2. COST OF GOODS SOLD (COGS)")
    pdf.drawRightString(width - 20 * mm, y, f"INR {cogs:,.2f}")
    y -= 5 * mm
    pdf.setFont("Helvetica", 9)
    pdf.drawString(26 * mm, y, "Garment Fabric & Manufacturing Direct Unit Costs")
    pdf.drawRightString(width - 20 * mm, y, f"INR {cogs:,.2f}")
    y -= 8 * mm

    # Gross Profit
    pdf.setFillColorRGB(0.93, 0.96, 0.95)
    pdf.rect(20 * mm, y - 2 * mm, width - 40 * mm, 8 * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 11)
    gp_margin = (gross_profit / revenue * 100) if revenue > 0 else 0
    pdf.drawString(22 * mm, y + 2 * mm, f"GROSS PROFIT (Margin: {gp_margin:.1f}%)")
    pdf.drawRightString(width - 22 * mm, y + 2 * mm, f"INR {gross_profit:,.2f}")
    y -= 10 * mm

    # Operating Expenses Section
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "3. OPERATING EXPENSES (Realized)")
    pdf.drawRightString(width - 20 * mm, y, f"INR {expenses:,.2f}")
    y -= 5 * mm
    pdf.setFont("Helvetica", 9)
    for cat in pnl_data.get("expense_categories", []):
        pdf.drawString(26 * mm, y, f"· {cat.get('category', 'General')}")
        pdf.drawRightString(width - 20 * mm, y, f"INR {float(cat.get('total', 0)):,.2f}")
        y -= 4.5 * mm
    y -= 4 * mm

    # Net Profit
    net_margin = (net_profit / revenue * 100) if revenue > 0 else 0
    bg_color = (0.9, 0.97, 0.92) if net_profit >= 0 else (0.98, 0.92, 0.92)
    pdf.setFillColorRGB(*bg_color)
    pdf.rect(20 * mm, y - 3 * mm, width - 40 * mm, 10 * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(22 * mm, y + 2 * mm, f"NET OPERATING PROFIT (Margin: {net_margin:.1f}%)")
    pdf.drawRightString(width - 22 * mm, y + 2 * mm, f"INR {net_profit:,.2f}")
    y -= 14 * mm

    # Footnote
    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.4, 0.4, 0.4)
    pdf.drawString(20 * mm, y, "* Realized expenses only. Future recurring scheduled commitments are excluded per accounting standard.")
    y -= 4 * mm
    pdf.drawString(20 * mm, y, "Generated by BizAI Financial Intelligence Engine for REIHH Studio.")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
