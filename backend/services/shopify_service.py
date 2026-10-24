"""Shopify Admin API client and idempotent webhook synchronization."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import settings
from models.customer import Customer
from models.integration import IntegrationEvent, ShopifyWebhookReceipt
from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem, OrderStatus
from models.product import Category, Product, ProductVariant
from models.user import User
from services.integration_service import emit_event, setting_enabled
from services.invoice_service import generate_invoice_from_order, record_payment, void_invoice
from services.product_service import _sync_product_stock


def shopify_connection_status() -> Dict[str, Any]:
    domain = settings.SHOPIFY_STORE_DOMAIN.strip().lower()
    valid_domain = bool(re.fullmatch(r"[a-z0-9][a-z0-9-]*\.myshopify\.com", domain))
    configured = bool(
        valid_domain
        and settings.SHOPIFY_ADMIN_ACCESS_TOKEN
        and settings.SHOPIFY_WEBHOOK_SECRET
    )
    return {
        "configured": configured,
        "domain": domain if valid_domain else "",
        "api_version": settings.SHOPIFY_API_VERSION,
        "webhooks_ready": bool(settings.SHOPIFY_WEBHOOK_SECRET),
        "invoice_links_ready": bool(configured and settings.PUBLIC_API_BASE_URL.strip()),
    }


def verify_shopify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, signature)


def normalize_shopify_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    if text.startswith("gid://shopify/"):
        return text.rsplit("/", 1)[-1]
    return text


def _money(value: Any, default: float = 0.0) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return default


def _shopify_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _admin_user(db: Session) -> User:
    user = (
        db.query(User)
        .join(User.role)
        .filter(User.is_active.is_(True), User.role.has(name="admin"))
        .order_by(User.id.asc())
        .first()
    )
    if not user:
        raise ValueError("No active admin account is available to attribute Shopify records")
    return user


def _upsert_customer(db: Session, payload: Optional[dict], order_payload: dict) -> Customer:
    payload = payload or {}
    external_id = normalize_shopify_id(payload.get("id"))
    email = payload.get("email") or order_payload.get("email") or order_payload.get("contact_email")
    query = db.query(Customer)
    customer = query.filter(Customer.shopify_customer_id == external_id).first() if external_id else None
    if customer is None and email:
        customer = query.filter(Customer.email == str(email).lower()).first()

    first_name = payload.get("first_name") or ""
    last_name = payload.get("last_name") or ""
    full_name = " ".join(part for part in (first_name, last_name) if part).strip()
    shipping = order_payload.get("shipping_address") or payload.get("default_address") or {}
    address = ", ".join(
        str(part).strip()
        for part in (
            shipping.get("address1"),
            shipping.get("address2"),
            shipping.get("city"),
            shipping.get("province"),
            shipping.get("zip"),
            shipping.get("country"),
        )
        if part
    )
    if customer is None:
        customer = Customer(name=full_name or email or f"Shopify customer {external_id or 'unknown'}")
        db.add(customer)
    customer.shopify_customer_id = external_id or customer.shopify_customer_id
    customer.name = full_name or customer.name
    customer.email = str(email).lower() if email else customer.email
    customer.phone = payload.get("phone") or shipping.get("phone") or customer.phone
    customer.address = address or customer.address
    customer.accepts_marketing = bool(
        (payload.get("email_marketing_consent") or {}).get("state") == "subscribed"
    )
    db.flush()
    return customer


def _upsert_product(db: Session, payload: dict) -> Product:
    external_id = normalize_shopify_id(payload.get("id"))
    if not external_id:
        raise ValueError("Shopify product is missing its ID")
    product = db.query(Product).filter(Product.shopify_product_id == external_id).first()
    variants = payload.get("variants") or []
    first_variant = variants[0] if variants else {}
    candidate_sku = first_variant.get("sku") or f"SHOP-{external_id}"
    sku_owner = db.query(Product).filter(Product.sku == candidate_sku).first()
    if sku_owner and (product is None or sku_owner.id != product.id):
        candidate_sku = f"SHOP-{external_id}"
    if product is None:
        product = Product(
            name=payload.get("title") or f"Shopify product {external_id}",
            sku=candidate_sku,
            price=_money(first_variant.get("price")),
            cost_price=0,
        )
        db.add(product)

    product.shopify_product_id = external_id
    product.name = payload.get("title") or product.name
    product.description = payload.get("body_html") or product.description
    product.product_type = payload.get("product_type") or product.product_type
    product.vendor = payload.get("vendor") or product.vendor or "Reihh"
    product.tags = payload.get("tags") if isinstance(payload.get("tags"), str) else ", ".join(payload.get("tags") or [])
    product.image_url = (payload.get("image") or {}).get("src") or product.image_url
    product.is_active = payload.get("status", "active").lower() == "active"
    product.price = _money(first_variant.get("price"), product.price or 0)
    if first_variant.get("compare_at_price"):
        product.compare_at_price = _money(first_variant.get("compare_at_price"))

    option_names = payload.get("options") or []
    if option_names:
        product.option1_name = option_names[0].get("name") or product.option1_name
    if len(option_names) > 1:
        product.option2_name = option_names[1].get("name") or product.option2_name

    collections = payload.get("collections") or []
    preferred_collection = next(
        (item.get("title") for item in collections if (item.get("title") or "").lower() in {"menswear", "womenswear"}),
        None,
    )
    product_type = preferred_collection or product.product_type or "Apparel"
    category = db.query(Category).filter(Category.name == product_type).first()
    if not category:
        category = Category(name=product_type)
        db.add(category)
        db.flush()
    product.category_id = category.id
    db.flush()

    received_variant_ids = set()
    received_skus = set()
    for item in variants:
        variant_external_id = normalize_shopify_id(item.get("id"))
        if not variant_external_id:
            continue
        received_variant_ids.add(variant_external_id)
        selected_options = item.get("option_values") or item.get("selected_options") or []
        option_values = [entry.get("value") for entry in selected_options]
        option1 = option_values[0] if option_values else item.get("option1")
        option2 = option_values[1] if len(option_values) > 1 else item.get("option2")
        variant_sku = item.get("sku") or f"SHOP-{variant_external_id}"
        sku_owner = db.query(ProductVariant).filter(ProductVariant.sku == variant_sku).first()
        if sku_owner and sku_owner.shopify_variant_id != variant_external_id:
            variant_sku = f"SHOP-{variant_external_id}"
        variant = db.query(ProductVariant).filter(
            ProductVariant.shopify_variant_id == variant_external_id
        ).first()
        if variant is None:
            variant = db.query(ProductVariant).filter(
                ProductVariant.product_id == product.id,
                ProductVariant.sku == variant_sku,
            ).first()
        if variant is None:
            variant = ProductVariant(product_id=product.id, sku=variant_sku)
            db.add(variant)
        variant.product_id = product.id
        variant.shopify_variant_id = variant_external_id
        variant.sku = variant_sku
        variant.option1 = option1
        variant.option2 = option2
        variant.price = _money(item.get("price"), product.price or 0)
        if item.get("compare_at_price"):
            product.compare_at_price = _money(item.get("compare_at_price"))
        variant.barcode = item.get("barcode") or variant.barcode
        inventory_item = item.get("inventory_item") or item.get("inventoryItem") or {}
        inventory_item_id = normalize_shopify_id(inventory_item.get("id"))
        if inventory_item_id:
            variant.shopify_inventory_item_id = inventory_item_id
        if item.get("inventory_quantity") is not None:
            variant.stock_qty = max(0, int(item["inventory_quantity"]))
        variant.is_active = item.get("available", True) is not False
        received_skus.add(variant_sku)

    db.flush()
    for current in product.variants:
        if current.shopify_variant_id and current.shopify_variant_id not in received_variant_ids:
            current.is_active = False
    if product.variants:
        _sync_product_stock(product)
    db.flush()
    return product


def _resolve_line_variant(db: Session, line: dict) -> tuple[Product, Optional[ProductVariant]]:
    external_variant_id = normalize_shopify_id(line.get("variant_id"))
    variant = None
    if external_variant_id:
        variant = db.query(ProductVariant).filter(
            ProductVariant.shopify_variant_id == external_variant_id
        ).first()
    sku = line.get("sku")
    if variant is None and sku:
        variant = db.query(ProductVariant).filter(ProductVariant.sku == sku).first()
    product_external_id = normalize_shopify_id(line.get("product_id"))
    product = variant.product if variant else None
    if product is None and product_external_id:
        product = db.query(Product).filter(Product.shopify_product_id == product_external_id).first()
    if product is None and sku:
        product = db.query(Product).filter(Product.sku == sku).first()
    if product is None:
        raise ValueError(f"No BizAI product matches Shopify line item SKU {sku or '(missing)'}")
    return product, variant


def _reconcile_order_payment(db: Session, order: Order, payload: dict) -> None:
    if not setting_enabled(db, "auto_invoice_on_confirm"):
        return
    invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
    if invoice is None:
        invoice = generate_invoice_from_order(db, order.id, commit=False)
    elif not invoice.public_token:
        invoice = generate_invoice_from_order(db, order.id, commit=False)
    if not invoice:
        return
    total = _money(payload.get("total_price"), order.total_amount)
    outstanding = _money(payload.get("total_outstanding"), 0 if payload.get("financial_status") == "paid" else total)
    target_paid = max(0, min(total, round(total - outstanding, 2)))
    current_paid = _money(invoice.paid_amount)
    if target_paid > current_paid:
        record_payment(
            db,
            invoice,
            target_paid - current_paid,
            method="shopify",
            notes=f"Shopify financial status: {payload.get('financial_status', 'unknown')}",
        )
    elif invoice.status != InvoiceStatus.CANCELLED.value:
        invoice.total_amount = total


def _import_order(db: Session, payload: dict, topic: str) -> Order:
    external_id = normalize_shopify_id(payload.get("id"))
    if not external_id:
        raise ValueError("Shopify order is missing its ID")
    order = db.query(Order).filter(Order.shopify_order_id == external_id).first()
    if order:
        if topic == "orders/cancelled" or payload.get("cancelled_at"):
            if order.status in {OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value}:
                order.status = OrderStatus.CANCELLED.value
                void_invoice(db, order.id, commit=False)
            elif order.status not in {OrderStatus.CANCELLED.value}:
                emit_event(db, "shopify.cancel_after_dispatch", "order", order.id, {"shopify_order_id": external_id})
        if topic.startswith("fulfillments/") or payload.get("fulfillment_status") == "fulfilled":
            if order.status == OrderStatus.CONFIRMED.value:
                order.status = OrderStatus.SHIPPED.value
        shipping_address = payload.get("shipping_address")
        if shipping_address:
            order.shipping_address = json.dumps(shipping_address, ensure_ascii=True)
        tracking = payload.get("tracking_info") or {}
        if isinstance(tracking, list):
            tracking = tracking[0] if tracking else {}
        order.tracking_company = payload.get("tracking_company") or tracking.get("company") or order.tracking_company
        order.tracking_number = payload.get("tracking_number") or tracking.get("number") or order.tracking_number
        order.tracking_url = payload.get("tracking_url") or tracking.get("url") or order.tracking_url
        if payload.get("delivery_latitude") is not None and payload.get("delivery_longitude") is not None:
            order.delivery_latitude = float(payload["delivery_latitude"])
            order.delivery_longitude = float(payload["delivery_longitude"])
            order.delivery_updated_at = datetime.now(timezone.utc)
        old_total = _money(order.total_amount)
        if payload.get("currency"):
            order.currency = str(payload["currency"])[:3].upper()
        if payload.get("subtotal_price") is not None:
            order.subtotal_amount = _money(payload["subtotal_price"])
        if payload.get("total_discounts") is not None:
            order.discount_amount = _money(payload["total_discounts"])
        if payload.get("total_price") is not None:
            order.total_amount = _money(payload["total_price"])
        if payload.get("total_shipping_price") is not None:
            order.shipping_amount = _money(payload["total_shipping_price"])
        discount_codes = payload.get("discount_codes") or []
        if discount_codes:
            order.discount_code = discount_codes[0].get("code")
        if payload.get("line_items"):
            db.query(OrderItem).filter(OrderItem.order_id == order.id).delete(synchronize_session=False)
            for line in payload["line_items"]:
                product, variant = _resolve_line_variant(db, line)
                quantity = max(1, int(line.get("quantity") or 1))
                unit_price = _money(line.get("price"), variant.selling_price if variant else product.price)
                db.add(OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    variant_id=variant.id if variant else None,
                    quantity=quantity,
                    unit_price=unit_price,
                    cost_price=variant.unit_cost if variant else product.cost_price,
                    total_price=round(unit_price * quantity, 2),
                    option1=variant.option1 if variant else None,
                    option2=variant.option2 if variant else None,
                    sku=line.get("sku") or (variant.sku if variant else product.sku),
                ))
        invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
        if invoice and invoice.status != InvoiceStatus.CANCELLED.value and order.total_amount != old_total:
            previous_balance = invoice.balance_due
            invoice.total_amount = order.total_amount
            customer = order.customer
            if customer:
                customer.outstanding_balance = max(
                    0,
                    round((customer.outstanding_balance or 0) + invoice.balance_due - previous_balance, 2),
                )
        _reconcile_order_payment(db, order, payload)
        db.flush()
        return order

    customer = _upsert_customer(db, payload.get("customer"), payload)
    lines = payload.get("line_items") or []
    if not lines:
        raise ValueError("Shopify order contains no line items")
    resolved_lines = []
    for line in lines:
        product, variant = _resolve_line_variant(db, line)
        resolved_lines.append((line, product, variant))

    admin = _admin_user(db)
    order_number = payload.get("name") or f"SHOP-{external_id}"
    if db.query(Order.id).filter(Order.order_number == order_number).first():
        order_number = f"SHOP-{external_id}"
    if payload.get("cancelled_at"):
        status = OrderStatus.CANCELLED.value
    elif payload.get("fulfillment_status") == "fulfilled":
        status = OrderStatus.SHIPPED.value
    else:
        status = OrderStatus.CONFIRMED.value
    shipping_set = payload.get("total_shipping_price_set") or {}
    shipping_money = shipping_set.get("shop_money") or {}
    shipping_amount = _money(shipping_money.get("amount", payload.get("total_shipping_price")))
    order = Order(
        order_number=order_number,
        shopify_order_id=external_id,
        currency=(payload.get("currency") or "INR")[:3].upper(),
        customer_id=customer.id,
        status=status,
        subtotal_amount=_money(payload.get("subtotal_price")),
        discount_code=(payload.get("discount_codes") or [{}])[0].get("code"),
        discount_amount=_money(payload.get("total_discounts")),
        shipping_amount=shipping_amount,
        shipping_address=json.dumps(payload.get("shipping_address"), ensure_ascii=True) if payload.get("shipping_address") else None,
        tracking_company=payload.get("tracking_company"),
        tracking_number=payload.get("tracking_number"),
        tracking_url=payload.get("tracking_url"),
        total_amount=_money(payload.get("total_price")),
        notes=f"Imported from Shopify ({external_id})",
        created_by=admin.id,
        created_at=_shopify_datetime(payload.get("created_at")),
    )
    db.add(order)
    db.flush()
    for line, product, variant in resolved_lines:
        quantity = max(1, int(line.get("quantity") or 1))
        unit_price = _money(line.get("price"), variant.selling_price if variant else product.price)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                variant_id=variant.id if variant else None,
                quantity=quantity,
                unit_price=unit_price,
                cost_price=variant.unit_cost if variant else product.cost_price,
                total_price=round(unit_price * quantity, 2),
                option1=(variant.option1 if variant else None),
                option2=(variant.option2 if variant else None),
                sku=line.get("sku") or (variant.sku if variant else product.sku),
            )
        )
    db.flush()
    if order.status != OrderStatus.CANCELLED.value:
        _reconcile_order_payment(db, order, payload)
    emit_event(
        db,
        "shopify.order_imported",
        "order",
        order.id,
        {"shopify_order_id": external_id, "order_number": order.order_number, "currency": order.currency},
    )
    return order


def _apply_inventory_level(db: Session, payload: dict) -> None:
    inventory_item_id = normalize_shopify_id(payload.get("inventory_item_id"))
    variant_id = normalize_shopify_id(payload.get("variant_id"))
    variant = db.query(ProductVariant).filter(
        ProductVariant.shopify_inventory_item_id == inventory_item_id
    ).first() if inventory_item_id else None
    if variant is None and variant_id:
        variant = db.query(ProductVariant).filter(
            ProductVariant.shopify_variant_id == variant_id
        ).first()
    if not variant:
        sku = payload.get("sku")
        variant = db.query(ProductVariant).filter(ProductVariant.sku == sku).first() if sku else None
    if not variant:
        raise ValueError("No BizAI variant matches the Shopify inventory update")
    available = payload.get("available")
    if available is None:
        return
    available = max(0, int(available))
    previous = variant.stock_qty or 0
    variant.stock_qty = available
    _sync_product_stock(variant.product)
    if available != previous:
        from models.inventory import InventoryMovement

        db.add(
            InventoryMovement(
                product_id=variant.product_id,
                variant_id=variant.id,
                quantity_change=available - previous,
                reason="shopify_inventory_sync",
                notes=f"Shopify inventory item {payload.get('inventory_item_id', '')}",
                created_by=_admin_user(db).id,
            )
        )


def process_shopify_webhook(
    db: Session,
    webhook_id: str,
    topic: str,
    payload: dict,
) -> Dict[str, Any]:
    receipt = db.query(ShopifyWebhookReceipt).filter(
        ShopifyWebhookReceipt.webhook_id == webhook_id
    ).first()
    if receipt and receipt.status == "processed":
        return {"status": "duplicate", "webhook_id": webhook_id}
    if receipt is None:
        receipt = ShopifyWebhookReceipt(webhook_id=webhook_id, topic=topic, status="processing")
        db.add(receipt)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return {"status": "duplicate", "webhook_id": webhook_id}
    else:
        receipt.status = "processing"
        receipt.error = None
        db.commit()

    try:
        topic = topic.lower()
        if topic in {"products/create", "products/update"}:
            product = _upsert_product(db, payload)
            entity_type, entity_id = "product", product.id
        elif topic in {"customers/create", "customers/update"}:
            customer = _upsert_customer(db, payload, {})
            entity_type, entity_id = "customer", customer.id
        elif topic in {"orders/create", "orders/updated", "orders/paid", "orders/cancelled", "fulfillments/create", "fulfillments/update"}:
            order_payload = payload
            if topic.startswith("fulfillments/"):
                order_id = normalize_shopify_id(payload.get("order_id"))
                tracking_info = payload.get("tracking_info") or []
                tracking = tracking_info[0] if isinstance(tracking_info, list) and tracking_info else {}
                order_payload = {
                    "id": order_id,
                    "fulfillment_status": "fulfilled",
                    "tracking_company": payload.get("tracking_company") or tracking.get("company"),
                    "tracking_number": payload.get("tracking_number") or tracking.get("number"),
                    "tracking_url": payload.get("tracking_url") or tracking.get("url"),
                }
            order = _import_order(db, order_payload, topic)
            entity_type, entity_id = "order", order.id
        elif topic == "inventory_levels/update":
            _apply_inventory_level(db, payload)
            entity_type, entity_id = "inventory", None
        elif topic == "refunds/create":
            external_order_id = normalize_shopify_id(payload.get("order_id"))
            order = db.query(Order).filter(Order.shopify_order_id == external_order_id).first()
            if order is None:
                raise ValueError("Refund references an unknown Shopify order")
            invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
            if invoice:
                refund_amount = sum(
                    _money(transaction.get("amount"))
                    for transaction in payload.get("transactions", [])
                    if transaction.get("kind") == "refund" and transaction.get("status") == "success"
                )
                if refund_amount > 0:
                    applied = min(refund_amount, invoice.paid_amount or 0)
                    invoice.paid_amount = round((invoice.paid_amount or 0) - applied, 2)
                    invoice.status = InvoiceStatus.PARTIALLY_PAID.value if invoice.paid_amount else InvoiceStatus.SENT.value
                    if order.customer:
                        order.customer.outstanding_balance = round((order.customer.outstanding_balance or 0) + applied, 2)
                    from models.invoice import Payment

                    db.add(Payment(invoice_id=invoice.id, amount=-applied, method="shopify_refund", notes=f"Shopify refund {payload.get('id', '')}"))
                    emit_event(db, "invoice.refunded", "invoice", invoice.id, {"amount": applied, "shopify_refund_id": payload.get("id")})
            entity_type, entity_id = "order", order.id
        else:
            raise ValueError(f"Unsupported Shopify webhook topic: {topic}")

        receipt = db.query(ShopifyWebhookReceipt).filter(
            ShopifyWebhookReceipt.webhook_id == webhook_id
        ).first()
        receipt.status = "processed"
        receipt.processed_at = datetime.now(timezone.utc)
        receipt.error = None
        db.add(
            IntegrationEvent(
                event_type=f"shopify.{topic.replace('/', '.')}"[:80],
                entity_type=entity_type,
                entity_id=entity_id,
                payload=json.dumps({"webhook_id": webhook_id}, default=str),
            )
        )
        db.commit()
        return {"status": "processed", "webhook_id": webhook_id}
    except Exception as exc:
        db.rollback()
        receipt = db.query(ShopifyWebhookReceipt).filter(
            ShopifyWebhookReceipt.webhook_id == webhook_id
        ).first()
        if receipt:
            receipt.status = "failed"
            receipt.error = str(exc)[:500]
            db.commit()
        raise


def _graphql(query: str, variables: Optional[dict] = None) -> dict:
    status = shopify_connection_status()
    if not status["configured"]:
        raise ValueError("Shopify credentials are not configured")
    url = f"https://{status['domain']}/admin/api/{settings.SHOPIFY_API_VERSION}/graphql.json"
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": settings.SHOPIFY_ADMIN_ACCESS_TOKEN,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError(f"Shopify API request failed: {exc}") from exc
    if result.get("errors"):
        raise ValueError("Shopify API returned errors: " + json.dumps(result["errors"])[:500])
    return result.get("data") or {}


def sync_shopify_catalog(db: Session) -> Dict[str, int]:
    query = """query Products($cursor: String) {
      products(first: 100, after: $cursor) {
        edges { cursor node {
          id title bodyHtml productType vendor tags status
          featuredImage { url }
        options { name }
        collections(first: 100) { nodes { title handle } }
          variants(first: 100) { edges { node {
            id sku title price compareAtPrice inventoryQuantity barcode
            selectedOptions { name value }
            inventoryItem { id }
          } } }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }"""
    cursor = None
    count = 0
    while True:
        data = _graphql(query, {"cursor": cursor})
        connection = data.get("products") or {}
        for edge in connection.get("edges") or []:
            node = edge.get("node") or {}
            image = node.get("featuredImage") or {}
            variants = [edge.get("node") or {} for edge in (node.get("variants") or {}).get("edges", [])]
            product_payload = {
                "id": node.get("id"),
                "title": node.get("title"),
                "body_html": node.get("bodyHtml"),
                "product_type": node.get("productType"),
                "vendor": node.get("vendor"),
                "tags": node.get("tags"),
                "status": (node.get("status") or "ACTIVE").lower(),
                "image": {"src": image.get("url")} if image else None,
                "options": node.get("options"),
                "collections": (node.get("collections") or {}).get("nodes", []),
                "variants": variants,
            }
            _upsert_product(db, product_payload)
            count += 1
        page = connection.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
    db.commit()
    return {"products_synced": count}


def sync_shopify_orders(db: Session) -> Dict[str, int]:
    query = """query Orders($cursor: String) {
      orders(first: 100, after: $cursor, sortKey: CREATED_AT) {
        edges { cursor node {
          id name email currencyCode createdAt cancelledAt
          displayFinancialStatus displayFulfillmentStatus
          subtotalPriceSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalPriceSet { shopMoney { amount } }
          totalOutstandingSet { shopMoney { amount } }
          discountCode
          customer { id firstName lastName email phone emailMarketingConsent { marketingState } }
          shippingAddress { address1 address2 city province zip country phone }
          lineItems(first: 100) { edges { node {
            quantity sku originalUnitPriceSet { shopMoney { amount } }
            variant { id product { id } }
          } } }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }"""
    cursor = None
    imported = 0
    updated = 0
    while True:
        data = _graphql(query, {"cursor": cursor})
        connection = data.get("orders") or {}
        for edge in connection.get("edges") or []:
            node = edge.get("node") or {}
            external_id = normalize_shopify_id(node.get("id"))
            existing = db.query(Order.id).filter(Order.shopify_order_id == external_id).first()
            subtotal = node.get("subtotalPriceSet", {}).get("shopMoney", {}).get("amount")
            discounts = node.get("totalDiscountsSet", {}).get("shopMoney", {}).get("amount")
            shipping = node.get("totalShippingPriceSet", {}).get("shopMoney", {}).get("amount")
            total = node.get("totalPriceSet", {}).get("shopMoney", {}).get("amount")
            outstanding = node.get("totalOutstandingSet", {}).get("shopMoney", {}).get("amount")
            customer = node.get("customer") or {}
            consent = customer.get("emailMarketingConsent") or {}
            lines = []
            line_connection = node.get("lineItems") or {}
            for line_edge in line_connection.get("edges") or []:
                line = line_edge.get("node") or {}
                variant = line.get("variant") or {}
                unit_price = line.get("originalUnitPriceSet", {}).get("shopMoney", {}).get("amount")
                lines.append({
                    "variant_id": normalize_shopify_id(variant.get("id")),
                    "product_id": normalize_shopify_id((variant.get("product") or {}).get("id")),
                    "sku": line.get("sku"),
                    "quantity": line.get("quantity"),
                    "price": unit_price,
                })
            normalized = {
                "id": external_id,
                "name": node.get("name"),
                "email": node.get("email"),
                "currency": node.get("currencyCode"),
                "created_at": node.get("createdAt"),
                "cancelled_at": node.get("cancelledAt"),
                "financial_status": (node.get("displayFinancialStatus") or "pending").lower(),
                "fulfillment_status": (node.get("displayFulfillmentStatus") or "").lower(),
                "subtotal_price": subtotal,
                "total_discounts": discounts,
                "total_shipping_price": shipping,
                "total_price": total,
                "total_outstanding": outstanding,
                "discount_codes": [{"code": node.get("discountCode")}] if node.get("discountCode") else [],
                "customer": {
                    "id": normalize_shopify_id(customer.get("id")),
                    "first_name": customer.get("firstName"),
                    "last_name": customer.get("lastName"),
                    "email": customer.get("email"),
                    "phone": customer.get("phone"),
                    "email_marketing_consent": {"state": consent.get("marketingState", "")},
                },
                "shipping_address": node.get("shippingAddress") or {},
                "line_items": lines,
            }
            _import_order(db, normalized, "orders/updated" if existing else "orders/create")
            if existing:
                updated += 1
            else:
                imported += 1
        page = connection.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
    db.commit()
    return {"orders_imported": imported, "orders_updated": updated}


def sync_shopify_store(db: Session) -> Dict[str, int]:
    products = sync_shopify_catalog(db)
    orders = sync_shopify_orders(db)
    return {**products, **orders}


def publish_invoice_link_to_shopify(shopify_order_id: str) -> None:
    if not settings.PUBLIC_API_BASE_URL.strip():
        return
    from database import SessionLocal

    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.shopify_order_id == str(shopify_order_id)).first()
        if not order or not order.invoice or not order.invoice.public_token:
            return
        if order.invoice.status == InvoiceStatus.CANCELLED.value:
            return
        api_base = settings.PUBLIC_API_BASE_URL.rstrip("/")
        if not api_base.endswith("/api"):
            api_base = f"{api_base}/api"
        invoice_url = f"{api_base}/invoices/public/{order.invoice.public_token}/pdf"
        order_gid = f"gid://shopify/Order/{order.shopify_order_id}"
        result = _graphql(
            """mutation SetBizAIInvoiceLink($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id }
                userErrors { field message }
              }
            }""",
            {"metafields": [{
                "ownerId": order_gid,
                "namespace": "bizai",
                "key": "invoice_url",
                "type": "url",
                "value": invoice_url,
            }]},
        )
        errors = (result.get("metafieldsSet") or {}).get("userErrors") or []
        if errors:
            raise ValueError("Shopify rejected the invoice link: " + json.dumps(errors)[:400])
        emit_event(
            db,
            "shopify.invoice_link_published",
            "order",
            order.id,
            {"shopify_order_id": order.shopify_order_id, "invoice_number": order.invoice.invoice_number},
            commit=True,
        )
    except Exception as exc:
        db.rollback()
        emit_event(
            db,
            "shopify.invoice_link_failed",
            "order",
            None,
            {"shopify_order_id": str(shopify_order_id), "error": str(exc)[:300]},
            commit=True,
        )
    finally:
        db.close()


def process_delivery_update(db: Session, event_id: str, payload: dict) -> Dict[str, str]:
    receipt_id = f"carrier:{event_id}"
    receipt = db.query(ShopifyWebhookReceipt).filter(
        ShopifyWebhookReceipt.webhook_id == receipt_id
    ).first()
    if receipt and receipt.status == "processed":
        return {"status": "duplicate", "event_id": event_id}

    order_reference = str(payload.get("shopify_order_id") or payload.get("order_number") or "").strip()
    if not order_reference:
        raise ValueError("Delivery update requires a Shopify order ID or BizAI order number")
    order = db.query(Order).filter(
        (Order.shopify_order_id == normalize_shopify_id(order_reference))
        | (Order.order_number == order_reference)
    ).first()
    if not order:
        raise ValueError("Delivery update references an unknown order")

    latitude = float(payload.get("latitude"))
    longitude = float(payload.get("longitude"))
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Delivery coordinates are outside valid ranges")
    delivery_status = str(payload.get("status", "in_transit")).lower()
    if delivery_status not in {"in_transit", "out_for_delivery", "delivered"}:
        raise ValueError("Delivery status must be in_transit, out_for_delivery, or delivered")

    if receipt is None:
        receipt = ShopifyWebhookReceipt(webhook_id=receipt_id, topic="delivery.location", status="processing")
        db.add(receipt)
    order.delivery_latitude = latitude
    order.delivery_longitude = longitude
    order.delivery_updated_at = datetime.now(timezone.utc)
    order.tracking_company = payload.get("carrier") or order.tracking_company
    order.tracking_number = payload.get("tracking_number") or order.tracking_number
    order.tracking_url = payload.get("tracking_url") or order.tracking_url
    if delivery_status in {"in_transit", "out_for_delivery"} and order.status == OrderStatus.CONFIRMED.value:
        order.status = OrderStatus.SHIPPED.value
    elif delivery_status == "delivered" and order.status == OrderStatus.SHIPPED.value:
        order.status = OrderStatus.DELIVERED.value
    receipt.status = "processed"
    receipt.processed_at = datetime.now(timezone.utc)
    receipt.error = None
    db.add(
        IntegrationEvent(
            event_type=f"delivery.{delivery_status}",
            entity_type="order",
            entity_id=order.id,
            payload=json.dumps({"event_id": event_id, "latitude": latitude, "longitude": longitude}),
        )
    )
    db.commit()
    return {"status": "processed", "event_id": event_id}