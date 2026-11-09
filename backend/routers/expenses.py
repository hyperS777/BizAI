"""Expenses API."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.expense import Expense
from models.user import User
from schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseUpdate
from services.expense_service import (
    create_expense,
    delete_expense,
    get_expense,
    get_expenses,
    update_expense,
)
from utils.permissions import require_accountant

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("", response_model=List[ExpenseResponse])
def read_expenses(
    skip: int = 0,
    limit: int = 200,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    view: Optional[str] = Query(None, description="'realized' (<= today), 'scheduled' (> today), or 'all'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    return get_expenses(
        db,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        view=view,
    )


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


@router.delete("/recurring/cancel")
def cancel_future_recurring(
    description: str = Query(..., description="Prefix of recurring expense description to cancel"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    today = date.today()
    deleted = (
        db.query(Expense)
        .filter(Expense.description.like(f"{description}%"), Expense.date > today)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "cancelled_count": deleted}


@router.post("/bulk", response_model=List[ExpenseResponse])
def add_bulk_expenses(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Create recurring expenses (monthly or annual).
    
    The initial occurrence is set for current/due date, and future occurrences
    are scheduled with their respective future dates so cashflow projections can
    track them without deducting from realized net profit before they occur.
    """
    import calendar
    description = payload.get("description", "").strip()
    amount = float(payload.get("amount", 0))
    category = payload.get("category", "Other")
    start_date_str = payload.get("start_date", str(date.today()))
    frequency = payload.get("frequency", "monthly")
    months = max(1, min(60, int(payload.get("months", 12))))

    try:
        start = date.fromisoformat(start_date_str)
    except (ValueError, TypeError):
        start = date.today()

    today = date.today()
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
                last_day = calendar.monthrange(yr, m)[1]
                exp_date = start.replace(year=yr, month=m, day=last_day)

        is_future = exp_date > today
        note = (
            f"Scheduled recurring ({frequency}) commitment"
            if is_future
            else f"Realized recurring ({frequency}) entry"
        )

        exp = create_expense(
            db,
            ExpenseCreate(
                description=f"{description} ({exp_date.strftime('%b %Y')})",
                amount=amount,
                category=category,
                date=exp_date,
                notes=note,
            ),
            current_user.id,
        )
        results.append(exp)
    return results
