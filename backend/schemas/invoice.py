"""Invoice schemas."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, computed_field

from models.invoice import InvoiceStatus
from schemas.order import OrderResponse


class InvoiceBase(BaseModel):
    order_id: int
    due_date: Optional[date] = None


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceUpdate(BaseModel):
    status: Optional[InvoiceStatus] = None
    paid_amount: Optional[float] = None


class InvoiceResponse(InvoiceBase):
    id: int
    invoice_number: str
    status: str
    total_amount: float
    paid_amount: float
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[OrderResponse] = None

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
