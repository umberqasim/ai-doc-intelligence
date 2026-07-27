from bson import ObjectId
from pymongo import MongoClient
from celery_app import celery_app
from celery.exceptions import SoftTimeLimitExceeded
from app.core.config import settings
from app.documents.processor import extract_text, split_text, store_embeddings

def get_sync_db():
    client = MongoClient(settings.MONGODB_URL)
    return client[settings.DATABASE_NAME]

@celery_app.task(name="process_document_task")
def process_document_task(doc_id: str, file_path: str, file_type: str, user_id: str):
    db = get_sync_db()
    try:
        db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"status": "processing"}}
        )

        text = extract_text(file_path, file_type)
        if not text:
            raise Exception("No text extracted")

        chunks = split_text(text)
        chunk_count = store_embeddings(doc_id, chunks, user_id)

        db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "status": "ready",
                "chunk_count": chunk_count,
                "text_preview": text[:500]
            }}
        )

        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"total_documents": 1}}
        )

    except SoftTimeLimitExceeded:
        db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"status": "error", "error": "Processing took too long (timeout) — the file may be too large or complex for OCR."}}
        )
    except Exception as e:
        db.documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"status": "error", "error": str(e)}}
        )
