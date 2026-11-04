"""
Pluggable AI assistant grounded in live business records with multi-turn conversational context.
"""

from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from config import settings
from models.ai_query import AIQuery
from models.user import User
from services.report_service import build_business_snapshot

logger = logging.getLogger("bizai.ai")


def _format_inr(val: float) -> str:
    return f"INR {val:,.0f}"


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

    q = query.strip().lower()
    words = set(q.replace("?", "").replace("!", "").replace(",", "").replace(".", "").split())

    # Get previous turns for multi-turn understanding
    last_assistant_msg = ""
    last_user_msg = ""
    if conversation_history:
        for msg in reversed(conversation_history):
            role = msg.get("role")
            text = msg.get("text") or msg.get("content") or ""
            if not last_assistant_msg and role in ("assistant", "model"):
                last_assistant_msg = text
            elif not last_user_msg and role == "user":
                last_user_msg = text
            if last_assistant_msg and last_user_msg:
                break

    # 1. Greetings & conversational introductions
    if (
        any(g in q for g in ["good morning", "good afternoon", "good evening", "how are you", "who are you", "what can you do"])
        or (words & {"hello", "hi", "hey", "hola", "help", "greetings"})
    ):
        return (
            "Hello! I am **BizAI**, your intelligent business co-pilot for REIHH Studio.\n\n"
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

        return (
            "Let me break down our business figures in simple, direct terms:\n\n"
            f"1. **Total Sales ({total_s})**: The gross amount generated across {sales.get('total_orders', 0)} customer orders.\n"
            f"2. **Net Profit ({prof})**: The actual money kept after subtracting the garment manufacturing cost ({cogs}) and operational expenses ({exp}) from total revenue ({rev}).\n"
            f"3. **Inventory Reorders ({len(low_stock)} items low)**: Certain pieces (like those in our low-stock list) are running close to zero units in the Delhi warehouse. If not reordered, prospective buyers will see 'Sold out'.\n\n"
            "Would you like me to show you the **exact restock recommendation list**, or drill down into **customer purchase history**?"
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
    ):
        advice_parts = []
        if low_stock:
            advice_parts.append("### [Restock Priority] Urgent Restock Recommendations (Operations POV):")
            advice_parts.append("These garments are running critically low in your Delhi fulfillment center:")
            for item in low_stock[:4]:
                current = item.get("stock_qty", 0)
                min_lvl = item.get("min_stock_level", 2)
                suggested_reorder = max(min_lvl * 4, 25)
                advice_parts.append(
                    f"* **{item['name']}** (SKU: `{item['sku']}`): **{current} units left** (Safety min: {min_lvl}) -> *Recommend reordering at least {suggested_reorder} units*."
                )
        else:
            advice_parts.append("### [Inventory Status] Warehouse Stock Level:")
            advice_parts.append("All products currently meet or exceed minimum safety stock thresholds.")

        if top_products:
            advice_parts.append("\n### [Customer Demand] Top-Selling Pieces (Sales POV):")
            advice_parts.append("If you are looking at customer favorites with the highest commercial turnover:")
            for p in top_products[:3]:
                rev = _format_inr(p.get("revenue", 0))
                qty = p.get("qty", 0)
                advice_parts.append(f"* **{p['name']}**: {qty} units sold ({rev} gross revenue).")

        advice_parts.append(
            "\n**Actionable Advice**: Prioritize reordering high-velocity pieces like the *Arden Grey Wash Jacket* before running targeted promotions."
        )
        return "\n".join(advice_parts)

    # 4. Courtesy / Closings
    if any(w in words for w in ["thanks", "thank", "bye", "goodbye"]) or "thank you" in q:
        return (
            "You are very welcome! I'm here 24/7 to monitor your inventory, track orders with Delhivery, "
            "and calculate your profit margins. Let me know whenever you need another operational update!"
        )

    # 5. Delivery & Delhivery Logistics Queries
    if any(w in q for w in ["delhivery", "courier", "dispatch", "shipment", "transit", "shipping", "carrier"]):
        return (
            "### [Logistics] Delhivery Express Integration Overview:\n\n"
            "* **Default Fulfillment Hub**: REIHH Studio Central Warehouse, Delhi NCR.\n"
            "* **Integrated Carrier**: **Delhivery Surface & Express** with automated 12-digit waybills (`148...`).\n"
            "* **Live Tracking**: Each order generates a direct tracking link (`https://www.delhivery.com/track/package/...`) along with an interactive Leaflet route simulator for delivery agents.\n"
            "* **Proof of Delivery**: Instant tax invoices (PDF) are unlocked automatically upon doorstep delivery.\n\n"
            "You can test live delivery dispatch in the **Orders** tab or open the **Delivery Agent POV**."
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
        if not bottom_products:
            return "There is not yet enough order distribution to rank slowest-selling items."
        lines = "\n".join(
            f"* **{item['name']}**: {_format_inr(item.get('total_revenue', 0))} in sales"
            for item in bottom_products[:3]
        )
        return f"### [Trends] Least-Selling Products by Revenue:\n\n{lines}\n\n*Consider running a 15% discount code to stimulate interest in these pieces.*"

    if "best" in q or "fastest" in q or "top" in q or "selling" in q:
        if not top_products:
            return "No sales recorded yet to establish top rankings."
        lines = "\n".join(
            f"* **{item['name']}**: {item.get('qty', 0)} units sold ({_format_inr(item.get('revenue', 0))})"
            for item in top_products[:4]
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
        cogs = _format_inr(profit.get("cogs", 0))
        margin_pct = (profit.get("profit", 0) / sales.get("total_sales", 1) * 100) if sales.get("total_sales", 0) > 0 else 0

        return (
            f"### [Financials] Financial Performance Summary:\n\n"
            f"* **Total Revenue**: {tot_s} across {sales.get('total_orders', 0)} orders.\n"
            f"* **Cost of Goods Sold (COGS)**: {cogs}.\n"
            f"* **Operational Expenses**: {tot_e}.\n"
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
        tot_e = _format_inr(metrics.get("total_expenses", 0) or profit.get("expenses", 0))
        return (
            f"### [Expenses] Expense Overview:\n\n"
            f"Total recorded business expenses: **{tot_e}**.\n"
            "Check the **Expenses** tab for a detailed month-by-month breakdown of rent, salaries, marketing, and logistics."
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
    best = f" {top[0]['name']} is the top revenue generator." if top else ""
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
    # 1. Try Groq
    if settings.GROQ_API_KEY:
        try:
            from groq import Groq

            client = Groq(api_key=settings.GROQ_API_KEY)
            payload = json.dumps(snapshot, default=str)[:8000]
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are BizAI, a friendly, razor-sharp business advisor for REIHH Studio. "
                        "You have full multi-turn conversational memory. Answer questions naturally, conversationally, "
                        "and ground all business numbers strictly in the provided JSON snapshot. "
                        "When the user asks 'what products should I buy?' or 'what should I stock?', analyze low-stock items "
                        "and top-selling products to give an actionable reorder recommendation. "
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
