"""Invoice generation and updates."""

from datetime import date, timedelta
from typing import List, Optional
import uuid

from sqlalchemy.orm import Session, joinedload

from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem
from schemas.invoice import InvoiceUpdate


def get_invoice(db: Session, invoice_id: int) -> Optional[Invoice]:
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )


def get_invoices(
    db: Session, skip: int = 0, limit: int = 100, status: Optional[InvoiceStatus] = None
) -> List[Invoice]:
    query = db.query(Invoice).options(
        joinedload(Invoice.order).joinedload(Order.customer)
    )
    if status:
        value = status.value if isinstance(status, InvoiceStatus) else status
        query = query.filter(Invoice.status == value)
    return query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()


def generate_invoice_from_order(
    db: Session, order_id: int, due_date: Optional[date] = None
) -> Optional[Invoice]:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return None

    existing_invoice = db.query(Invoice).filter(Invoice.order_id == order_id).first()
    if existing_invoice:
        return get_invoice(db, existing_invoice.id)

    invoice_number = f"INV-{uuid.uuid4().hex[:8].upper()}"
    db_invoice = Invoice(
        invoice_number=invoice_number,
        order_id=order_id,
        status=InvoiceStatus.SENT.value,
        total_amount=order.total_amount,
        due_date=due_date or (date.today() + timedelta(days=15)),
    )
    db.add(db_invoice)
    db.commit()
    return get_invoice(db, db_invoice.id)


def update_invoice(db: Session, invoice_id: int, invoice_update: InvoiceUpdate) -> Optional[Invoice]:
    db_invoice = get_invoice(db, invoice_id)
    if not db_invoice:
        return None

    update_data = invoice_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(db_invoice, key, value)

    if "paid_amount" in update_data:
        if db_invoice.balance_due <= 0:
            db_invoice.status = InvoiceStatus.PAID.value
            customer = db_invoice.order.customer if db_invoice.order else None
            if customer:
                customer.outstanding_balance = max(
                    0.0, (customer.outstanding_balance or 0) - db_invoice.total_amount
                )
        elif db_invoice.paid_amount > 0 and db_invoice.status == InvoiceStatus.DRAFT.value:
            db_invoice.status = InvoiceStatus.SENT.value

    db.commit()
    return get_invoice(db, invoice_id)
