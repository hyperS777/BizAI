"""
BizAI Database Models
Imports all models so they are registered with SQLAlchemy Base.
"""

from models.user import Role, User
from models.customer import Customer
from models.product import Category, Product, ProductVariant
from models.order import Order, OrderItem
from models.invoice import Invoice, Payment
from models.expense import Expense
from models.ai_query import AIQuery
from models.inventory import InventoryMovement
from models.integration import IntegrationEvent, WebhookEndpoint, AppSetting, DiscountCode, ShopifyWebhookReceipt, StorefrontSimulation

__all__ = [
    "Role",
    "User",
    "Customer",
    "Category",
    "Product",
    "ProductVariant",
    "Order",
    "OrderItem",
    "Invoice",
    "Payment",
    "Expense",
    "AIQuery",
    "InventoryMovement",
    "IntegrationEvent",
    "WebhookEndpoint",
    "AppSetting",
    "DiscountCode",
    "ShopifyWebhookReceipt",
    "StorefrontSimulation",
]
