"""Invoices API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.invoice import Invoice, InvoiceStatus
from models.user import User
from schemas.invoice import InvoiceUpdate, InvoiceResponse, InvoiceCreate
from services.invoice_service import (
    get_invoices, get_invoice, generate_invoice_from_order, update_invoice,
    create_standalone_invoice, record_payment
)
from utils.pdf import build_invoice_pdf
from utils.permissions import require_accountant, require_staff

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=List[InvoiceResponse])
def read_invoices(
    skip: int = 0,
    limit: int = 100,
    status: Optional[InvoiceStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    return get_invoices(db, skip=skip, limit=limit, status=status)


@router.get("/public/{token}/pdf")
def download_customer_invoice(token: str, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter_by(public_token=token).first()
    if invoice is None or invoice.status == InvoiceStatus.CANCELLED.value:
        raise HTTPException(status_code=404, detail="Invoice link is invalid or unavailable")
    db_invoice = get_invoice(db, invoice.id)
    data = build_invoice_pdf(db_invoice)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{db_invoice.invoice_number}.pdf"',
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )


@router.post("", response_model=InvoiceResponse)
def create_standalone_invoice_endpoint(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    if payload.order_id:
        inv = generate_invoice_from_order(db, payload.order_id, due_date=payload.due_date)
        if not inv:
            raise HTTPException(status_code=404, detail="Order not found")
        return inv
    return create_standalone_invoice(
        db,
        customer_id=payload.customer_id,
        total_amount=payload.total_amount,
        due_date=payload.due_date,
        payment_method=payload.payment_method,
        taxable_amount=payload.taxable_amount,
        cgst=payload.cgst,
        sgst=payload.sgst,
        igst=payload.igst,
        notes=payload.notes,
    )


@router.post("/{invoice_id}/payments", response_model=InvoiceResponse)
def record_invoice_payment_endpoint(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    db_invoice = get_invoice(db, invoice_id)
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    amount = payload.payment_amount or payload.paid_amount or 0.0
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    record_payment(db, db_invoice, amount, method=payload.method or "manual", notes=payload.notes)
    db.commit()
    return get_invoice(db, invoice_id)


@router.post("/from-order/{order_id}", response_model=InvoiceResponse)
def create_invoice(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    db_invoice = generate_invoice_from_order(db, order_id)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return db_invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def read_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    db_invoice = get_invoice(db, invoice_id)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    db_invoice = get_invoice(db, invoice_id)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    data = build_invoice_pdf(db_invoice)
    filename = f"{db_invoice.invoice_number}.pdf"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
def update_invoice_status(
    invoice_id: int,
    invoice_update: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    db_invoice = update_invoice(db, invoice_id, invoice_update)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice
