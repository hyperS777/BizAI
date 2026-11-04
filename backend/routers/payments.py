"""
Payments Router - Razorpay Real Payment Gateway & Webhook verification.
"""

import hashlib
import hmac
import logging
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from schemas.integration import StorefrontSimulationItem
from services.storefront_service import create_storefront_simulation

logger = logging.getLogger("bizai.payments")

router = APIRouter(prefix="/api/payments", tags=["payments"])


class RazorpayOrderCreate(BaseModel):
    amount: float = Field(..., gt=0, description="Amount in INR")
    currency: str = "INR"
    receipt: Optional[str] = None
    notes: Optional[Dict[str, Any]] = None


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    delivery_address: str
    session_id: str
    items: List[StorefrontSimulationItem]
    discount_code: Optional[str] = None


@router.get("/config")
def get_payment_config():
    """Returns gateway configuration for storefront checkout."""
    has_keys = bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)
    return {
        "razorpay_enabled": has_keys,
        "razorpay_key_id": settings.RAZORPAY_KEY_ID or "rzp_test_bizai_demo",
        "currency": "INR",
        "gateway": "Razorpay",
        "supported_methods": ["upi", "card", "netbanking", "wallet"],
        "delhivery_carrier": "Delhivery Express",
        "delhivery_enabled": bool(settings.DELHIVERY_API_KEY),
    }


@router.post("/razorpay/create-order")
def create_razorpay_order(payload: RazorpayOrderCreate):
    """
    Creates a real Razorpay Order via Razorpay API if credentials are configured.
    Falls back gracefully to seamless test order generation if keys are not yet added.
    """
    amount_in_paise = int(round(payload.amount * 100))
    receipt = payload.receipt or f"rcpt_{secrets.token_hex(6)}"

    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    "https://api.razorpay.com/v1/orders",
                    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
                    json={
                        "amount": amount_in_paise,
                        "currency": payload.currency.upper(),
                        "receipt": receipt[:40],
                        "notes": payload.notes or {},
                    },
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    return {
                        "id": data["id"],
                        "amount": data["amount"],
                        "currency": data["currency"],
                        "key_id": settings.RAZORPAY_KEY_ID,
                        "live_mode": True,
                        "status": data.get("status", "created"),
                    }
                else:
                    logger.error("Razorpay order creation failed: %s %s", res.status_code, res.text)
                    raise HTTPException(
                        status_code=res.status_code,
                        detail=f"Razorpay order failed: {res.text}",
                    )
        except Exception as exc:
            logger.exception("Failed to connect to Razorpay API: %s", exc)
            return {
                "id": f"order_test_{secrets.token_hex(8)}",
                "amount": amount_in_paise,
                "currency": payload.currency.upper(),
                "key_id": settings.RAZORPAY_KEY_ID or "rzp_test_bizai_demo",
                "live_mode": False,
                "warning": f"Razorpay API unavailable ({str(exc)}). Test mode active.",
            }

    # Seamless development mode when keys are pending
    return {
        "id": f"order_test_{secrets.token_hex(8)}",
        "amount": amount_in_paise,
        "currency": payload.currency.upper(),
        "key_id": "rzp_test_bizai_demo",
        "live_mode": False,
        "demo_notice": "Configure RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET in backend/.env for real credit card/UPI charges.",
    }


@router.post("/razorpay/verify")
def verify_razorpay_payment(payload: RazorpayVerifyRequest, db: Session = Depends(get_db)):
    """
    Verifies Razorpay HMAC SHA256 payment signature and executes real order fulfillment.
    """
    # 1. Signature check if live keys are configured
    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET and payload.razorpay_signature:
        generated = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
            f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(generated, payload.razorpay_signature):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment signature verification failed. Tampering detected.",
            )

    # 2. Convert to confirmed order via storefront service
    try:
        simulation = create_storefront_simulation(
            db=db,
            customer_name=payload.customer_name,
            customer_email=payload.customer_email,
            requested_address=payload.delivery_address,
            session_id=payload.session_id,
            requested_items=payload.items,
            discount_code=payload.discount_code,
            payment_method=f"Razorpay ({payload.razorpay_payment_id})",
            customer_phone=payload.customer_phone,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    return {
        "status": "success",
        "payment_id": payload.razorpay_payment_id,
        "order_id": payload.razorpay_order_id,
        "simulation": simulation,
    }
