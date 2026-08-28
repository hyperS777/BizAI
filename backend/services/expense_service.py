"""
Expense service for CRUD operations
"""

from sqlalchemy.orm import Session
from models.expense import Expense
from schemas.expense import ExpenseCreate, ExpenseUpdate
from typing import List, Optional
from datetime import date


def get_expense(db: Session, expense_id: int) -> Optional[Expense]:
    return db.query(Expense).filter(Expense.id == expense_id).first()


def get_expenses(db: Session, skip: int = 0, limit: int = 100, start_date: Optional[date] = None, end_date: Optional[date] = None) -> List[Expense]:
    query = db.query(Expense)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    return query.order_by(Expense.date.desc()).offset(skip).limit(limit).all()


def create_expense(db: Session, expense: ExpenseCreate, user_id: int) -> Expense:
    db_expense = Expense(
        **expense.model_dump(),
        created_by=user_id
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense


def update_expense(db: Session, expense_id: int, expense_update: ExpenseUpdate) -> Optional[Expense]:
    db_expense = get_expense(db, expense_id)
    if not db_expense:
        return None

    update_data = expense_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_expense, key, value)

    db.commit()
    db.refresh(db_expense)
    return db_expense


def delete_expense(db: Session, expense_id: int) -> bool:
    db_expense = get_expense(db, expense_id)
    if not db_expense:
        return False
        
    db.delete(db_expense)
    db.commit()
    return True
