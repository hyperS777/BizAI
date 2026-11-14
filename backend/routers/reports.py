"""Reports API."""

import csv
import io
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.order import Order
from schemas.report import DashboardMetrics, SalesSeries
from services.report_service import (
    get_dashboard_metrics,
    get_sales_series,
    get_top_products,
    get_customer_activity,
    get_expense_summary,
    get_pnl_data,
)
from utils.pdf import build_pnl_pdf
from utils.permissions import require_finance

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardMetrics)
def dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return get_dashboard_metrics(db)


@router.get("/sales", response_model=SalesSeries)
def sales_report(
    days: int = Query(30, ge=7, le=90),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return {"points": get_sales_series(db, days=days, start_date=start_date, end_date=end_date)}


@router.get("/pnl")
def pnl_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return get_pnl_data(db, start_date=start_date, end_date=end_date)


@router.get("/pnl/pdf")
def pnl_pdf_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    data = get_pnl_data(db, start_date=start_date, end_date=end_date)
    pdf_bytes = build_pnl_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="profit-and-loss-statement.pdf"'},
    )


@router.get("/gstr1-export")
def gstr1_export(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    from models.invoice import Invoice
    q = db.query(Invoice).join(Order, Order.id == Invoice.order_id, isouter=True)
    if start_date:
        q = q.filter(Invoice.created_at >= start_date)
    if end_date:
        q = q.filter(Invoice.created_at <= end_date)
    invoices = q.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "InvoiceNumber", "InvoiceDate", "CustomerName", "CustomerGSTIN", "PlaceOfSupply",
        "InvoiceType", "TotalInvoiceValue", "TaxableValue", "Rate", "CGST", "SGST", "IGST", "Status"
    ])
    for inv in invoices:
        cust = (inv.order.customer if inv.order else None) or inv.customer
        cust_name = cust.name if cust else "B2C Consumer"
        cust_gstin = cust.gstin if cust and cust.gstin else "URP" # Unregistered person
        inv_type = "B2B" if cust and cust.gstin else "B2C Large/Small"
        taxable = inv.taxable_amount or round(inv.total_amount / 1.18, 2)
        cgst = inv.cgst or round((inv.total_amount - taxable) / 2, 2)
        sgst = inv.sgst or cgst
        igst = inv.igst or 0.0
        pos = "07-Delhi"

        writer.writerow([
            inv.invoice_number,
            inv.created_at.strftime("%Y-%m-%d") if inv.created_at else str(date.today()),
            cust_name,
            cust_gstin,
            pos,
            inv_type,
            inv.total_amount,
            taxable,
            "18%",
            cgst,
            sgst,
            igst,
            inv.status.upper()
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="GSTR1-Tax-Report.csv"'},
    )



@router.get("/top-products")
def top_products_report(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return get_top_products(db, limit=limit)


@router.get("/customer-activity")
def customer_activity_report(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return get_customer_activity(db, limit=limit)


@router.get("/expenses-summary")
def expenses_summary_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    return get_expense_summary(db, start_date=start_date, end_date=end_date)
