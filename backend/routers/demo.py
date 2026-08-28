"""Controlled demo-data generation for local presentations."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.customer import Customer
from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem, OrderStatus
from models.product import Product
from models.user import User
from utils.permissions import require_manager

router = APIRouter(prefix="/api/demo", tags=["demo"])


class DemoRequest(BaseModel):
    scenario: str = "showcase"


@router.post("/simulate")
def simulate_business_data(
    payload: DemoRequest = DemoRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Create a selected, clearly synthetic dataset for demos and testing."""
    suffix = uuid.uuid4().hex[:6].upper()
    customer = Customer(
        name=f"Demo Customer {suffix}",
        email=f"demo-{suffix.lower()}@example.com",
        phone="9000000000",
        company="Demo Trading Co.",
    )
    product = Product(
        name=f"Demo Product {suffix}",
        sku=f"DEMO-{suffix}",
        price=1200.0,
        cost_price=700.0,
        stock_qty=24,
        min_stock_level=5,
    )
    db.add(customer)
    if payload.scenario == "customer":
        db.commit()
        return {"message": "Synthetic customer created", "customer_id": customer.id}

    db.add(product)
    db.flush()

    if payload.scenario == "inventory":
        product.stock_qty = 2
        product.min_stock_level = 10
        db.commit()
        return {"message": "Synthetic low-stock product created", "product_id": product.id}

    order = Order(
        order_number=f"ORD-DEMO-{suffix}",
        customer_id=customer.id,
        status=OrderStatus.DELIVERED.value,
        total_amount=product.price * 2,
        created_by=current_user.id,
        notes="Synthetic record created by the demo simulator.",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.id, product_id=product.id, quantity=2, unit_price=product.price, total_price=product.price * 2))
    if payload.scenario in ("order", "showcase"):
        db.add(Invoice(
        invoice_number=f"INV-DEMO-{suffix}",
        order_id=order.id,
        status=InvoiceStatus.PAID.value,
        total_amount=order.total_amount,
        paid_amount=order.total_amount,
        due_date=date.today() + timedelta(days=30),
    ))
    db.commit()
    return {"message": f"Synthetic {payload.scenario} data created", "customer_id": customer.id, "order_id": order.id}