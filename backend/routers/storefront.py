"""Public customer storefront catalog."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.integration import StorefrontSimulationCreate
from services.storefront_service import create_storefront_simulation, list_storefront_simulations
from services.storefront_service import get_public_storefront_products
from utils.permissions import require_manager

router = APIRouter(prefix="/api/storefront", tags=["storefront"])


@router.get("/products")
def read_storefront_products(refresh: bool = False):
    try:
        return get_public_storefront_products(force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/simulations")
def create_customer_simulation(payload: StorefrontSimulationCreate, db: Session = Depends(get_db)):
    try:
        return create_storefront_simulation(
            db,
            payload.customer_name,
            str(payload.customer_email),
            payload.items,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/simulations")
def read_customer_simulations(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    return list_storefront_simulations(db, limit=max(1, min(limit, 250)))
