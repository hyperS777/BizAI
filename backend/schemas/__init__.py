"""
BizAI Schemas
"""

from .user import UserBase, UserCreate, UserUpdate, UserResponse, RoleBase, RoleResponse, Token, TokenData
from .customer import CustomerBase, CustomerCreate, CustomerUpdate, CustomerResponse
from .product import ProductBase, ProductCreate, ProductUpdate, ProductResponse, CategoryBase, CategoryCreate, CategoryResponse
from .order import OrderBase, OrderCreate, OrderUpdate, OrderResponse, OrderItemBase, OrderItemCreate, OrderItemResponse
from .invoice import InvoiceBase, InvoiceCreate, InvoiceUpdate, InvoiceResponse
from .expense import ExpenseBase, ExpenseCreate, ExpenseUpdate, ExpenseResponse
from .ai import AIQueryRequest, AIQueryResponse, AISummaryResponse
from .report import SalesSummary, RevenueProfitSummary, TopProduct, InventorySummary, DashboardMetrics
