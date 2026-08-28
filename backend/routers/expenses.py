"""Expenses API."""

from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse
from services.expense_service import get_expenses, create_expense, update_expense, delete_expense, get_expense
from utils.permissions import require_accountant

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("", response_model=List[ExpenseResponse])
def read_expenses(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    return get_expenses(db, skip=skip, limit=limit, start_date=start_date, end_date=end_date)


@router.post("", response_model=ExpenseResponse)
def add_expense(
    expense: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    return create_expense(db, expense, current_user.id)


@router.put("/{expense_id}", response_model=ExpenseResponse)
def edit_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    updated = update_expense(db, expense_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Expense not found")
    return updated


@router.delete("/{expense_id}")
def remove_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    if not delete_expense(db, expense_id):
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"ok": True}
