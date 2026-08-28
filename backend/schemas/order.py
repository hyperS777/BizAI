"""Order and OrderItem schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from models.order import OrderStatus


class OrderItemBase(BaseModel):
    product_id: int
    quantity: int


class OrderItemCreate(OrderItemBase):
    pass


class ProductLite(BaseModel):
    id: int
    name: str
    sku: str

    class Config:
        from_attributes = True


class CustomerLite(BaseModel):
    id: int
    name: str
    company: Optional[str] = None

    class Config:
        from_attributes = True


class OrderItemResponse(OrderItemBase):
    id: int
    order_id: int
    unit_price: float
    total_price: float
    product: Optional[ProductLite] = None

    class Config:
        from_attributes = True


class OrderBase(BaseModel):
    customer_id: int
    notes: Optional[str] = None


class OrderCreate(OrderBase):
    items: List[OrderItemCreate]


class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderResponse(OrderBase):
    id: int
    order_number: str
    status: str
    total_amount: float
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    customer: Optional[CustomerLite] = None

    class Config:
        from_attributes = True
