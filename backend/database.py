"""
BizAI Database Connection
SQLAlchemy engine, session, and base model.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# Handle SQLite vs PostgreSQL connection args
database_url = settings.DATABASE_URL
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    database_url,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_EXTRA_COLUMNS = {
    "products": [
        ("compare_at_price", "FLOAT"),
        ("product_type", "VARCHAR(80)"),
        ("vendor", "VARCHAR(120)"),
        ("tags", "VARCHAR(255)"),
        ("option1_name", "VARCHAR(50)"),
        ("option2_name", "VARCHAR(50)"),
        ("image_url", "VARCHAR(500)"),
            ("shopify_product_id", "VARCHAR(80)"),
    ],
    "order_items": [
        ("variant_id", "INTEGER"),
        ("cost_price", "FLOAT DEFAULT 0"),
        ("option1", "VARCHAR(80)"),
        ("option2", "VARCHAR(80)"),
        ("sku", "VARCHAR(80)"),
    ],
    "orders": [
        ("subtotal_amount", "FLOAT DEFAULT 0"),
        ("discount_code", "VARCHAR(40)"),
        ("discount_amount", "FLOAT DEFAULT 0"),
        ("shipping_amount", "FLOAT DEFAULT 0"),
        ("shopify_order_id", "VARCHAR(80)"),
        ("currency", "VARCHAR(3) DEFAULT 'INR'"),
        ("shipping_address", "TEXT"),
        ("tracking_company", "VARCHAR(120)"),
        ("tracking_number", "VARCHAR(120)"),
        ("tracking_url", "VARCHAR(500)"),
        ("delivery_latitude", "FLOAT"),
        ("delivery_longitude", "FLOAT"),
        ("delivery_updated_at", "DATETIME"),
    ],
    "invoices": [
        ("public_token", "VARCHAR(80)"),
    ],
    "customers": [
        ("tags", "VARCHAR(255)"),
        ("notes", "TEXT"),
        ("accepts_marketing", "BOOLEAN DEFAULT 0"),
            ("shopify_customer_id", "VARCHAR(80)"),
    ],
    "inventory_movements": [
        ("variant_id", "INTEGER"),
    ],
    "product_variants": [
        ("shopify_variant_id", "VARCHAR(80)"),
        ("shopify_inventory_item_id", "VARCHAR(80)"),
    ],
}


def ensure_schema():
    """Add newly introduced columns on existing SQLite/Postgres databases."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _EXTRA_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {col["name"] for col in inspect(engine).get_columns(table)}
            for name, typedef in columns:
                if name in present:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typedef}"))

        unique_indexes = (
            ("customers", "shopify_customer_id", "ux_customers_shopify_customer_id"),
            ("products", "shopify_product_id", "ux_products_shopify_product_id"),
            ("product_variants", "shopify_variant_id", "ux_variants_shopify_variant_id"),
            ("product_variants", "shopify_inventory_item_id", "ux_variants_shopify_inventory_item_id"),
            ("orders", "shopify_order_id", "ux_orders_shopify_order_id"),
            ("invoices", "public_token", "ux_invoices_public_token"),
        )
        for table, column, index_name in unique_indexes:
            if table in existing_tables:
                conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"))
