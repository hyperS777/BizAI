"""Integration, webhook, discount, and settings schemas."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


class IntegrationEventResponse(BaseModel):
    id: int
    event_type: str
    entity_type: str
    entity_id: Optional[int] = None
    payload: Dict[str, Any] = {}
    created_at: Optional[datetime] = None


class WebhookPayload(BaseModel):
    name: str
    url: Optional[str] = ""
    secret: Optional[str] = None
    events: Optional[str] = "order.confirmed,invoice.paid,inventory.low_stock"
    enabled: Optional[bool] = True


class WebhookResponse(BaseModel):
    id: int
    name: str
    url: Optional[str] = None
    events: Optional[str] = None
    enabled: bool = True
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    auto_invoice_on_confirm: Optional[bool] = None
    auto_mark_overdue: Optional[bool] = None
    store_channel: Optional[str] = None
    store_currency: Optional[str] = None
    cancel_lock_after: Optional[str] = None


class DiscountPayload(BaseModel):
    code: str
    discount_type: str = "percent"
    value: float
    active: bool = True
    usage_limit: Optional[int] = None
    description: Optional[str] = None


class DiscountResponse(BaseModel):
    id: int
    code: str
    discount_type: str
    value: float
    active: bool
    usage_limit: Optional[int] = None
    times_used: int = 0
    description: Optional[str] = None

    class Config:
        from_attributes = True


class IntegrationDashboard(BaseModel):
    settings: Dict[str, str]
    events: List[IntegrationEventResponse]
    webhooks: List[WebhookResponse]
    discounts: List[DiscountResponse]
    store: Dict[str, Any]


class StorefrontSimulationItem(BaseModel):
    variant_id: str
    quantity: int = Field(ge=1, le=10)


class StorefrontSimulationCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=150)
    customer_email: EmailStr
    items: List[StorefrontSimulationItem] = Field(min_length=1, max_length=30)


class StorefrontSimulationResponse(BaseModel):
    id: int
    reference: str
    customer_name: str
    customer_email: str
    items: List[Dict[str, Any]]
    total_amount: float
    currency: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
