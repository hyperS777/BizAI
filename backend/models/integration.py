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
    delivery_address = Column(Text, nullable=True)
    items = Column(Text, nullable=False)
    total_amount = Column(Float, nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    delivery_status = Column(String(32), default="ready_to_pack", nullable=False)
    delivery_agent_name = Column(String(120), nullable=True)
    delivery_note = Column(Text, nullable=True)
    delivery_token_hash = Column(String(64), unique=True, nullable=True, index=True)
    delivery_updated_at = Column(DateTime(timezone=True), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    current_location = Column(String(200), nullable=True)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    checkpoint_log = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StorefrontAnalyticsEvent(Base):
    __tablename__ = "storefront_analytics_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(160), unique=True, nullable=False, index=True)
    session_id = Column(String(80), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)
    product_id = Column(String(80), nullable=False, index=True)
    product_title = Column(String(200), nullable=False)
    variant_id = Column(String(80), nullable=True)
    variant_title = Column(String(160), nullable=True)
    quantity = Column(Integer, default=1, nullable=False)
    source = Column(String(20), default="storefront", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


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
