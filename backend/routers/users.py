"""Users API."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import Role, User
from schemas.user import UserCreate, UserUpdate, UserResponse, RoleResponse
from services.user_service import get_users, get_user, create_user, update_user
from utils.permissions import require_admin, require_staff

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/roles", response_model=List[RoleResponse])
def read_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(Role).order_by(Role.id.asc()).all()


@router.get("", response_model=List[UserResponse])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return get_users(db, skip=skip, limit=limit)


@router.post("", response_model=UserResponse)
def create_new_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return create_user(db, user)


@router.get("/{user_id}", response_model=UserResponse)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if current_user.role.name != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Operation not permitted for your role")
    db_user = get_user(db, user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.put("/{user_id}", response_model=UserResponse)
def update_existing_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    db_user = update_user(db, user_id, user_update)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    new_password = payload.get("password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    db_user = update_user(db, user_id, UserUpdate(password=new_password))
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": "Password updated successfully"}


@router.delete("/{user_id}")
def delete_or_deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate or delete your own account")
    db_user = get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    # Soft delete / toggle active
    db_user.is_active = not db_user.is_active
    db.commit()
    return {"ok": True, "is_active": db_user.is_active}

