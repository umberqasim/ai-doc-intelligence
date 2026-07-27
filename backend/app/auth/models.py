from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

class UserModel(BaseModel):
    id: Optional[str] = None
    full_name: str
    email: str
    hashed_password: str
    role: str = "user"
    is_active: bool = True
    created_at: datetime = datetime.utcnow()
    total_documents: int = 0
    total_conversations: int = 0
    total_ai_requests: int = 0
