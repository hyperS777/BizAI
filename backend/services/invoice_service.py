"""Invoice generation, payments, and AR ledger."""

from datetime import date, timedelta
from typing import List, Optional
import uuid
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from models.invoice import Invoice, InvoiceStatus, Payment
from models.order import Order, OrderItem, OrderStatus
from schemas.invoice import InvoiceUpdate
from services.integration_service import emit_event, setting_enabled


def get_invoice(db: Session, invoice_id: int) -> Optional[Invoice]:
    return (
        db.query(Invoice)
        .options(
            joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.variant),
            joinedload(Invoice.customer),
            joinedload(Invoice.payments),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )


def _normalize_channel(value: Optional[str]) -> str:
    return "demo" if str(value or "").strip().lower() == "demo" else "real"


def get_invoices(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[InvoiceStatus] = None,
    channel: Optional[str] = None,
) -> List[Invoice]:
    scan_overdue_invoices(db)
    query = db.query(Invoice).options(
        joinedload(Invoice.order).joinedload(Order.customer),
        joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Invoice.order).joinedload(Order.items).joinedload(OrderItem.variant),
        joinedload(Invoice.customer),
        joinedload(Invoice.payments),
    )
    if status:
        value = status.value if isinstance(status, InvoiceStatus) else status
        query = query.filter(Invoice.status == value)
    if channel in ("real", "demo"):
        query = query.filter(Invoice.channel == channel)
    return query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()


def _refresh_invoice_status(invoice: Invoice):
    if invoice.status == InvoiceStatus.CANCELLED.value:
        return
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID.value
    elif invoice.due_date and invoice.due_date < date.today():
        invoice.status = InvoiceStatus.OVERDUE.value
    elif (invoice.paid_amount or 0) > 0:
        invoice.status = InvoiceStatus.PARTIALLY_PAID.value
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
    if order.status == OrderStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="A draft order must be opened before an invoice can be created")

    existing_invoice = db.query(Invoice).filter(Invoice.order_id == order_id).first()
    if existing_invoice:
        updated = False
        if not existing_invoice.public_token:
            existing_invoice.public_token = secrets.token_urlsafe(36)
            updated = True
        if not existing_invoice.taxable_amount and (existing_invoice.total_amount or 0) > 0:
            taxable = round(existing_invoice.total_amount / 1.18, 2)
            tax_diff = round(existing_invoice.total_amount - taxable, 2)
            existing_invoice.taxable_amount = taxable
            existing_invoice.cgst = round(tax_diff / 2.0, 2)
            existing_invoice.sgst = round(tax_diff - existing_invoice.cgst, 2)
            existing_invoice.igst = 0.0
            updated = True
        if updated:
            db.flush()
        return get_invoice(db, existing_invoice.id)

    invoice_number = f"INV-{uuid.uuid4().hex[:8].upper()}"
    taxable = round(order.total_amount / 1.18, 2)
    tax_diff = round(order.total_amount - taxable, 2)
    c_tax = round(tax_diff / 2.0, 2)
    s_tax = round(tax_diff - c_tax, 2)

    inv_channel = _normalize_channel(getattr(order, "channel", "real"))
    db_invoice = Invoice(
        invoice_number=invoice_number,
        public_token=secrets.token_urlsafe(36),
        order_id=order_id,
        status=InvoiceStatus.SENT.value,
        total_amount=round(order.total_amount, 2),
        paid_amount=0.0,
        due_date=due_date or (date.today() + timedelta(days=15)),
        taxable_amount=taxable,
        cgst=c_tax,
        sgst=s_tax,
        igst=0.0,
        channel=inv_channel,
        notes=f"Order #{order.order_number} apparel dispatch",
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


def create_standalone_invoice(
    db: Session,
    customer_id: Optional[int],
    total_amount: float,
    due_date: Optional[date] = None,
    payment_method: Optional[str] = "bank_transfer",
    taxable_amount: Optional[float] = None,
    cgst: Optional[float] = None,
    sgst: Optional[float] = None,
    igst: Optional[float] = None,
    channel: str = "real",
    notes: Optional[str] = None,
    commit: bool = True,
) -> Invoice:
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice amount must be greater than zero")

    invoice_number = f"INV-{uuid.uuid4().hex[:8].upper()}"
    taxable = taxable_amount if taxable_amount is not None else round(total_amount / 1.18, 2)
    tax_diff = max(0.0, total_amount - taxable)
    if igst is not None and igst > 0:
        c_tax = 0.0
        s_tax = 0.0
        i_tax = round(igst, 2)
    elif cgst is not None and sgst is not None:
        c_tax = round(cgst, 2)
        s_tax = round(sgst, 2)
        i_tax = 0.0
    elif taxable >= total_amount:
        c_tax = 0.0
        s_tax = 0.0
        i_tax = 0.0
    else:
        c_tax = round(tax_diff / 2, 2)
        s_tax = round(tax_diff - c_tax, 2)
        i_tax = 0.0

    db_invoice = Invoice(
        invoice_number=invoice_number,
        public_token=secrets.token_urlsafe(36),
        order_id=None,
        customer_id=customer_id,
        status=InvoiceStatus.SENT.value,
        total_amount=round(total_amount, 2),
        paid_amount=0.0,
        due_date=due_date or (date.today() + timedelta(days=15)),
        payment_method=payment_method,
        taxable_amount=taxable,
        cgst=c_tax,
        sgst=s_tax,
        igst=i_tax,
        channel=_normalize_channel(channel),
        notes=notes,
    )
    db.add(db_invoice)
    db.flush()
    if customer_id:
        from models.customer import Customer
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if customer:
            customer.outstanding_balance = round((customer.outstanding_balance or 0) + total_amount, 2)

    emit_event(
        db,
        "invoice.created",
        "invoice",
        db_invoice.id,
        {"invoice_number": invoice_number, "total": total_amount},
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
    channel: Optional[str] = None,
):
    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Cannot take payment on a cancelled invoice")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    remaining = invoice.balance_due
    applied = min(amount, remaining)
    invoice.paid_amount = round((invoice.paid_amount or 0) + applied, 2)
    is_demo = (
        channel == "demo"
        or getattr(invoice, "channel", "real") == "demo"
        or (invoice.order is not None and getattr(invoice.order, "channel", "real") == "demo")
        or (method or "").lower().startswith("demo")
    )
    pay_channel = "demo" if is_demo else "real"
    db.add(Payment(invoice_id=invoice.id, amount=applied, method=method or "manual", channel=pay_channel, notes=notes))
    customer = (invoice.order.customer if invoice.order else None) or invoice.customer
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
    pay_channel = data.pop("channel", None)
    notes = data.pop("notes", None)
    absolute_paid = data.pop("paid_amount", None)
    data.pop("status", None)

    if payment_amount is not None:
        record_payment(db, db_invoice, float(payment_amount), method=method, notes=notes, channel=pay_channel)
    elif absolute_paid is not None:
        delta = round(float(absolute_paid) - (db_invoice.paid_amount or 0), 2)
        if delta > 0:
            record_payment(db, db_invoice, delta, method=method, notes=notes, channel=pay_channel)

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
        InvoiceStatus.DRAFT.value,
    }
    rows = (
        db.query(Invoice)
        .filter(Invoice.status.in_(open_statuses), Invoice.due_date < today)
        .all()
    )
    count = 0
    for invoice in rows:
        if invoice.balance_due > 0 and invoice.status != InvoiceStatus.OVERDUE.value:
            invoice.status = InvoiceStatus.OVERDUE.value
            count += 1
    if count:
        db.commit()
    return count


def get_payment_summary(db: Session) -> dict:
    """Return separated Actual (real) vs Demo invoice and payment totals."""
    invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.order))
        .filter(Invoice.status != InvoiceStatus.CANCELLED.value)
        .all()
    )
    actual = {"invoiced_total": 0.0, "paid_total": 0.0, "balance_due": 0.0, "invoice_count": 0, "payment_count": 0}
    demo = {"invoiced_total": 0.0, "paid_total": 0.0, "balance_due": 0.0, "invoice_count": 0, "payment_count": 0}
    for inv in invoices:
        ch = inv.channel or (inv.order.channel if inv.order else "real") or "real"
        bucket = demo if ch == "demo" else actual
        bucket["invoiced_total"] = round(bucket["invoiced_total"] + float(inv.total_amount or 0), 2)
        bucket["paid_total"] = round(bucket["paid_total"] + float(inv.paid_amount or 0), 2)
        bucket["balance_due"] = round(bucket["balance_due"] + max(0.0, float(inv.balance_due or 0)), 2)
        bucket["invoice_count"] += 1

    payments = db.query(Payment).all()
    for p in payments:
        ch = p.channel or "real"
        if ch == "demo":
            demo["payment_count"] += 1
        else:
            actual["payment_count"] += 1

    return {
        "actual": actual,
        "demo": demo,
        "combined": {
            "invoiced_total": round(actual["invoiced_total"] + demo["invoiced_total"], 2),
            "paid_total": round(actual["paid_total"] + demo["paid_total"], 2),
            "balance_due": round(actual["balance_due"] + demo["balance_due"], 2),
            "invoice_count": actual["invoice_count"] + demo["invoice_count"],
            "payment_count": actual["payment_count"] + demo["payment_count"],
        },
    }


def get_payments_ledger(db: Session, channel: Optional[str] = None, limit: int = 200) -> list[dict]:
    """Return itemized payment receipts tagged by real vs demo channel."""
    q = (
        db.query(Payment)
        .options(
            joinedload(Payment.invoice).joinedload(Invoice.order).joinedload(Order.customer),
            joinedload(Payment.invoice).joinedload(Invoice.customer),
        )
        .order_by(Payment.created_at.desc())
    )
    if channel in ("real", "demo"):
        q = q.filter(Payment.channel == channel)
    rows = q.limit(limit).all()
    out = []
    for p in rows:
        inv = p.invoice
        order = inv.order if inv else None
        cust = (order.customer if order else None) or (inv.customer if inv else None)
        out.append({
            "id": p.id,
            "invoice_id": p.invoice_id,
            "invoice_number": inv.invoice_number if inv else None,
            "order_number": order.order_number if order else None,
            "customer_name": cust.name if cust else "Counter Sale",
            "amount": float(p.amount or 0),
            "method": p.method or "manual",
            "channel": p.channel or (inv.channel if inv else "real") or "real",
            "notes": p.notes,
            "created_at": p.created_at,
        })
    return out
