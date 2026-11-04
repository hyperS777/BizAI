"""Expenses API."""

from typing import List, Optional
from datetime import date, timedelta

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


@router.post("/bulk", response_model=List[ExpenseResponse])
def add_bulk_expenses(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Create multiple recurring expenses (monthly or annual).
    
    Body: { description, amount, category, start_date, frequency: 'monthly'|'annual', months: int }
    """
    from datetime import date as _date
    from schemas.expense import ExpenseCreate
    description = payload.get("description", "")
    amount = float(payload.get("amount", 0))
    category = payload.get("category", "Other")
    start_date_str = payload.get("start_date", str(_date.today()))
    frequency = payload.get("frequency", "monthly")
    months = int(payload.get("months", 12))

    try:
        start = _date.fromisoformat(start_date_str)
    except (ValueError, TypeError):
        start = _date.today()

    results = []
    for i in range(months):
        if frequency == "annual":
            yr = start.year + i
            exp_date = start.replace(year=yr)
        else:
            # monthly: advance month by month
            m = start.month + i
            yr = start.year + (m - 1) // 12
            m = ((m - 1) % 12) + 1
            try:
                exp_date = start.replace(year=yr, month=m)
            except ValueError:
                # Handle Feb 29 edge-case
                import calendar
                last_day = calendar.monthrange(yr, m)[1]
                exp_date = start.replace(year=yr, month=m, day=last_day)

        exp = create_expense(
            db,
            ExpenseCreate(
                description=f"{description} ({exp_date.strftime('%b %Y')})",
                amount=amount,
                category=category,
                date=exp_date,
                notes=f"Auto-created recurring ({frequency}) entry",
            ),
            current_user.id,
        )
        results.append(exp)
    return results
