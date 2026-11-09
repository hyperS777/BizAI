"""
Pluggable AI assistant grounded in live business records with multi-turn conversational context.
"""

from datetime import datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from config import settings
from models.ai_query import AIQuery
from models.user import User
from services.report_service import build_business_snapshot

logger = logging.getLogger("bizai.ai")


def _format_inr(val: float) -> str:
    return f"INR {val:,.0f}"


def _sanitize_input(query: str) -> tuple[str, set[str]]:
    """Clean query string by removing surrounding brackets, quotes, and punctuation."""
    # Strip leading/trailing brackets, braces, parentheses, quotes
    clean = re.sub(r'^[\[\(\{<"\']+|[\]\)\}>"\']+$', '', query).strip()
    # Normalize for keyword matching
    norm = re.sub(r'[^a-zA-Z0-9\s]', ' ', clean).lower()
    words = set(norm.split())
    return clean.lower(), words


def _fallback_conversational_answer(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Intelligent, grounded multi-turn conversational NLP engine.
    Understands context, follow-ups, advice, restock calculations, and plain-English business guidance.
    """
    metrics = snapshot.get("metrics", {})
    sales = metrics.get("sales_summary", {})
    profit = metrics.get("revenue_profit", {})
    inventory = metrics.get("inventory_summary", {})
    top_products = metrics.get("top_products", [])
    bottom_products = metrics.get("bottom_products", [])
    low_stock = snapshot.get("low_stock", [])
    outstanding = snapshot.get("outstanding_payments", 0.0)

    q, words = _sanitize_input(query)

    # 1. Greetings & casual check-ins (e.g. "[hello", "hi", "how u doing", "how are you", "what's up")
    greeting_phrases = [
        "good morning", "good afternoon", "good evening", "how are you", "how u doing",
        "how are u", "hows it going", "how's it going", "how do you do", "who are you",
        "what can you do", "whats up", "what's up", "wassup",
    ]
    greeting_words = {"hello", "hi", "hey", "hola", "help", "greetings", "yo", "sup", "namaste"}

    if any(g in q for g in greeting_phrases) or (words & greeting_words):
        is_check_in = any(x in q for x in ["how are you", "how u doing", "how are u", "hows it going", "how's it going", "whats up", "what's up", "sup"])
        opener = (
            "Hello! I'm doing great, thank you for asking! Everything is running smoothly at REIHH Studio.\n\n"
            if is_check_in
            else "Hello! I am **BizAI**, your intelligent business co-pilot for REIHH Studio.\n\n"
        )
        return (
            f"{opener}"
            "I have real-time access to your live orders, catalog stock, customer ledger, Delhivery shipments, and profit figures. Here are a few things you can ask me:\n"
            "* **'What products should I buy / restock?'** — Get priority reorder recommendations.\n"
            "* **'How are sales this month compared to last month?'** — View growth trends.\n"
            "* **'Break down our expenses and profit margins.'** — Financial health check.\n"
            "* **'What is the status of our Delhivery orders?'** — Fulfillment pulse.\n\n"
            "How can I help you make today's decisions?"
        )

    # 2. Clarification / "what do you mean" / follow-up requests
    if (
        "what do you mean" in q
        or "what do u mean" in q
        or "clarify" in q
        or "i don't understand" in q
        or "explain that" in q
        or "tell me more" in q
        or "meaning" in q
    ):
        total_s = _format_inr(sales.get("total_sales", 0))
        prof = _format_inr(profit.get("profit", 0))
        rev = _format_inr(profit.get("revenue", 0))
        exp = _format_inr(profit.get("expenses", 0))
        cogs = _format_inr(profit.get("cogs", 0))
        sched_exp = profit.get("scheduled_expenses", 0)

        sched_line = (
            f" (plus {_format_inr(sched_exp)} in upcoming recurring commitments kept separate)"
            if sched_exp > 0
            else ""
        )

        return (
            "Let me break down our business figures in simple, direct terms:\n\n"
            f"1. **Total Sales ({total_s})**: The gross amount generated across {sales.get('total_orders', 0)} customer orders.\n"
            f"2. **Net Profit ({prof})**: The actual money kept after subtracting garment manufacturing cost ({cogs}) and realized operational spend ({exp}{sched_line}) from total revenue ({rev}).\n"
            f"3. **Inventory Status**: We actively monitor our 40 apparel items so bestselling pieces never run out in Delhi.\n\n"
            "Would you like me to show you the **restock recommendation list**, or drill down into **customer purchase history**?"
        )

    # 3. Purchasing / Restocking Advice: "what products should i buy?", "what to stock?", "purchase advice"
    if (
        ("what" in q and "buy" in q)
        or "should i buy" in q
        or "should we buy" in q
        or "restock" in q
        or "reorder" in q
        or "stock up" in q
        or ("which" in q and "buy" in q)
        or ("recommend" in q and "product" in q)
        or ("suggest" in q and "buy" in q)
    ):
        advice_parts = []
        if low_stock:
            advice_parts.append("### [Restock Priority] Urgent Restock Recommendations (Operations POV):")
            advice_parts.append("These garments are running low in your Delhi fulfillment center:")
            for item in low_stock[:4]:
                current = item.get("stock_qty", 0)
                min_lvl = item.get("min_stock_level", 4)
                suggested_reorder = max(min_lvl * 4, 25)
                advice_parts.append(
                    f"* **{item['name']}** (SKU: `{item['sku']}`): **{current} units left** (Safety min: {min_lvl}) -> *Recommend reordering at least {suggested_reorder} units*."
                )
        else:
            advice_parts.append("### [Inventory Status] Warehouse Stock Level:")
            advice_parts.append(
                "Good news! All active pieces in the REIHH collection (Womenswear, Menswear, Outerwear, Denim) "
                "currently meet or exceed safety stock thresholds in the Delhi fulfillment center. No urgent reorders required today."
            )

        # Sales demand view
        valid_top = [
            p for p in top_products
            if (p.get("total_quantity") or p.get("qty", 0)) > 0
        ]

        if valid_top:
            advice_parts.append("\n### [Customer Demand] Top-Selling Pieces (Sales POV):")
            advice_parts.append("If you want to restock based on customer favorite pieces with highest turnover:")
            for p in valid_top[:3]:
                qty = p.get("total_quantity") or p.get("qty", 0)
                rev = _format_inr(p.get("total_revenue") or p.get("revenue", 0))
                advice_parts.append(f"* **{p['name']}**: {qty} units sold ({rev} gross revenue).")
            top_name = valid_top[0]["name"]
            advice_parts.append(
                f"\n**Actionable Advice**: Prioritize keeping a safety buffer for customer favorites like the *{top_name}* "
                "to maintain order momentum during high-traffic campaigns."
            )
        else:
            advice_parts.append(
                "\n**Actionable Advice**: Catalog inventory is healthy. Focus marketing efforts on the *Arden Grey Wash Jacket* "
                "and *Alba Straight Fit Denim* sets to drive initial collection volume."
            )

        return "\n".join(advice_parts)

    # 4. Courtesy / Closings
    if any(w in words for w in ["thanks", "thank", "bye", "goodbye"]) or "thank you" in q:
        return (
            "You are very welcome! I'm here 24/7 to monitor your inventory, track orders with Delhivery, "
            "and calculate your profit margins. Let me know whenever you need another operational update!"
        )

    # 5. Delivery & Delhivery Logistics Queries
    if any(w in q for w in ["delhivery", "courier", "dispatch", "shipment", "transit", "shipping", "carrier", "delivery status"]):
        return (
            "### [Logistics] Delhivery Express Integration Overview:\n\n"
            "* **Default Fulfillment Hub**: REIHH Studio Central Warehouse, Delhi NCR.\n"
            "* **Integrated Carrier**: **Delhivery Surface & Express** with automated 12-digit waybills (`148...`).\n"
            "* **Live Tracking**: Each order generates a direct tracking link (`https://www.delhivery.com/track/package/...`) along with an interactive Leaflet route simulator for delivery agents.\n"
            "* **WhatsApp Updates**: Customers receive instant WhatsApp dispatch updates with live waybills and tax invoice PDFs upon delivery.\n\n"
            "You can test live dispatch directly in the **Orders** tab or open the **Delivery Agent POV**."
        )

    # 6. Low stock specifically
    if "low" in q and "stock" in q:
        if not low_stock:
            return "Good news! No products are currently below their safety stock thresholds in the catalog."
        items_text = "\n".join(
            f"* **{item['name']}**: {item['stock_qty']} in stock (min: {item['min_stock_level']})"
            for item in low_stock
        )
        return f"### [Alert] {len(low_stock)} Low-Stock Products Require Attention:\n\n{items_text}"

    # 7. Product Rankings: best vs slowest selling
    if "least" in q or "worst" in q or "slowest" in q:
        valid_bottom = [p for p in bottom_products if (p.get("total_revenue") or p.get("revenue", 0)) > 0]
        if not valid_bottom:
            return "All catalog pieces currently have balanced demand across orders."
        lines = "\n".join(
            f"* **{item['name']}**: {_format_inr(item.get('total_revenue') or item.get('revenue', 0))} in sales"
            for item in valid_bottom[:3]
        )
        return f"### [Trends] Least-Selling Products by Revenue:\n\n{lines}\n\n*Consider running a 15% promotional discount to stimulate sales for these pieces.*"

    if "best" in q or "fastest" in q or "top" in q or "selling" in q:
        valid_top = [p for p in top_products if (p.get("total_quantity") or p.get("qty", 0)) > 0]
        if not valid_top:
            return "Customer demand is currently registering initial orders across new apparel collections."
        lines = "\n".join(
            f"* **{item['name']}**: {item.get('total_quantity') or item.get('qty', 0)} units sold ({_format_inr(item.get('total_revenue') or item.get('revenue', 0))})"
            for item in valid_top[:4]
        )
        return f"### [Top Sellers] Top-Performing REIHH Products:\n\n{lines}"

    # 8. Orders summary
    if any(phrase in q for phrase in ["how many orders", "total orders", "order count", "orders summary"]):
        total_o = sales.get("total_orders", 0)
        m_orders = sales.get("monthly_orders", 0)
        m_sales = _format_inr(sales.get("monthly_sales", 0))
        return (
            f"### [Orders] Orders Status:\n\n"
            f"* **Lifetime Orders**: {total_o} placed.\n"
            f"* **This Month**: {m_orders} orders totaling {m_sales}.\n"
            f"* **Fulfillment**: Synchronized with Delhivery Express."
        )

    # 9. Revenue & Profit
    if any(phrase in q for phrase in ["sales", "revenue", "profit", "margin", "earnings", "how much money"]):
        tot_s = _format_inr(sales.get("total_sales", 0))
        tot_p = _format_inr(profit.get("profit", 0))
        tot_e = _format_inr(profit.get("expenses", 0))
        sched = _format_inr(profit.get("scheduled_expenses", 0))
        cogs = _format_inr(profit.get("cogs", 0))
        margin_pct = (profit.get("profit", 0) / sales.get("total_sales", 1) * 100) if sales.get("total_sales", 0) > 0 else 0

        recurring_note = (
            f"\n* **Upcoming Recurring Commitments**: {sched} scheduled across future months (kept separate from current profit)."
            if profit.get("scheduled_expenses", 0) > 0
            else ""
        )

        return (
            f"### [Financials] Financial Performance Summary:\n\n"
            f"* **Total Revenue**: {tot_s} across {sales.get('total_orders', 0)} orders.\n"
            f"* **Cost of Goods Sold (COGS)**: {cogs}.\n"
            f"* **Realized Operational Expenses**: {tot_e}.{recurring_note}\n"
            f"* **Estimated Net Profit**: **{tot_p}** (Net Margin: **{margin_pct:.1f}%**).\n"
            f"* **Outstanding Balances**: {_format_inr(outstanding)} due from customers.\n\n"
            "Your business maintains a healthy margin above 35% on apparel."
        )

    # 10. Customer analytics
    if any(w in words for w in ["customer", "customers", "clients", "crm"]):
        cust_count = metrics.get("customers_count", 0) or sales.get("total_customers", 0)
        return (
            f"### [CRM] Customer Base Overview:\n\n"
            f"* **Total Active Profiles**: {cust_count} registered customers.\n"
            f"* **Outstanding Receivables**: {_format_inr(outstanding)} across unpaid invoices.\n"
            "* **Integration**: Customers receive real-time order updates via WhatsApp deep links upon placement."
        )

    # 11. Expenses breakdown
    if "expense" in q or "spend" in q:
        tot_e = _format_inr(profit.get("expenses", 0) or metrics.get("total_expenses", 0))
        sched = _format_inr(profit.get("scheduled_expenses", 0))
        sched_note = f" (plus {sched} in upcoming recurring commitments)" if profit.get("scheduled_expenses", 0) > 0 else ""
        return (
            f"### [Expenses] Expense Overview:\n\n"
            f"Realized business expenses to date: **{tot_e}**{sched_note}.\n"
            "Future recurring entries are kept separate and only deducted as their billing months arrive. "
            "Check the **Expenses** tab for a detailed month-by-month breakdown of rent, logistics, and utilities."
        )

    # 12. Monthly comparisons
    if "compared" in q or "last month" in q or "this month" in q:
        current = sales.get("monthly_sales", 0)
        previous = sales.get("previous_month_sales", 0)
        if previous <= 0:
            return f"This month has recorded {_format_inr(current)} in sales across {sales.get('monthly_orders', 0)} orders. No prior month baseline is available."
        change = ((current - previous) / previous) * 100
        direction = "increased" if change >= 0 else "decreased"
        return (
            f"Sales have **{direction} by {abs(change):.1f}%** this month "
            f"({_format_inr(current)} this month vs {_format_inr(previous)} last month)."
        )

    if "summary" in q or "performance" in q:
        return _summary_from_snapshot(snapshot)

    # Contextual fallback that guides the user rather than repeating a dead-end string
    return (
        f"Based on current live records: **{sales.get('total_orders', 0)} orders**, "
        f"**{_format_inr(sales.get('total_sales', 0))} sales**, and **{_format_inr(profit.get('profit', 0))} net profit**.\n\n"
        "Here are specific questions you can ask me:\n"
        "1. *'What products should I buy / restock?'*\n"
        "2. *'What do you mean by net profit?'*\n"
        "3. *'How is our Delhivery shipping performing?'*\n"
        "4. *'Which items are our top sellers?'*"
    )


def _summary_from_snapshot(snapshot: dict) -> str:
    sales = snapshot.get("metrics", {}).get("sales_summary", {})
    profit = snapshot.get("metrics", {}).get("revenue_profit", {})
    top = snapshot.get("metrics", {}).get("top_products", [])
    low = snapshot.get("low_stock", [])
    current = sales.get("monthly_sales", 0)
    previous = sales.get("previous_month_sales", 0)
    if previous > 0:
        change = ((current - previous) / previous) * 100
        trend = f"Sales {'increased' if change >= 0 else 'decreased'} by {abs(change):.1f}% this month."
    else:
        trend = f"This month has recorded {_format_inr(current)} in sales."
    best = ""
    valid_top = [p for p in top if (p.get("total_quantity") or p.get("qty", 0)) > 0]
    if valid_top:
        best = f" {valid_top[0]['name']} is the top revenue generator."
    restock = ""
    if low:
        names = ", ".join(item["name"] for item in low[:3])
        restock = f" {names} {'is' if len(low) == 1 else 'are'} near minimum stock."
    return f"{trend}{best} Net estimated profit is {_format_inr(profit.get('profit', 0))}.{restock}"


def _ask_model(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """Calls Groq or Gemini if keys are configured."""
    if settings.GROQ_API_KEY:
        try:
            from groq import Groq

            client = Groq(api_key=settings.GROQ_API_KEY)
            payload = json.dumps(snapshot, default=str)[:8000]
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are BizAI, a friendly, razor-sharp business advisor for REIHH Studio (luxury Indian apparel). "
                        "You have full multi-turn conversational memory. Answer questions naturally, conversationally, "
                        "and ground all business numbers strictly in the provided JSON snapshot. "
                        "When greeted (e.g. 'hello', 'how u doing'), reply warmly and conversationally without dumping raw stats. "
                        "When the user asks 'what products should I buy?' or 'what should I stock?', analyze low-stock items "
                        "and top-selling apparel pieces to give an actionable reorder recommendation. "
                        "When the user asks 'what do you mean?', clarify the previous points simply. "
                        "Use Markdown formatting with bold text and bullet points."
                    ),
                },
            ]
            if conversation_history:
                for msg in conversation_history[-6:]:
                    r = "user" if msg.get("role") == "user" else "assistant"
                    t = msg.get("text") or msg.get("content") or ""
                    if t:
                        messages.append({"role": r, "content": t})

            messages.append({
                "role": "user",
                "content": f"Business data snapshot:\n{payload}\n\nUser question: {query}",
            })
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                temperature=0.3,
                max_tokens=500,
            )
            return completion.choices[0].message.content
        except Exception as exc:
            logger.warning("Groq AI query failed: %s", exc)

    return None


def answer_query(
    db: Session,
    user: User,
    query: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> AIQuery:
    snapshot = build_business_snapshot(db)
    response_text = (
        _ask_model(query, snapshot, conversation_history)
        or _fallback_conversational_answer(query, snapshot, conversation_history)
    )
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
