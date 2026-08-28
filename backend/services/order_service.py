"""Order service for create, list, and status updates."""

from typing import List, Optional
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from models.customer import Customer
from models.order import Order, OrderItem, OrderStatus
from models.product import Product
from schemas.order import OrderCreate
from services.product_service import update_stock


def _status_value(status) -> str:
    return status.value if isinstance(status, OrderStatus) else str(status)


def get_order(db: Session, order_id: int) -> Optional[Order]:
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.customer),
        )
        .filter(Order.id == order_id)
        .first()
    )


def get_orders(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: Optional[OrderStatus] = None,
    customer_id: Optional[int] = None,
) -> List[Order]:
    query = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.customer),
    )
    if status:
        query = query.filter(Order.status == _status_value(status))
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    return query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()


def create_order(db: Session, order: OrderCreate, user_id: int) -> Order:
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not order.items:
        raise HTTPException(status_code=400, detail="An order must include at least one item")

    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    db_order = Order(
        order_number=order_number,
        customer_id=order.customer_id,
        notes=order.notes,
        created_by=user_id,
        status=OrderStatus.PENDING.value,
    )
    db.add(db_order)
    db.flush()

    total_amount = 0.0
    for item in order.items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        if not product.is_active:
            raise HTTPException(status_code=400, detail=f"{product.name} is inactive")
        unit_price = product.price
        total_price = unit_price * item.quantity
        total_amount += total_price
        db.add(
            OrderItem(
                order_id=db_order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                total_price=total_price,
            )
        )

    db_order.total_amount = total_amount
    db.commit()
    return get_order(db, db_order.id)


def update_order_status(db: Session, order_id: int, status: OrderStatus) -> Optional[Order]:
    db_order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not db_order:
        return None

    new_status = _status_value(status)
    old_status = _status_value(db_order.status)

    if new_status == old_status:
        return get_order(db, order_id)

    if new_status == OrderStatus.CONFIRMED.value and old_status == OrderStatus.PENDING.value:
        try:
            for item in db_order.items:
                update_stock(
                    db,
                    item.product_id,
                    -item.quantity,
                    reason="order_confirmed",
                    notes=db_order.order_number,
                    user_id=db_order.created_by,
                    commit=False,
                )
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    elif new_status == OrderStatus.CANCELLED.value and old_status in {
        OrderStatus.CONFIRMED.value,
        OrderStatus.SHIPPED.value,
    }:
        for item in db_order.items:
            update_stock(
                db,
                item.product_id,
                item.quantity,
                reason="order_cancelled",
                notes=db_order.order_number,
                user_id=db_order.created_by,
                commit=False,
            )

    db_order.status = new_status
    db.commit()
    return get_order(db, order_id)
