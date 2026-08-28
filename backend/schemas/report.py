"""Report schemas."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SalesSummary(BaseModel):
    total_sales: float
    total_orders: int
    total_customers: int = 0
    daily_sales: float = 0
    daily_orders: int = 0
    monthly_sales: float = 0
    monthly_orders: int = 0
    previous_month_sales: float = 0
    previous_month_orders: int = 0


class RevenueProfitSummary(BaseModel):
    revenue: float
    expenses: float
    profit: float


class TopProduct(BaseModel):
    product_id: int
    name: str
    total_quantity: int
    total_revenue: float


class InventorySummary(BaseModel):
    total_products: int
    low_stock_products: int


class DashboardMetrics(BaseModel):
    sales_summary: SalesSummary
    revenue_profit: RevenueProfitSummary
    inventory_summary: InventorySummary
    top_products: List[TopProduct]
    recent_orders: List[Dict[str, Any]]


class SalesPoint(BaseModel):
    date: str
    total: float


class SalesSeries(BaseModel):
    points: List[SalesPoint]
