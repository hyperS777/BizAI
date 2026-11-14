"""Customer API."""

import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
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
from utils.permissions import require_staff, require_employee, require_manager

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


@router.get("/export")
def export_customers_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    customers = get_customers(db, limit=1000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "Email", "Phone", "Company", "Tier", "Tags", "Address", "BillingAddress", "GSTIN", "OutstandingBalance"])
    for c in customers:
        writer.writerow([
            c.id, c.name, c.email or "", c.phone or "", c.company or "",
            c.tier or "Regular", c.tags or "", (c.address or "").replace("\n", " "),
            (c.billing_address or "").replace("\n", " "), c.gstin or "", c.outstanding_balance or 0
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="customers.csv"'},
    )


@router.post("/import")
async def import_customers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee),
):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    count = 0
    from models.customer import Customer
    for row in reader:
        name = (row.get("Name") or row.get("name") or "").strip()
        if not name:
            continue
        email = (row.get("Email") or row.get("email") or "").strip() or None
        phone = (row.get("Phone") or row.get("phone") or "").strip() or None

        cust = None
        if email:
            cust = db.query(Customer).filter(Customer.email == email).first()
        if not cust:
            cust = Customer(
                name=name,
                email=email,
                phone=phone,
                company=row.get("Company") or row.get("company"),
                tier=row.get("Tier") or row.get("tier") or "Regular",
                tags=row.get("Tags") or row.get("tags"),
                address=row.get("Address") or row.get("address"),
                billing_address=row.get("BillingAddress") or row.get("billing_address"),
                gstin=row.get("GSTIN") or row.get("gstin"),
            )
            db.add(cust)
            count += 1
        else:
            cust.name = name
            if phone:
                cust.phone = phone
            if row.get("Tier"):
                cust.tier = row.get("Tier")
    db.commit()
    return {"ok": True, "imported_or_updated": count}


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
    current_user: User = Depends(require_manager),
):
    result = delete_customer(db, customer_id)
    if result == "missing":
        raise HTTPException(status_code=404, detail="Customer not found")
    if result == "in_use":
        raise HTTPException(status_code=400, detail="Customer has orders and cannot be deleted")
    return {"ok": True}
