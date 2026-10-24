"""
Shopify-style integrations: events, webhooks, discounts, settings.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey
from sqlalchemy.sql import func
from database import Base


class IntegrationEvent(Base):
    __tablename__ = "integration_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    entity_type = Column(String(40), nullable=False)
    entity_id = Column(Integer, nullable=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ShopifyWebhookReceipt(Base):
    __tablename__ = "shopify_webhook_receipts"

    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(String(120), unique=True, nullable=False, index=True)
    topic = Column(String(120), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="received")
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)


class StorefrontSimulation(Base):
    __tablename__ = "storefront_simulations"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(40), unique=True, nullable=False, index=True)
    customer_name = Column(String(150), nullable=False)
    customer_email = Column(String(255), nullable=False)
    items = Column(Text, nullable=False)
    total_amount = Column(Float, nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    url = Column(String(500), nullable=True)
    secret = Column(String(120), nullable=True)
    events = Column(String(400), default="order.confirmed,order.cancelled,invoice.paid,inventory.low_stock")
    enabled = Column(Boolean, default=True)
    last_status = Column(String(40), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(80), primary_key=True)
    value = Column(String(200), nullable=True)


class DiscountCode(Base):
    __tablename__ = "discount_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(40), unique=True, nullable=False, index=True)
    discount_type = Column(String(20), default="percent")  # percent | fixed
    value = Column(Float, nullable=False)
    active = Column(Boolean, default=True)
    usage_limit = Column(Integer, nullable=True)
    times_used = Column(Integer, default=0)
    description = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
