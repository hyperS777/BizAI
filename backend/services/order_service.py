"""Order service: variants, discounts, FSM, cancel lock, automation."""

from typing import List, Optional
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from models.customer import Customer
from models.order import ALLOWED_TRANSITIONS, Order, OrderItem, OrderStatus
from models.product import Product, ProductVariant
from schemas.order import OrderCreate
from services.integration_service import apply_discount, bump_discount_usage, emit_event, get_setting, setting_enabled
from services.invoice_service import generate_invoice_from_order, void_invoice
from services.product_service import update_stock


def _status_value(status) -> str:
    return status.value if isinstance(status, OrderStatus) else str(status)


def get_order(db: Session, order_id: int) -> Optional[Order]:
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.variant),
            joinedload(Order.customer),
            joinedload(Order.invoice),
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
        joinedload(Order.items).joinedload(OrderItem.variant),
        joinedload(Order.customer),
        joinedload(Order.invoice),
    )
    if status:
        query = query.filter(Order.status == _status_value(status))
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    return query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()


def _resolve_variant(db: Session, product: Product, variant_id: Optional[int]) -> ProductVariant:
    variants = product.variants or []
    if variant_id:
        variant = db.query(ProductVariant).filter(
            ProductVariant.id == variant_id, ProductVariant.product_id == product.id
        ).first()
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variant {variant_id} not found for {product.name}")
        return variant
    if len(variants) == 1:
        return variants[0]
    if not variants:
        raise HTTPException(status_code=400, detail=f"{product.name} has no purchasable variant")
    raise HTTPException(status_code=400, detail=f"Select a color/size option for {product.name}")


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

    subtotal = 0.0
    for item in order.items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        product = (
            db.query(Product)
            .options(joinedload(Product.variants))
            .filter(Product.id == item.product_id)
            .first()
        )
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        if not product.is_active:
            raise HTTPException(status_code=400, detail=f"{product.name} is inactive")
        variant = _resolve_variant(db, product, item.variant_id)
        if not variant.is_active:
            raise HTTPException(status_code=400, detail=f"{product.name} {variant.title} is unavailable")
        unit_price = variant.selling_price
        total_price = unit_price * item.quantity
        subtotal += total_price
        db.add(
            OrderItem(
                order_id=db_order.id,
                product_id=product.id,
                variant_id=variant.id,
                quantity=item.quantity,
                unit_price=unit_price,
                cost_price=variant.unit_cost,
                total_price=total_price,
                option1=variant.option1,
                option2=variant.option2,
                sku=variant.sku,
            )
        )

    try:
        discount_amount, code = apply_discount(db, order.discount_code, subtotal)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db_order.subtotal_amount = round(subtotal, 2)
    db_order.discount_code = code
    db_order.discount_amount = discount_amount
    db_order.total_amount = round(max(subtotal - discount_amount, 0), 2)
    if code:
        bump_discount_usage(db, code)

    emit_event(
        db,
        "order.created",
        "order",
        db_order.id,
        {"order_number": order_number, "customer": customer.name, "total": db_order.total_amount},
    )
    db.commit()
    return get_order(db, db_order.id)


def _adjust_line_stock(db: Session, order: Order, multiplier: int, reason: str):
    for item in order.items:
        update_stock(
            db,
            item.product_id,
            multiplier * item.quantity,
            reason=reason,
            notes=order.order_number,
            user_id=order.created_by,
            commit=False,
            variant_id=item.variant_id,
        )


def update_order_status(db: Session, order_id: int, status: OrderStatus) -> Optional[Order]:
    db_order = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.invoice), joinedload(Order.customer))
        .filter(Order.id == order_id)
        .first()
    )
    if not db_order:
        return None

    new_status = _status_value(status)
    old_status = _status_value(db_order.status)

    if new_status == old_status:
        return get_order(db, order_id)

    if new_status == OrderStatus.CANCELLED.value:
        lock_after = get_setting(db, "cancel_lock_after", "shipped")
        locked_statuses = {OrderStatus.SHIPPED.value, OrderStatus.DELIVERED.value}
        if lock_after == "confirmed":
            locked_statuses.add(OrderStatus.CONFIRMED.value)
        if old_status in locked_statuses:
            raise HTTPException(
                status_code=400,
                detail="Cancellation is locked at this stage. Use a return/refund workflow instead.",
            )

    allowed = ALLOWED_TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from {old_status} to {new_status}",
        )

    if new_status == OrderStatus.CONFIRMED.value:
        try:
            _adjust_line_stock(db, db_order, -1, "order_confirmed")
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        db_order.status = new_status
        if setting_enabled(db, "auto_invoice_on_confirm"):
            generate_invoice_from_order(db, db_order.id, commit=False)
        emit_event(
            db,
            "order.confirmed",
            "order",
            db_order.id,
            {"order_number": db_order.order_number, "total": db_order.total_amount},
        )

    elif new_status == OrderStatus.CANCELLED.value:
        if old_status == OrderStatus.CONFIRMED.value:
            _adjust_line_stock(db, db_order, 1, "order_cancelled")
        void_invoice(db, db_order.id, commit=False)
        db_order.status = new_status
        emit_event(
            db,
            "order.cancelled",
            "order",
            db_order.id,
            {"order_number": db_order.order_number, "from": old_status},
        )

    else:
        db_order.status = new_status
        event = "order.shipped" if new_status == OrderStatus.SHIPPED.value else "order.delivered"
        emit_event(
            db,
            event,
            "order",
            db_order.id,
            {"order_number": db_order.order_number},
        )

    db.commit()
    return get_order(db, order_id)
