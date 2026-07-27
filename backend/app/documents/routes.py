import os
import uuid
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
from app.auth.utils import decode_token
from app.core.database import get_db
from app.documents.schemas import DocumentResponse, DocumentListResponse, DocumentUpdate
from app.documents.processor import extract_text, split_text, store_embeddings, delete_document_embeddings
from tasks import process_document_task

router = APIRouter(prefix="/documents", tags=["Documents"])
security = HTTPBearer()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/csv": "csv"
}

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="File type not supported. Use PDF, DOCX, TXT, or CSV")
    
    file_type = ALLOWED_TYPES[file.content_type]
    file_id = str(uuid.uuid4())
    file_path = f"{UPLOAD_DIR}/{file_id}.{file_type}"
    
    content = await file.read()
    file_size = len(content)
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    db = get_db()
    document = {
        "filename": f"{file_id}.{file_type}",
        "original_filename": file.filename,
        "file_type": file_type,
        "file_size": file_size,
        "file_path": file_path,
        "status": "pending",
        "chunk_count": 0,
        "user_id": str(current_user["_id"]),
        "category": None,
        "created_at": datetime.utcnow()
    }
    
    result = await db.documents.insert_one(document)
    doc_id = str(result.inserted_id)
    
    process_document_task.delay(
        doc_id, file_path, file_type,
        str(current_user["_id"])
    )
    
    document["id"] = doc_id
    return DocumentResponse(**document)

@router.get("/", response_model=DocumentListResponse)
async def get_documents(
    skip: int = 0,
    limit: int = 20,
    file_type: str = None,
    status: str = None,
    date_from: str = None,
    date_to: str = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = str(current_user["_id"])
    query = {"user_id": user_id}
    if file_type:
        query["file_type"] = file_type
    if status:
        query["status"] = status
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = datetime.fromisoformat(date_from)
        if date_to:
            date_filter["$lte"] = datetime.fromisoformat(date_to)
        query["created_at"] = date_filter
    cursor = db.documents.find(query).skip(skip).limit(limit)
    documents = await cursor.to_list(length=limit)
    total = await db.documents.count_documents(query)
    docs = []
    for doc in documents:
        doc["id"] = str(doc["_id"])
        docs.append(DocumentResponse(**doc))
    return DocumentListResponse(documents=docs, total=total)

@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str,
    updates: DocumentUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": ObjectId(doc_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    update_fields = {}
    if updates.original_filename is not None:
        update_fields["original_filename"] = updates.original_filename
    if updates.category is not None:
        update_fields["category"] = updates.category

    if update_fields:
        await db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": update_fields}
        )

    updated_doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    updated_doc["id"] = str(updated_doc["_id"])
    return DocumentResponse(**updated_doc)

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": __import__('bson').ObjectId(doc_id),
        "user_id": str(current_user["_id"])
    })
    
    if not doc:
        raise HTTPException(stode=404, detail="Document not found")
    
    if os.path.exists(doc["file_path"]):
        os.remove(doc["file_path"])
    
    delete_document_embeddings(doc_id)
    await db.documents.delete_one({"_id": __import__('bson').ObjectId(doc_id)})
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"total_documents": -1}}
    )
    
    return {"message": "Document deleted successfully"}

@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = await db.documents.find_one({
        "_id": __import__('bson').ObjectId(doc_id),
        "user_id": str(current_user["_id"])
    })
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc["id"] = str(doc["_id"])
    return DocumentResponse(**doc)
