"""Invoice PDF generation."""

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from models.invoice import Invoice


def build_invoice_pdf(invoice: Invoice) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    order = invoice.order
    customer = order.customer if order else None

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, height - 25 * mm, "BizAI / Reihh")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(20 * mm, height - 32 * mm, "Invoice")
    pdf.drawRightString(width - 20 * mm, height - 25 * mm, invoice.invoice_number)
    pdf.drawRightString(width - 20 * mm, height - 32 * mm, f"Status: {invoice.status}")

    y = height - 50 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Bill to")
    pdf.setFont("Helvetica", 10)
    y -= 6 * mm
    if customer:
        pdf.drawString(20 * mm, y, customer.name)
        y -= 5 * mm
        if customer.company:
            pdf.drawString(20 * mm, y, customer.company)
            y -= 5 * mm
        if customer.address:
            pdf.drawString(20 * mm, y, customer.address[:90])
            y -= 5 * mm
        if customer.email:
            pdf.drawString(20 * mm, y, customer.email)
            y -= 5 * mm

    y -= 8 * mm
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(20 * mm, y, "Item")
    pdf.drawString(110 * mm, y, "Qty")
    pdf.drawString(130 * mm, y, "Price")
    pdf.drawString(160 * mm, y, "Total")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    if order:
        for item in order.items:
            name = item.product.name if item.product else f"Product #{item.product_id}"
            pdf.drawString(20 * mm, y, name[:40])
            pdf.drawString(110 * mm, y, str(item.quantity))
            pdf.drawString(130 * mm, y, f"Rs {item.unit_price:.2f}")
            pdf.drawString(160 * mm, y, f"Rs {item.total_price:.2f}")
            y -= 6 * mm

    y -= 8 * mm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawRightString(width - 20 * mm, y, f"Total: Rs {invoice.total_amount:.2f}")
    y -= 6 * mm
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(width - 20 * mm, y, f"Paid: Rs {invoice.paid_amount:.2f}")
    y -= 5 * mm
    pdf.drawRightString(width - 20 * mm, y, f"Balance: Rs {invoice.balance_due:.2f}")
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
