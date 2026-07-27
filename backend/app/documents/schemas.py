from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    file_type: str
    file_size: int
    status: str
    chunk_count: int
    user_id: str
    category: Optional[str] = None
    created_at: datetime

class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int

class DocumentUpdate(BaseModel):
    original_filename: Optional[str] = None
    category: Optional[str] = None
