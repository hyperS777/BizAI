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
    delivery_address: str = Field(min_length=8, max_length=500)
    items: List[StorefrontSimulationItem] = Field(min_length=1, max_length=30)
    session_id: str = Field(min_length=4, max_length=80)
    discount_code: Optional[str] = Field(default=None, max_length=40)
    payment_method: Optional[str] = Field(default="demo_card", max_length=50)


class StorefrontAnalyticsEventCreate(BaseModel):
    event_id: str = Field(min_length=4, max_length=160)
    session_id: str = Field(min_length=4, max_length=80)
    event_type: str
    product_id: str = Field(min_length=1, max_length=80)
    variant_id: Optional[str] = Field(default=None, max_length=80)
    quantity: int = Field(default=1, ge=1, le=10)
    source: str = "live"


class StorefrontSimulationResponse(BaseModel):
    id: int
    reference: str
    customer_name: str
    customer_email: str
    items: List[Dict[str, Any]]
    total_amount: float
    currency: str
    created_at: Optional[datetime] = None
    delivery_address: Optional[str] = None
    delivery_status: str = "ready_to_pack"
    delivery_agent_name: Optional[str] = None
    delivery_token: Optional[str] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    invoice_number: Optional[str] = None
    current_location: Optional[str] = None


class StorefrontDeliveryUpdate(BaseModel):
    status: Optional[str] = None
    agent_name: str = Field(min_length=2, max_length=120)
    note: Optional[str] = Field(default=None, max_length=500)
    checkpoint_id: Optional[str] = Field(default=None, max_length=40)
    current_location: Optional[str] = Field(default=None, max_length=200)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    class Config:
        from_attributes = True
