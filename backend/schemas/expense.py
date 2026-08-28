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
    date: date
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    date: Optional[date] = None
    notes: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: int
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
