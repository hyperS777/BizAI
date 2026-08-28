"""Orders API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.order import OrderStatus
from models.user import User
from schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate
from services.order_service import get_orders, get_order, create_order, update_order_status
from utils.permissions import require_staff, require_employee, require_manager

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=List[OrderResponse])
def read_orders(
    skip: int = 0,
    limit: int = 100,
    status: Optional[OrderStatus] = None,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_orders(db, skip=skip, limit=limit, status=status, customer_id=customer_id)


@router.post("", response_model=OrderResponse)
def create_new_order(
    order: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    return create_order(db, order, current_user.id)


@router.get("/{order_id}", response_model=OrderResponse)
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    db_order = get_order(db, order_id)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return db_order


@router.patch("/{order_id}/status", response_model=OrderResponse)
def change_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    db_order = update_order_status(db, order_id, payload.status)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return db_order
