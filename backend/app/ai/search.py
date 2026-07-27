from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List
from app.auth.utils import decode_token
from app.core.database import get_db
from app.documents.processor import embedding_model, chroma_client

router = APIRouter(prefix="/search", tags=["Semantic Search"])
security = HTTPBearer()

class SearchRequest(BaseModel):
    query: str
    document_id: str
    top_k: int = 5

class SearchResult(BaseModel):
    chunk: str
    relevance: float

class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    total: int

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/", response_model=SearchResponse)
async def semantic_search(
    request: SearchRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        collection = chroma_client.get_collection(f"doc_{request.document_id}")
        query_embedding = embedding_model.encode([request.query]).tolist()

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=min(request.top_k, collection.count())
        )

        chunks = results['documents'][0]
        distances = results['distances'][0]

        # With the collection now using cosine space, dist is cosine distance
        # (0 = identical, 2 = opposite). Clamp to [0, 1] just in case of
        # floating point drift so relevance is always a clean 0-100%.
        search_results = [
            SearchResult(
                chunk=chunk,
                relevance=round(max(0.0, min(1.0, 1 - dist)), 3)
            )
            for chunk, dist in zip(chunks, distances)
        ]

        return SearchResponse(
            query=request.query,
            results=search_results,
            total=len(search_results)
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="Document not found in search index")