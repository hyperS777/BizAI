"""
Role-based access control (RBAC) permissions.
"""

from fastapi import Depends, HTTPException, status
from models.user import User
from utils.deps import get_current_active_user


class RoleChecker:
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)):
        role_name = (user.role.name if user.role else "").lower()
        if role_name not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for your role"
            )
        return user


# All signed-in staff can view operational data.
require_staff = RoleChecker(["admin", "manager", "employee", "accountant"])
# Mutations that frontline staff perform (customers, orders).
require_employee = RoleChecker(["admin", "manager", "employee"])
# Billing and financial records.
require_accountant = RoleChecker(["admin", "manager", "accountant"])
# Inventory, products, reports, AI.
require_manager = RoleChecker(["admin", "manager"])
# User administration.
require_admin = RoleChecker(["admin"])
