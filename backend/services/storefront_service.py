"""Public REIHH catalog feed for the customer storefront preview."""

from __future__ import annotations

import json
import hashlib
import secrets
import uuid
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from sqlalchemy.orm import Session

from config import settings
from models.customer import Customer
from models.integration import IntegrationEvent, StorefrontAnalyticsEvent, StorefrontSimulation
from models.invoice import Invoice
from models.order import Order, OrderStatus
from models.product import Category, Product, ProductVariant
from models.user import User
from schemas.order import OrderCreate, OrderItemCreate
from services.order_service import create_order, update_order_status
from services.product_service import _sync_product_stock

COLLECTIONS = (
    ("new-collections", "New arrivals"),
    ("menswear", "Menswear"),
    ("womenswear", "Womenswear"),
)
_CACHE_SECONDS = 300
_cached_products: List[Dict[str, Any]] = []
_cached_at = 0.0


def _image_url(value: str | None) -> str | None:
    if not value:
        return None
    return f"https:{value}" if value.startswith("//") else value


def _fetch_collection(handle: str, label: str) -> list[dict]:
    url = f"https://reihh.com/collections/{handle}/products.json?limit=100"
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "BizAI-Reihh-Storefront/1.0"},
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    items = []
    for product in payload.get("products", []):
        variants = [
            {
                "id": str(variant.get("id")),
                "title": variant.get("public_title") or variant.get("title") or "Default",
                "options": [option for option in (variant.get("option1"), variant.get("option2"), variant.get("option3")) if option],
                "price": round(float(variant.get("price") or 0), 2),
                "available": True,
            }
            for variant in product.get("variants", [])
            if variant.get("id") is not None
        ]
        images = product.get("images", [])
        image = _image_url(images[0].get("src")) if images else _image_url(product.get("featured_image"))
        product_type = str(product.get("product_type") or "").lower()
        category = "Womenswear" if product_type in {"women", "womenswear"} else "Menswear" if product_type in {"men", "menswear"} else label
        items.append({
            "id": str(product.get("id")),
            "title": product.get("title") or "REIHH product",
            "handle": product.get("handle") or "",
            "product_url": f"https://reihh.com/products/{product.get('handle', '')}",
            "description": product.get("body_html") or "",
            "category": category,
            "collections": [handle],
            "image_url": image,
            "price": min((variant["price"] for variant in variants), default=0),
            "variants": variants,
        })
    return items


def get_public_storefront_products(force_refresh: bool = False) -> Dict[str, Any]:
    global _cached_at, _cached_products
    if not force_refresh and _cached_products and time.monotonic() - _cached_at < _CACHE_SECONDS:
        return {"products": _cached_products, "source": "reihh.com", "cached": True}

    merged: dict[str, dict] = {}
    errors = []
    with ThreadPoolExecutor(max_workers=len(COLLECTIONS)) as executor:
        futures = {
            executor.submit(_fetch_collection, handle, label): handle
            for handle, label in COLLECTIONS
        }
        for future in as_completed(futures):
            handle = futures[future]
            try:
                for product in future.result():
                    existing = merged.get(product["id"])
                    if existing is None:
                        merged[product["id"]] = product
                    else:
                        existing["collections"] = sorted(set(existing["collections"] + product["collections"]))
            except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
                errors.append(f"{handle}: {exc}")

    if not merged:
        if _cached_products:
            return {"products": _cached_products, "source": "reihh.com", "cached": True}
        raise RuntimeError("REIHH storefront catalog is currently unavailable")

    _cached_products = sorted(merged.values(), key=lambda item: item["title"].casefold())
    _cached_at = time.monotonic()
    return {
        "products": _cached_products,
        "source": "reihh.com",
        "cached": False,
        "partial": bool(errors),
    }


WAREHOUSE = {"id": "warehouse", "label": "REIHH Delhi Warehouse", "lat": 28.6139, "lng": 77.2090}
CITY_COORDS = (
    ("delhi", 28.6139, 77.2090),
    ("noida", 28.5355, 77.3910),
    ("gurgaon", 28.4595, 77.0266),
    ("gurugram", 28.4595, 77.0266),
    ("mumbai", 19.0760, 72.8777),
    ("pune", 18.5204, 73.8567),
    ("delhi_ncr", 28.6139, 77.2090),
    ("noida", 28.5355, 77.3910),
    ("gurgaon", 28.4595, 77.0266),
    ("gurugram", 28.4595, 77.0266),
    ("bengaluru", 12.9716, 77.5946),
    ("bangalore", 12.9716, 77.5946),
    ("hyderabad", 17.3850, 78.4867),
    ("chennai", 13.0827, 80.2707),
    ("kolkata", 22.5726, 88.3639),
    ("ahmedabad", 23.0225, 72.5714),
    ("jaipur", 26.9124, 75.7873),
    ("lucknow", 26.8467, 80.9462),
    ("surat", 21.1702, 72.8311),
    ("indore", 22.7196, 75.8577),
)


def demo_checkpoints(address: str | None = None) -> list[dict]:
    city_lat, city_lng = _guess_city_coords(address)
    return [
        {**WAREHOUSE},
        {"id": "out_for_delivery", "label": "Out for delivery — near customer", "lat": round(city_lat + 0.018, 4), "lng": round(city_lng + 0.012, 4)},
        {"id": "customer_door", "label": "At customer address", "lat": round(city_lat - 0.008, 4), "lng": round(city_lng - 0.006, 4)},
    ]


def _guess_city_coords(address: str | None) -> tuple[float, float]:
    text = (address or "").lower()
    for name, lat, lng in CITY_COORDS:
        if name in text:
            return lat, lng
    return 28.6139, 77.2090


def _checkpoint_for_status(status: str, address: str | None) -> dict:
    mapping = {
        "ready_to_pack": "warehouse",
        "packed": "warehouse",
        "out_for_delivery": "out_for_delivery",
        "failed_delivery": "out_for_delivery",
        "delivered": "customer_door",
        "returned_to_store": "warehouse",
    }
    wanted = mapping.get(status, "warehouse")
    return next((item for item in demo_checkpoints(address) if item["id"] == wanted), WAREHOUSE)


def _order_status_for_delivery(status: str) -> str | None:
    if status in {"ready_to_pack", "packed"}:
        return OrderStatus.CONFIRMED.value
    if status in {"out_for_delivery", "failed_delivery"}:
        return OrderStatus.SHIPPED.value
    if status == OrderStatus.DELIVERED.value or status == "delivered":
        return OrderStatus.DELIVERED.value
    return None


def _ensure_category(db: Session, name: str) -> Category:
    row = db.query(Category).filter(Category.name == name).first()
    if row:
        return row
    row = Category(name=name, description=f"REIHH {name}")
    db.add(row)
    db.flush()
    return row


def _ensure_catalog_variant(db: Session, product: dict, variant: dict) -> tuple[Product, ProductVariant]:
    shopify_product_id = str(product["id"])
    shopify_variant_id = str(variant["id"])
    db_product = db.query(Product).filter(Product.shopify_product_id == shopify_product_id).first()
    category = _ensure_category(db, product.get("category") or "Menswear")
    price = float(variant["price"] or product.get("price") or 0)
    if not db_product:
        db_product = Product(
            name=product["title"][:200],
            sku=f"RH-{shopify_product_id}"[:50],
            shopify_product_id=shopify_product_id,
            description=(product.get("description") or "")[:2000] or None,
            price=price,
            cost_price=round(price * 0.42, 2),
            stock_qty=50,
            min_stock_level=4,
            category_id=category.id,
            product_type=product.get("category"),
            vendor="Reihh",
            tags="demo,reihh",
            option1_name="Option",
            option2_name="Size",
            image_url=product.get("image_url"),
            is_active=True,
        )
        db.add(db_product)
        db.flush()
    else:
        db_product.name = product["title"][:200]
        db_product.image_url = product.get("image_url") or db_product.image_url
        db_product.is_active = True
        db_product.category_id = category.id

    options = variant.get("options") or []
    option1 = options[0] if options else variant.get("title")
    option2 = options[1] if len(options) > 1 else None
    db_variant = db.query(ProductVariant).filter(ProductVariant.shopify_variant_id == shopify_variant_id).first()
    if not db_variant:
        db_variant = ProductVariant(
            product_id=db_product.id,
            sku=f"RH-{shopify_variant_id}"[:80],
            shopify_variant_id=shopify_variant_id,
            option1=option1,
            option2=option2,
            price=price,
            cost_price=round(price * 0.42, 2),
            stock_qty=50,
            min_stock_level=2,
            is_active=True,
        )
        db.add(db_variant)
        db.flush()
    else:
        db_variant.price = price
        db_variant.is_active = True
        if db_variant.stock_qty is None:
            db_variant.stock_qty = 50
    _sync_product_stock(db_product)
    return db_product, db_variant


def sync_all_reihh_catalog(db: Session, force: bool = False) -> dict:
    """Sync the live REIHH collection into the BizAI database."""
    catalog = get_public_storefront_products(force_refresh=force)
    count_prods = 0
    count_vars = 0
    for product in catalog.get("products", []):
        for variant in product.get("variants", []):
            _ensure_catalog_variant(db, product, variant)
            count_vars += 1
        count_prods += 1
    # Deactivate legacy dummy products so only real REIHH pieces are active
    db.query(Product).filter(Product.shopify_product_id.is_(None)).update({"is_active": False}, synchronize_session=False)
    db.commit()
    return {"products_synced": count_prods, "variants_synced": count_vars}


def _upsert_demo_customer(db: Session, name: str, email: str, address: str) -> Customer:
    clean_email = email.strip().lower()
    clean_name = name.strip() or "Demo Customer"
    customer = db.query(Customer).filter(Customer.email == clean_email).first()
    if customer:
        # If the existing customer has a different name, do NOT mutate it!
        # Mutating customer.name would retroactively rename all past orders for this customer.
        # Instead, generate a distinct demo customer so every device/identity stays isolated.
        if customer.name and customer.name.strip().lower() != clean_name.lower():
            prefix = clean_email.split("@")[0] if "@" in clean_email else "demo"
            domain = clean_email.split("@")[-1] if "@" in clean_email else "demo.reihh.com"
            unique_email = f"{prefix}_{secrets.token_hex(3)}@{domain}"
            new_customer = Customer(
                name=clean_name,
                email=unique_email,
                address=address,
                company="REIHH demo customer",
                tags="demo-store",
                notes="Created from demo storefront checkout (separate device/identity).",
            )
            db.add(new_customer)
            db.flush()
            return new_customer
        # Same customer name: update address if provided
        if address:
            customer.address = address
        if customer.tags and "demo-store" not in customer.tags:
            customer.tags = f"{customer.tags},demo-store"
        elif not customer.tags:
            customer.tags = "demo-store"
        return customer
    customer = Customer(
        name=clean_name,
        email=clean_email,
        address=address,
        company="REIHH demo customer",
        tags="demo-store",
        notes="Created from the demo storefront checkout.",
    )
    db.add(customer)
    db.flush()
    return customer


def _system_user_id(db: Session) -> int:
    admin = db.query(User).filter(User.email == "admin@bizai.com").first()
    if not admin:
        raise ValueError("Demo workspace is missing the admin user")
    return admin.id


def _checkpoint_history(row: StorefrontSimulation) -> list:
    try:
        return json.loads(row.checkpoint_log or "[]")
    except json.JSONDecodeError:
        return []


def _serialize_delivery(row: StorefrontSimulation, extra: dict | None = None) -> dict:
    payload = {
        "id": row.id,
        "reference": row.reference,
        "customer_name": row.customer_name,
        "customer_email": row.customer_email,
        "delivery_address": row.delivery_address,
        "delivery_status": row.delivery_status,
        "delivery_agent_name": row.delivery_agent_name,
        "delivery_note": row.delivery_note,
        "items": json.loads(row.items),
        "total_amount": row.total_amount,
        "currency": row.currency,
        "created_at": row.created_at,
        "updated_at": row.delivery_updated_at,
        "order_id": row.order_id,
        "current_location": row.current_location,
        "delivery_latitude": row.delivery_latitude,
        "delivery_longitude": row.delivery_longitude,
        "checkpoints": demo_checkpoints(row.delivery_address),
        "checkpoint_log": _checkpoint_history(row),
    }
    # Attach invoice info if order is delivered
    if row.order_id and row.delivery_status == "delivered":
        from models.invoice import Invoice as InvoiceModel
        # Note: db not in scope here, invoice_info set via extra kwarg from callers
        pass
    if extra:
        payload.update(extra)
    return payload


def create_storefront_simulation(
    db: Session,
    customer_name: str,
    customer_email: str,
    requested_address: str,
    session_id: str,
    requested_items: list,
    discount_code: str | None = None,
    payment_method: str | None = "demo_card",
) -> dict:
    if not settings.STOREFRONT_SIMULATION_ENABLED:
        raise ValueError("Customer simulation is disabled")
    catalog = get_public_storefront_products()
    variants = {
        variant["id"]: (product, variant)
        for product in catalog["products"]
        for variant in product["variants"]
    }
    lines = []
    order_items = []
    total = 0.0
    for item in requested_items:
        match = variants.get(item.variant_id)
        if not match:
            raise ValueError("One or more selected products are no longer in the REIHH catalog")
        product, variant = match
        db_product, db_variant = _ensure_catalog_variant(db, product, variant)
        if (db_variant.stock_qty or 0) < item.quantity:
            db_variant.stock_qty = max(item.quantity + 20, 50)
            _sync_product_stock(db_product)
        line_total = round(variant["price"] * item.quantity, 2)
        total += line_total
        lines.append({
            "product_id": product["id"],
            "title": product["title"],
            "handle": product["handle"],
            "product_url": product["product_url"],
            "image_url": product["image_url"],
            "variant_id": variant["id"],
            "variant_title": variant["title"],
            "quantity": item.quantity,
            "unit_price": variant["price"],
            "line_total": line_total,
        })
        order_items.append(OrderItemCreate(
            product_id=db_product.id,
            variant_id=db_variant.id,
            quantity=item.quantity,
        ))

    customer = _upsert_demo_customer(db, customer_name.strip(), str(customer_email).lower(), requested_address)
    user_id = _system_user_id(db)
    db.flush()
    order = create_order(
        db,
        OrderCreate(
            customer_id=customer.id,
            notes="Demo storefront checkout — no real payment.",
            items=order_items,
            discount_code=(discount_code or "").strip().upper() or None,
        ),
        user_id,
    )
    order = update_order_status(db, order.id, OrderStatus.CONFIRMED)
    origin = _checkpoint_for_status("ready_to_pack", requested_address)
    order.shipping_address = requested_address
    order.tracking_company = "REIHH Demo Rider"
    order.tracking_number = order.order_number
    order.delivery_location = origin["label"]
    order.delivery_latitude = origin["lat"]
    order.delivery_longitude = origin["lng"]
    order.delivery_updated_at = datetime.now(timezone.utc)

    delivery_token = secrets.token_urlsafe(36)
    order.tracking_url = f"/delivery/demo/{delivery_token}"
    first_scan = [{
        "label": origin["label"],
        "status": "ready_to_pack",
        "agent_name": "Warehouse",
        "at": datetime.now(timezone.utc).isoformat(),
        "lat": origin["lat"],
        "lng": origin["lng"],
    }]
    simulation = StorefrontSimulation(
        reference=order.order_number,
        customer_name=customer.name,
        customer_email=customer.email,
        delivery_address=requested_address,
        items=json.dumps(lines, ensure_ascii=True),
        total_amount=order.total_amount,
        currency="INR",
        delivery_status="ready_to_pack",
        delivery_token_hash=hashlib.sha256(delivery_token.encode("utf-8")).hexdigest(),
        order_id=order.id,
        current_location=origin["label"],
        delivery_latitude=origin["lat"],
        delivery_longitude=origin["lng"],
        checkpoint_log=json.dumps(first_scan),
    )
    db.add(simulation)
    db.flush()
    db.add(IntegrationEvent(
        event_type="storefront.simulation_created",
        entity_type="order",
        entity_id=order.id,
        payload=json.dumps({"reference": simulation.reference, "total": simulation.total_amount, "order_number": order.order_number}),
    ))
    for index, line in enumerate(lines):
        db.add(StorefrontAnalyticsEvent(
            event_id=f"demo-purchase-{simulation.reference}-{index}",
            session_id=session_id,
            event_type="demo_purchase",
            product_id=line["product_id"],
            product_title=line["title"],
            variant_id=line["variant_id"],
            variant_title=line["variant_title"],
            quantity=line["quantity"],
            source="demo",
        ))
    invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
    if not invoice:
        from services.invoice_service import generate_invoice_from_order
        invoice = generate_invoice_from_order(db, order.id, commit=False)
    if invoice and order.total_amount > 0:
        from services.invoice_service import record_payment
        record_payment(
            db,
            invoice,
            order.total_amount,
            method=payment_method or "demo_card",
            notes=f"Demo storefront payment ({payment_method or 'demo_card'}) - simulated instant approval",
        )
    db.commit()
    db.refresh(simulation)
    return {
        **_serialize_delivery(simulation, {"delivery_token": delivery_token}),
        "order_number": order.order_number,
        "invoice_number": invoice.invoice_number if invoice else None,
        "invoice_token": invoice.public_token if invoice else None,
        "customer_id": customer.id,
    }


def list_storefront_simulations(db: Session, limit: int = 100) -> list[dict]:
    rows = db.query(StorefrontSimulation).order_by(StorefrontSimulation.created_at.desc()).limit(limit).all()
    order_ids = [row.order_id for row in rows if row.order_id]
    orders = {order.id: order for order in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}
    result = []
    for row in rows:
        order = orders.get(row.order_id)
        payload = _serialize_delivery(row)
        payload["order_number"] = order.order_number if order else row.reference
        payload["order_status"] = order.status if order else None
        result.append(payload)
    return result


DEMO_DELIVERY_TRANSITIONS = {
    "ready_to_pack": {"packed"},
    "packed": {"out_for_delivery"},
    "out_for_delivery": {"delivered", "failed_delivery"},
    "failed_delivery": {"out_for_delivery", "returned_to_store"},
    "delivered": set(),
    "returned_to_store": set(),
}


def get_demo_delivery_by_token(db: Session, token: str) -> dict:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.query(StorefrontSimulation).filter_by(delivery_token_hash=token_hash).first()
    if not row:
        raise ValueError("This demo delivery link is invalid")
    order = db.query(Order).filter(Order.id == row.order_id).first() if row.order_id else None
    payload = _serialize_delivery(row)
    payload["order_number"] = order.order_number if order else row.reference
    payload["order_status"] = order.status if order else None
    return payload


def update_demo_delivery(
    db: Session,
    token: str,
    status: str | None,
    agent_name: str,
    note: str | None,
    checkpoint_id: str | None = None,
    current_location: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.query(StorefrontSimulation).filter_by(delivery_token_hash=token_hash).first()
    if not row:
        raise ValueError("This demo delivery link is invalid")
    next_status = status or row.delivery_status
    if status and status != row.delivery_status:
        allowed = DEMO_DELIVERY_TRANSITIONS.get(row.delivery_status, set())
        if status not in allowed:
            raise ValueError(f"Cannot move demo delivery from {row.delivery_status} to {status}")
        row.delivery_status = status
    checkpoints = demo_checkpoints(row.delivery_address)
    chosen = next((item for item in checkpoints if item["id"] == checkpoint_id), None)
    if chosen is None and (latitude is None or longitude is None):
        chosen = _checkpoint_for_status(next_status, row.delivery_address)
    label = (current_location or "").strip() or (chosen["label"] if chosen else row.current_location)
    lat = latitude if latitude is not None else (chosen["lat"] if chosen else row.delivery_latitude)
    lng = longitude if longitude is not None else (chosen["lng"] if chosen else row.delivery_longitude)
    now = datetime.now(timezone.utc)
    row.delivery_agent_name = agent_name.strip()
    if note and note.strip():
        row.delivery_note = note.strip()
    row.current_location = label
    row.delivery_latitude = lat
    row.delivery_longitude = lng
    row.delivery_updated_at = now
    history = _checkpoint_history(row)
    history.append({
        "label": label,
        "status": row.delivery_status,
        "agent_name": row.delivery_agent_name,
        "note": row.delivery_note,
        "at": now.isoformat(),
        "lat": lat,
        "lng": lng,
    })
    row.checkpoint_log = json.dumps(history[-20:])
    if row.order_id:
        order = db.query(Order).filter(Order.id == row.order_id).first()
        if order:
            order.delivery_location = label
            order.delivery_latitude = lat
            order.delivery_longitude = lng
            order.delivery_updated_at = now
            order.tracking_company = row.delivery_agent_name or "REIHH Demo Rider"
            order.shipping_address = row.delivery_address
            wanted = _order_status_for_delivery(row.delivery_status)
            if wanted and wanted != order.status:
                try:
                    update_order_status(db, order.id, OrderStatus(wanted))
                except Exception:
                    db.refresh(order)
                    order.delivery_location = label
                    order.delivery_latitude = lat
                    order.delivery_longitude = lng
    # On delivery: expose invoice info
    invoice_info = {}
    if row.delivery_status == "delivered" and row.order_id:
        from models.invoice import Invoice as _Invoice
        inv = db.query(_Invoice).filter(_Invoice.order_id == row.order_id).first()
        if inv:
            invoice_info = {
                "invoice_number": inv.invoice_number,
                "invoice_token": inv.public_token,
                "invoice_status": inv.status,
            }
    db.add(IntegrationEvent(
        event_type=f"storefront.demo_delivery.{row.delivery_status}",
        entity_type="order" if row.order_id else "storefront_simulation",
        entity_id=row.order_id or row.id,
        payload=json.dumps({
            "reference": row.reference,
            "agent": row.delivery_agent_name,
            "location": label,
            "note": row.delivery_note,
        }),
    ))
    db.commit()
    result = get_demo_delivery_by_token(db, token)
    if invoice_info:
        result.update(invoice_info)
    return result


def _catalog_variant(product_id: str, variant_id: str | None = None) -> tuple[dict, dict]:
    catalog = get_public_storefront_products()
    for product in catalog["products"]:
        if product["id"] != str(product_id):
            continue
        variants = product["variants"]
        variant = next((item for item in variants if item["id"] == str(variant_id)), None) if variant_id else None
        if variant is None and variants:
            variant = variants[0]
        if variant:
            return product, variant
    raise ValueError("Product or variant is no longer in the REIHH catalog")


def record_storefront_event(db: Session, payload) -> dict:
    allowed_events = {"product_view", "variant_selected", "add_to_cart", "checkout_started", "demo_checkout_started", "wishlist_add"}
    if payload.event_type not in allowed_events:
        raise ValueError("Unsupported storefront analytics event")
    if payload.source not in {"live", "demo"}:
        raise ValueError("Storefront analytics source must be live or demo")
    existing = db.query(StorefrontAnalyticsEvent.id).filter_by(event_id=payload.event_id).first()
    if existing:
        return {"status": "duplicate"}
    product, variant = _catalog_variant(payload.product_id, payload.variant_id)
    db.add(StorefrontAnalyticsEvent(
        event_id=payload.event_id,
        session_id=payload.session_id,
        event_type=payload.event_type,
        product_id=product["id"],
        product_title=product["title"],
        variant_id=variant["id"],
        variant_title=variant["title"],
        quantity=payload.quantity,
        source=payload.source,
    ))
    db.commit()
    return {"status": "recorded"}


def record_shopify_purchase_events(db: Session, order_id: str, line_items: list) -> None:
    for index, (line, product, variant) in enumerate(line_items):
        event_id = f"shopify-purchase-{order_id}-{index}"
        if db.query(StorefrontAnalyticsEvent.id).filter_by(event_id=event_id).first():
            continue
        db.add(StorefrontAnalyticsEvent(
            event_id=event_id,
            session_id=f"shopify-order-{order_id}",
            event_type="purchase",
            product_id=product.shopify_product_id or str(product.id),
            product_title=product.name,
            variant_id=variant.shopify_variant_id if variant else str(line.get("variant_id") or ""),
            variant_title=variant.title if variant else "Default",
            quantity=max(1, int(line.get("quantity") or 1)),
            source="shopify",
        ))


def get_storefront_analytics(db: Session, days: int = 30) -> dict:
    start_date = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))
    rows = db.query(StorefrontAnalyticsEvent).filter(StorefrontAnalyticsEvent.created_at >= start_date).all()
    product_stats: dict[str, dict] = {}
    totals = {event: 0 for event in ("product_view", "variant_selected", "add_to_cart", "checkout_started", "demo_checkout_started", "purchase", "demo_purchase")}
    for row in rows:
        stat = product_stats.setdefault(row.product_id, {
            "product_id": row.product_id,
            "product_title": row.product_title,
            "views": 0,
            "viewers": set(),
            "variant_selections": 0,
            "variant_selectors": set(),
            "add_to_cart": 0,
            "cart_sessions": set(),
            "checkout_started": 0,
            "checkout_sessions": set(),
            "purchases": 0,
            "purchase_sessions": set(),
            "demo_purchases": 0,
            "demo_sessions": set(),
            "live_cart_sessions": set(),
            "demo_cart_sessions": set(),
            "live_checkout_sessions": set(),
            "demo_checkout_sessions": set(),
        })
        totals[row.event_type] = totals.get(row.event_type, 0) + 1
        if row.event_type == "product_view":
            stat["views"] += 1
            stat["viewers"].add(row.session_id)
        elif row.event_type == "variant_selected":
            stat["variant_selections"] += 1
            stat["variant_selectors"].add(row.session_id)
        elif row.event_type == "add_to_cart":
            stat["add_to_cart"] += row.quantity
            stat["cart_sessions"].add(row.session_id)
            stat[f"{row.source}_cart_sessions"].add(row.session_id)
        elif row.event_type == "checkout_started":
            stat["checkout_started"] += 1
            stat["checkout_sessions"].add(row.session_id)
            stat[f"{row.source}_checkout_sessions"].add(row.session_id)
        elif row.event_type == "demo_checkout_started":
            stat["checkout_started"] += 1
            stat["checkout_sessions"].add(row.session_id)
            stat["demo_checkout_sessions"].add(row.session_id)
        elif row.event_type == "purchase":
            stat["purchases"] += row.quantity
            stat["purchase_sessions"].add(row.session_id)
        elif row.event_type == "demo_purchase":
            stat["demo_purchases"] += row.quantity
            stat["demo_sessions"].add(row.session_id)

    result = []
    for stat in product_stats.values():
        stat["unique_viewers"] = len(stat.pop("viewers"))
        stat["unique_variant_selectors"] = len(stat.pop("variant_selectors"))
        stat["unique_cart_sessions"] = len(stat.pop("cart_sessions"))
        stat["unique_checkout_sessions"] = len(stat.pop("checkout_sessions"))
        stat["unique_demo_customers"] = len(stat.pop("demo_sessions"))
        stat["unique_purchase_sessions"] = len(stat.pop("purchase_sessions"))
        stat["unique_live_cart_sessions"] = len(stat.pop("live_cart_sessions"))
        stat["unique_demo_cart_sessions"] = len(stat.pop("demo_cart_sessions"))
        stat["unique_live_checkout_sessions"] = len(stat.pop("live_checkout_sessions"))
        stat["unique_demo_checkout_sessions"] = len(stat.pop("demo_checkout_sessions"))
        viewers = stat["unique_viewers"]
        carts = stat["unique_cart_sessions"]
        checkouts = stat["unique_checkout_sessions"]
        buys = stat["unique_demo_customers"] + stat["unique_purchase_sessions"]
        stat["view_to_cart_rate"] = round((carts / viewers) * 100, 1) if viewers else 0
        stat["cart_to_checkout_rate"] = round((checkouts / carts) * 100, 1) if carts else 0
        stat["checkout_to_purchase_rate"] = round((buys / checkouts) * 100, 1) if checkouts else 0
        result.append(stat)
    result.sort(key=lambda item: (item["unique_viewers"], item["add_to_cart"]), reverse=True)
    unique_sessions = len({row.session_id for row in rows})
    demo_buys = totals.get("demo_purchase", 0)
    views = totals.get("product_view", 0)
    carts = totals.get("add_to_cart", 0)
    totals["unique_sessions"] = unique_sessions
    totals["view_to_cart_rate"] = round((carts / views) * 100, 1) if views else 0
    totals["purchase_rate"] = round((demo_buys / unique_sessions) * 100, 1) if unique_sessions else 0
    return {"days": days, "totals": totals, "products": result}
