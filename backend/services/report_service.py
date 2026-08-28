"""Dashboard and analytics aggregations grounded in live records."""

from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.customer import Customer
from models.expense import Expense
from models.order import Order, OrderItem, OrderStatus
from models.product import Product


def _month_bounds(ref: Optional[date] = None):
    ref = ref or date.today()
    start = date(ref.year, ref.month, 1)
    end = date(ref.year, ref.month, monthrange(ref.year, ref.month)[1])
    return start, end


def _previous_month_bounds(ref: Optional[date] = None):
    ref = ref or date.today()
    if ref.month == 1:
        prev = date(ref.year - 1, 12, 1)
    else:
        prev = date(ref.year, ref.month - 1, 1)
    return _month_bounds(prev)


def sales_between(db: Session, start: date, end: date):
    q = db.query(func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id)).filter(
        Order.created_at >= datetime.combine(start, datetime.min.time()),
        Order.created_at <= datetime.combine(end, datetime.max.time()),
        Order.status != OrderStatus.CANCELLED.value,
    )
    total, count = q.one()
    return float(total or 0), int(count or 0)


def get_dashboard_metrics(db: Session):
    total_sales = float(db.query(func.coalesce(func.sum(Order.total_amount), 0)).filter(
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0)
    total_orders = int(db.query(func.count(Order.id)).scalar() or 0)
    total_customers = int(db.query(func.count(Customer.id)).scalar() or 0)
    total_expenses = float(db.query(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0)
    cogs = float(
        db.query(func.coalesce(func.sum(OrderItem.quantity * Product.cost_price), 0))
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
        .scalar()
        or 0
    )
    profit = total_sales - total_expenses - cogs
    total_products = int(db.query(func.count(Product.id)).scalar() or 0)
    low_stock_products = int(
        db.query(func.count(Product.id))
        .filter(Product.stock_qty <= Product.min_stock_level)
        .scalar()
        or 0
    )

    top_rows = (
        db.query(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.total_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.total_price).desc())
        .limit(5)
        .all()
    )
    top_products = [
        {
            "product_id": row.id,
            "name": row.name,
            "total_quantity": int(row.qty or 0),
            "total_revenue": float(row.revenue or 0),
        }
        for row in top_rows
    ]

    recent_orders = (
        db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    )
    recent_orders_list = [
        {
            "id": o.id,
            "order_number": o.order_number,
            "status": o.status,
            "total_amount": o.total_amount,
            "created_at": o.created_at,
            "customer_id": o.customer_id,
        }
        for o in recent_orders
    ]

    start, end = _month_bounds()
    prev_start, prev_end = _previous_month_bounds()
    month_sales, month_orders = sales_between(db, start, end)
    prev_sales, prev_orders = sales_between(db, prev_start, prev_end)

    today = date.today()
    daily_sales, daily_orders = sales_between(db, today, today)

    return {
        "sales_summary": {
            "total_sales": total_sales,
            "total_orders": total_orders,
            "total_customers": total_customers,
            "daily_sales": daily_sales,
            "daily_orders": daily_orders,
            "monthly_sales": month_sales,
            "monthly_orders": month_orders,
            "previous_month_sales": prev_sales,
            "previous_month_orders": prev_orders,
        },
        "revenue_profit": {
            "revenue": total_sales,
            "expenses": total_expenses,
            "profit": profit,
        },
        "inventory_summary": {
            "total_products": total_products,
            "low_stock_products": low_stock_products,
        },
        "top_products": top_products,
        "recent_orders": recent_orders_list,
    }


def get_sales_series(db: Session, days: int = 30):
    start = date.today() - timedelta(days=days - 1)
    rows = (
        db.query(func.date(Order.created_at), func.coalesce(func.sum(Order.total_amount), 0))
        .filter(
            Order.created_at >= datetime.combine(start, datetime.min.time()),
            Order.status != OrderStatus.CANCELLED.value,
        )
        .group_by(func.date(Order.created_at))
        .all()
    )
    by_day = {str(r[0]): float(r[1] or 0) for r in rows}
    series = []
    for i in range(days):
        day = start + timedelta(days=i)
        key = day.isoformat()
        series.append({"date": key, "total": by_day.get(key, 0.0)})
    return series


def build_business_snapshot(db: Session) -> dict:
    metrics = get_dashboard_metrics(db)
    low_items = (
        db.query(Product)
        .filter(Product.stock_qty <= Product.min_stock_level)
        .order_by(Product.stock_qty.asc())
        .limit(8)
        .all()
    )
    outstanding = float(
        db.query(func.coalesce(func.sum(Customer.outstanding_balance), 0)).scalar() or 0
    )
    return {
        "metrics": metrics,
        "low_stock": [
            {
                "name": p.name,
                "sku": p.sku,
                "stock_qty": p.stock_qty,
                "min_stock_level": p.min_stock_level,
            }
            for p in low_items
        ],
        "outstanding_payments": outstanding,
    }
