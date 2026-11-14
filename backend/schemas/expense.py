"""
Expense schemas
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class ExpenseBase(BaseModel):
    description: str
    amount: float
    category: Optional[str] = None
    vendor: Optional[str] = None
    payment_mode: Optional[str] = "bank_transfer"
    receipt_url: Optional[str] = None
    vendor_gstin: Optional[str] = None
    gst_amount: Optional[float] = 0.0
    date: date
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    vendor: Optional[str] = None
    payment_mode: Optional[str] = None
    receipt_url: Optional[str] = None
    vendor_gstin: Optional[str] = None
    gst_amount: Optional[float] = None
    date: Optional[date] = None
    notes: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: int
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
