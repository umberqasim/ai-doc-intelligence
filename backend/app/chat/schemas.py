from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = datetime.utcnow()

class ChatRequest(BaseModel):
    document_id: str
    question: str

class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    document_id: str
    question: str

class ConversationResponse(BaseModel):
    id: str
    document_id: str
    messages: List[ChatMessage]
    created_at: datetime
