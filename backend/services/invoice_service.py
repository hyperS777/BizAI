"""Invoice generation, payments, and AR ledger."""

from datetime import date, timedelta
from typing import List, Optional
import uuid
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from models.invoice import Invoice, InvoiceStatus, Payment
from models.order import Order, OrderItem
from schemas.invoice import InvoiceUpdate
from services.integration_service import emit_event, setting_enabled


def get_invoice(db: Session, invoice_id: int) -> Optional[Invoice]:
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.variant),
            joinedload(Invoice.payments),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )


def get_invoices(
    db: Session, skip: int = 0, limit: int = 100, status: Optional[InvoiceStatus] = None
) -> List[Invoice]:
    query = db.query(Invoice).options(
        joinedload(Invoice.order).joinedload(Order.customer),
        joinedload(Invoice.payments),
    )
    if status:
        value = status.value if isinstance(status, InvoiceStatus) else status
        query = query.filter(Invoice.status == value)
    return query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()


def _refresh_invoice_status(invoice: Invoice):
    if invoice.status == InvoiceStatus.CANCELLED.value:
        return
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID.value
    elif (invoice.paid_amount or 0) > 0:
        invoice.status = InvoiceStatus.PARTIALLY_PAID.value
    elif invoice.due_date and invoice.due_date < date.today():
        invoice.status = InvoiceStatus.OVERDUE.value
    else:
        invoice.status = InvoiceStatus.SENT.value


def generate_invoice_from_order(
    db: Session,
    order_id: int,
    due_date: Optional[date] = None,
    commit: bool = True,
) -> Optional[Invoice]:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        return None

    existing_invoice = db.query(Invoice).filter(Invoice.order_id == order_id).first()
    if existing_invoice:
        if not existing_invoice.public_token:
            existing_invoice.public_token = secrets.token_urlsafe(36)
            db.flush()
        return get_invoice(db, existing_invoice.id)

    invoice_number = f"INV-{uuid.uuid4().hex[:8].upper()}"
    db_invoice = Invoice(
        invoice_number=invoice_number,
        public_token=secrets.token_urlsafe(36),
        order_id=order_id,
        status=InvoiceStatus.SENT.value,
        total_amount=order.total_amount,
        paid_amount=0.0,
        due_date=due_date or (date.today() + timedelta(days=15)),
    )
    db.add(db_invoice)
    db.flush()
    if order.customer:
        order.customer.outstanding_balance = round(
            (order.customer.outstanding_balance or 0) + (order.total_amount or 0), 2
        )
    emit_event(
        db,
        "invoice.created",
        "invoice",
        db_invoice.id,
        {"invoice_number": invoice_number, "order_number": order.order_number, "total": order.total_amount},
    )
    if commit:
        db.commit()
        return get_invoice(db, db_invoice.id)
    return db_invoice


def void_invoice(db: Session, order_id: int, commit: bool = False) -> Optional[Invoice]:
    invoice = db.query(Invoice).options(joinedload(Invoice.order).joinedload(Order.customer)).filter(
        Invoice.order_id == order_id
    ).first()
    if not invoice or invoice.status == InvoiceStatus.CANCELLED.value:
        return invoice
    remaining = invoice.balance_due
    invoice.status = InvoiceStatus.CANCELLED.value
    customer = invoice.order.customer if invoice.order else None
    if customer and remaining > 0:
        customer.outstanding_balance = max(0.0, round((customer.outstanding_balance or 0) - remaining, 2))
    emit_event(
        db,
        "invoice.cancelled",
        "invoice",
        invoice.id,
        {"invoice_number": invoice.invoice_number, "reversed": remaining},
    )
    if commit:
        db.commit()
    return invoice


def record_payment(
    db: Session,
    invoice: Invoice,
    amount: float,
    method: str = "manual",
    notes: Optional[str] = None,
):
    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Cannot take payment on a cancelled invoice")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    remaining = invoice.balance_due
    applied = min(amount, remaining)
    invoice.paid_amount = round((invoice.paid_amount or 0) + applied, 2)
    db.add(Payment(invoice_id=invoice.id, amount=applied, method=method or "manual", notes=notes))
    customer = invoice.order.customer if invoice.order else None
    if customer:
        customer.outstanding_balance = max(0.0, round((customer.outstanding_balance or 0) - applied, 2))
    _refresh_invoice_status(invoice)
    event = "invoice.paid" if invoice.status == InvoiceStatus.PAID.value else "invoice.partially_paid"
    emit_event(
        db,
        event,
        "invoice",
        invoice.id,
        {"invoice_number": invoice.invoice_number, "amount": applied, "balance_due": invoice.balance_due},
    )


def update_invoice(db: Session, invoice_id: int, invoice_update: InvoiceUpdate) -> Optional[Invoice]:
    db_invoice = get_invoice(db, invoice_id)
    if not db_invoice:
        return None

    data = invoice_update.model_dump(exclude_unset=True)
    if data.get("status") == InvoiceStatus.CANCELLED.value or data.get("status") == "cancelled":
        void_invoice(db, db_invoice.order_id)
        db.commit()
        return get_invoice(db, invoice_id)

    payment_amount = data.pop("payment_amount", None)
    method = data.pop("method", "manual")
    notes = data.pop("notes", None)
    absolute_paid = data.pop("paid_amount", None)
    data.pop("status", None)

    if payment_amount is not None:
        record_payment(db, db_invoice, float(payment_amount), method=method, notes=notes)
    elif absolute_paid is not None:
        delta = round(float(absolute_paid) - (db_invoice.paid_amount or 0), 2)
        if delta > 0:
            record_payment(db, db_invoice, delta, method=method, notes=notes)

    _refresh_invoice_status(db_invoice)
    db.commit()
    return get_invoice(db, invoice_id)


def scan_overdue_invoices(db: Session) -> int:
    if not setting_enabled(db, "auto_mark_overdue"):
        return 0
    today = date.today()
    open_statuses = {
        InvoiceStatus.SENT.value,
        InvoiceStatus.PARTIALLY_PAID.value,
        InvoiceStatus.OVERDUE.value,
    }
    rows = (
        db.query(Invoice)
        .filter(Invoice.status.in_(open_statuses), Invoice.due_date < today)
        .all()
    )
    count = 0
    for invoice in rows:
        if invoice.status != InvoiceStatus.OVERDUE.value:
            invoice.status = InvoiceStatus.OVERDUE.value
            count += 1
    if count:
        db.commit()
    return count
