"""Product and inventory service."""

from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from models.inventory import InventoryMovement
from models.product import Category, Product
from schemas.product import ProductCreate, ProductUpdate


def get_product(db: Session, product_id: int) -> Optional[Product]:
    return (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.id == product_id)
        .first()
    )


def get_products(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
) -> List[Product]:
    query = db.query(Product).options(joinedload(Product.category))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search:
        term = f"%{search}%"
        query = query.filter(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    return query.order_by(Product.name.asc()).offset(skip).limit(limit).all()


def get_low_stock_products(db: Session) -> List[Product]:
    return (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.stock_qty <= Product.min_stock_level)
        .order_by(Product.stock_qty.asc())
        .all()
    )


def create_product(db: Session, product: ProductCreate) -> Product:
    db_product = Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return get_product(db, db_product.id)


def update_product(
    db: Session, product_id: int, product_update: ProductUpdate
) -> Optional[Product]:
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        return None

    update_data = product_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_product, key, value)

    db.commit()
    return get_product(db, product_id)


def update_stock(
    db: Session,
    product_id: int,
    quantity_change: int,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    user_id: Optional[int] = None,
    commit: bool = True,
) -> Optional[Product]:
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        return None

    new_qty = db_product.stock_qty + quantity_change
    if new_qty < 0:
        raise ValueError("Insufficient stock")

    db_product.stock_qty = new_qty
    db.add(
        InventoryMovement(
            product_id=product_id,
            quantity_change=quantity_change,
            reason=reason or "adjustment",
            notes=notes,
            created_by=user_id,
        )
    )
    if commit:
        db.commit()
        db.refresh(db_product)
    else:
        db.flush()
    return db_product


def get_categories(db: Session) -> List[Category]:
    return db.query(Category).order_by(Category.name.asc()).all()


def create_category(db: Session, name: str, description: Optional[str] = None) -> Category:
    existing = db.query(Category).filter(Category.name == name).first()
    if existing:
        return existing
    category = Category(name=name, description=description)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_inventory_history(db: Session, product_id: Optional[int] = None, limit: int = 50):
    query = db.query(InventoryMovement).order_by(InventoryMovement.created_at.desc())
    if product_id:
        query = query.filter(InventoryMovement.product_id == product_id)
    return query.limit(limit).all()
