"""Invoice schemas."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, computed_field, Field

from models.invoice import InvoiceStatus
from schemas.order import OrderResponse, CustomerLite


class InvoiceBase(BaseModel):
    order_id: Optional[int] = None
    customer_id: Optional[int] = None
    due_date: Optional[date] = None
    payment_method: Optional[str] = None
    taxable_amount: Optional[float] = 0.0
    cgst: Optional[float] = 0.0
    sgst: Optional[float] = 0.0
    igst: Optional[float] = 0.0
    notes: Optional[str] = None


class InvoiceCreate(BaseModel):
    order_id: Optional[int] = None
    customer_id: Optional[int] = None
    total_amount: float
    due_date: Optional[date] = None
    payment_method: Optional[str] = "bank_transfer"
    taxable_amount: Optional[float] = 0.0
    cgst: Optional[float] = 0.0
    sgst: Optional[float] = 0.0
    igst: Optional[float] = 0.0
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    status: Optional[InvoiceStatus] = None
    paid_amount: Optional[float] = None
    payment_amount: Optional[float] = None
    method: Optional[str] = "manual"
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    id: int
    invoice_id: int
    amount: float
    method: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceResponse(InvoiceBase):
    id: int
    invoice_number: str
    status: str
    total_amount: float
    paid_amount: float
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[OrderResponse] = None
    customer: Optional[CustomerLite] = None
    payments: List[PaymentResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

    @computed_field
    @property
    def balance_due(self) -> float:
        return round((self.total_amount or 0) - (self.paid_amount or 0), 2)

    @computed_field
    @property
    def issue_date(self) -> Optional[datetime]:
        return self.created_at
