"""BizAI FastAPI backend."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import engine, Base, ensure_schema, SessionLocal
import models  # noqa: F401
from routers import (
    auth, users, customers, products, orders, invoices,
    reports, ai, demo, expenses, notifications, integrations, storefront, payments,
)

logging.basicConfig(level=logging.INFO if settings.DEBUG else logging.WARNING)
logger = logging.getLogger("bizai")

def init_db_in_background():
    """Run database table creation, schema migration, and catalog seeding safely in background."""
    try:
        logger.info("Initializing database schema and seed data in background...")
        Base.metadata.create_all(bind=engine)
        ensure_schema()

        from scripts.seed import seed_data
        seed_data()

        from services.integration_service import ensure_default_settings
        from services.storefront_service import sync_all_reihh_catalog
        db = SessionLocal()
        try:
            ensure_default_settings(db)
            sync_all_reihh_catalog(db)
        finally:
            db.close()
        logger.info("Database background initialization complete.")
    except Exception as exc:
        logger.warning("Background database initialization warning: %s", exc)


app = FastAPI(
    title=settings.APP_NAME,
    description="API for BizAI Business Management Platform",
    version="1.0.0",
)


@app.on_event("startup")
def on_startup():
    import threading
    threading.Thread(target=init_db_in_background, daemon=True).start()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        *settings.cors_origins_list,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://biz-ai-sooty.vercel.app",
        "https://bizai-reihh.site",
        "https://www.bizai-reihh.site",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.azurestaticapps\.net",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_ROUTE_PREFIXES = (
    "/auth",
    "/users",
    "/customers",
    "/products",
    "/orders",
    "/invoices",
    "/reports",
    "/ai",
    "/expenses",
    "/demo",
    "/notifications",
    "/integrations",
    "/storefront",
    "/payments",
    "/health",
)


@app.middleware("http")
async def fallback_api_prefix(request: Request, call_next):
    """Automatically map requests missing /api prefix (e.g. /auth/login -> /api/auth/login)."""
    path = request.scope.get("path", "")
    if not path.startswith("/api/"):
        for prefix in API_ROUTE_PREFIXES:
            if path == prefix or path.startswith(f"{prefix}/"):
                request.scope["path"] = f"/api{path}"
                break
    return await call_next(request)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    logger.info("%s %s -> %s", request.method, request.url.path, response.status_code)
    return response


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(invoices.router)
app.include_router(reports.router)
app.include_router(ai.router)
app.include_router(expenses.router)
app.include_router(demo.router)
app.include_router(notifications.router)
app.include_router(integrations.router)
app.include_router(storefront.router)
app.include_router(payments.router)


@app.get("/")
def root():
    return {"message": "Welcome to BizAI API"}


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "bizai-api"}


@app.get("/api/migrate")
def trigger_migration():
    """Safety endpoint to trigger schema migration and table creation on demand."""
    try:
        Base.metadata.create_all(bind=engine)
        ensure_schema()
        return {"status": "ok", "message": "Schema migration executed successfully"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
