from __future__ import annotations

"""Dashboard and analytics aggregations grounded in live records."""

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from models.customer import Customer
from models.expense import Expense
from models.integration import AbandonedCheckout
from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem, OrderStatus
from models.product import Product


def _order_channel_cond(channel: Optional[str]):
    if channel == "demo":
        return Order.channel == "demo"
    if channel == "real":
        return or_(Order.channel == "real", Order.channel.is_(None))
    return None

IST_OFFSET = timedelta(hours=5, minutes=30)


def _ist_today() -> date:
    return (datetime.now(timezone.utc) + IST_OFFSET).date()


def _utc_bounds_for_ist_dates(start: date, end: date):
    start_utc = datetime.combine(start, datetime.min.time()) - IST_OFFSET
    end_utc = datetime.combine(end, datetime.max.time()) - IST_OFFSET
    return start_utc, end_utc


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
    start_utc, end_utc = _utc_bounds_for_ist_dates(start, end)
    q = db.query(func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id)).filter(
        Order.created_at >= start_utc,
        Order.created_at <= end_utc,
        Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]),
    )
    total, count = q.one()
    return float(total or 0), int(count or 0)


def get_dashboard_metrics(db: Session, channel: Optional[str] = None):
    today = _ist_today()
    start, end = _month_bounds()
    prev_start, prev_end = _previous_month_bounds()

    month_start_utc, month_end_utc = _utc_bounds_for_ist_dates(start, end)
    prev_start_utc, prev_end_utc = _utc_bounds_for_ist_dates(prev_start, prev_end)
    today_start_utc, today_end_utc = _utc_bounds_for_ist_dates(today, today)

    excluded_statuses = [OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]
    is_valid_order = Order.status.notin_(excluded_statuses)
    ch_cond = _order_channel_cond(channel)
    active_filter = (is_valid_order & ch_cond) if ch_cond is not None else is_valid_order

    order_q = db.query(
        func.coalesce(func.sum(case((active_filter, Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((ch_cond, 1), else_=0)), 0) if ch_cond is not None else func.count(Order.id),
        func.coalesce(func.sum(case(((Order.status == OrderStatus.DRAFT.value) & ch_cond if ch_cond is not None else Order.status == OrderStatus.DRAFT.value, 1), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= month_start_utc) & (Order.created_at <= month_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= month_start_utc) & (Order.created_at <= month_end_utc), 1), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= prev_start_utc) & (Order.created_at <= prev_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= prev_start_utc) & (Order.created_at <= prev_end_utc), 1), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= today_start_utc) & (Order.created_at <= today_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((active_filter & (Order.created_at >= today_start_utc) & (Order.created_at <= today_end_utc), 1), else_=0)), 0),
    )
    order_stats = order_q.one()

    total_sales = float(order_stats[0] or 0)
    total_orders = int(order_stats[1] or 0)
    draft_orders = int(order_stats[2] or 0)
    month_sales = float(order_stats[3] or 0)
    month_orders = int(order_stats[4] or 0)
    prev_sales = float(order_stats[5] or 0)
    prev_orders = int(order_stats[6] or 0)
    daily_sales = float(order_stats[7] or 0)
    daily_orders = int(order_stats[8] or 0)

    total_customers = int(db.query(func.count(Customer.id)).scalar() or 0)

    # Incurred/realized expenses to date (future recurring commitments excluded from current profit)
    expense_stats = db.query(
        func.coalesce(func.sum(case((Expense.date <= today, Expense.amount), else_=0)), 0),
        func.coalesce(func.sum(case((Expense.date > today, Expense.amount), else_=0)), 0),
    ).one()
    realized_expenses = float(expense_stats[0] or 0)
    scheduled_expenses = float(expense_stats[1] or 0)

    cogs = float(
        db.query(func.coalesce(func.sum(OrderItem.quantity * Product.cost_price), 0))
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(active_filter)
        .scalar()
        or 0
    )

    # Net profit strictly deducts realized spend and manufacturing costs (expenses apply to actual operations; skip deducting full rent from demo-only slice)
    profit = (total_sales - realized_expenses - cogs) if channel != "demo" else (total_sales - cogs)

    # Separated Actual vs Demo payment & sales breakdown
    is_real_ch = or_(Order.channel == "real", Order.channel.is_(None))
    is_demo_ch = Order.channel == "demo"
    split_stats = db.query(
        func.coalesce(func.sum(case((is_valid_order & is_real_ch, Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_real_ch, 1), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_real_ch & (Order.created_at >= today_start_utc) & (Order.created_at <= today_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_real_ch & (Order.created_at >= month_start_utc) & (Order.created_at <= month_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_demo_ch, Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_demo_ch, 1), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_demo_ch & (Order.created_at >= today_start_utc) & (Order.created_at <= today_end_utc), Order.total_amount), else_=0)), 0),
        func.coalesce(func.sum(case((is_valid_order & is_demo_ch & (Order.created_at >= month_start_utc) & (Order.created_at <= month_end_utc), Order.total_amount), else_=0)), 0),
    ).one()

    real_cogs = float(
        db.query(func.coalesce(func.sum(OrderItem.quantity * Product.cost_price), 0))
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(is_valid_order, is_real_ch)
        .scalar()
        or 0
    )
    demo_cogs = float(
        db.query(func.coalesce(func.sum(OrderItem.quantity * Product.cost_price), 0))
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(is_valid_order, is_demo_ch)
        .scalar()
        or 0
    )

    inv_real_ch = or_(Invoice.channel == "real", Invoice.channel.is_(None))
    inv_demo_ch = Invoice.channel == "demo"
    inv_valid = Invoice.status != InvoiceStatus.CANCELLED.value
    inv_split = db.query(
        func.coalesce(func.sum(case((inv_valid & inv_real_ch, Invoice.paid_amount), else_=0)), 0),
        func.coalesce(func.sum(case((inv_valid & inv_real_ch, Invoice.total_amount - Invoice.paid_amount), else_=0)), 0),
        func.coalesce(func.sum(case((inv_valid & inv_demo_ch, Invoice.paid_amount), else_=0)), 0),
        func.coalesce(func.sum(case((inv_valid & inv_demo_ch, Invoice.total_amount - Invoice.paid_amount), else_=0)), 0),
    ).one()

    payment_breakdown = {
        "actual": {
            "sales": float(split_stats[0] or 0),
            "orders": int(split_stats[1] or 0),
            "daily_sales": float(split_stats[2] or 0),
            "monthly_sales": float(split_stats[3] or 0),
            "paid_payments": round(float(inv_split[0] or 0), 2),
            "pending_payments": round(max(0.0, float(inv_split[1] or 0)), 2),
            "profit": round(float(split_stats[0] or 0) - realized_expenses - real_cogs, 2),
        },
        "demo": {
            "sales": float(split_stats[4] or 0),
            "orders": int(split_stats[5] or 0),
            "daily_sales": float(split_stats[6] or 0),
            "monthly_sales": float(split_stats[7] or 0),
            "paid_payments": round(float(inv_split[2] or 0), 2),
            "pending_payments": round(max(0.0, float(inv_split[3] or 0)), 2),
            "profit": round(float(split_stats[4] or 0) - demo_cogs, 2),
        },
    }

    product_stats = db.query(
        func.coalesce(func.sum(case((Product.is_active == True, 1), else_=0)), 0),
        func.coalesce(func.sum(case(((Product.is_active == True) & (Product.stock_qty <= Product.min_stock_level), 1), else_=0)), 0),
    ).one()
    total_products = int(product_stats[0] or 0)
    low_stock_products = int(product_stats[1] or 0)

    product_perf_rows = (
        db.query(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.total_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            active_filter,
            Product.is_active == True,
            OrderItem.total_price > 0,
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.total_price).desc())
        .all()
    )
    def _format_perf(row):
        return {
            "product_id": row.id,
            "name": row.name,
            "total_quantity": int(row.qty or 0),
            "qty": int(row.qty or 0),
            "total_revenue": float(row.revenue or 0),
            "revenue": float(row.revenue or 0),
        }

    top_products = [_format_perf(row) for row in product_perf_rows[:5]]
    bottom_products = [_format_perf(row) for row in sorted(product_perf_rows, key=lambda r: float(r.revenue or 0))[:5]]

    recent_q = db.query(Order)
    if ch_cond is not None:
        recent_q = recent_q.filter(ch_cond)
    recent_orders = recent_q.order_by(Order.created_at.desc()).limit(8).all()
    recent_orders_list = [
        {
            "id": o.id,
            "order_number": o.order_number,
            "status": o.status,
            "channel": o.channel or "real",
            "total_amount": o.total_amount,
            "created_at": o.created_at,
            "customer_id": o.customer_id,
        }
        for o in recent_orders
    ]

    abandoned_orders = int(
        db.query(func.count(AbandonedCheckout.id))
        .filter(AbandonedCheckout.recovery_status == "abandoned")
        .scalar()
        or 0
    )

    return {
        "sales_summary": {
            "total_sales": total_sales,
            "total_orders": total_orders,
            "total_customers": total_customers,
            "daily_sales": daily_sales,
            "daily_orders": daily_orders,
            "draft_orders": draft_orders,
            "abandoned_orders": abandoned_orders,
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
        "payment_breakdown": payment_breakdown,
    }


def get_sales_series(db: Session, days: int = 30, start_date: Optional[date] = None, end_date: Optional[date] = None, channel: Optional[str] = None):
    if start_date and end_date:
        start = start_date
        end = end_date
        total_days = max(1, (end - start).days + 1)
    else:
        end = date.today()
        start = end - timedelta(days=days - 1)
        total_days = days

    q = db.query(func.date(Order.created_at), func.coalesce(func.sum(Order.total_amount), 0)).filter(
        Order.created_at >= datetime.combine(start, datetime.min.time()),
        Order.created_at <= datetime.combine(end, datetime.max.time()),
        Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]),
    )
    ch_cond = _order_channel_cond(channel)
    if ch_cond is not None:
        q = q.filter(ch_cond)
    rows = q.group_by(func.date(Order.created_at)).all()
    by_day = {str(r[0]): float(r[1] or 0) for r in rows}
    series = []
    for i in range(total_days):
        day = start + timedelta(days=i)
        key = day.isoformat()
        series.append({"date": key, "total": by_day.get(key, 0.0)})
    return series


def get_pnl_data(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None, channel: Optional[str] = None) -> dict:
    today = date.today()
    q_orders = db.query(Order).filter(Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]))
    ch_cond = _order_channel_cond(channel)
    if ch_cond is not None:
        q_orders = q_orders.filter(ch_cond)
    q_expenses = db.query(Expense).filter(Expense.date <= today)

    if start_date:
        q_orders = q_orders.filter(Order.created_at >= datetime.combine(start_date, datetime.min.time()))
        q_expenses = q_expenses.filter(Expense.date >= start_date)
    if end_date:
        q_orders = q_orders.filter(Order.created_at <= datetime.combine(end_date, datetime.max.time()))
        q_expenses = q_expenses.filter(Expense.date <= end_date)

    orders = q_orders.all()
    gross_sales = sum(float(o.total_amount or 0) for o in orders)
    total_orders = len(orders)

    order_ids = [o.id for o in orders]
    cogs = 0.0
    if order_ids:
        items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all()
        cogs = sum(float(it.quantity or 0) * float(it.cost_price or 0) for it in items)

    gross_profit = gross_sales - cogs

    expenses = q_expenses.all() if channel != "demo" else []
    operating_expenses = sum(float(e.amount or 0) for e in expenses)
    net_profit = gross_profit - operating_expenses

    by_cat = {}
    for e in expenses:
        cat = e.category or "Other"
        by_cat[cat] = by_cat.get(cat, 0.0) + float(e.amount or 0)
    expense_categories = [{"category": k, "total": round(v, 2)} for k, v in sorted(by_cat.items(), key=lambda x: x[1], reverse=True)]

    period_str = f"{start_date} to {end_date}" if start_date and end_date else "Fiscal Year to Date"
    return {
        "period": period_str,
        "gross_sales": round(gross_sales, 2),
        "total_orders": total_orders,
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "operating_expenses": round(operating_expenses, 2),
        "expense_categories": expense_categories,
        "net_profit": round(net_profit, 2),
    }



def get_top_products(db: Session, limit: int = 10, channel: Optional[str] = None):
    q = (
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
            Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]),
            Product.is_active == True,
            OrderItem.total_price > 0,
        )
    )
    ch_cond = _order_channel_cond(channel)
    if ch_cond is not None:
        q = q.filter(ch_cond)
    rows = q.group_by(Product.id, Product.name, Product.sku).order_by(func.sum(OrderItem.total_price).desc()).limit(limit).all()
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


def get_customer_activity(db: Session, limit: int = 10, channel: Optional[str] = None):
    order_join_cond = (Order.customer_id == Customer.id) & (Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.DRAFT.value]))
    ch_cond = _order_channel_cond(channel)
    if ch_cond is not None:
        order_join_cond = order_join_cond & ch_cond
    rows = (
        db.query(
            Customer.id,
            Customer.name,
            Customer.email,
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
        )
        .outerjoin(Order, order_join_cond)
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
    q = db.query(Expense)
    if start_date:
        q = q.filter(Expense.date >= start_date)
    if end_date:
        q = q.filter(Expense.date <= end_date)
    else:
        # Default to realized expenses up to today so upcoming recurring schedules do not inflate spend
        q = q.filter(Expense.date <= today)

    all_exps = q.all()
    # Case-insensitive grouping by category.strip().title()
    category_totals = {}
    category_counts = {}
    for e in all_exps:
        cat = (e.category or "Uncategorized").strip().title()
        amt = float(e.amount or 0)
        category_totals[cat] = category_totals.get(cat, 0.0) + amt
        category_counts[cat] = category_counts.get(cat, 0) + 1

    by_category = [
        {"category": cat, "total": total, "count": category_counts[cat]}
        for cat, total in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    ]
    realized_total = sum(category_totals.values())
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
        "by_category": by_category,
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

    # Enrich: first order ever recorded
    first_order_q = (
        db.query(Order, Customer.name.label("customer_name"))
        .join(Customer, Customer.id == Order.customer_id)
        .order_by(Order.created_at.asc())
        .first()
    )
    first_order_detail = None
    if first_order_q:
        fo, fo_cust = first_order_q
        fo_items_q = (
            db.query(OrderItem.quantity, Product.name.label("product_name"))
            .join(Product, Product.id == OrderItem.product_id)
            .filter(OrderItem.order_id == fo.id)
            .all()
        )
        fo_items_summary = ", ".join(f"{item.quantity}x {item.product_name}" for item in fo_items_q[:3])
        first_order_detail = {
            "order_number": fo.order_number,
            "customer": fo_cust,
            "status": fo.status,
            "total": float(fo.total_amount or 0),
            "date": fo.created_at.strftime("%d %b %Y") if fo.created_at else "N/A",
            "items_summary": fo_items_summary or "No items",
        }

    # Enrich: full active product catalog
    all_products_q = (
        db.query(Product)
        .filter(Product.is_active == True)
        .order_by(Product.name.asc())
        .all()
    )
    all_products_catalog = [
        {
            "name": p.name,
            "sku": p.sku,
            "price": float(p.price or 0),
            "cost_price": float(p.cost_price or 0),
            "stock_qty": int(p.stock_qty or 0),
            "min_stock_level": int(p.min_stock_level or 0),
        }
        for p in all_products_q
    ]

    # Enrich: order status counts
    status_counts_rows = db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    order_status_counts = {str(r[0]): int(r[1]) for r in status_counts_rows}

    # Enrich: all orders summary list for full database lookups
    all_orders_q = (
        db.query(Order.order_number, Customer.name.label("customer_name"), Order.total_amount, Order.status, Order.created_at)
        .join(Customer, Customer.id == Order.customer_id)
        .order_by(Order.created_at.desc())
        .limit(50)
        .all()
    )
    all_orders_brief = [
        {
            "order_number": r[0],
            "customer": r[1],
            "total": float(r[2] or 0),
            "status": r[3],
            "date": r[4].strftime("%d %b %Y") if r[4] else "N/A",
        }
        for r in all_orders_q
    ]

    # Enrich: Storefront visitor engagement & conversion funnel signals
    storefront_funnel = {}
    storefront_top_viewed = []
    try:
        from services.storefront_service import get_storefront_analytics
        sf_data = get_storefront_analytics(db, days=30)
        storefront_funnel = sf_data.get("totals", {})
        storefront_top_viewed = [
            {"product_title": p.get("product_title"), "views": p.get("views", 0), "carts": p.get("carts", 0)}
            for p in sf_data.get("products", [])[:6]
        ]
    except Exception:
        pass

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
        "first_order_detail": first_order_detail,
        "all_products_catalog": all_products_catalog,
        "order_status_counts": order_status_counts,
        "all_orders_brief": all_orders_brief,
        "top_customers": top_customers,
        "expense_breakdown": expense_summary.get("by_category", []),
        "storefront_funnel": storefront_funnel,
        "storefront_top_viewed": storefront_top_viewed,
    }


def get_staff_performance(db: Session, limit: int = 10, channel: Optional[str] = None) -> list[dict]:
    from models.user import User
    q = (
        db.query(
            User.id.label("user_id"),
            User.full_name.label("full_name"),
            User.email.label("email"),
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_sales"),
        )
        .join(Order, Order.created_by == User.id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
    )
    ch_cond = _order_channel_cond(channel)
    if ch_cond is not None:
        q = q.filter(ch_cond)
    rows = q.group_by(User.id).order_by(func.sum(Order.total_amount).desc()).limit(limit).all()
    return [
        {
            "user_id": r.user_id,
            "full_name": r.full_name or "Staff Member",
            "email": r.email,
            "order_count": int(r.order_count or 0),
            "total_sales": float(r.total_sales or 0.0),
        }
        for r in rows
    ]
