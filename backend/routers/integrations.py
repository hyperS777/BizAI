"""Admin-controlled integration settings and activity."""

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from schemas.integration import (
    DiscountPayload,
    DiscountResponse,
    IntegrationDashboard,
    SettingsUpdate,
    WebhookPayload,
    WebhookResponse,
)
from services.integration_service import (
    emit_event,
    list_discounts,
    list_events,
    list_settings,
    list_webhooks,
    set_setting,
    upsert_discount,
    upsert_webhook,
)
from services.shopify_service import (
    process_delivery_update,
    process_shopify_webhook,
    normalize_shopify_id,
    publish_invoice_link_to_shopify,
    shopify_connection_status,
    sync_shopify_store,
    verify_shopify_signature,
)
from utils.permissions import require_integration_admin, require_integration_reader

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/dashboard", response_model=IntegrationDashboard)
def read_integration_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_reader),
):
    settings = list_settings(db)
    return {
        "settings": settings,
        "events": list_events(db, limit=80),
        "webhooks": list_webhooks(db),
        "discounts": list_discounts(db),
        "store": {
            "channel": settings.get("store_channel", ""),
            "currency": settings.get("store_currency", "INR"),
            **shopify_connection_status(),
        },
    }


@router.post("/shopify/sync")
def sync_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    try:
        result = sync_shopify_store(db)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    emit_event(db, "shopify.store_synced", "store", None, result, commit=True)
    return result


@router.post("/shopify/webhooks")
async def receive_shopify_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    body = await request.body()
    if len(body) > 2_000_000:
        raise HTTPException(status_code=413, detail="Webhook payload is too large")

    connection = shopify_connection_status()
    if not connection["domain"] or not connection["webhooks_ready"]:
        raise HTTPException(status_code=503, detail="Shopify webhook credentials are not configured")

    signature = request.headers.get("x-shopify-hmac-sha256", "")
    if not verify_shopify_signature(body, signature, settings.SHOPIFY_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid Shopify webhook signature")

    shop_domain = request.headers.get("x-shopify-shop-domain", "").lower()
    configured_domain = settings.SHOPIFY_STORE_DOMAIN.strip().lower()
    if shop_domain != configured_domain:
        raise HTTPException(status_code=401, detail="Webhook shop domain does not match configured store")

    webhook_id = request.headers.get("x-shopify-webhook-id")
    topic = request.headers.get("x-shopify-topic")
    if not webhook_id or not topic:
        raise HTTPException(status_code=400, detail="Shopify webhook ID and topic headers are required")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Webhook body must be valid JSON") from exc
    try:
        result = process_shopify_webhook(db, webhook_id, topic, payload)
        if topic.lower() in {"orders/create", "orders/updated", "orders/paid"}:
            external_order_id = normalize_shopify_id(payload.get("id"))
            if external_order_id:
                background_tasks.add_task(publish_invoice_link_to_shopify, external_order_id)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Shopify webhook processing failed") from exc


@router.post("/delivery/location")
async def receive_delivery_location(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    if len(body) > 32_000:
        raise HTTPException(status_code=413, detail="Delivery update payload is too large")
    signature = request.headers.get("x-bizai-signature", "")
    if not verify_shopify_signature(body, signature, settings.DELIVERY_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid delivery-provider signature")
    event_id = request.headers.get("x-delivery-event-id", "").strip()
    if not event_id:
        raise HTTPException(status_code=400, detail="Delivery event ID header is required")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Delivery update body must be valid JSON") from exc
    try:
        return process_delivery_update(db, event_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/settings")
def update_integration_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    values = payload.model_dump(exclude_unset=True)
    if "cancel_lock_after" in values and values["cancel_lock_after"] != "shipped":
        raise HTTPException(status_code=400, detail="REIHH policy locks cancellation after dispatch")
    if "store_currency" in values and values["store_currency"] not in {"INR", "USD", "EUR", "GBP", "CAD", "AFN"}:
        raise HTTPException(status_code=400, detail="Unsupported store currency")
    for key, value in values.items():
        set_setting(db, key, str(value).lower() if isinstance(value, bool) else str(value), commit=False)
    db.commit()
    return list_settings(db)


@router.post("/webhooks", response_model=WebhookResponse)
def create_webhook(
    payload: WebhookPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    return upsert_webhook(db, payload.model_dump(exclude_unset=True))


@router.patch("/webhooks/{webhook_id}", response_model=WebhookResponse)
def update_webhook(
    webhook_id: int,
    payload: WebhookPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    try:
        return upsert_webhook(db, payload.model_dump(exclude_unset=True), webhook_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/discounts", response_model=DiscountResponse)
def create_discount(
    payload: DiscountPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    try:
        return upsert_discount(db, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/discounts/{discount_id}", response_model=DiscountResponse)
def update_discount(
    discount_id: int,
    payload: DiscountPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_integration_admin),
):
    try:
        return upsert_discount(db, payload.model_dump(exclude_unset=True), discount_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc