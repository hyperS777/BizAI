"""
Pluggable AI assistant grounded in live business records with multi-turn conversational context.
Supports Gemini (primary), Groq (secondary), and a rich rule-based fallback.
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
    clean = re.sub(r'^[\[\(\{<"\'\s]+|[\]\)\}<>"\'\s]+$', '', query).strip()
    norm = re.sub(r'[^a-zA-Z0-9\s]', ' ', clean).lower()
    words = set(norm.split())
    return clean.lower(), words


def _build_system_prompt(snapshot: dict) -> str:
    """Build a rich system prompt with live business data for the LLM."""
    metrics = snapshot.get("metrics", {})
    sales = metrics.get("sales_summary", {})
    profit = metrics.get("revenue_profit", {})
    top_products = metrics.get("top_products", [])
    low_stock = snapshot.get("low_stock", [])
    recent_orders = snapshot.get("recent_orders_detail", [])
    top_customers = snapshot.get("top_customers", [])
    expense_breakdown = snapshot.get("expense_breakdown", [])
    outstanding = snapshot.get("outstanding_payments", 0)

    # Build human-readable data sections
    orders_text = "\n".join(
        f"  - {o['order_number']} | {o['customer']} | {o['status'].upper()} | INR {o['total']:,.0f} | {o['date']} | {o['items_summary']}"
        for o in recent_orders[:8]
    ) or "  No recent orders."

    top_products_text = "\n".join(
        f"  - {p['name']}: {p.get('total_quantity', 0)} units sold, INR {p.get('total_revenue', 0):,.0f} revenue"
        for p in top_products[:5] if p.get('total_revenue', 0) > 0
    ) or "  No sales data yet."

    low_stock_text = "\n".join(
        f"  - {item['name']} (SKU: {item['sku']}): {item['stock_qty']} left (min: {item['min_stock_level']})"
        for item in low_stock[:5]
    ) or "  All items above safety stock."

    customers_text = "\n".join(
        f"  - {c['name']}: {c['order_count']} orders, INR {c['total_spent']:,.0f} lifetime spend"
        for c in top_customers[:5]
    ) or "  No customer data."

    expense_text = "\n".join(
        f"  - {e['category']}: INR {e['total']:,.0f} ({e['count']} entries)"
        for e in expense_breakdown[:6]
    ) or "  No expense data."

    return f"""You are BizAI, the intelligent business co-pilot for REIHH Studio — a premium Indian fashion and apparel brand.

You have LIVE access to their business database. Answer questions conversationally, helpfully, and accurately using ONLY the data below. Be friendly and concise. Use markdown formatting (bold, bullet points, headers).

When someone greets you (hi, hello, how are you), respond warmly and conversationally — do NOT dump statistics. When they ask general questions, give a helpful, natural answer. When they ask specific business questions, ground your answer in the data below.

=== LIVE BUSINESS DATA ===

FINANCIAL OVERVIEW:
- Total Revenue: INR {sales.get('total_sales', 0):,.0f} across {sales.get('total_orders', 0)} orders
- This Month Sales: INR {sales.get('monthly_sales', 0):,.0f} ({sales.get('monthly_orders', 0)} orders)
- Last Month Sales: INR {sales.get('previous_month_sales', 0):,.0f}
- Net Profit: INR {profit.get('profit', 0):,.0f}
- COGS: INR {profit.get('cogs', 0):,.0f}
- Realized Expenses: INR {profit.get('expenses', 0):,.0f}
- Scheduled Future Expenses: INR {profit.get('scheduled_expenses', 0):,.0f} (not deducted from profit yet)
- Outstanding Receivables: INR {outstanding:,.0f}
- Customers: {sales.get('total_customers', 0)}

TOP SELLING PRODUCTS:
{top_products_text}

LOW STOCK ALERTS:
{low_stock_text}

RECENT 10 ORDERS (newest first):
{orders_text}

TOP CUSTOMERS BY SPEND:
{customers_text}

EXPENSE BREAKDOWN (realized only):
{expense_text}

FULFILLMENT: Delhivery Express courier integration. Orders can be tracked at https://www.delhivery.com/track/package/[waybill]
=== END LIVE DATA ===

Rules:
1. Never invent numbers not in the data above.
2. If asked something not in the data, say so honestly and suggest what you CAN help with.
3. For greetings/casual chat, respond naturally and warmly.
4. Format numbers in Indian Rupee style (INR X,XX,XXX).
5. Be concise — avoid walls of text unless explicitly asked for a report.
"""


def _fallback_conversational_answer(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Rich rule-based NLP engine. Covers 20+ intent categories.
    Used when no LLM key is configured.
    """
    metrics = snapshot.get("metrics", {})
    sales = metrics.get("sales_summary", {})
    profit = metrics.get("revenue_profit", {})
    top_products = metrics.get("top_products", [])
    bottom_products = metrics.get("bottom_products", [])
    low_stock = snapshot.get("low_stock", [])
    outstanding = snapshot.get("outstanding_payments", 0.0)
    recent_orders = snapshot.get("recent_orders_detail", [])
    top_customers = snapshot.get("top_customers", [])
    expense_breakdown = snapshot.get("expense_breakdown", [])

    q, words = _sanitize_input(query)

    # --- 1. Greetings & casual check-ins ---
    greeting_phrases = [
        "good morning", "good afternoon", "good evening", "how are you", "how u doing",
        "how are u", "hows it going", "how's it going", "how do you do", "who are you",
        "what can you do", "whats up", "what's up", "wassup",
    ]
    greeting_words = {"hello", "hi", "hey", "hola", "help", "greetings", "yo", "sup", "namaste"}

    if any(g in q for g in greeting_phrases) or (words & greeting_words):
        is_check_in = any(x in q for x in ["how are you", "how u doing", "how are u", "hows it going", "how's it going", "whats up", "what's up", "sup"])
        opener = (
            "Hey! I'm doing great, thanks for asking! Business is running.\n\n"
            if is_check_in
            else "Hello! I'm **BizAI**, your business co-pilot for REIHH Studio.\n\n"
        )
        return (
            f"{opener}"
            "I have live access to your orders, inventory, customers, expenses, and Delhivery shipments. Try asking:\n"
            "* **'What was the latest order?'** — Order details with customer and items\n"
            "* **'Which products should I restock?'** — Priority reorder list\n"
            "* **'How are sales this month?'** — Revenue and growth trends\n"
            "* **'Who are our best customers?'** — Customer rankings\n"
            "* **'Break down our expenses.'** — Financial health check\n\n"
            "What would you like to know?"
        )

    # --- 2. Multiple / recent orders list ("recent orders", "show orders", "list orders", "all orders") ---
    if (("show" in q or "list" in q or "all" in q) and "order" in q) or "recent orders" in q or "last orders" in q:
        if not recent_orders:
            return "No orders have been placed yet."
        lines = []
        for o in recent_orders[:6]:
            lines.append(f"* **{o['order_number']}** — {o['customer']} — {o['status'].upper()} — INR {o['total']:,.0f} ({o['date']})")
        return f"### Recent Orders\n\n" + "\n".join(lines) + "\n\nView the full list in the **Orders** tab."

    # --- 3. Single latest / last order query ("latest order", "last order", "newest order") ---
    if any(phrase in q for phrase in ["latest order", "last order", "most recent order", "recent order", "newest order", "first order", "what was the order"]):
        if recent_orders:
            o = recent_orders[0]
            return (
                f"### Most Recent Order\n\n"
                f"* **Order #**: {o['order_number']}\n"
                f"* **Customer**: {o['customer']}\n"
                f"* **Status**: {o['status'].upper()}\n"
                f"* **Total**: INR {o['total']:,.0f}\n"
                f"* **Date**: {o['date']}\n"
                f"* **Items**: {o['items_summary']}\n\n"
                f"Want to see more recent orders or the full order list?"
            )
        return "No orders found in the database yet."

    # --- 4. Order count / orders summary ---
    if any(phrase in q for phrase in ["how many orders", "total orders", "order count", "orders summary", "number of orders"]):
        total_o = sales.get("total_orders", 0)
        m_orders = sales.get("monthly_orders", 0)
        m_sales = _format_inr(sales.get("monthly_sales", 0))
        return (
            f"### Orders Overview\n\n"
            f"* **Lifetime Orders**: {total_o} placed\n"
            f"* **This Month**: {m_orders} orders totaling {m_sales}\n"
            f"* **Fulfillment**: Synchronized with Delhivery Express\n"
        )

    # --- 5. Order status / what order is ... ---
    order_num_match = re.search(r'\b(ord[-\s]?\d+|#?\d{3,})\b', q)
    if order_num_match and "order" in q:
        num = order_num_match.group(1).replace(" ", "").upper()
        matched = next((o for o in recent_orders if num in o["order_number"].upper()), None)
        if matched:
            o = matched
            return (
                f"### Order {o['order_number']}\n\n"
                f"* **Customer**: {o['customer']}\n"
                f"* **Status**: {o['status'].upper()}\n"
                f"* **Total**: INR {o['total']:,.0f}\n"
                f"* **Date**: {o['date']}\n"
                f"* **Items**: {o['items_summary']}\n"
            )
        return f"I couldn't find an order matching '{num}' in recent records. Check the **Orders** tab for the full list."

    # --- 6. Purchasing / Restocking ---
    if (
        (("what" in q or "which" in q or "suggest" in q) and "buy" in q)
        or "should i buy" in q
        or "should we buy" in q
        or "restock" in q
        or "reorder" in q
        or "stock up" in q
        or ("recommend" in q and "product" in q)
    ):
        advice_parts = []
        if low_stock:
            advice_parts.append("### Urgent Restock Recommendations")
            advice_parts.append("These items are running low in your Delhi fulfillment center:")
            for item in low_stock[:4]:
                current = item.get("stock_qty", 0)
                min_lvl = item.get("min_stock_level", 4)
                suggested = max(min_lvl * 4, 25)
                advice_parts.append(
                    f"* **{item['name']}** (SKU: `{item['sku']}`): {current} units left (min: {min_lvl}) — *Reorder at least {suggested} units*"
                )
        else:
            advice_parts.append("### Inventory Status")
            advice_parts.append("All REIHH pieces currently meet safety stock thresholds. No urgent reorders required today.")

        valid_top = [p for p in top_products if (p.get("total_quantity") or 0) > 0]
        if valid_top:
            advice_parts.append("\n### Top-Selling Products (Demand-Based Restock)")
            for p in valid_top[:3]:
                qty = p.get("total_quantity", 0)
                rev = _format_inr(p.get("total_revenue", 0))
                advice_parts.append(f"* **{p['name']}**: {qty} units sold ({rev})")
            advice_parts.append(f"\n**Recommendation**: Keep buffer stock for **{valid_top[0]['name']}** to sustain momentum.")
        else:
            advice_parts.append("\n**Tip**: Focus marketing on the *Arden Grey Wash Jacket* and *Alba Straight Fit Denim* to drive initial collection volume.")

        return "\n".join(advice_parts)

    # --- 7. Specific product query ---
    if ("product" in q or "item" in q or "stock" in q or "inventory" in q) and not any(x in q for x in ["buy", "restock", "reorder"]):
        # Low stock check
        if "low" in q or "out of" in q or "running out" in q:
            if not low_stock:
                return "All products are above their safety stock thresholds right now."
            items_text = "\n".join(
                f"* **{item['name']}**: {item['stock_qty']} in stock (min: {item['min_stock_level']})"
                for item in low_stock
            )
            return f"### {len(low_stock)} Low-Stock Alert(s)\n\n{items_text}"

        # General inventory question
        total_prods = metrics.get("inventory_summary", {}).get("total_products", 0)
        low_count = metrics.get("inventory_summary", {}).get("low_stock_products", 0)
        return (
            f"### Inventory Overview\n\n"
            f"* **Active Products**: {total_prods} in catalog\n"
            f"* **Low Stock**: {low_count} items below safety level\n"
            f"* **Fulfillment Hub**: REIHH Studio, Delhi NCR\n\n"
            "Ask me which products to restock or view top sellers!"
        )

    # --- 8. Best / top / fastest selling ---
    if any(w in q for w in ["best", "fastest", "top sell", "selling", "popular", "most sold"]) and "customer" not in q:
        valid_top = [p for p in top_products if (p.get("total_quantity") or 0) > 0]
        if not valid_top:
            return "Sales data is still accumulating — no best sellers to rank yet. Check back after more orders come in."
        lines = "\n".join(
            f"* **{item['name']}**: {item.get('total_quantity', 0)} units ({_format_inr(item.get('total_revenue', 0))})"
            for item in valid_top[:4]
        )
        return f"### Top-Performing REIHH Products\n\n{lines}"

    # --- 9. Worst / slowest selling ---
    if any(w in q for w in ["least", "worst", "slowest", "not selling", "low sales"]):
        valid_bottom = [p for p in bottom_products if (p.get("total_revenue") or 0) > 0]
        if not valid_bottom:
            return "All catalog pieces currently show balanced demand across orders."
        lines = "\n".join(
            f"* **{item['name']}**: {_format_inr(item.get('total_revenue', 0))} in sales"
            for item in valid_bottom[:3]
        )
        return f"### Least-Selling Products by Revenue\n\n{lines}\n\n*Consider a 15% promotional discount to stimulate these lines.*"

    # --- 10. Revenue & Profit ---
    if any(phrase in q for phrase in ["sales", "revenue", "profit", "margin", "earnings", "how much money", "how much have", "income", "financial"]):
        tot_s = _format_inr(sales.get("total_sales", 0))
        tot_p = _format_inr(profit.get("profit", 0))
        tot_e = _format_inr(profit.get("expenses", 0))
        sched = _format_inr(profit.get("scheduled_expenses", 0))
        cogs = _format_inr(profit.get("cogs", 0))
        margin_pct = (profit.get("profit", 0) / max(sales.get("total_sales", 1), 1)) * 100

        recurring_note = (
            f"\n* **Upcoming Recurring**: {sched} scheduled (kept separate until billing date)"
            if profit.get("scheduled_expenses", 0) > 0
            else ""
        )

        return (
            f"### Financial Performance Summary\n\n"
            f"* **Total Revenue**: {tot_s} across {sales.get('total_orders', 0)} orders\n"
            f"* **COGS**: {cogs}\n"
            f"* **Realized Expenses**: {tot_e}{recurring_note}\n"
            f"* **Estimated Net Profit**: **{tot_p}** (Net Margin: **{margin_pct:.1f}%**)\n"
            f"* **Outstanding Receivables**: {_format_inr(outstanding)}\n"
        )

    # --- 11. Monthly comparison ---
    if any(phrase in q for phrase in ["compared", "last month", "this month", "month over month", "growth", "change"]):
        current = sales.get("monthly_sales", 0)
        previous = sales.get("previous_month_sales", 0)
        if previous <= 0:
            return f"This month has recorded {_format_inr(current)} in sales across {sales.get('monthly_orders', 0)} orders. No prior month baseline available yet."
        change = ((current - previous) / previous) * 100
        direction = "increased" if change >= 0 else "decreased"
        return (
            f"### Month-over-Month Sales\n\n"
            f"Sales **{direction} by {abs(change):.1f}%** this month.\n"
            f"* **This Month**: {_format_inr(current)} ({sales.get('monthly_orders', 0)} orders)\n"
            f"* **Last Month**: {_format_inr(previous)} ({sales.get('previous_month_orders', 0)} orders)\n"
        )

    # --- 12. Customer queries ---
    if any(w in words for w in ["customer", "customers", "clients", "crm", "buyer", "buyers"]):
        cust_count = sales.get("total_customers", 0)
        if any(phrase in q for phrase in ["best customer", "top customer", "biggest customer", "most spent", "who bought most"]):
            if top_customers:
                lines = "\n".join(
                    f"* **{c['name']}**: {c['order_count']} orders — INR {c['total_spent']:,.0f} lifetime"
                    for c in top_customers[:5]
                )
                return f"### Top Customers by Lifetime Spend\n\n{lines}"
            return "No customer purchase data found yet."

        if top_customers:
            best = top_customers[0]
            return (
                f"### Customer Base Overview\n\n"
                f"* **Total Customers**: {cust_count}\n"
                f"* **Top Customer**: {best['name']} — INR {best['total_spent']:,.0f} lifetime ({best['order_count']} orders)\n"
                f"* **Outstanding Receivables**: {_format_inr(outstanding)}\n"
                "* **Updates**: Customers receive WhatsApp alerts on dispatch with live tracking links\n"
            )
        return (
            f"### Customer Base\n\n"
            f"* **Total Registered**: {cust_count} customers\n"
            f"* **Outstanding Receivables**: {_format_inr(outstanding)}\n"
        )

    # --- 13. Expense breakdown ---
    if any(w in q for w in ["expense", "spend", "spending", "cost", "costs", "overhead"]):
        tot_e = _format_inr(profit.get("expenses", 0))
        sched = _format_inr(profit.get("scheduled_expenses", 0))
        sched_note = f" (plus {sched} in upcoming recurring commitments)" if profit.get("scheduled_expenses", 0) > 0 else ""

        lines = ""
        if expense_breakdown:
            lines = "\n" + "\n".join(
                f"* **{e['category']}**: INR {e['total']:,.0f} ({e['count']} entries)"
                for e in expense_breakdown[:6]
            )

        return (
            f"### Expense Breakdown\n\n"
            f"Realized expenses to date: **{tot_e}**{sched_note}\n"
            f"{lines}\n\n"
            "Future recurring entries are only deducted as their billing dates arrive."
        )

    # --- 14. Delivery & Delhivery Logistics ---
    if any(w in q for w in ["delhivery", "courier", "dispatch", "shipment", "transit", "shipping", "carrier", "delivery status", "track"]):
        shipped = sum(1 for o in recent_orders if o.get("status") == "shipped")
        delivered = sum(1 for o in recent_orders if o.get("status") == "delivered")
        return (
            f"### Delhivery Logistics Overview\n\n"
            f"* **Carrier**: Delhivery Surface & Express with 12-digit waybills\n"
            f"* **Hub**: REIHH Studio Central Warehouse, Delhi NCR\n"
            f"* **Recent Shipped**: {shipped} orders in transit\n"
            f"* **Recent Delivered**: {delivered} orders completed\n"
            f"* **Tracking**: Each order generates a live link at delhivery.com\n"
            f"* **Customer Notifications**: WhatsApp dispatch alerts with invoice PDF on delivery\n\n"
            "Test live dispatch from the **Orders** tab or view the **Delivery Agent POV**."
        )

    # --- 15. Performance summary ---
    if any(w in q for w in ["summary", "performance", "overview", "dashboard", "snapshot", "report", "how are we doing", "how is business"]):
        return _summary_from_snapshot(snapshot)

    # --- 16. Clarification / follow-up ---
    if any(phrase in q for phrase in ["what do you mean", "what do u mean", "clarify", "i don't understand", "explain that", "tell me more", "meaning", "elaborate"]):
        total_s = _format_inr(sales.get("total_sales", 0))
        prof = _format_inr(profit.get("profit", 0))
        rev = _format_inr(profit.get("revenue", 0))
        exp = _format_inr(profit.get("expenses", 0))
        cogs = _format_inr(profit.get("cogs", 0))
        return (
            "Let me break this down simply:\n\n"
            f"1. **Total Sales ({total_s})**: Gross amount across {sales.get('total_orders', 0)} customer orders\n"
            f"2. **COGS ({cogs})**: Manufacturing / garment cost of goods sold\n"
            f"3. **Expenses ({exp})**: Realized operational costs (rent, logistics, etc.)\n"
            f"4. **Net Profit ({prof})**: What remains after COGS and expenses are deducted from revenue ({rev})\n\n"
            "Want me to show the **restock list**, **expense breakdown**, or **customer ranking**?"
        )

    # --- 17. Courtesy / Closings ---
    if any(w in words for w in ["thanks", "thank", "bye", "goodbye", "cya", "cheers"]) or "thank you" in q:
        return (
            "You're welcome! I'm here 24/7 — monitoring inventory, tracking Delhivery orders, and keeping your profit figures sharp. "
            "Let me know whenever you need an update!"
        )

    # --- 18. What can you do / help ---
    if any(phrase in q for phrase in ["what can you", "what do you", "capabilities", "features", "what can i ask"]):
        return (
            "### What I Can Help With\n\n"
            "* **Orders** — Latest order, order status, recent orders list\n"
            "* **Inventory** — Low stock alerts, restock recommendations, catalog overview\n"
            "* **Sales & Profit** — Revenue, margins, month-over-month growth\n"
            "* **Customers** — Top customers, outstanding balances, CRM overview\n"
            "* **Expenses** — Category breakdown, realized vs scheduled\n"
            "* **Delivery** — Delhivery tracking, shipment status\n\n"
            "Just ask in plain English — I understand business questions naturally!"
        )

    # --- 19. Profit specifically ---
    if "profit" in words or "loss" in words or "net" in words:
        prof = profit.get("profit", 0)
        direction = "profit" if prof >= 0 else "loss"
        return (
            f"### Net {direction.title()} Position\n\n"
            f"* **Net Profit**: {_format_inr(prof)}\n"
            f"* **Revenue**: {_format_inr(profit.get('revenue', 0))}\n"
            f"* **COGS**: {_format_inr(profit.get('cogs', 0))}\n"
            f"* **Realized Expenses**: {_format_inr(profit.get('expenses', 0))}\n"
        )

    # --- 20. Contextual fallback - still better than a stat dump ---
    total_o = sales.get("total_orders", 0)
    tot_s = _format_inr(sales.get("total_sales", 0))
    latest = f" Latest order: **{recent_orders[0]['order_number']}** from {recent_orders[0]['customer']}." if recent_orders else ""

    return (
        f"I'm not sure exactly what you're asking, but here's a quick snapshot: "
        f"**{total_o} orders**, **{tot_s} in revenue**.{latest}\n\n"
        "Try asking:\n"
        "* 'What was the latest order?'\n"
        "* 'Which products should I restock?'\n"
        "* 'Who are our best customers?'\n"
        "* 'How are sales this month?'\n"
        "* 'What can you do?'"
    )


def _summary_from_snapshot(snapshot: dict) -> str:
    sales = snapshot.get("metrics", {}).get("sales_summary", {})
    profit = snapshot.get("metrics", {}).get("revenue_profit", {})
    top = snapshot.get("metrics", {}).get("top_products", [])
    low = snapshot.get("low_stock", [])
    recent_orders = snapshot.get("recent_orders_detail", [])
    top_customers = snapshot.get("top_customers", [])

    current = sales.get("monthly_sales", 0)
    previous = sales.get("previous_month_sales", 0)
    if previous > 0:
        change = ((current - previous) / previous) * 100
        trend = f"Sales {'increased' if change >= 0 else 'decreased'} by {abs(change):.1f}% this month ({_format_inr(current)} vs {_format_inr(previous)} last month)."
    else:
        trend = f"This month has recorded {_format_inr(current)} in sales."

    valid_top = [p for p in top if (p.get("total_quantity") or 0) > 0]
    best = f" **{valid_top[0]['name']}** is the top revenue generator." if valid_top else ""
    restock = ""
    if low:
        names = ", ".join(item["name"] for item in low[:3])
        restock = f" **{names}** {'is' if len(low) == 1 else 'are'} near minimum stock."
    best_cust = f" Top customer: **{top_customers[0]['name']}** (INR {top_customers[0]['total_spent']:,.0f})." if top_customers else ""
    latest_order = f" Latest order: **{recent_orders[0]['order_number']}** from {recent_orders[0]['customer']} ({recent_orders[0]['status'].upper()})." if recent_orders else ""

    return (
        f"{trend}{best} Net profit: **{_format_inr(profit.get('profit', 0))}**.{restock}{best_cust}{latest_order}"
    )


def _ask_gemini(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """Call Google Gemini API for conversational AI responses."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=_build_system_prompt(snapshot),
        )

        # Build conversation history
        history = []
        if conversation_history:
            for msg in conversation_history[-8:]:
                role = "user" if msg.get("role") == "user" else "model"
                text = msg.get("text") or msg.get("content") or ""
                if text:
                    history.append({"role": role, "parts": [text]})

        chat = model.start_chat(history=history)
        response = chat.send_message(query)
        return response.text
    except Exception as exc:
        logger.warning("Gemini AI query failed: %s", exc)
        return None


def _ask_groq(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """Call Groq API for conversational AI responses."""
    if not settings.GROQ_API_KEY:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        messages = [
            {
                "role": "system",
                "content": _build_system_prompt(snapshot),
            },
        ]
        if conversation_history:
            for msg in conversation_history[-8:]:
                r = "user" if msg.get("role") == "user" else "assistant"
                t = msg.get("text") or msg.get("content") or ""
                if t:
                    messages.append({"role": r, "content": t})

        messages.append({"role": "user", "content": query})
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.3,
            max_tokens=600,
        )
        return completion.choices[0].message.content
    except Exception as exc:
        logger.warning("Groq AI query failed: %s", exc)
        return None


def _ask_model(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """Try Gemini first, then Groq, then return None for rule-based fallback."""
    return _ask_gemini(query, snapshot, conversation_history) or _ask_groq(query, snapshot, conversation_history)


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
