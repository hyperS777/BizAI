"""
AI and Report schemas
"""

from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime


class AIQueryRequest(BaseModel):
    query: str
    conversation_history: Optional[List[Dict[str, Any]]] = None


class AIQueryResponse(BaseModel):
    id: int
    query_text: str
    response_text: str
    intent: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AISummaryResponse(BaseModel):
    summary: str
    generated_at: datetime
