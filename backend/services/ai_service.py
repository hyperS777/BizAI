"""Pluggable AI assistant grounded in live business records."""

from datetime import datetime
import json
from typing import Optional

from sqlalchemy.orm import Session

from config import settings
from models.ai_query import AIQuery
from models.user import User
from services.report_service import build_business_snapshot


def _fallback_answer(query: str, snapshot: dict) -> str:
    metrics = snapshot["metrics"]
    sales = metrics["sales_summary"]
    profit = metrics["revenue_profit"]
    inventory = metrics["inventory_summary"]
    top = metrics["top_products"]
    low = snapshot["low_stock"]
    q = query.lower()

    if any(word in q for word in ["low", "stock", "restock"]):
        if not low:
            return "No products are currently at or below their minimum stock level."
        lines = ", ".join(f"{item['name']} ({item['stock_qty']} left, min {item['min_stock_level']})" for item in low)
        return f"{inventory['low_stock_products']} products need attention: {lines}."

    if "best" in q or "fastest" in q or "selling" in q:
        if not top:
            return "There is not enough order history yet to rank best-selling products."
        lines = ", ".join(f"{item['name']} (₹{item['total_revenue']:.0f})" for item in top[:3])
        return f"Best-selling products by revenue: {lines}."

    if "compared" in q or "last month" in q or "this month" in q:
        current = sales["monthly_sales"]
        previous = sales["previous_month_sales"]
        if previous <= 0:
            return f"This month has ₹{current:.0f} in sales across {sales['monthly_orders']} orders. There is no previous-month baseline yet."
        change = ((current - previous) / previous) * 100
        direction = "increased" if change >= 0 else "decreased"
        return (
            f"Sales {direction} by {abs(change):.1f}% this month "
            f"(₹{current:.0f} vs ₹{previous:.0f} last month)."
        )

    if "summary" in q or "performance" in q:
        return _summary_from_snapshot(snapshot)

    return (
        f"From current records: {sales['total_orders']} orders, ₹{sales['total_sales']:.0f} in sales, "
        f"₹{profit['profit']:.0f} estimated profit, and {inventory['low_stock_products']} low-stock products. "
        "I only use figures stored in the database."
    )


def _summary_from_snapshot(snapshot: dict) -> str:
    sales = snapshot["metrics"]["sales_summary"]
    profit = snapshot["metrics"]["revenue_profit"]
    top = snapshot["metrics"]["top_products"]
    low = snapshot["low_stock"]
    current = sales["monthly_sales"]
    previous = sales["previous_month_sales"]
    if previous > 0:
        change = ((current - previous) / previous) * 100
        trend = f"Sales {'increased' if change >= 0 else 'decreased'} by {abs(change):.1f}% this month."
    else:
        trend = f"This month has recorded ₹{current:.0f} in sales."
    best = f" {top[0]['name']} generated the highest revenue." if top else ""
    restock = ""
    if low:
        names = ", ".join(item["name"] for item in low[:3])
        restock = f" {names} {'is' if len(low) == 1 else 'are'} approaching minimum stock."
    return f"{trend}{best} Estimated profit is ₹{profit['profit']:.0f}.{restock}"


def _ask_model(query: str, snapshot: dict) -> Optional[str]:
    if settings.AI_PROVIDER != "groq" or not settings.GROQ_API_KEY:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        payload = json.dumps(snapshot, default=str)[:8000]
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are BizAI, a business assistant for Reihh. "
                        "Answer only from the JSON snapshot. Never invent numbers. "
                        "If the snapshot does not contain the answer, say so. "
                        "Keep replies concise and practical for a small business owner."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Business snapshot:\n{payload}\n\nQuestion: {query}",
                },
            ],
            temperature=0.2,
            max_tokens=400,
        )
        return completion.choices[0].message.content
    except Exception:
        return None


def answer_query(db: Session, user: User, query: str) -> AIQuery:
    snapshot = build_business_snapshot(db)
    response_text = _ask_model(query, snapshot) or _fallback_answer(query, snapshot)
    record = AIQuery(
        user_id=user.id,
        query_text=query,
        response_text=response_text,
        intent="business_data",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def business_summary(db: Session) -> dict:
    snapshot = build_business_snapshot(db)
    return {
        "summary": _summary_from_snapshot(snapshot),
        "generated_at": datetime.utcnow(),
    }
