"""Customer service for CRUD operations."""

from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.customer import Customer
from models.order import Order
from schemas.customer import CustomerCreate, CustomerUpdate


def get_customer(db: Session, customer_id: int) -> Optional[Customer]:
    return db.query(Customer).filter(Customer.id == customer_id).first()


def get_customers(
    db: Session, skip: int = 0, limit: int = 100, search: Optional[str] = None
) -> List[Customer]:
    query = db.query(Customer)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Customer.name.ilike(term),
                Customer.company.ilike(term),
                Customer.email.ilike(term),
                Customer.phone.ilike(term),
            )
        )
    return query.order_by(Customer.created_at.desc()).offset(skip).limit(limit).all()


def create_customer(db: Session, customer: CustomerCreate) -> Customer:
    payload = customer.model_dump()
    for key in ("email", "phone", "address", "company", "gstin"):
        if payload.get(key) == "":
            payload[key] = None
    db_customer = Customer(**payload)
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer


def update_customer(
    db: Session, customer_id: int, customer_update: CustomerUpdate
) -> Optional[Customer]:
    db_customer = get_customer(db, customer_id)
    if not db_customer:
        return None

    update_data = customer_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value == "":
            value = None
        setattr(db_customer, key, value)

    db.commit()
    db.refresh(db_customer)
    return db_customer


def delete_customer(db: Session, customer_id: int) -> Optional[str]:
    db_customer = get_customer(db, customer_id)
    if not db_customer:
        return "missing"
    has_orders = db.query(Order).filter(Order.customer_id == customer_id).first()
    if has_orders:
        return "in_use"
    db.delete(db_customer)
    db.commit()
    return "deleted"


def get_customer_orders(db: Session, customer_id: int) -> List[Order]:
    return (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .all()
    )
