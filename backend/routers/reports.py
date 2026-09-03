"""Reports API."""

from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.report import DashboardMetrics, SalesSeries
from services.report_service import (
    get_dashboard_metrics,
    get_sales_series,
    get_top_products,
    get_customer_activity,
    get_expense_summary,
)
from utils.permissions import require_staff

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardMetrics)
def dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_dashboard_metrics(db)


@router.get("/sales", response_model=SalesSeries)
def sales_report(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return {"points": get_sales_series(db, days=days)}


@router.get("/top-products")
def top_products_report(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_top_products(db, limit=limit)


@router.get("/customer-activity")
def customer_activity_report(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_customer_activity(db, limit=limit)


@router.get("/expenses-summary")
def expenses_summary_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_expense_summary(db, start_date=start_date, end_date=end_date)
