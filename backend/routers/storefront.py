"""Public customer storefront catalog."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.integration import (
    AbandonedCheckoutConvertRequest,
    AbandonedCheckoutPayload,
    StorefrontAnalyticsEventCreate,
    StorefrontDeliveryUpdate,
    StorefrontSimulationCreate,
)
from services.storefront_service import (
    convert_abandoned_checkout,
    create_storefront_simulation,
    dismiss_abandoned_checkout,
    get_demo_delivery_by_token,
    get_storefront_analytics,
    list_abandoned_checkouts,
    list_storefront_simulations,
    record_storefront_event,
    update_demo_delivery,
    upsert_abandoned_checkout,
)
from services.storefront_service import get_public_storefront_products
from utils.permissions import require_employee, require_manager, require_staff

router = APIRouter(prefix="/api/storefront", tags=["storefront"])


@router.get("/products")
def read_storefront_products(refresh: bool = False):
    try:
        return get_public_storefront_products(force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/simulations")
def create_customer_simulation(payload: StorefrontSimulationCreate, db: Session = Depends(get_db)):
    try:
        return create_storefront_simulation(
            db,
            payload.customer_name,
            str(payload.customer_email),
            payload.delivery_address,
            payload.session_id,
            payload.items,
            payload.discount_code,
            payload.payment_method,
            customer_phone=payload.customer_phone,
            gift_card_code=payload.gift_card_code,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sync-catalog")
def sync_catalog_endpoint(db: Session = Depends(get_db)):
    try:
        from services.storefront_service import sync_all_reihh_catalog
        return sync_all_reihh_catalog(db, force=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/demo-delivery/{token}")
def read_demo_delivery(token: str, db: Session = Depends(get_db)):
    try:
        return get_demo_delivery_by_token(db, token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tracking/{tracking_number}")
def read_public_tracking(tracking_number: str, db: Session = Depends(get_db)):
    """Public tracking payload lookup by Delhivery AWB or REIHH order number."""
    import json
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload
    from models.integration import StorefrontSimulation
    from models.order import Order, OrderItem

    ref = tracking_number.strip().lstrip("#")
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.customer))
        .filter(or_(Order.tracking_number == ref, Order.order_number == ref.upper()))
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="No order or AWB found for that reference")
    sim = db.query(StorefrontSimulation).filter(StorefrontSimulation.order_id == order.id).first()
    checkpoints = []
    if sim and sim.checkpoint_log:
        try:
            checkpoints = json.loads(sim.checkpoint_log)
        except json.JSONDecodeError:
            checkpoints = []
    return {
        "order_number": order.order_number,
        "status": order.status,
        "tracking_company": order.tracking_company or "Delhivery Express",
        "tracking_number": order.tracking_number,
        "tracking_url": order.tracking_url,
        "location": order.delivery_location,
        "shipping_address": order.shipping_address,
        "customer_name": order.customer.name if order.customer else None,
        "total_amount": float(order.total_amount or 0),
        "created_at": order.created_at,
        "updated_at": order.delivery_updated_at or order.updated_at,
        "items": [
            {
                "name": it.product.name if it.product else f"Item #{it.product_id}",
                "quantity": it.quantity,
                "option1": it.option1,
                "option2": it.option2,
                "total_price": float(it.total_price or 0),
            }
            for it in (order.items or [])
        ],
        "checkpoints": checkpoints,
    }


@router.post("/abandoned-checkouts")
def save_abandoned_checkout(payload: AbandonedCheckoutPayload, db: Session = Depends(get_db)):
    try:
        return upsert_abandoned_checkout(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/abandoned-checkouts")
def read_abandoned_checkouts(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return list_abandoned_checkouts(db, limit=max(1, min(limit, 250)))


@router.post("/abandoned-checkouts/{checkout_id}/convert")
def recover_abandoned_checkout(
    checkout_id: int,
    payload: AbandonedCheckoutConvertRequest = AbandonedCheckoutConvertRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    try:
        return convert_abandoned_checkout(db, checkout_id, current_user.id, target_status=payload.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/abandoned-checkouts/{checkout_id}")
def delete_abandoned_checkout(
    checkout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    try:
        return dismiss_abandoned_checkout(db, checkout_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/discounts")
def read_public_discounts(db: Session = Depends(get_db)):
    """Public list of active storefront coupon codes."""
    from models.integration import DiscountCode
    rows = db.query(DiscountCode).filter(DiscountCode.active.is_(True)).order_by(DiscountCode.code.asc()).all()
    return [
        {
            "code": row.code,
            "discount_type": row.discount_type,
            "value": float(row.value or 0),
            "description": row.description or "",
        }
        for row in rows
        if row.usage_limit is None or (row.times_used or 0) < row.usage_limit
    ]


@router.post("/discounts/validate")
def validate_public_discount(payload: dict, db: Session = Depends(get_db)):
    """Public coupon code validation for the customer storefront."""
    from models.integration import DiscountCode
    from services.integration_service import apply_discount

    code = (payload.get("code") or "").strip().upper()
    subtotal = float(payload.get("subtotal", 0.0))
    if not code:
        raise HTTPException(status_code=400, detail="Coupon code is required")
    try:
        amount, normalized_code = apply_discount(db, code, subtotal)
        row = db.query(DiscountCode).filter(DiscountCode.code == normalized_code).first()
        return {
            "valid": True,
            "code": normalized_code,
            "discount_type": row.discount_type if row else "percent",
            "value": float(row.value) if row else 0.0,
            "discount_amount": amount,
            "description": row.description if row else "",
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gift-cards/validate")
def validate_public_gift_card(payload: dict, db: Session = Depends(get_db)):
    """Public gift card balance check & validation for storefront checkout."""
    from models.integration import GiftCard

    code = (payload.get("code") or "").strip().upper()
    subtotal = float(payload.get("subtotal", 0.0))
    if not code:
        raise HTTPException(status_code=400, detail="Gift card code is required")
    row = db.query(GiftCard).filter(GiftCard.code == code).first()
    if not row or not row.active:
        raise HTTPException(status_code=400, detail="Gift card is invalid or paused")
    if float(row.current_balance or 0) <= 0:
        raise HTTPException(status_code=400, detail="This gift card has ₹0 remaining balance")
    applicable = round(min(float(row.current_balance or 0), max(subtotal, 0.0)), 2)
    return {
        "valid": True,
        "code": row.code,
        "current_balance": float(row.current_balance or 0),
        "applicable_amount": applicable,
    }


@router.patch("/demo-delivery/{token}")
def update_demo_delivery_status(token: str, payload: StorefrontDeliveryUpdate, db: Session = Depends(get_db)):
    try:
        return update_demo_delivery(db, token, payload.status, payload.agent_name, payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/events")
def record_customer_event(payload: StorefrontAnalyticsEventCreate, db: Session = Depends(get_db)):
    try:
        return record_storefront_event(db, payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/simulations")
def read_customer_simulations(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return list_storefront_simulations(db, limit=max(1, min(limit, 250)))


@router.get("/analytics")
def read_storefront_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return get_storefront_analytics(db, days)


@router.get("/simulations/{reference}")
def read_storefront_simulation(reference: str, db: Session = Depends(get_db)):
    """Get a single simulation by reference (order number)."""
    from models.integration import StorefrontSimulation
    row = db.query(StorefrontSimulation).filter_by(reference=reference).first()
    if not row:
        raise HTTPException(status_code=404, detail="Simulation not found")
    from services.storefront_service import _serialize_delivery
    return _serialize_delivery(row)


@router.get("/analytics/funnel")
def read_storefront_funnel(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Shopify-style conversion funnel data."""
    from services.storefront_service import get_storefront_analytics
    data = get_storefront_analytics(db, days)
    totals = data["totals"]
    sessions = totals.get("unique_sessions", 0) or 1
    views = totals.get("product_view", 0) or 0
    carts = totals.get("add_to_cart", 0) or 0
    checkouts = (totals.get("checkout_started", 0) or 0) + (totals.get("demo_checkout_started", 0) or 0)
    purchases = (totals.get("demo_purchase", 0) or 0) + (totals.get("purchase", 0) or 0)
    return {
        "days": days,
        "funnel": [
            {"stage": "Sessions", "count": sessions, "pct": 100},
            {"stage": "Product views", "count": views, "pct": round(views / sessions * 100, 1) if sessions else 0},
            {"stage": "Added to cart", "count": carts, "pct": round(carts / max(views, 1) * 100, 1)},
            {"stage": "Checkout started", "count": checkouts, "pct": round(checkouts / max(carts, 1) * 100, 1)},
            {"stage": "Purchased", "count": purchases, "pct": round(purchases / max(checkouts, 1) * 100, 1)},
        ],
        "top_products": sorted(data["products"], key=lambda x: x["views"], reverse=True)[:8],
        "totals": totals,
    }
