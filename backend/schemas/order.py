"""Order and OrderItem schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, computed_field, Field

from models.order import ALLOWED_TRANSITIONS, CANCEL_LOCKED_STATUSES, OrderStatus


class OrderItemBase(BaseModel):
    product_id: int
    quantity: int
    variant_id: Optional[int] = None


class OrderItemCreate(OrderItemBase):
    pass


class ProductLite(BaseModel):
    id: int
    name: str
    sku: str
    option1_name: Optional[str] = None
    option2_name: Optional[str] = None

    class Config:
        from_attributes = True


class VariantLite(BaseModel):
    id: int
    sku: str
    option1: Optional[str] = None
    option2: Optional[str] = None
    title: Optional[str] = None

    class Config:
        from_attributes = True

    @computed_field
    @property
    def display_title(self) -> str:
        return self.title or " / ".join([p for p in (self.option1, self.option2) if p]) or self.sku


class CustomerLite(BaseModel):
    id: int
    name: str
    company: Optional[str] = None

    class Config:
        from_attributes = True


class InvoiceLite(BaseModel):
    id: int
    invoice_number: str
    status: str
    paid_amount: float = 0
    total_amount: float = 0

    class Config:
        from_attributes = True


class OrderItemResponse(OrderItemBase):
    id: int
    order_id: int
    unit_price: float
    total_price: float
    option1: Optional[str] = None
    option2: Optional[str] = None
    sku: Optional[str] = None
    product: Optional[ProductLite] = None
    variant: Optional[VariantLite] = None

    class Config:
        from_attributes = True


class OrderBase(BaseModel):
    customer_id: int
    notes: Optional[str] = None


class OrderCreate(OrderBase):
    items: List[OrderItemCreate]
    discount_code: Optional[str] = None


class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderResponse(OrderBase):
    id: int
    order_number: str
    status: str
    subtotal_amount: float = 0
    discount_code: Optional[str] = None
    discount_amount: float = 0
    shipping_amount: float = 0
    shipping_address: Optional[str] = None
    tracking_company: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_updated_at: Optional[datetime] = None
    total_amount: float
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse] = Field(default_factory=list)
    customer: Optional[CustomerLite] = None
    invoice: Optional[InvoiceLite] = None

    class Config:
        from_attributes = True

    @computed_field
    @property
    def allowed_next_statuses(self) -> List[str]:
        return sorted(ALLOWED_TRANSITIONS.get(self.status, set()))

    @computed_field
    @property
    def cancel_locked(self) -> bool:
        return self.status in CANCEL_LOCKED_STATUSES
