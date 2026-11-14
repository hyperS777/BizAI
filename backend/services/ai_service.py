"""
Pluggable AI assistant grounded in live business records with multi-turn conversational context.
Supports Gemini (primary), Groq (secondary), and a rich intelligent business NLP engine.
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
from models.integration import AppSetting
from models.order import Order as OrderModel, OrderItem as OrderItemModel
from models.customer import Customer as CustomerModel
from models.product import Product as ProductModel
from services.report_service import build_business_snapshot

logger = logging.getLogger("bizai.ai")


def _format_inr(val: float) -> str:
    return f"INR {val:,.0f}"


def _sanitize_input(query: str) -> tuple[str, str, set[str]]:
    """Clean query string and apply fuzzy typo normalization."""
    clean = re.sub(r'^[\[\(\{<"\'\s]+|[\]\)\}<>"\'\s]+$', '', query).strip()
    norm = re.sub(r'[^a-zA-Z0-9\s]', ' ', clean).lower()
    
    # Fuzzy typo corrections for high-frequency business terms
    norm = re.sub(r'\borde+r+s?\b', 'order', norm)
    norm = re.sub(r'\b(frst|firts|firstt|1st)\b', 'first', norm)
    norm = re.sub(r'\b(latst|lastt|newst)\b', 'latest', norm)
    norm = re.sub(r'\bcust[o0]?m[e3]r?s?\b', 'customer', norm)
    norm = re.sub(r'\bpr[o0]d[u0]ct?s?\b', 'product', norm)
    norm = re.sub(r'\bdelhiv[e3]ry\b', 'delhivery', norm)
    norm = re.sub(r'\bshipp?in[g]?\b', 'shipping', norm)
    norm = re.sub(r'\bprof?i[t]?s?\b', 'profit', norm)
    norm = re.sub(r'\bexpens[e3]s?\b', 'expense', norm)
    norm = re.sub(r'\brest[o0]ck\b', 'restock', norm)

    words = set(norm.split())
    return clean.lower(), norm, words


def _build_system_prompt(snapshot: dict) -> str:
    """Build a rich system prompt with full business database context for the LLM."""
    metrics = snapshot.get("metrics", {})
    sales = metrics.get("sales_summary", {})
    profit = metrics.get("revenue_profit", {})
    top_products = metrics.get("top_products", [])
    low_stock = snapshot.get("low_stock", [])
    recent_orders = snapshot.get("recent_orders_detail", [])
    first_order = snapshot.get("first_order_detail")
    all_products = snapshot.get("all_products_catalog", [])
    order_counts = snapshot.get("order_status_counts", {})
    top_customers = snapshot.get("top_customers", [])
    expense_breakdown = snapshot.get("expense_breakdown", [])
    outstanding = snapshot.get("outstanding_payments", 0)

    # First and latest order strings
    first_order_text = (
        f"Order #{first_order['order_number']} | Customer: {first_order['customer']} | "
        f"Total: INR {first_order['total']:,.0f} | Date: {first_order['date']} | Status: {first_order['status'].upper()} | "
        f"Items: {first_order['items_summary']}"
        if first_order else "No first order on record."
    )

    recent_orders_text = "\n".join(
        f"  - {o['order_number']} | {o['customer']} | {o['status'].upper()} | INR {o['total']:,.0f} | {o['date']} | {o['items_summary']}"
        for o in recent_orders[:10]
    ) or "  No recent orders."

    products_text = "\n".join(
        f"  - {p['name']} (SKU: {p['sku']}): INR {p['price']:,.0f} (Stock: {p['stock_qty']} units)"
        for p in all_products[:25]
    ) or "  No catalog data."

    top_products_text = "\n".join(
        f"  - {p['name']}: {p.get('total_quantity', 0)} units sold, INR {p.get('total_revenue', 0):,.0f} revenue"
        for p in top_products[:5] if p.get('total_revenue', 0) > 0
    ) or "  No sales data yet."

    low_stock_text = "\n".join(
        f"  - {item['name']} (SKU: {item['sku']}): {item['stock_qty']} left (min safety buffer: {item['min_stock_level']})"
        for item in low_stock[:6]
    ) or "  All active items meet or exceed safety stock thresholds."

    customers_text = "\n".join(
        f"  - {c['name']} ({c.get('tier', 'Regular')}): {c['order_count']} orders, INR {c['total_spent']:,.0f} lifetime spend"
        for c in top_customers[:6]
    ) or "  No customer data."

    expense_text = "\n".join(
        f"  - {e['category']}: INR {e['total']:,.0f} ({e['count']} transactions)"
        for e in expense_breakdown[:6]
    ) or "  No expense data."

    status_text = ", ".join(f"{k.capitalize()}: {v}" for k, v in order_counts.items()) or "Synchronized"

    return f"""You are BizAI, the intelligent business co-pilot and commercial advisor for REIHH Studio — a luxury Indian fashion and apparel house based in New Delhi.

You have LIVE access to the entire business database (orders, catalog, inventory, expenses, customer ledger, Delhivery courier tracking, profit & loss). Answer questions conversationally, helpfully, and accurately using the live data below. You know everything about the site and business operations.

=== LIVE BUSINESS DATABASE SNAPSHOT ===

BRAND: REIHH Studio (HQ: Okhla Phase III, New Delhi)
CHANNEL: Luxury Womenswear, Menswear, Premium Denim & Tailored Outerwear

FINANCIAL PERFORMANCE:
- Total Sales: INR {sales.get('total_sales', 0):,.0f} across {sales.get('total_orders', 0)} orders
- This Month Sales: INR {sales.get('monthly_sales', 0):,.0f} ({sales.get('monthly_orders', 0)} orders)
- Previous Month Sales: INR {sales.get('previous_month_sales', 0):,.0f}
- Net Profit: INR {profit.get('profit', 0):,.0f}
- Cost of Goods Sold (COGS): INR {profit.get('cogs', 0):,.0f}
- Realized Operating Expenses: INR {profit.get('expenses', 0):,.0f}
- Upcoming Scheduled Recurring Commitments: INR {profit.get('scheduled_expenses', 0):,.0f} (tracked separately, not deducted from current profit)
- Outstanding Receivables: INR {outstanding:,.0f}
- Total Customers: {sales.get('total_customers', 0)}

FIRST EVER ORDER RECORDED:
{first_order_text}

RECENT ORDERS (newest first):
{recent_orders_text}

ORDER STATUSES: {status_text}

TOP REVENUE GENERATING GARMENTS:
{top_products_text}

ACTIVE APPAREL CATALOG:
{products_text}

LOW STOCK ALERTS:
{low_stock_text}

TOP VIP & WHOLESALE CUSTOMERS:
{customers_text}

OPERATING EXPENSES (REALIZED):
{expense_text}

COURIER / LOGISTICS:
- Partner: Delhivery Express (Air & Surface)
- Packing Slips: Formal warehouse packing slips with scannable Delhivery AWB barcodes are auto-generated.
- Tracking portal: https://www.delhivery.com/track/package/[waybill]
=== END DATABASE SNAPSHOT ===

GUIDELINES:
1. Always ground your facts in the database numbers above. Never invent fake revenue or non-existent orders.
2. For greetings ("hi", "hello"), reply with warm sophistication and suggest 3 high-impact questions.
3. If asked about the first order, cite the exact order number, customer name, date, items, and total from the first order data above.
4. If asked about logistics, summarize Delhivery delivery statuses and tracking.
5. If asked for business or marketing advice, provide strategic, apparel-focused insights (pricing, safety buffer restocking, margin optimization).
6. Use markdown formatting (bolding, headers, bullet points).
"""


def _fallback_conversational_answer(
    query: str,
    snapshot: dict,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    db: Optional[Session] = None,
) -> str:
    """
    Rich intelligent fallback NLP engine.
    Comprehensive coverage across orders, customers, catalog, finances, logistics, and business strategy.
    """
    metrics = snapshot.get("metrics", {})
    sales = metrics.get("sales_summary", {})
    profit = metrics.get("revenue_profit", {})
    top_products = metrics.get("top_products", [])
    low_stock = snapshot.get("low_stock", [])
    recent_orders = snapshot.get("recent_orders_detail", [])
    first_order = snapshot.get("first_order_detail")
    all_products = snapshot.get("all_products_catalog", [])
    order_counts = snapshot.get("order_status_counts", {})
    top_customers = snapshot.get("top_customers", [])
    expense_breakdown = snapshot.get("expense_breakdown", [])

    clean, q_norm, words = _sanitize_input(query)

    # 1. First order / earliest order (handles typos like "ordeer", "frst")
    if (
        "first order" in q_norm
        or "earliest order" in q_norm
        or "initial order" in q_norm
        or "oldest order" in q_norm
        or "order 1" in q_norm
        or "order #1" in q_norm
        or "first sale" in q_norm
        or "first purchase" in q_norm
        or (("first" in q_norm or "earliest" in q_norm or "initial" in q_norm or "oldest" in q_norm) and "order" in q_norm)
        or "who made the first" in q_norm
        or "who placed the first" in q_norm
        or "who was the first customer" in q_norm
    ):
        if first_order:
            return (
                f"### First Order Recorded (REIHH Studio)\n\n"
                f"* **Order #**: `{first_order['order_number']}`\n"
                f"* **Customer**: **{first_order['customer']}**\n"
                f"* **Status**: {first_order['status'].upper()}\n"
                f"* **Total Value**: INR {first_order['total']:,.0f}\n"
                f"* **Date**: {first_order['date']}\n"
                f"* **Items Purchased**: {first_order['items_summary']}\n\n"
                f"This was the very first commercial order booked into REIHH's operations! Would you like details on subsequent orders or customer history?"
            )
        return "No orders have been recorded in the database yet."

    # 2. Latest order / most recent order
    if (
        "latest order" in q_norm
        or "last order" in q_norm
        or "newest order" in q_norm
        or "most recent order" in q_norm
        or (("latest" in q_norm or "newest" in q_norm) and "order" in q_norm)
    ):
        if recent_orders:
            o = recent_orders[0]
            return (
                f"### Most Recent Order (REIHH Studio)\n\n"
                f"* **Order #**: `{o['order_number']}`\n"
                f"* **Customer**: **{o['customer']}**\n"
                f"* **Status**: {o['status'].upper()}\n"
                f"* **Total Amount**: INR {o['total']:,.0f}\n"
                f"* **Date**: {o['date']}\n"
                f"* **Items**: {o['items_summary']}\n\n"
                f"You can view tracking or print Delhivery packing slips in the **Orders** section."
            )
        return "No orders found in the database yet."

    # 3. Direct Order lookup by order number (e.g. ORD-REIHH-010, #ORD-..., ORD-...)
    ord_match = re.search(r'\b(ORD-[A-Z0-9-]+)\b', query, re.IGNORECASE)
    if ord_match and db:
        ord_num = ord_match.group(1).upper()
        ord_rec = db.query(OrderModel).filter(OrderModel.order_number == ord_num).first()
        if ord_rec:
            items = db.query(OrderItemModel).filter(OrderItemModel.order_id == ord_rec.id).all()
            items_str = ", ".join(f"{it.quantity}x {it.product.name if it.product else 'Garment'}" for it in items)
            return (
                f"### Order Details: {ord_rec.order_number}\n\n"
                f"* **Customer**: {ord_rec.customer.name if ord_rec.customer else 'Guest'}\n"
                f"* **Status**: {ord_rec.status.upper()}\n"
                f"* **Total**: INR {ord_rec.total_amount:,.0f}\n"
                f"* **Items**: {items_str or 'No items'}\n"
                f"* **Date**: {ord_rec.created_at.strftime('%d %b %Y, %I:%M %p') if ord_rec.created_at else 'N/A'}\n"
                f"* **Carrier**: {ord_rec.tracking_company or 'Delhivery Express'} ({ord_rec.tracking_number or 'AWB pending'})\n"
                f"* **Shipping Destination**: {ord_rec.shipping_address or (ord_rec.customer.address if ord_rec.customer else 'Delhi, India')}\n"
            )

    # 4. Customer profile lookup (e.g. "who is Amber Abbas?", "orders of Amber", "tell me about customer Ramji")
    if db and any(w in q_norm for w in ["who is", "customer", "client", "buyer", "orders of", "spent"]):
        for c in db.query(CustomerModel).all():
            if c.name and c.name.lower() in q_norm:
                c_orders = db.query(OrderModel).filter(OrderModel.customer_id == c.id).order_by(OrderModel.created_at.desc()).all()
                orders_line = ", ".join(f"`{o.order_number}` (INR {o.total_amount:,.0f})" for o in c_orders[:4]) or "No orders yet"
                return (
                    f"### Customer Dossier: {c.name}\n\n"
                    f"* **Client Tier**: **{c.tier or 'Regular'}**\n"
                    f"* **Contact**: {c.email or 'No email'} · {c.phone or 'No phone'}\n"
                    f"* **Lifetime Orders**: {len(c_orders)} orders\n"
                    f"* **Recent Orders**: {orders_line}\n"
                    f"* **Outstanding Balance**: INR {c.outstanding_balance or 0:,.0f}\n"
                    f"* **Delivery Address**: {c.address or 'Delhi NCR, India'}\n"
                    f"* **Notes & Fit**: {c.notes or 'No special fit preferences on file'}\n"
                )

    # 5. Greetings & check-ins
    greeting_phrases = [
        "good morning", "good afternoon", "good evening", "how are you", "how u doing",
        "how are u", "hows it going", "how's it going", "who are you", "what can you do", "whats up",
    ]
    greeting_words = {"hello", "hi", "hey", "namaste", "help", "greetings"}
    if any(g in q_norm for g in greeting_phrases) or (words & greeting_words):
        return (
            "Hello! I am **BizAI**, your intelligent business co-pilot for REIHH Studio.\n\n"
            "I have live database access to your complete apparel catalog, customer ledger, Delhivery courier dispatches, and profit margins. Here are specific things you can ask me:\n"
            "* **'What was the first order?'** — Origin order and earliest customer\n"
            "* **'What was the latest order?'** — Real-time recent sale and courier status\n"
            "* **'What products should I restock?'** — Safety stock reorder recommendations\n"
            "* **'Break down our net profit and expenses.'** — Realized vs scheduled cash flow\n"
            "* **'What is our delivery status with Delhivery?'** — Dispatch & in-transit pulse\n"
            "* **'What products do we sell?'** — Overview of active garment collections\n\n"
            "How can I assist your business decisions today?"
        )

    # 6. Product catalog overview ("what products do we sell", "catalog", "garments", "collection")
    if any(w in q_norm for w in ["what products", "list products", "catalog", "show products", "all products", "what clothes", "garments", "apparel", "collection"]):
        if all_products:
            lines = [f"* **{p['name']}** (SKU: `{p['sku']}`) — INR {p['price']:,.0f} | Stock: {p['stock_qty']} units" for p in all_products[:10]]
            return (
                f"### REIHH Studio Active Collection ({len(all_products)} Styles)\n\n"
                + "\n".join(lines) +
                f"\n\nIncludes Womenswear, Menswear, Denim & Tailored Outerwear. You can edit sizing variants, upload high-res images, and update compare-at MRP prices in the **Products** section."
            )

    # 7. Restocking & Inventory priorities
    if any(w in q_norm for w in ["restock", "buy", "purchase", "reorder", "low stock", "safety stock"]):
        if low_stock:
            lines = [
                f"* **{item['name']}** (SKU: `{item['sku']}`): **{item['stock_qty']} units left** (Safety min: {item['min_stock_level']}) -> *Recommend reordering at least {item['min_stock_level'] * 2} units*."
                for item in low_stock[:5]
            ]
            return (
                f"### [Restock Priority] Urgent Warehouse Reorders\n\n"
                f"The following garments are running below safety stock thresholds in your Delhi fulfillment center:\n\n"
                + "\n".join(lines) +
                f"\n\n**Actionable Advice**: Generate an automated Purchase Order draft in the **Inventory** tab to restock before marketing campaigns."
            )
        return (
            "### [Inventory Status] Warehouse Stock Level\n\n"
            "Good news! All active pieces in the REIHH collection currently meet or exceed safety stock thresholds in the Delhi fulfillment center. No urgent reorders are required today."
        )

    # 8. Best sellers & top products
    if any(w in q_norm for w in ["best seller", "top seller", "top product", "fastest", "popular", "selling fastest", "highest sales"]):
        if top_products:
            lines = [
                f"* **{p['name']}**: {p.get('total_quantity', 0)} units sold (INR {p.get('total_revenue', 0):,.0f} gross revenue)"
                for p in top_products[:5] if p.get('total_revenue', 0) > 0
            ]
            return (
                f"### Top-Selling Customer Favorites (Commercial Turnover)\n\n"
                + "\n".join(lines) +
                f"\n\n**Strategic Advice**: Prioritize maintaining continuous fabric and stitching buffers for your high-turnover pieces to prevent stockouts."
            )
        return "Sales turnover is still accumulating. Check back once more orders are completed."

    # 9. Profit & Expenses Breakdown
    if any(w in q_norm for w in ["profit", "cogs", "margin", "expense", "spend", "net profit", "costs", "financial"]):
        total_s = sales.get("total_sales", 0)
        p = profit.get("profit", 0)
        c = profit.get("cogs", 0)
        e = profit.get("expenses", 0)
        margin_pct = (p / total_s * 100) if total_s > 0 else 0
        cats = [f"* **{item['category']}**: INR {item['total']:,.0f}" for item in expense_breakdown[:5]]
        return (
            f"### Financial Performance & Margin Breakdown\n\n"
            f"* **Gross Sales**: INR {total_s:,.0f}\n"
            f"* **Manufacturing Cost (COGS)**: INR {c:,.0f}\n"
            f"* **Operating Expenses (Realized)**: INR {e:,.0f}\n"
            f"* **Net Estimated Profit**: **INR {p:,.0f}** ({margin_pct:.1f}% net margin)\n\n"
            f"**Major Incurred Spend Categories**:\n"
            + "\n".join(cats) +
            f"\n\n*Note: Future scheduled recurring payments are tracked separately and do not distort current profit figures.*"
        )

    # 10. Delhivery shipping & Logistics pulse
    if any(w in q_norm for w in ["delhivery", "shipping", "courier", "delivery", "track", "dispatch", "awb"]):
        delivered = order_counts.get("delivered", 0)
        shipped = order_counts.get("shipped", 0)
        pending = order_counts.get("confirmed", 0) + order_counts.get("pending", 0)
        return (
            f"### Delhivery Fulfillment Logistics Pulse\n\n"
            f"* **Delivered**: **{delivered} orders completed**\n"
            f"* **In Transit (Out for Delivery)**: **{shipped} shipments** across Delhi NCR\n"
            f"* **Awaiting Dispatch**: **{pending} orders** pending label print\n"
            f"* **Fulfillment Hub**: Okhla Phase III, New Delhi\n"
            f"* **Carrier**: Delhivery Express Surface & Air\n\n"
            f"You can download and print official Delhivery packing slips with scannable barcodes directly from the **Orders** section."
        )

    # 11. Customer count & VIPs
    if any(w in q_norm for w in ["how many customer", "customers", "vip", "client", "who buys", "best customer"]):
        lines = [f"* **{c['name']}** ({c.get('tier', 'VIP')}): {c['order_count']} orders (INR {c['total_spent']:,.0f} lifetime spend)" for c in top_customers[:5]]
        return (
            f"### Customer Portfolio & VIP Concierge\n\n"
            f"Total Client Base: **{sales.get('total_customers', 0)} registered customers**.\n\n"
            f"**Top Customer Accounts by Lifetime Spend**:\n"
            + "\n".join(lines) +
            f"\n\nView client fit notes and manage VIP/Wholesale tiers in the **Customers** tab."
        )

    # 12. Contextual default summary
    total_o = sales.get("total_orders", 0)
    tot_s = _format_inr(sales.get("total_sales", 0))
    latest = f" Most recent order: **{recent_orders[0]['order_number']}** from {recent_orders[0]['customer']}." if recent_orders else ""
    first = f" First order: **{first_order['order_number']}** from {first_order['customer']}." if first_order else ""

    return (
        f"Based on REIHH Studio's live database: **{total_o} orders** totaling **{tot_s} in sales**, with **INR {profit.get('profit', 0):,.0f} net profit**.{first}{latest}\n\n"
        "Here are specific questions you can ask me:\n"
        "1. *'What was the first order?'*\n"
        "2. *'What products should I restock?'*\n"
        "3. *'How is our Delhivery shipping performing?'*\n"
        "4. *'Which items are our top sellers?'*\n"
        "5. *'Break down our net profit and expenses.'*"
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
    api_key: Optional[str] = None,
) -> Optional[str]:
    """Call Google Gemini API for conversational AI responses."""
    key = api_key or settings.GEMINI_API_KEY
    if not key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=_build_system_prompt(snapshot),
        )

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
    api_key: Optional[str] = None,
) -> Optional[str]:
    """Call Groq API for conversational AI responses."""
    key = api_key or settings.GROQ_API_KEY
    if not key:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=key)
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
    db: Optional[Session] = None,
) -> Optional[str]:
    """Check API keys from settings and DB, then try Gemini, then Groq."""
    gemini_key = settings.GEMINI_API_KEY
    groq_key = settings.GROQ_API_KEY
    if db:
        if not gemini_key:
            row = db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").first()
            if row and row.value:
                gemini_key = row.value.strip()
        if not groq_key:
            row = db.query(AppSetting).filter(AppSetting.key == "groq_api_key").first()
            if row and row.value:
                groq_key = row.value.strip()

    return _ask_gemini(query, snapshot, conversation_history, api_key=gemini_key) or _ask_groq(query, snapshot, conversation_history, api_key=groq_key)


def answer_query(
    db: Session,
    user: User,
    query: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> AIQuery:
    snapshot = build_business_snapshot(db)
    response_text = (
        _ask_model(query, snapshot, conversation_history, db=db)
        or _fallback_conversational_answer(query, snapshot, conversation_history, db=db)
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
