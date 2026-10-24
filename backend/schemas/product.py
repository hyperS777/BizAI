"""Product, variant, and inventory schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, computed_field, Field


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int

    class Config:
        from_attributes = True


class VariantUpsert(BaseModel):
    sku: str
    option1: Optional[str] = None
    option2: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: int = 0
    min_stock_level: Optional[int] = 2
    barcode: Optional[str] = None
    is_active: Optional[bool] = True


class VariantResponse(BaseModel):
    id: int
    product_id: int
    sku: str
    option1: Optional[str] = None
    option2: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: int = 0
    min_stock_level: int = 2
    barcode: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True

    @computed_field
    @property
    def title(self) -> str:
        parts = [p for p in (self.option1, self.option2) if p]
        return " / ".join(parts) if parts else "Default"

    @computed_field
    @property
    def is_low_stock(self) -> bool:
        return (self.stock_qty or 0) <= (self.min_stock_level or 0)


class ProductBase(BaseModel):
    name: str
    sku: str
    description: Optional[str] = None
    price: float
    cost_price: float
    compare_at_price: Optional[float] = None
    stock_qty: Optional[int] = 0
    min_stock_level: Optional[int] = 10
    category_id: Optional[int] = None
    product_type: Optional[str] = None
    vendor: Optional[str] = "Reihh"
    tags: Optional[str] = None
    option1_name: Optional[str] = "Color"
    option2_name: Optional[str] = "Size"
    image_url: Optional[str] = None
    is_active: Optional[bool] = True


class ProductCreate(ProductBase):
    variants: List[VariantUpsert] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    compare_at_price: Optional[float] = None
    stock_qty: Optional[int] = None
    min_stock_level: Optional[int] = None
    category_id: Optional[int] = None
    product_type: Optional[str] = None
    vendor: Optional[str] = None
    tags: Optional[str] = None
    option1_name: Optional[str] = None
    option2_name: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    variants: Optional[List[VariantUpsert]] = None


class StockAdjust(BaseModel):
    quantity_change: int
    reason: Optional[str] = "manual_adjustment"
    notes: Optional[str] = None
    variant_id: Optional[int] = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    category: Optional[CategoryResponse] = None
    variants: List[VariantResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field
    @property
    def is_low_stock(self) -> bool:
        if (self.stock_qty or 0) <= (self.min_stock_level or 0):
            return True
        return any((v.stock_qty or 0) <= (v.min_stock_level or 0) for v in self.variants)


class InventoryMovementResponse(BaseModel):
    id: int
    product_id: int
    variant_id: Optional[int] = None
    quantity_change: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
