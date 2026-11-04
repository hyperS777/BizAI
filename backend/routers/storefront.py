"""Public customer storefront catalog."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.integration import StorefrontAnalyticsEventCreate, StorefrontDeliveryUpdate, StorefrontSimulationCreate
from services.storefront_service import (
    create_storefront_simulation,
    get_demo_delivery_by_token,
    get_storefront_analytics,
    list_storefront_simulations,
    record_storefront_event,
    update_demo_delivery,
)
from services.storefront_service import get_public_storefront_products
from utils.permissions import require_manager

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
