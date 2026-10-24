"""Product, variant, and inventory service."""

from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from models.inventory import InventoryMovement
from models.product import Category, Product, ProductVariant
from schemas.product import ProductCreate, ProductUpdate, VariantUpsert


def _sync_product_stock(product: Product):
    if product.variants:
        product.stock_qty = sum(v.stock_qty or 0 for v in product.variants)
        prices = [v.selling_price for v in product.variants]
        if prices:
            product.price = min(prices)


def get_product(db: Session, product_id: int) -> Optional[Product]:
    return (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.variants))
        .filter(Product.id == product_id)
        .first()
    )


def get_products(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    product_type: Optional[str] = None,
) -> List[Product]:
    query = db.query(Product).options(joinedload(Product.category), joinedload(Product.variants))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if product_type:
        query = query.filter(Product.product_type == product_type)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.tags.ilike(term),
                Product.vendor.ilike(term),
            )
        )
    return query.order_by(Product.name.asc()).offset(skip).limit(limit).all()


def get_low_stock_products(db: Session) -> List[Product]:
    products = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.variants))
        .filter(Product.is_active.is_(True))
        .order_by(Product.stock_qty.asc())
        .all()
    )
    return [p for p in products if p.is_low_stock or any(v.is_low_stock for v in p.variants)]


def _ensure_default_variant(db: Session, product: Product) -> ProductVariant:
    if product.variants:
        return product.variants[0]
    variant = ProductVariant(
        product_id=product.id,
        sku=product.sku,
        option1=None,
        option2=None,
        price=product.price,
        cost_price=product.cost_price,
        stock_qty=product.stock_qty or 0,
        min_stock_level=product.min_stock_level or 2,
    )
    db.add(variant)
    db.flush()
    return variant


def _create_variants(db: Session, product: Product, variants: List[VariantUpsert]):
    for item in variants:
        db.add(
            ProductVariant(
                product_id=product.id,
                sku=item.sku,
                option1=item.option1,
                option2=item.option2,
                price=item.price if item.price is not None else product.price,
                cost_price=item.cost_price if item.cost_price is not None else product.cost_price,
                stock_qty=item.stock_qty or 0,
                min_stock_level=item.min_stock_level or 2,
                barcode=item.barcode,
            )
        )
    db.flush()
    db.refresh(product)
    _sync_product_stock(product)


def create_product(db: Session, product: ProductCreate) -> Product:
    payload = product.model_dump(exclude={"variants"})
    variants = product.variants or []
    db_product = Product(**payload)
    db.add(db_product)
    db.flush()
    if variants:
        _create_variants(db, db_product, variants)
    else:
        _ensure_default_variant(db, db_product)
        _sync_product_stock(db_product)
    db.commit()
    return get_product(db, db_product.id)


def update_product(db: Session, product_id: int, product_update: ProductUpdate) -> Optional[Product]:
    db_product = get_product(db, product_id)
    if not db_product:
        return None

    data = product_update.model_dump(exclude_unset=True, exclude={"variants"})
    variants = product_update.variants
    for key, value in data.items():
        setattr(db_product, key, value)

    if variants is not None:
        existing = {v.sku: v for v in db_product.variants}
        seen = set()
        for item in variants:
            seen.add(item.sku)
            current = existing.get(item.sku)
            if current:
                current.option1 = item.option1
                current.option2 = item.option2
                current.price = item.price if item.price is not None else db_product.price
                current.cost_price = item.cost_price if item.cost_price is not None else db_product.cost_price
                current.stock_qty = item.stock_qty
                current.min_stock_level = item.min_stock_level or current.min_stock_level
                current.barcode = item.barcode
                current.is_active = True if item.is_active is None else item.is_active
            else:
                db.add(
                    ProductVariant(
                        product_id=db_product.id,
                        sku=item.sku,
                        option1=item.option1,
                        option2=item.option2,
                        price=item.price if item.price is not None else db_product.price,
                        cost_price=item.cost_price if item.cost_price is not None else db_product.cost_price,
                        stock_qty=item.stock_qty or 0,
                        min_stock_level=item.min_stock_level or 2,
                        barcode=item.barcode,
                    )
                )
        for sku, current in existing.items():
            if sku not in seen:
                current.is_active = False
        db.flush()
        db.refresh(db_product)
        _sync_product_stock(db_product)

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
    variant_id: Optional[int] = None,
) -> Optional[Product]:
    db_product = get_product(db, product_id)
    if not db_product:
        return None

    variant = None
    if variant_id:
        variant = next((item for item in db_product.variants if item.id == variant_id), None)
        if not variant:
            raise ValueError("Variant not found")
    elif db_product.variants:
        variant = db_product.variants[0]

    if variant:
        new_qty = (variant.stock_qty or 0) + quantity_change
        if new_qty < 0:
            raise ValueError(f"Insufficient stock for {db_product.name} ({variant.title})")
        variant.stock_qty = new_qty
        _sync_product_stock(db_product)
    else:
        new_qty = (db_product.stock_qty or 0) + quantity_change
        if new_qty < 0:
            raise ValueError("Insufficient stock")
        db_product.stock_qty = new_qty

    db.add(
        InventoryMovement(
            product_id=product_id,
            variant_id=variant.id if variant else None,
            quantity_change=quantity_change,
            reason=reason or "adjustment",
            notes=notes,
            created_by=user_id,
        )
    )
    if commit:
        db.commit()
        return get_product(db, product_id)
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
