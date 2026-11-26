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
from models.integration import (
    AbandonedCheckout,
    AppSetting,
    IntegrationEvent,
    ShopifyWebhookReceipt,
    StorefrontAnalyticsEvent,
    StorefrontSimulation,
)
from models.inventory import InventoryMovement
from models.invoice import Invoice, InvoiceStatus, Payment
from models.order import Order, OrderItem, OrderStatus
from models.product import Category, Product, ProductVariant
from models.user import Role, User
from services.storefront_service import sync_all_reihh_catalog
from utils.security import get_password_hash

logger = logging.getLogger("bizai.seed")


def _set_demo_cleared_flag(db, cleared: bool):
    """Persist whether demo data has been explicitly cleared by an admin/manager."""
    setting = db.query(AppSetting).filter(AppSetting.key == "demo_data_cleared").first()
    val = "true" if cleared else "false"
    if setting:
        setting.value = val
    else:
        db.add(AppSetting(key="demo_data_cleared", value=val))


def clear_all_demo_and_purchases(db: SessionLocal = None):
    """Permanently remove all demo/transactional data and purchases without re-seeding."""
    close_at_end = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_at_end = True

    try:
        db.query(StorefrontAnalyticsEvent).delete(synchronize_session=False)
        db.query(StorefrontSimulation).delete(synchronize_session=False)
        db.query(IntegrationEvent).delete(synchronize_session=False)
        db.query(ShopifyWebhookReceipt).delete(synchronize_session=False)
        db.query(AIQuery).delete(synchronize_session=False)
        db.query(Payment).delete(synchronize_session=False)
        db.query(Invoice).delete(synchronize_session=False)
        db.query(OrderItem).delete(synchronize_session=False)
        db.query(Order).delete(synchronize_session=False)
        db.query(InventoryMovement).delete(synchronize_session=False)
        db.query(AbandonedCheckout).delete(synchronize_session=False)
        db.query(Expense).delete(synchronize_session=False)
        db.query(Customer).delete(synchronize_session=False)
        # Remove synthetic/non-Shopify demo products and their variants
        db.query(ProductVariant).filter(
            ProductVariant.product_id.in_(db.query(Product.id).filter(Product.shopify_product_id.is_(None)))
        ).delete(synchronize_session=False)
        db.query(Product).filter(Product.shopify_product_id.is_(None)).delete(synchronize_session=False)

        _set_demo_cleared_flag(db, True)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if close_at_end:
            db.close()


def reset_and_seed(db: SessionLocal = None):
    """Wipes all demo data and cleanly re-seeds according to current options."""
    close_at_end = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_at_end = True

    try:
        _set_demo_cleared_flag(db, False)
        # 1. Clean existing transactional / demo data
        db.query(StorefrontAnalyticsEvent).delete()
        db.query(StorefrontSimulation).delete()
        db.query(IntegrationEvent).delete()
        db.query(AIQuery).delete()
        db.query(Invoice).delete()
        db.query(OrderItem).delete()
        db.query(Order).delete()
        db.query(Expense).delete()
        # Completely remove obsolete demo products (office supplies)
        db.query(ProductVariant).filter(
            ProductVariant.product_id.in_(db.query(Product.id).filter(Product.shopify_product_id.is_(None)))
        ).delete(synchronize_session=False)
        db.query(Product).filter(Product.shopify_product_id.is_(None)).delete(synchronize_session=False)
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
            ("Ramji", "ramji@reihh.com", "+919876543211", "REIHH Demo Customer", "Sector 125, Mohali, Punjab 160055"),
            ("Mohammad Ibad Hussain", "ibad@reihh.com", "+919815000004", "REIHH Studio & Demo Client", "Connaught Place, New Delhi 110001"),
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
                (6, [(0, 1)], 1, OrderStatus.DELIVERED.value, "Demo VIP order via driver."),
                (6, [(1, 1)], 7, OrderStatus.DELIVERED.value, "Delivered via Delhivery Courier Executive."),
                (7, [(0, 1)], 1, OrderStatus.DELIVERED.value, "Studio bespoke sample."),
                (7, [(0, 1)], 2, OrderStatus.CONFIRMED.value, "Ready for dispatch."),
                (1, [(0, 2), (6, 1)], 12, OrderStatus.DELIVERED.value, "Pre-festive retail order."),
                (2, [(2, 1), (4, 1)], 16, OrderStatus.DELIVERED.value, "Wholesale trial shipment."),
                (3, [(5, 2)], 21, OrderStatus.DELIVERED.value, "Shipped via Delhivery Air."),
                (0, [(3, 1), (1, 1)], 26, OrderStatus.DELIVERED.value, "Studio showroom samples."),
            ]

            ADDR_COORDS = {
                'Mohali': (30.6757, 76.7332),
                'Bengaluru': (12.9784, 77.6408),
                'Mumbai': (19.0596, 72.8295),
                'Jaipur': (26.9124, 75.7873),
                'New Delhi': (28.6315, 77.2167),
                'Delhi': (28.6315, 77.2167),
            }

            def get_coords(addr):
                for city, coords in ADDR_COORDS.items():
                    if city.lower() in (addr or '').lower():
                        return coords
                return (28.6139, 77.2090)

            for idx, (c_idx, p_specs, days_ago, st, note) in enumerate(order_templates, start=1):
                cust = created_customers[c_idx % len(created_customers)]
                order_time = now - timedelta(days=days_ago)
                waybill = f"148{839201948 + idx}"
                lat, lon = get_coords(cust.address)

                order = Order(
                    order_number=f"ORD-REIHH-{idx:03d}",
                    customer_id=cust.id,
                    status=st,
                    tracking_company="Delhivery Express",
                    tracking_number=waybill,
                    tracking_url=f"https://www.delhivery.com/track/package/{waybill}",
                    delivery_location=cust.address.split(',')[0] if cust.address else "Delhi NCR Hub",
                    delivery_latitude=lat,
                    delivery_longitude=lon,
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


def ensure_essential_records(db: SessionLocal):
    """
    Self-healing routine running on boot to ensure core stakeholders (Ramji, Mohammad Ibad Hussain),
    their orders, realistic geocoordinates, and clean customer names always exist.
    """
    try:
        # 1. Ensure Ramji customer
        ramji = db.query(Customer).filter((Customer.name == "Ramji") | (Customer.email == "ramji@reihh.com")).first()
        if not ramji:
            ramji = Customer(
                name="Ramji",
                email="ramji@reihh.com",
                phone="+919876543211",
                tier="VIP",
                company="REIHH Demo Customer & Engineer",
                address="Sector 125, Mohali, Punjab 160055",
            )
            db.add(ramji)
            db.flush()
        else:
            ramji.tier = "VIP"
            ramji.phone = ramji.phone or "+919876543211"
            ramji.address = ramji.address or "Sector 125, Mohali, Punjab 160055"

        # 2. Ensure Mohammad Ibad Hussain customer
        ibad = db.query(Customer).filter(
            (Customer.name.ilike("%ibad%")) | (Customer.name.ilike("%iabd%")) | (Customer.email == "ibad@reihh.com")
        ).first()
        if not ibad:
            ibad = Customer(
                name="Mohammad Ibad Hussain",
                email="ibad@reihh.com",
                phone="+919815000004",
                tier="VIP",
                company="REIHH Studio & Team Lead",
                address="Connaught Place, New Delhi 110001",
            )
            db.add(ibad)
            db.flush()
        else:
            ibad.name = "Mohammad Ibad Hussain"
            ibad.tier = "VIP"
            ibad.phone = ibad.phone or "+919815000004"
            ibad.address = ibad.address or "Connaught Place, New Delhi 110001"

        db.commit()

        # 3. Clean up any typo customers (like 'iabd' or 'hello' demo accounts)
        typo_custs = db.query(Customer).filter(Customer.name.in_(["iabd", "hello", "demo"])).all()
        for tc in typo_custs:
            # Reassign orders to ibad
            db.query(Order).filter(Order.customer_id == tc.id).update({"customer_id": ibad.id})
            db.delete(tc)
        db.commit()

        # 4. Ensure Ramji has at least 2 orders
        ramji_orders_count = db.query(Order).filter(Order.customer_id == ramji.id).count()
        alba_prod = db.query(Product).filter(Product.is_active == True).first()
        if ramji_orders_count < 2 and alba_prod:
            now = datetime.now()
            # Order 1
            o1 = Order(
                order_number="ORD-89B08259",
                customer_id=ramji.id,
                status=OrderStatus.DELIVERED.value,
                tracking_company="Delhivery Express",
                tracking_number="148839201977",
                tracking_url="https://www.delhivery.com/track/package/148839201977",
                delivery_location="Mohali, Punjab",
                delivery_latitude=30.6757,
                delivery_longitude=76.7332,
                delivery_updated_at=now - timedelta(days=8),
                shipping_address=ramji.address,
                currency="INR",
                subtotal_amount=4950.0,
                total_amount=4950.0,
                notes="Delivered to Mohali storefront. Core engineer demo order.",
                created_at=now - timedelta(days=8),
            )
            db.add(o1)
            db.flush()
            db.add(OrderItem(order_id=o1.id, product_id=alba_prod.id, quantity=1, unit_price=4950.0, cost_price=alba_prod.cost_price or 1800.0, total_price=4950.0, sku=alba_prod.sku))
            
            # Order 2
            o2 = Order(
                order_number="ORD-35AAC5A4",
                customer_id=ramji.id,
                status=OrderStatus.DELIVERED.value,
                tracking_company="Delhivery Express",
                tracking_number="148839201978",
                tracking_url="https://www.delhivery.com/track/package/148839201978",
                delivery_location="Saket, New Delhi",
                delivery_latitude=28.5244,
                delivery_longitude=77.2185,
                delivery_updated_at=now - timedelta(days=14),
                shipping_address="Saket, South Delhi 110017",
                currency="INR",
                subtotal_amount=8500.0,
                total_amount=8500.0,
                notes="VIP Delivery via Delhivery Express.",
                created_at=now - timedelta(days=14),
            )
            db.add(o2)
            db.flush()
            db.add(OrderItem(order_id=o2.id, product_id=alba_prod.id, quantity=2, unit_price=4250.0, cost_price=alba_prod.cost_price or 1800.0, total_price=8500.0, sku=alba_prod.sku))
            db.commit()

        # 5. Ensure Mohammad Ibad Hussain has orders
        ibad_orders_count = db.query(Order).filter(Order.customer_id == ibad.id).count()
        if ibad_orders_count == 0 and alba_prod:
            now = datetime.now()
            orders_to_add = [
                ("ORD-1560B63F", OrderStatus.DELIVERED.value, 4250.0, 14, "Studio bespoke sample. Delivered in CP."),
                ("ORD-0B6ABBDF", OrderStatus.CONFIRMED.value, 4450.0, 14, "VIP Pre-order tailored piece."),
                ("ORD-9B9747BA", OrderStatus.CONFIRMED.value, 4450.0, 14, "Ready for warehouse dispatch."),
                ("ORD-84BDAC86", OrderStatus.CONFIRMED.value, 23300.0, 15, "Wholesale trial order."),
                ("ORD-27489DF1", OrderStatus.SHIPPED.value, 4450.0, 15, "In transit via Delhivery rider."),
                ("ORD-CE0B8A25", OrderStatus.CONFIRMED.value, 19900.0, 15, "Outerwear coordination set."),
            ]
            for num, st, amt, days, nt in orders_to_add:
                ord_rec = Order(
                    order_number=num,
                    customer_id=ibad.id,
                    status=st,
                    tracking_company="Delhivery Express",
                    tracking_number=f"14883{abs(hash(num)) % 1000000:06d}",
                    tracking_url="https://www.delhivery.com/track/package/148839201999",
                    delivery_location="Connaught Place, New Delhi",
                    delivery_latitude=28.6315,
                    delivery_longitude=77.2167,
                    delivery_updated_at=now - timedelta(days=days),
                    shipping_address=ibad.address,
                    currency="INR",
                    subtotal_amount=amt,
                    total_amount=amt,
                    notes=nt,
                    created_at=now - timedelta(days=days),
                )
                db.add(ord_rec)
                db.flush()
                db.add(OrderItem(order_id=ord_rec.id, product_id=alba_prod.id, quantity=1, unit_price=amt, cost_price=alba_prod.cost_price or 1800.0, total_price=amt, sku=alba_prod.sku))
            db.commit()

        # 6. Ensure all orders have coordinates
        ADDR_COORDS = {
            'mohali': (30.6757, 76.7332),
            'bengaluru': (12.9784, 77.6408),
            'mumbai': (19.0596, 72.8295),
            'jaipur': (26.9124, 75.7873),
            'connaught': (28.6315, 77.2167),
            'saket': (28.5244, 77.2185),
            'south delhi': (28.5244, 77.2185),
            'okhla': (28.5355, 77.2713),
            'noida': (28.5355, 77.3910),
            'gurgaon': (28.4595, 77.0266),
            'delhi': (28.6139, 77.2090),
        }
        for o in db.query(Order).all():
            if not o.delivery_latitude or not o.delivery_longitude:
                addr_text = f"{o.shipping_address or ''} {o.delivery_location or ''}".lower()
                chosen = (28.6139, 77.2090)
                for city, coords in ADDR_COORDS.items():
                    if city in addr_text:
                        chosen = coords
                        break
                o.delivery_latitude = chosen[0]
                o.delivery_longitude = chosen[1]
        db.commit()

    except Exception as exc:
        logger.warning("ensure_essential_records error: %s", exc)
        db.rollback()


def seed_data():
    """Initial boot seeder that ensures basic data exists and auto-cleans old dummy data."""
    db = SessionLocal()
    try:
        cleared_setting = db.query(AppSetting).filter(AppSetting.key == "demo_data_cleared").first()
        user_count = db.query(User).count()
        if cleared_setting and cleared_setting.value == "true" and user_count > 0:
            logger.info("Demo data was explicitly cleared — skipping boot seeding.")
            return

        order_count = db.query(Order).count()
        # Automatically wipe obsolete dummy office equipment if present
        has_stale_dummy_data = (
            db.query(Product)
            .filter(Product.sku.in_(["FU-DESK-02", "EL-HUB-02", "OS-PEN-04", "RH-DESK-01"]))
            .first()
            is not None
        )
        if user_count == 0 or order_count == 0 or has_stale_dummy_data:
            logger.info("Stale or missing database records detected on boot — auto-resetting with clean REIHH data.")
            reset_and_seed(db)
        else:
            # Self-healing check on existing database
            ensure_essential_records(db)
    finally:
        db.close()


if __name__ == "__main__":
    reset_and_seed()
    print("Seed complete: all demo data cleared and re-created according to current options.")
