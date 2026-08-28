"""Customer API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from schemas.order import OrderResponse
from services.customer_service import (
    get_customers,
    get_customer,
    create_customer,
    update_customer,
    delete_customer,
    get_customer_orders,
)
from utils.permissions import require_staff, require_employee

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("", response_model=List[CustomerResponse])
def read_customers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_customers(db, skip=skip, limit=limit, search=search)


@router.post("", response_model=CustomerResponse)
def create_new_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    return create_customer(db, customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
def read_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    db_customer = get_customer(db, customer_id)
    if db_customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return db_customer


@router.get("/{customer_id}/orders", response_model=List[OrderResponse])
def read_customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if get_customer(db, customer_id) is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return get_customer_orders(db, customer_id)


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_existing_customer(
    customer_id: int,
    customer_update: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    db_customer = update_customer(db, customer_id, customer_update)
    if db_customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return db_customer


@router.delete("/{customer_id}")
def remove_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    result = delete_customer(db, customer_id)
    if result == "missing":
        raise HTTPException(status_code=404, detail="Customer not found")
    if result == "in_use":
        raise HTTPException(status_code=400, detail="Customer has orders and cannot be deleted")
    return {"ok": True}
