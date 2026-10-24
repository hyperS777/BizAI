"""Public REIHH catalog feed for the customer storefront preview."""

from __future__ import annotations

import json
import uuid
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List
from sqlalchemy.orm import Session

from config import settings
from models.integration import IntegrationEvent, StorefrontSimulation

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
                "available": bool(variant.get("available")),
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


def create_storefront_simulation(db: Session, customer_name: str, customer_email: str, requested_items: list) -> dict:
    if not settings.STOREFRONT_SIMULATION_ENABLED:
        raise ValueError("Customer simulation is disabled")
    catalog = get_public_storefront_products()
    variants = {
        variant["id"]: (product, variant)
        for product in catalog["products"]
        for variant in product["variants"]
    }
    lines = []
    total = 0.0
    for item in requested_items:
        match = variants.get(item.variant_id)
        if not match:
            raise ValueError("One or more selected products are no longer in the REIHH catalog")
        product, variant = match
        if not variant["available"]:
            raise ValueError(f"{product['title']} ({variant['title']}) is currently unavailable")
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

    simulation = StorefrontSimulation(
        reference=f"SIM-{uuid.uuid4().hex[:10].upper()}",
        customer_name=customer_name.strip(),
        customer_email=str(customer_email).lower(),
        items=json.dumps(lines, ensure_ascii=True),
        total_amount=round(total, 2),
        currency="INR",
    )
    db.add(simulation)
    db.flush()
    db.add(IntegrationEvent(
        event_type="storefront.simulation_created",
        entity_type="storefront_simulation",
        entity_id=simulation.id,
        payload=json.dumps({"reference": simulation.reference, "total": simulation.total_amount}),
    ))
    db.commit()
    db.refresh(simulation)
    return {
        "id": simulation.id,
        "reference": simulation.reference,
        "customer_name": simulation.customer_name,
        "customer_email": simulation.customer_email,
        "items": lines,
        "total_amount": simulation.total_amount,
        "currency": simulation.currency,
        "created_at": simulation.created_at,
    }


def list_storefront_simulations(db: Session, limit: int = 100) -> list[dict]:
    rows = db.query(StorefrontSimulation).order_by(StorefrontSimulation.created_at.desc()).limit(limit).all()
    return [{
        "id": row.id,
        "reference": row.reference,
        "customer_name": row.customer_name,
        "customer_email": row.customer_email,
        "items": json.loads(row.items),
        "total_amount": row.total_amount,
        "currency": row.currency,
        "created_at": row.created_at,
    } for row in rows]
