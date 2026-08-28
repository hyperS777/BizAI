"""Invoices API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.invoice import InvoiceStatus
from models.user import User
from schemas.invoice import InvoiceUpdate, InvoiceResponse
from services.invoice_service import get_invoices, get_invoice, generate_invoice_from_order, update_invoice
from utils.pdf import build_invoice_pdf
from utils.permissions import require_accountant, require_staff

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=List[InvoiceResponse])
def read_invoices(
    skip: int = 0,
    limit: int = 100,
    status: Optional[InvoiceStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_invoices(db, skip=skip, limit=limit, status=status)


@router.post("/from-order/{order_id}", response_model=InvoiceResponse)
def create_invoice(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    db_invoice = generate_invoice_from_order(db, order_id)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return db_invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def read_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    db_invoice = get_invoice(db, invoice_id)
    if db_invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
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
