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
    words = set(q.replace("?", "").replace("!", "").replace(",", "").split())

    # 1. Greetings & conversational introductions
    if (
        any(g in q for g in ["good morning", "good afternoon", "good evening", "how are you", "who are you", "what can you do"])
        or any(w in words for w in ["hello", "hi", "hey", "hola", "help"])
    ):
        return (
            "Hello! I am BizAI, your business assistant for Reihh. "
            "I can help you monitor sales trends, low stock alerts, orders, and profit metrics. "
            "How can I help you today?"
        )

    # 2. Courtesy / Closings
    if any(w in words for w in ["thanks", "thank", "bye", "goodbye"]) or "thank you" in q:
        return "You're very welcome! Feel free to ask anytime if you need insights on your sales, inventory, or orders."

    # 3. Low stock and restocking questions
    if any(word in q for word in ["low", "stock", "restock"]):
        if not low:
            return "No products are currently at or below their minimum stock level."
        lines = ", ".join(f"{item['name']} ({item['stock_qty']} left, min {item['min_stock_level']})" for item in low)
        return f"{inventory['low_stock_products']} products need attention: {lines}."

    # 4. Product rankings
    if "least" in q or "worst" in q or "slowest" in q:
        bottom = metrics.get("bottom_products", [])
        if not bottom:
            return "There is not enough order history yet to rank products."
        lines = ", ".join(f"{item['name']} (₹{item['total_revenue']:.0f})" for item in bottom[:3])
        return f"Least-selling products by revenue: {lines}."

    if "best" in q or "fastest" in q or "selling" in q:
        if not top:
            return "There is not enough order history yet to rank best-selling products."
        lines = ", ".join(f"{item['name']} (₹{item['total_revenue']:.0f})" for item in top[:3])
        return f"Best-selling products by revenue: {lines}."

    # 5. Orders and revenue inquiries
    if any(phrase in q for phrase in ["how many orders", "total orders", "order count", "orders summary"]):
        return f"You currently have {sales['total_orders']} total orders recorded, with {sales['monthly_orders']} placed this month totaling ₹{sales['monthly_sales']:.0f}."

    if any(phrase in q for phrase in ["total sales", "total revenue", "how much sales", "how much revenue", "sales to date"]):
        return f"Total sales to date stand at ₹{sales['total_sales']:.0f} across {sales['total_orders']} orders, generating approximately ₹{profit['profit']:.0f} in gross profit."

    if any(w in words for w in ["profit", "margin", "earnings"]):
        return f"Your estimated gross profit is ₹{profit['profit']:.0f}, calculated from ₹{sales['total_sales']:.0f} in revenue minus cost of goods sold and recorded expenses."

    if any(w in words for w in ["customer", "customers", "clients"]):
        return f"We are tracking {metrics.get('customers_count', 'all active')} registered customers. You can check customer-specific order history in the Customers tab."

    if "expense" in q:
        return f"Total business expenses recorded stand at ₹{metrics.get('total_expenses', 0):.0f}."

    # 6. Monthly comparison
    if "compared" in q or "last month" in q or "this month" in q:
        current = sales["monthly_sales"]
        previous = sales["previous_month_sales"]
        if previous <= 0:
            return f"This month has recorded ₹{current:.0f} in sales across {sales['monthly_orders']} orders. There is no previous-month baseline yet."
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
        "Ask me about your top-selling products, low inventory, orders, or monthly comparisons!"
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
                        "You are BizAI, a friendly and intelligent business assistant for Reihh. "
                        "If the user greets you (e.g. 'hello', 'hi', 'hey'), greet them back warmly and explain what you can help with. "
                        "For business queries, answer strictly using the provided JSON snapshot. Never invent numbers. "
                        "If the snapshot does not contain the answer, say so politely. "
                        "Keep replies concise, clear, and practical for a small business owner."
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
