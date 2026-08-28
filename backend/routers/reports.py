"""Reports API."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.report import DashboardMetrics, SalesSeries
from services.report_service import get_dashboard_metrics, get_sales_series
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
