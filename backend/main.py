"""BizAI FastAPI backend."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import engine, Base
import models  # noqa: F401
from routers import auth, users, customers, products, orders, invoices, reports, ai, demo, expenses

logging.basicConfig(level=logging.INFO if settings.DEBUG else logging.WARNING)
logger = logging.getLogger("bizai")

Base.metadata.create_all(bind=engine)

from scripts.seed import seed_data
seed_data()

app = FastAPI(
    title=settings.APP_NAME,
    description="API for BizAI Business Management Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        *settings.cors_origins_list,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/")
def root():
    return {"message": "Welcome to BizAI API"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
