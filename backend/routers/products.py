"""Products and inventory API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    CategoryResponse,
    CategoryCreate,
    StockAdjust,
    InventoryMovementResponse,
)
from services.product_service import (
    get_products,
    get_product,
    create_product,
    update_product,
    get_low_stock_products,
    get_categories,
    create_category,
    update_stock,
    get_inventory_history,
)
from utils.permissions import require_staff, require_manager

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=List[ProductResponse])
def read_products(
    skip: int = 0,
    limit: int = 100,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_products(db, skip=skip, limit=limit, category_id=category_id, search=search)


@router.get("/low-stock", response_model=List[ProductResponse])
def read_low_stock_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_low_stock_products(db)


@router.get("/categories", response_model=List[CategoryResponse])
def read_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_categories(db)


@router.post("/categories", response_model=CategoryResponse)
def add_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return create_category(db, payload.name, payload.description)


@router.get("/history", response_model=List[InventoryMovementResponse])
def read_inventory_history(
    product_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return get_inventory_history(db, product_id=product_id)


@router.post("", response_model=ProductResponse)
def create_new_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return create_product(db, product)


@router.get("/{product_id}", response_model=ProductResponse)
def read_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    db_product = get_product(db, product_id)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return db_product


@router.put("/{product_id}", response_model=ProductResponse)
def update_existing_product(
    product_id: int,
    product_update: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    db_product = update_product(db, product_id, product_update)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return db_product


@router.post("/{product_id}/stock", response_model=ProductResponse)
def adjust_stock(
    product_id: int,
    payload: StockAdjust,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    try:
        db_product = update_stock(
            db,
            product_id,
            payload.quantity_change,
            reason=payload.reason,
            notes=payload.notes,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return get_product(db, product_id)
