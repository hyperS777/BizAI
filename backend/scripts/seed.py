"""Seed roles, users, and a realistic Reihh demo workspace."""

import os
import sys
from datetime import date, datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine, Base
import models  # noqa: F401 — register ORM tables
from models.customer import Customer
from models.expense import Expense
from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem, OrderStatus
from models.product import Category, Product
from models.user import Role, User
from utils.security import get_password_hash


def seed_data():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Seeding roles...")
    for role_name in ["admin", "manager", "employee", "accountant"]:
        if not db.query(Role).filter(Role.name == role_name).first():
            db.add(Role(name=role_name, description=f"{role_name.title()} access"))
    db.commit()

    roles = {r.name: r for r in db.query(Role).all()}
    users = [
        ("admin@bizai.com", "System Admin", "admin123", "admin"),
        ("manager@bizai.com", "Priya Sharma", "manager123", "manager"),
        ("staff@bizai.com", "Rahul Mehta", "staff123", "employee"),
        ("accounts@bizai.com", "Neha Kapoor", "accounts123", "accountant"),
    ]
    for email, name, password, role in users:
        if not db.query(User).filter(User.email == email).first():
            db.add(
                User(
                    email=email,
                    full_name=name,
                    password_hash=get_password_hash(password),
                    role_id=roles[role].id,
                    is_active=True,
                )
            )
    db.commit()
    admin = db.query(User).filter(User.email == "admin@bizai.com").first()

    print("Seeding categories and products...")
    categories = {
        "Electronics": "Devices and accessories",
        "Office Supplies": "Everyday office consumables",
        "Furniture": "Workspace furniture",
    }
    for name, description in categories.items():
        if not db.query(Category).filter(Category.name == name).first():
            db.add(Category(name=name, description=description))
    db.commit()
    cats = {c.name: c for c in db.query(Category).all()}

    products = [
        ("Wireless Mouse", "EL-MOUSE-01", 899, 420, 18, 8, "Electronics"),
        ("USB-C Hub", "EL-HUB-02", 1499, 780, 6, 10, "Electronics"),
        ("A4 Copier Paper", "OS-PAPER-01", 349, 210, 40, 15, "Office Supplies"),
        ("Ballpoint Pen Box", "OS-PEN-04", 199, 90, 12, 20, "Office Supplies"),
        ("Ergo Office Chair", "FU-CHAIR-01", 7499, 4200, 4, 3, "Furniture"),
        ("Standing Desk", "FU-DESK-02", 12999, 7800, 2, 2, "Furniture"),
    ]
    created_products = []
    for name, sku, price, cost, qty, minimum, category in products:
        product = db.query(Product).filter(Product.sku == sku).first()
        if not product:
            product = Product(
                name=name,
                sku=sku,
                price=price,
                cost_price=cost,
                stock_qty=qty,
                min_stock_level=minimum,
                category_id=cats[category].id,
            )
            db.add(product)
            db.flush()
        created_products.append(product)
    db.commit()

    print("Seeding customers, orders, invoices, expenses...")
    customers = [
        ("Amber Abbas", "amber@reihh.com", "9815000001", "Reihh", "Sector 125, Mohali"),
        ("Kiran Traders", "kiran@traders.in", "9815000002", "Kiran Traders", "Phase 7, Mohali"),
        ("Northwind Supplies", "hello@northwind.in", "9815000003", "Northwind Supplies", "Chandigarh"),
    ]
    created_customers = []
    for name, email, phone, company, address in customers:
        customer = db.query(Customer).filter(Customer.email == email).first()
        if not customer:
            customer = Customer(name=name, email=email, phone=phone, company=company, address=address)
            db.add(customer)
            db.flush()
        created_customers.append(customer)
    db.commit()

    if db.query(Order).count() == 0:
        now = datetime.utcnow()
        mouse, hub, paper, pens, chair, desk = created_products
        c1, c2, c3 = created_customers
        samples = [
            (c1, [(mouse, 4), (paper, 10)], 18, OrderStatus.DELIVERED.value, InvoiceStatus.PAID.value, 1.0),
            (c2, [(hub, 2), (pens, 6)], 9, OrderStatus.CONFIRMED.value, InvoiceStatus.SENT.value, 0.0),
            (c3, [(chair, 1)], 4, OrderStatus.PENDING.value, None, 0.0),
            (c1, [(desk, 1), (mouse, 2)], 2, OrderStatus.SHIPPED.value, InvoiceStatus.OVERDUE.value, 0.0),
        ]
        for index, (customer, items, days_ago, status, invoice_status, paid_ratio) in enumerate(samples, start=1):
            total = sum(product.price * qty for product, qty in items)
            order = Order(
                order_number=f"ORD-SEED-{index:03d}",
                customer_id=customer.id,
                status=status,
                total_amount=total,
                created_by=admin.id,
                created_at=now - timedelta(days=days_ago),
            )
            db.add(order)
            db.flush()
            for product, qty in items:
                db.add(
                    OrderItem(
                        order_id=order.id,
                        product_id=product.id,
                        quantity=qty,
                        unit_price=product.price,
                        total_price=product.price * qty,
                    )
                )
                if status in {OrderStatus.CONFIRMED.value, OrderStatus.SHIPPED.value, OrderStatus.DELIVERED.value}:
                    product.stock_qty = max(0, product.stock_qty - qty)
            if invoice_status:
                paid = total * paid_ratio
                db.add(
                    Invoice(
                        invoice_number=f"INV-SEED-{index:03d}",
                        order_id=order.id,
                        status=invoice_status,
                        total_amount=total,
                        paid_amount=paid,
                        due_date=date.today() + timedelta(days=10 - index),
                    )
                )
                if paid_ratio < 1:
                    customer.outstanding_balance = (customer.outstanding_balance or 0) + (total - paid)

        db.add_all(
            [
                Expense(
                    description="Warehouse rent",
                    amount=18000,
                    category="rent",
                    date=date.today().replace(day=1),
                    created_by=admin.id,
                ),
                Expense(
                    description="Electricity",
                    amount=4200,
                    category="utilities",
                    date=date.today() - timedelta(days=5),
                    created_by=admin.id,
                ),
            ]
        )
        db.commit()

    print("Seed complete. Login as admin@bizai.com / admin123")
    db.close()


if __name__ == "__main__":
    seed_data()
