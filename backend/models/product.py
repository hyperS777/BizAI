"""
Product, Category, and Shopify-style variant models.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(300), nullable=True)

    products = relationship("Product", back_populates="category")

    def __repr__(self):
        return f"<Category {self.name}>"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    sku = Column(String(50), unique=True, nullable=False)
    shopify_product_id = Column(String(80), unique=True, nullable=True, index=True)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    cost_price = Column(Float, nullable=False)
    compare_at_price = Column(Float, nullable=True)
    stock_qty = Column(Integer, default=0)
    min_stock_level = Column(Integer, default=10)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    product_type = Column(String(80), nullable=True)
    vendor = Column(String(120), default="Reihh")
    tags = Column(String(255), nullable=True)
    option1_name = Column(String(50), default="Color")
    option2_name = Column(String(50), default="Size")
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    order_items = relationship("OrderItem", back_populates="product")
    movements = relationship("InventoryMovement", back_populates="product")

    @property
    def is_low_stock(self) -> bool:
        return (self.stock_qty or 0) <= (self.min_stock_level or 0)

    def __repr__(self):
        return f"<Product {self.name} (SKU: {self.sku})>"


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String(80), unique=True, nullable=False)
    shopify_variant_id = Column(String(80), unique=True, nullable=True, index=True)
    shopify_inventory_item_id = Column(String(80), unique=True, nullable=True, index=True)
    option1 = Column(String(80), nullable=True)
    option2 = Column(String(80), nullable=True)
    price = Column(Float, nullable=True)
    cost_price = Column(Float, nullable=True)
    stock_qty = Column(Integer, default=0)
    min_stock_level = Column(Integer, default=2)
    barcode = Column(String(80), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="variants")
    order_items = relationship("OrderItem", back_populates="variant")
    movements = relationship("InventoryMovement", back_populates="variant")

    @property
    def title(self) -> str:
        parts = [p for p in (self.option1, self.option2) if p]
        return " / ".join(parts) if parts else "Default"

    @property
    def selling_price(self) -> float:
        if self.price is not None:
            return self.price
        return self.product.price if self.product else 0

    @property
    def unit_cost(self) -> float:
        if self.cost_price is not None:
            return self.cost_price
        return self.product.cost_price if self.product else 0

    @property
    def is_low_stock(self) -> bool:
        return (self.stock_qty or 0) <= (self.min_stock_level or 0)

    def __repr__(self):
        return f"<ProductVariant {self.sku}>"
