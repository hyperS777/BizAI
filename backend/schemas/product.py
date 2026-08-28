"""Product and inventory schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, computed_field


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int

    class Config:
        from_attributes = True


class ProductBase(BaseModel):
    name: str
    sku: str
    description: Optional[str] = None
    price: float
    cost_price: float
    stock_qty: Optional[int] = 0
    min_stock_level: Optional[int] = 10
    category_id: Optional[int] = None
    is_active: Optional[bool] = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: Optional[int] = None
    min_stock_level: Optional[int] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class StockAdjust(BaseModel):
    quantity_change: int
    reason: Optional[str] = "manual_adjustment"
    notes: Optional[str] = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True

    @computed_field
    @property
    def is_low_stock(self) -> bool:
        return (self.stock_qty or 0) <= (self.min_stock_level or 0)


class InventoryMovementResponse(BaseModel):
    id: int
    product_id: int
    quantity_change: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
