"""
Seed roles, users, REIHH apparel catalog, realistic customers, Delhivery orders, and expenses.
Provides reset_and_seed() to cleanly wipe test clutter and re-seed with current options.
"""

from datetime import date, datetime, timedelta
import logging
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base, SessionLocal, engine
import models  # noqa: F401
from models.ai_query import AIQuery
from models.customer import Customer
from models.expense import Expense
from models.integration import IntegrationEvent, StorefrontAnalyticsEvent, StorefrontSimulation
from models.invoice import Invoice, InvoiceStatus
from models.order import Order, OrderItem, OrderStatus
from models.product import Category, Product
from models.user import Role, User
from services.storefront_service import sync_all_reihh_catalog
from utils.security import get_password_hash

logger = logging.getLogger("bizai.seed")


def reset_and_seed(db: SessionLocal = None):
    """Wipes all demo data and cleanly re-seeds according to current options."""
    close_at_end = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_at_end = True

    try:
        # 1. Clean existing transactional / demo data
        db.query(StorefrontAnalyticsEvent).delete()
        db.query(StorefrontSimulation).delete()
        db.query(IntegrationEvent).delete()
        db.query(AIQuery).delete()
        db.query(Invoice).delete()
        db.query(OrderItem).delete()
        db.query(Order).delete()
        db.query(Expense).delete()
        db.commit()

        # 2. Roles
        for role_name in ["admin", "manager", "employee", "accountant"]:
            if not db.query(Role).filter(Role.name == role_name).first():
                db.add(Role(name=role_name, description=f"{role_name.title()} access"))
        db.commit()

        roles = {r.name: r for r in db.query(Role).all()}

        # 3. Users
        users = [
            ("admin@bizai.com", "Amber Abbas", "admin123", "admin"),
            ("manager@bizai.com", "Priya Sharma", "manager123", "manager"),
            ("staff@bizai.com", "Rahul Mehta", "staff123", "employee"),
            ("accounts@bizai.com", "Neha Kapoor", "accounts123", "accountant"),
        ]
        for email, name, password, role in users:
            existing = db.query(User).filter(User.email == email).first()
            if not existing:
                db.add(
                    User(
                        email=email,
                        full_name=name,
                        password_hash=get_password_hash(password),
                        role_id=roles[role].id,
                        is_active=True,
                    )
                )
            else:
                existing.full_name = name
                existing.role_id = roles[role].id
                existing.is_active = True
        db.commit()
        admin = db.query(User).filter(User.email == "admin@bizai.com").first()

        # 4. Apparel Categories
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

        # 5. Sync Authentic REIHH Products
        try:
            sync_all_reihh_catalog(db)
        except Exception as exc:
            logger.warning("Catalog sync warning: %s", exc)

        # Ensure all active products have minimum stock levels and non-zero prices
        active_products = db.query(Product).filter(Product.is_active == True).all()
        for p in active_products:
            if not p.min_stock_level:
                p.min_stock_level = 4
            if not p.cost_price:
                p.cost_price = round(p.price * 0.42, 2)
            if p.stock_qty < 10:
                p.stock_qty = 25
        db.commit()

        # 6. Realistic Fashion Customers
        customers_data = [
            ("Amber Abbas", "amber@reihh.com", "+919815000001", "REIHH Studio", "Sector 125, Mohali, Punjab 160055"),
            ("Kiran Malhotra", "kiran@traders.in", "+919815000002", "Kiran Boutique", "Phase 7, Mohali, Punjab 160062"),
            ("Northwind Retail", "hello@northwind.in", "+919815000003", "Northwind Luxury Retail", "Connaught Place, New Delhi 110001"),
            ("Priya Verma", "priya.verma@gmail.com", "+919811223344", "Indie Studio", "Indiranagar, Bengaluru, Karnataka 560038"),
            ("Rohit Sen", "rohit.sen@gmail.com", "+919820112233", "Urban Collective", "Bandra West, Mumbai, Maharashtra 400050"),
            ("Tanya Ahuja", "tanya.ahuja@gmail.com", "+919876543210", "Ahuja Apparel", "Civil Lines, Jaipur, Rajasthan 302006"),
        ]
        created_customers = []
        for name, email, phone, company, address in customers_data:
            cust = db.query(Customer).filter(Customer.email == email).first()
            if not cust:
                cust = Customer(name=name, email=email, phone=phone, company=company, address=address)
                db.add(cust)
                db.flush()
            else:
                cust.name = name
                cust.phone = phone
                cust.company = company
                cust.address = address
            created_customers.append(cust)
        db.commit()

        # 7. Seed Curated Orders with Delhivery Shipping
        if active_products and created_customers:
            prods = list(active_products)
            now = datetime(2026, 11, 9, 15, 0)

            # (customer_idx, [(prod_idx, qty)], days_ago, status, note)
            order_templates = [
                (0, [(0, 2), (1, 1)], 1, OrderStatus.DELIVERED.value, "VIP Delivery via Delhivery Express."),
                (1, [(2, 1)], 2, OrderStatus.DELIVERED.value, "Delivered to Mohali storefront."),
                (2, [(0, 1), (3, 2)], 3, OrderStatus.DELIVERED.value, "Surface delivery completed."),
                (3, [(4, 1), (5, 1)], 4, OrderStatus.DELIVERED.value, "Doorstep OTP verified."),
                (4, [(6, 2)], 5, OrderStatus.SHIPPED.value, "In transit: Delhi hub to Mumbai."),
                (5, [(1, 1)], 6, OrderStatus.CONFIRMED.value, "Processing at central warehouse."),
                (1, [(0, 2), (6, 1)], 12, OrderStatus.DELIVERED.value, "Pre-festive retail order."),
                (2, [(2, 1), (4, 1)], 16, OrderStatus.DELIVERED.value, "Wholesale trial shipment."),
                (3, [(5, 2)], 21, OrderStatus.DELIVERED.value, "Shipped via Delhivery Air."),
                (0, [(3, 1), (1, 1)], 26, OrderStatus.DELIVERED.value, "Studio showroom samples."),
            ]

            for idx, (c_idx, p_specs, days_ago, st, note) in enumerate(order_templates, start=1):
                cust = created_customers[c_idx % len(created_customers)]
                order_time = now - timedelta(days=days_ago)
                waybill = f"148{839201948 + idx}"
                
                order = Order(
                    order_number=f"ORD-REIHH-{idx:03d}",
                    customer_id=cust.id,
                    status=st,
                    tracking_company="Delhivery Express",
                    tracking_number=waybill,
                    tracking_url=f"https://www.delhivery.com/track/package/{waybill}",
                    delivery_location="Delhi NCR Hub",
                    delivery_latitude=28.6139,
                    delivery_longitude=77.2090,
                    delivery_updated_at=order_time,
                    shipping_address=cust.address,
                    currency="INR",
                    notes=note,
                    created_by=admin.id if admin else 1,
                    created_at=order_time,
                    updated_at=order_time,
                )
                db.add(order)
                db.flush()

                subtotal = 0.0
                for p_idx, qty in p_specs:
                    prod = prods[p_idx % len(prods)]
                    item_tot = float(prod.price * qty)
                    subtotal += item_tot
                    db.add(
                        OrderItem(
                            order_id=order.id,
                            product_id=prod.id,
                            quantity=qty,
                            unit_price=prod.price,
                            cost_price=prod.cost_price,
                            total_price=item_tot,
                            sku=prod.sku,
                        )
                    )
                    # Deduct stock for confirmed orders
                    if st in (OrderStatus.CONFIRMED.value, OrderStatus.SHIPPED.value, OrderStatus.DELIVERED.value):
                        prod.stock_qty = max(0, prod.stock_qty - qty)

                order.subtotal_amount = subtotal
                order.total_amount = subtotal

                if st == OrderStatus.DELIVERED.value:
                    db.add(
                        Invoice(
                            invoice_number=f"INV-REIHH-{idx:03d}",
                            order_id=order.id,
                            status=InvoiceStatus.PAID.value,
                            total_amount=subtotal,
                            paid_amount=subtotal,
                            due_date=order_time.date() + timedelta(days=15),
                            created_at=order_time,
                        )
                    )
            db.commit()

        # 8. Clean Operational Expenses (Realized Only)
        today = date.today()
        expenses_data = [
            ("Delhi Central Warehouse Rent", 24000.0, "Rent", today.replace(day=1), "Monthly facility lease"),
            ("Delhivery Express & Surface Logistics Contract", 6800.0, "Transport", today - timedelta(days=4), "Courier dispatch retainer"),
            ("Studio Electricity & Climate Control", 3500.0, "Utilities", today - timedelta(days=5), "Power & operations"),
            ("Autumn / Winter Lookbook Photoshoot", 12000.0, "Marketing", today.replace(month=max(1, today.month - 1), day=24), "Digital campaign production"),
            ("Shopify Platform & Cloud Infrastructure", 4200.0, "Software", today.replace(month=max(1, today.month - 1), day=18), "E-commerce tech stack"),
        ]
        for desc, amt, cat, dt, nt in expenses_data:
            db.add(
                Expense(
                    description=desc,
                    amount=amt,
                    category=cat,
                    date=dt,
                    notes=nt,
                    created_by=admin.id if admin else 1,
                )
            )
        db.commit()

        logger.info("Database reset and re-seeded cleanly with authentic REIHH options.")
    finally:
        if close_at_end:
            db.close()


def seed_data():
    """Initial boot seeder that ensures basic data exists without wiping if already populated."""
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        order_count = db.query(Order).count()
        if user_count == 0 or order_count == 0:
            reset_and_seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    reset_and_seed()
    print("Seed complete: all demo data cleared and re-created according to current options.")
