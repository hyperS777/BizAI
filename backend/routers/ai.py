"""AI API."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.ai import AIQueryRequest, AIQueryResponse, AISummaryResponse
from services.ai_service import answer_query, business_summary
from utils.permissions import require_staff

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat", response_model=AIQueryResponse)
def ai_chat(
    request: AIQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return answer_query(db, current_user, request.query)


@router.get("/summary", response_model=AISummaryResponse)
def get_business_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    return business_summary(db)
