"""Products and inventory API."""

import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.product import InventoryLocation, Product, ProductLocationStock
from models.user import User
from schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    CategoryResponse,
    CategoryCreate,
    StockAdjust,
    InventoryMovementResponse,
    InventoryLocationCreate,
    InventoryLocationResponse,
    LocationStockAllocate,
)
from services.product_service import (
    get_products,
    get_product,
    create_product,
    update_product,
    delete_product,
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


def _ensure_default_locations(db: Session) -> List[InventoryLocation]:
    rows = db.query(InventoryLocation).order_by(InventoryLocation.is_default.desc(), InventoryLocation.id.asc()).all()
    if not rows:
        defaults = [
            InventoryLocation(
                name="Delhi Okhla Flagship Warehouse",
                code="DEL-WH",
                city="New Delhi",
                address="Okhla Industrial Phase II, New Delhi 110020",
                is_default=True,
                active=True,
            ),
            InventoryLocation(
                name="Mumbai Bandra Studio",
                code="BOM-ST",
                city="Mumbai",
                address="Chapel Road, Bandra West, Mumbai 400050",
                is_default=False,
                active=True,
            ),
        ]
        db.add_all(defaults)
        db.commit()
        rows = db.query(InventoryLocation).order_by(InventoryLocation.is_default.desc(), InventoryLocation.id.asc()).all()
    return rows


@router.get("/locations", response_model=List[InventoryLocationResponse])
def read_inventory_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return _ensure_default_locations(db)


@router.post("/locations", response_model=InventoryLocationResponse)
def create_inventory_location(
    payload: InventoryLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    code = payload.code.strip().upper().replace(" ", "-")
    if db.query(InventoryLocation).filter(InventoryLocation.code == code).first():
        raise HTTPException(status_code=400, detail="Location code already exists")
    row = InventoryLocation(
        name=payload.name.strip(),
        code=code,
        city=payload.city,
        address=payload.address,
        is_default=payload.is_default,
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/locations/stock")
def read_location_stock_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    locs = _ensure_default_locations(db)
    allocs = db.query(ProductLocationStock).all()
    return {
        "locations": [InventoryLocationResponse.model_validate(l) for l in locs],
        "allocations": [
            {"product_id": a.product_id, "location_id": a.location_id, "stock_qty": a.stock_qty}
            for a in allocs
        ],
    }


@router.post("/{product_id}/locations/allocate")
def allocate_location_stock(
    product_id: int,
    payload: LocationStockAllocate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    loc = db.query(InventoryLocation).filter(InventoryLocation.id == payload.location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    row = (
        db.query(ProductLocationStock)
        .filter(ProductLocationStock.product_id == product_id, ProductLocationStock.location_id == payload.location_id)
        .first()
    )
    if row:
        row.stock_qty = payload.stock_qty
    else:
        row = ProductLocationStock(product_id=product_id, location_id=payload.location_id, stock_qty=payload.stock_qty)
        db.add(row)
    db.commit()
    return {"product_id": product_id, "location_id": payload.location_id, "stock_qty": payload.stock_qty}


@router.post("", response_model=ProductResponse)
def create_new_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return create_product(db, product)


@router.get("/export")
def export_products_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    products = get_products(db, limit=1000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "SKU", "Category", "Price", "CostPrice", "CompareAtPrice", "Stock", "MinStock", "Vendor", "ProductType", "Tags", "Description", "ImageURL"])
    for p in products:
        cat_name = p.category.name if p.category else ""
        writer.writerow([
            p.id, p.name, p.sku, cat_name, p.price, p.cost_price,
            p.compare_at_price or "", p.stock_qty, p.min_stock_level,
            p.vendor or "", p.product_type or "", p.tags or "",
            (p.description or "").replace("\n", " "), p.image_url or ""
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="products.csv"'},
    )


@router.post("/import")
async def import_products_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    created_count = 0
    from models.product import Product
    for row in reader:
        sku = (row.get("SKU") or row.get("sku") or "").strip()
        name = (row.get("Name") or row.get("name") or "").strip()
        if not sku or not name:
            continue
        price = float(row.get("Price") or row.get("price") or 0.0)
        cost = float(row.get("CostPrice") or row.get("cost_price") or 0.0)
        stock = int(float(row.get("Stock") or row.get("stock_qty") or 0))
        min_stock = int(float(row.get("MinStock") or row.get("min_stock_level") or 5))

        existing = db.query(Product).filter(Product.sku == sku).first()
        if existing:
            existing.price = price
            existing.cost_price = cost
            existing.stock_qty = stock
            existing.is_active = True
        else:
            db_p = Product(
                name=name,
                sku=sku,
                price=price,
                cost_price=cost,
                stock_qty=stock,
                min_stock_level=min_stock,
                vendor=row.get("Vendor") or "Reihh",
                description=row.get("Description") or "",
                tags=row.get("Tags") or "",
                image_url=row.get("ImageURL") or "",
                is_active=True,
            )
            db.add(db_p)
            created_count += 1
    db.commit()
    return {"ok": True, "created_or_updated": created_count}


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
            variant_id=payload.variant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return get_product(db, product_id)


@router.delete("/{product_id}")
def delete_existing_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    if not delete_product(db, product_id):
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True, "message": "Product removed or archived"}

