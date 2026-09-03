"""Notifications API — real alerts from business data."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.invoice import Invoice, InvoiceStatus
from models.product import Product
from models.user import User
from utils.permissions import require_staff
from datetime import date

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    notifications = []

    # Low-stock alerts
    low_stock = (
        db.query(Product)
        .filter(Product.stock_qty <= Product.min_stock_level, Product.is_active == True)  # noqa: E712
        .order_by(Product.stock_qty.asc())
        .limit(10)
        .all()
    )
    for p in low_stock:
        notifications.append({
            "id": f"stock-{p.id}",
            "type": "low_stock",
            "title": f"Low stock: {p.name}",
            "message": f"Only {p.stock_qty} units left (minimum: {p.min_stock_level}).",
            "link": "/inventory",
            "severity": "warning",
        })

    # Overdue invoices
    today = date.today()
    overdue = (
        db.query(Invoice)
        .filter(
            Invoice.status == InvoiceStatus.SENT.value,
            Invoice.due_date < today,
        )
        .limit(10)
        .all()
    )
    for inv in overdue:
        notifications.append({
            "id": f"invoice-{inv.id}",
            "type": "overdue_invoice",
            "title": f"Overdue invoice #{inv.invoice_number}",
            "message": f"Due on {inv.due_date}. Amount: ₹{inv.total_amount:.0f}.",
            "link": "/invoices",
            "severity": "error",
        })

    return {"count": len(notifications), "items": notifications}
