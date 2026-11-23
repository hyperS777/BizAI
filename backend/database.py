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

if "neon.tech" in database_url and "sslmode" not in database_url:
    database_url += ("&" if "?" in database_url else "?") + "sslmode=require"

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


def _migration_column_type(type_name: str, dialect_name: str) -> str:
    if dialect_name == "postgresql":
        if "DATETIME" in type_name.upper():
            type_name = type_name.replace("DATETIME", "TIMESTAMP WITH TIME ZONE")
        if "BOOLEAN DEFAULT 0" in type_name.upper():
            type_name = type_name.replace("BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE")
        elif "BOOLEAN DEFAULT 1" in type_name.upper():
            type_name = type_name.replace("BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE")
    return type_name


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
        ("gallery_urls", "TEXT"),
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
        ("delivery_location", "VARCHAR(200)"),
        ("delivery_latitude", "FLOAT"),
        ("delivery_longitude", "FLOAT"),
        ("delivery_updated_at", "DATETIME"),
    ],
    "invoices": [
        ("public_token", "VARCHAR(80)"),
        ("customer_id", "INTEGER"),
        ("payment_method", "VARCHAR(50)"),
        ("taxable_amount", "FLOAT DEFAULT 0"),
        ("cgst", "FLOAT DEFAULT 0"),
        ("sgst", "FLOAT DEFAULT 0"),
        ("igst", "FLOAT DEFAULT 0"),
        ("notes", "TEXT"),
    ],
    "expenses": [
        ("vendor", "VARCHAR(200)"),
        ("payment_mode", "VARCHAR(50) DEFAULT 'bank_transfer'"),
        ("receipt_url", "TEXT"),
        ("vendor_gstin", "VARCHAR(20)"),
        ("gst_amount", "FLOAT DEFAULT 0"),
    ],
    "storefront_simulations": [
        ("delivery_status", "VARCHAR(32) DEFAULT 'ready_to_pack'"),
        ("delivery_agent_name", "VARCHAR(120)"),
        ("delivery_note", "TEXT"),
        ("delivery_address", "TEXT"),
        ("delivery_token_hash", "VARCHAR(64)"),
        ("delivery_updated_at", "DATETIME"),
        ("order_id", "INTEGER"),
        ("current_location", "VARCHAR(200)"),
        ("delivery_latitude", "FLOAT"),
        ("delivery_longitude", "FLOAT"),
        ("checkpoint_log", "TEXT"),
    ],
    "customers": [
        ("tags", "VARCHAR(255)"),
        ("notes", "TEXT"),
        ("accepts_marketing", "BOOLEAN DEFAULT 0"),
        ("shopify_customer_id", "VARCHAR(80)"),
        ("tier", "VARCHAR(30) DEFAULT 'Regular'"),
        ("billing_address", "TEXT"),
        ("is_active", "BOOLEAN DEFAULT 1"),
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
    dialect_name = engine.dialect.name

    for table, columns in _EXTRA_COLUMNS.items():
        if table not in existing_tables:
            continue
        try:
            present = {col["name"] for col in inspect(engine).get_columns(table)}
        except Exception:
            present = set()

        for name, typedef in columns:
            if name in present:
                continue
            column_type = _migration_column_type(typedef, dialect_name)
            try:
                with engine.begin() as conn:
                    if dialect_name == "postgresql":
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {column_type}"))
                    else:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {column_type}"))
            except Exception as exc:
                print(f"Migration note for column {name} in {table}: {exc}")

    unique_indexes = (
        ("customers", "shopify_customer_id", "ux_customers_shopify_customer_id"),
        ("products", "shopify_product_id", "ux_products_shopify_product_id"),
        ("product_variants", "shopify_variant_id", "ux_variants_shopify_variant_id"),
        ("product_variants", "shopify_inventory_item_id", "ux_variants_shopify_inventory_item_id"),
        ("orders", "shopify_order_id", "ux_orders_shopify_order_id"),
        ("invoices", "public_token", "ux_invoices_public_token"),
        ("storefront_simulations", "delivery_token_hash", "ux_storefront_sim_delivery_token"),
    )
    for table, column, index_name in unique_indexes:
        if table in existing_tables:
            try:
                with engine.begin() as conn:
                    conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"))
            except Exception as exc:
                print(f"Migration note for index {index_name}: {exc}")

    if "invoices" in existing_tables:
        if dialect_name == "sqlite":
            try:
                with engine.begin() as conn:
                    conn.execute(text("UPDATE invoices SET due_date = substr(due_date, 1, 10) WHERE due_date LIKE '% %' OR due_date LIKE '%T%'"))
            except Exception as exc:
                print(f"Migration note for invoice date normalization: {exc}")

        # Also backfill public_token for any invoices missing it
        try:
            with engine.begin() as conn:
                res = conn.execute(text("SELECT id FROM invoices WHERE public_token IS NULL")).fetchall()
                for (inv_id,) in res:
                    import secrets
                    token = secrets.token_urlsafe(32)
                    conn.execute(text("UPDATE invoices SET public_token = :t WHERE id = :id"), {"t": token, "id": inv_id})
        except Exception:
            pass
