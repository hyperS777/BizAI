"""Seed roles, users, and realistic REIHH apparel categories."""

import os
import sys
from datetime import date, datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine, Base
import models  # noqa: F401 — register ORM tables
from models.customer import Customer
from models.expense import Expense
from models.product import Category
from models.user import Role, User
from utils.security import get_password_hash


def seed_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. Roles
    for role_name in ["admin", "manager", "employee", "accountant"]:
        if not db.query(Role).filter(Role.name == role_name).first():
            db.add(Role(name=role_name, description=f"{role_name.title()} access"))
    db.commit()

    roles = {r.name: r for r in db.query(Role).all()}
    users = [
        ("admin@bizai.com", "Amber Abbas", "admin123", "admin"),
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

    # 2. Apparel Categories for REIHH
    categories = {
        "Womenswear": "Women's denim, tops and trench jacket sets",
        "Menswear": "Men's shirts, jackets and washed denim",
        "Outerwear": "Jackets, trench sets and overshirts",
        "Denim": "Straight-fit, wide-leg and washed denim",
    }
    for name, description in categories.items():
        if not db.query(Category).filter(Category.name == name).first():
            db.add(Category(name=name, description=description))
    db.commit()

    # 3. Base Customers
    customers = [
        ("Amber Abbas", "amber@reihh.com", "+919815000001", "REIHH Studio", "Sector 125, Mohali, Punjab 160055"),
        ("Kiran Traders", "kiran@traders.in", "+919815000002", "Kiran Boutique", "Phase 7, Mohali, Punjab 160062"),
        ("Northwind Fashion", "hello@northwind.in", "+919815000003", "Northwind Retail", "Connaught Place, New Delhi 110001"),
    ]
    for name, email, phone, company, address in customers:
        if not db.query(Customer).filter(Customer.email == email).first():
            db.add(Customer(name=name, email=email, phone=phone, company=company, address=address))
    db.commit()

    # 4. Standard Operational Expenses
    if db.query(Expense).count() == 0 and admin:
        db.add_all([
            Expense(
                description="Delhi Central Warehouse Rent",
                amount=24000,
                category="Rent",
                date=date.today().replace(day=1),
                created_by=admin.id,
            ),
            Expense(
                description="Delhivery Surface & Express Shipping Contract",
                amount=6800,
                category="Transport",
                date=date.today() - timedelta(days=3),
                created_by=admin.id,
            ),
            Expense(
                description="Studio Electricity & Utilities",
                amount=3500,
                category="Utilities",
                date=date.today() - timedelta(days=5),
                created_by=admin.id,
            ),
        ])
        db.commit()

    db.close()


if __name__ == "__main__":
    seed_data()
