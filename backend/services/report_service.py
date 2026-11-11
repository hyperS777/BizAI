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
    today = date.today()

    total_sales = float(
        db.query(func.coalesce(func.sum(Order.total_amount), 0))
        .filter(Order.status != OrderStatus.CANCELLED.value)
        .scalar()
        or 0
    )
    total_orders = int(db.query(func.count(Order.id)).scalar() or 0)
    total_customers = int(db.query(func.count(Customer.id)).scalar() or 0)

    # Incurred/realized expenses to date (future recurring commitments excluded from current profit)
    realized_expenses = float(
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.date <= today)
        .scalar()
        or 0
    )
    scheduled_expenses = float(
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.date > today)
        .scalar()
        or 0
    )

    cogs = float(
        db.query(func.coalesce(func.sum(OrderItem.quantity * Product.cost_price), 0))
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
        .scalar()
        or 0
    )

    # Net profit strictly deducts realized spend and manufacturing costs
    profit = total_sales - realized_expenses - cogs

    total_products = int(
        db.query(func.count(Product.id))
        .filter(Product.is_active == True)
        .scalar()
        or 0
    )
    low_stock_products = int(
        db.query(func.count(Product.id))
        .filter(Product.is_active == True, Product.stock_qty <= Product.min_stock_level)
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
        .filter(
            Order.status != OrderStatus.CANCELLED.value,
            Product.is_active == True,
            OrderItem.total_price > 0,
        )
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
            "qty": int(row.qty or 0),
            "total_revenue": float(row.revenue or 0),
            "revenue": float(row.revenue or 0),
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

    daily_sales, daily_orders = sales_between(db, today, today)

    bottom_rows = (
        db.query(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.total_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.status != OrderStatus.CANCELLED.value,
            Product.is_active == True,
            OrderItem.total_price > 0,
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.total_price).asc())
        .limit(5)
        .all()
    )
    bottom_products = [
        {
            "product_id": row.id,
            "name": row.name,
            "total_quantity": int(row.qty or 0),
            "qty": int(row.qty or 0),
            "total_revenue": float(row.revenue or 0),
            "revenue": float(row.revenue or 0),
        }
        for row in bottom_rows
    ]

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
            "expenses": realized_expenses,
            "scheduled_expenses": scheduled_expenses,
            "cogs": cogs,
            "profit": profit,
        },
        "inventory_summary": {
            "total_products": total_products,
            "low_stock_products": low_stock_products,
        },
        "top_products": top_products,
        "bottom_products": bottom_products,
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


def get_top_products(db: Session, limit: int = 10):
    rows = (
        db.query(
            Product.id,
            Product.name,
            Product.sku,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.total_price).label("total_revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.status != OrderStatus.CANCELLED.value,
            Product.is_active == True,
            OrderItem.total_price > 0,
        )
        .group_by(Product.id, Product.name, Product.sku)
        .order_by(func.sum(OrderItem.total_price).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "product_id": r.id,
            "name": r.name,
            "sku": r.sku,
            "total_quantity": int(r.total_quantity or 0),
            "qty": int(r.total_quantity or 0),
            "total_revenue": float(r.total_revenue or 0),
            "revenue": float(r.total_revenue or 0),
        }
        for r in rows
    ]


def get_customer_activity(db: Session, limit: int = 10):
    rows = (
        db.query(
            Customer.id,
            Customer.name,
            Customer.email,
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
        )
        .outerjoin(Order, (Order.customer_id == Customer.id) & (Order.status != OrderStatus.CANCELLED.value))
        .group_by(Customer.id, Customer.name, Customer.email)
        .order_by(func.coalesce(func.sum(Order.total_amount), 0).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "customer_id": r.id,
            "name": r.name,
            "email": r.email,
            "order_count": int(r.order_count or 0),
            "total_spent": float(r.total_spent or 0),
        }
        for r in rows
    ]


def get_expense_summary(db: Session, start_date=None, end_date=None):
    today = date.today()
    q = db.query(
        Expense.category,
        func.coalesce(func.sum(Expense.amount), 0).label("total"),
        func.count(Expense.id).label("count"),
    )
    if start_date:
        q = q.filter(Expense.date >= start_date)
    if end_date:
        q = q.filter(Expense.date <= end_date)
    else:
        # Default to realized expenses up to today so upcoming recurring schedules do not inflate spend
        q = q.filter(Expense.date <= today)

    rows = q.group_by(Expense.category).order_by(func.sum(Expense.amount).desc()).all()
    realized_total = float(
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.date <= today)
        .scalar()
        or 0
    )
    scheduled_total = float(
        db.query(func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.date > today)
        .scalar()
        or 0
    )
    return {
        "total": realized_total,
        "realized_total": realized_total,
        "scheduled_total": scheduled_total,
        "by_category": [
            {"category": r.category or "Uncategorized", "total": float(r.total or 0), "count": int(r.count or 0)}
            for r in rows
        ],
    }


def build_business_snapshot(db: Session) -> dict:
    metrics = get_dashboard_metrics(db)
    low_items = (
        db.query(Product)
        .filter(Product.is_active == True, Product.stock_qty <= Product.min_stock_level)
        .order_by(Product.stock_qty.asc())
        .limit(8)
        .all()
    )
    outstanding = float(
        db.query(func.coalesce(func.sum(Customer.outstanding_balance), 0)).scalar() or 0
    )

    # Enrich: recent orders with customer names and item summaries
    recent_orders_q = (
        db.query(Order, Customer.name.label("customer_name"))
        .join(Customer, Customer.id == Order.customer_id)
        .order_by(Order.created_at.desc())
        .limit(10)
        .all()
    )
    recent_orders_detail = []
    for o, cust_name in recent_orders_q:
        items_q = (
            db.query(OrderItem.quantity, Product.name.label("product_name"))
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == o.id)
            .all()
        )
        items_summary = ", ".join(
            f"{item.quantity}x {item.product_name}" for item in items_q[:3]
        )
        recent_orders_detail.append({
            "order_number": o.order_number,
            "customer": cust_name,
            "status": o.status,
            "total": float(o.total_amount or 0),
            "date": o.created_at.strftime("%d %b %Y") if o.created_at else "N/A",
            "items_summary": items_summary or "No items",
        })

    # Enrich: top customers by lifetime spend
    top_customers = get_customer_activity(db, limit=5)

    # Enrich: expense breakdown by category (realized only)
    expense_summary = get_expense_summary(db)

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
        "recent_orders_detail": recent_orders_detail,
        "top_customers": top_customers,
        "expense_breakdown": expense_summary.get("by_category", []),
    }
