"""
Product and Category models.
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
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)           # selling price
    cost_price = Column(Float, nullable=False)       # purchase/cost price
    stock_qty = Column(Integer, default=0)
    min_stock_level = Column(Integer, default=10)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("Category", back_populates="products")
    order_items = relationship("OrderItem", back_populates="product")
    movements = relationship("InventoryMovement", back_populates="product")

    @property
    def is_low_stock(self) -> bool:
        return self.stock_qty <= self.min_stock_level

    def __repr__(self):
        return f"<Product {self.name} (SKU: {self.sku})>"
