"""Internal event bus, webhooks, app settings, and discount codes."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models.integration import AppSetting, DiscountCode, IntegrationEvent, WebhookEndpoint

DEFAULT_SETTINGS = {
    "auto_invoice_on_confirm": "true",
    "auto_mark_overdue": "true",
    "store_channel": "reihh.com",
    "store_currency": "INR",
    "cancel_lock_after": "shipped",
}


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row and row.value is not None:
        return row.value
    return DEFAULT_SETTINGS.get(key, default)


def setting_enabled(db: Session, key: str) -> bool:
    return get_setting(db, key, DEFAULT_SETTINGS.get(key, "true")).lower() in {"1", "true", "yes", "on"}


def set_setting(db: Session, key: str, value: str, commit: bool = True) -> AppSetting:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def ensure_default_settings(db: Session):
    for key, value in DEFAULT_SETTINGS.items():
        if not db.query(AppSetting).filter(AppSetting.key == key).first():
            db.add(AppSetting(key=key, value=value))
    if db.query(WebhookEndpoint).count() == 0:
        db.add(
            WebhookEndpoint(
                name="Reihh operations log",
                url="",
                events="order.created,order.confirmed,order.cancelled,order.shipped,invoice.created,invoice.paid,inventory.low_stock",
                enabled=True,
                last_status="log_only",
            )
        )
    if not db.query(DiscountCode).filter(DiscountCode.code == "REIHH10").first():
        db.add(
            DiscountCode(
                code="REIHH10",
                discount_type="percent",
                value=10,
                active=True,
                description="Get 10% off your purchase — Reihh storefront code",
            )
        )
    db.commit()


def list_settings(db: Session) -> Dict[str, str]:
    rows = {row.key: row.value for row in db.query(AppSetting).all()}
    merged = dict(DEFAULT_SETTINGS)
    merged.update({k: v for k, v in rows.items() if v is not None})
    return merged


def emit_event(
    db: Session,
    event_type: str,
    entity_type: str,
    entity_id: Optional[int],
    payload: Optional[Dict[str, Any]] = None,
    commit: bool = False,
) -> IntegrationEvent:
    event = IntegrationEvent(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=json.dumps(payload or {}, default=str),
    )
    db.add(event)
    db.flush()
    _deliver_webhooks(db, event)
    if commit:
        db.commit()
        db.refresh(event)
    return event


def _deliver_webhooks(db: Session, event: IntegrationEvent):
    hooks = db.query(WebhookEndpoint).filter(WebhookEndpoint.enabled.is_(True)).all()
    body = json.dumps(
        {
            "event_type": event.event_type,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "payload": json.loads(event.payload or "{}"),
            "created_at": str(event.created_at),
        },
        default=str,
    ).encode("utf-8")
    for hook in hooks:
        subscribed = [item.strip() for item in (hook.events or "").split(",") if item.strip()]
        if subscribed and event.event_type not in subscribed and "*" not in subscribed:
            continue
        if not hook.url:
            hook.last_status = "logged"
            continue
        req = urllib.request.Request(
            hook.url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-BizAI-Event": event.event_type,
                "X-BizAI-Secret": hook.secret or "",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=4) as response:
                hook.last_status = f"ok:{response.status}"
                hook.last_error = None
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            hook.last_status = "failed"
            hook.last_error = str(exc)[:400]


def list_events(db: Session, limit: int = 80, entity_type: Optional[str] = None, entity_id: Optional[int] = None):
    query = db.query(IntegrationEvent).order_by(IntegrationEvent.created_at.desc())
    if entity_type:
        query = query.filter(IntegrationEvent.entity_type == entity_type)
    if entity_id:
        query = query.filter(IntegrationEvent.entity_id == entity_id)
    rows = query.limit(limit).all()
    result = []
    for row in rows:
        try:
            payload = json.loads(row.payload or "{}")
        except json.JSONDecodeError:
            payload = {}
        result.append(
            {
                "id": row.id,
                "event_type": row.event_type,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "payload": payload,
                "created_at": row.created_at,
            }
        )
    return result


def list_webhooks(db: Session) -> List[WebhookEndpoint]:
    return db.query(WebhookEndpoint).order_by(WebhookEndpoint.id.asc()).all()


def upsert_webhook(db: Session, payload: dict, webhook_id: Optional[int] = None) -> WebhookEndpoint:
    if webhook_id:
        hook = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == webhook_id).first()
        if not hook:
            raise ValueError("Webhook not found")
    else:
        hook = WebhookEndpoint()
        db.add(hook)
    for key in ("name", "url", "secret", "events", "enabled"):
        if key in payload and payload[key] is not None:
            setattr(hook, key, payload[key])
    db.commit()
    db.refresh(hook)
    return hook


def apply_discount(db: Session, code: Optional[str], subtotal: float) -> tuple[float, Optional[str]]:
    if not code:
        return 0.0, None
    row = db.query(DiscountCode).filter(DiscountCode.code == code.strip().upper()).first()
    if not row or not row.active:
        raise ValueError("Discount code is invalid or inactive")
    if row.usage_limit is not None and (row.times_used or 0) >= row.usage_limit:
        raise ValueError("Discount code has reached its usage limit")
    if row.discount_type == "fixed":
        amount = min(float(row.value), subtotal)
    else:
        amount = round(subtotal * (float(row.value) / 100.0), 2)
    return amount, row.code


def bump_discount_usage(db: Session, code: Optional[str]):
    if not code:
        return
    row = db.query(DiscountCode).filter(DiscountCode.code == code).first()
    if row:
        row.times_used = (row.times_used or 0) + 1


def list_discounts(db: Session) -> List[DiscountCode]:
    return db.query(DiscountCode).order_by(DiscountCode.code.asc()).all()


def upsert_discount(db: Session, payload: dict, discount_id: Optional[int] = None) -> DiscountCode:
    if discount_id:
        row = db.query(DiscountCode).filter(DiscountCode.id == discount_id).first()
        if not row:
            raise ValueError("Discount not found")
    else:
        code = (payload.get("code") or "").strip().upper()
        row = db.query(DiscountCode).filter(DiscountCode.code == code).first()
        if not row:
            row = DiscountCode(code=code)
            db.add(row)
    for key in ("code", "discount_type", "value", "active", "usage_limit", "description"):
        if key in payload and payload[key] is not None:
            value = payload[key]
            if key == "code":
                value = str(value).strip().upper()
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row
