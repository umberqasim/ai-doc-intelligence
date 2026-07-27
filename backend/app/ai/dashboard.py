from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth.utils import decode_token
from app.core.database import get_db
from app.core.cache import get_cache, set_cache

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])

    cache_key = f"dashboard_stats:{user_id}"
    cached = get_cache(cache_key)
    if cached:
        return cached
    
    total_docs = await db.documents.count_documents({"user_id": user_id})
    ready_docs = await db.documents.count_documents({"user_id": user_id, "status": "ready"})
    total_conversations = await db.conversations.count_documents({"user_id": user_id})
    
    # Recent documents
    cursor = db.documents.find({"user_id": user_id}).sort("created_at", -1).limit(5)
    recent_docs = await cursor.to_list(length=5)
    for doc in recent_docs:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    
    # File type breakdown
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$file_type", "count": {"$sum": 1}}}
    ]
    file_types_cursor = db.documents.aggregate(pipeline)
    file_types = await file_types_cursor.to_list(length=10)
    
    # AI performance stats (response time, token usage, model breakdown)
    perf_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$feature",
            "avg_duration_ms": {"$avg": "$duration_ms"},
            "total_requests": {"$sum": 1},
            "total_tokens": {"$sum": {"$ifNull": ["$tokens_used", 0]}},
        }}
    ]
    perf_cursor = db.ai_logs.aggregate(perf_pipeline)
    perf_by_feature = await perf_cursor.to_list(length=20)

    model_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$model",
            "avg_duration_ms": {"$avg": "$duration_ms"},
            "total_requests": {"$sum": 1},
            "total_tokens": {"$sum": {"$ifNull": ["$tokens_used", 0]}},
        }}
    ]
    model_cursor = db.ai_logs.aggregate(model_pipeline)
    perf_by_model = await model_cursor.to_list(length=20)

    total_tokens_used = sum(m.get("total_tokens", 0) for m in perf_by_model)

    # Response time distribution (histogram buckets, in milliseconds)
    histogram_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$bucket": {
            "groupBy": "$duration_ms",
            "boundaries": [0, 1000, 2000, 5000, 10000, 20000, 40000, 1000000],
            "default": "40000+",
            "output": {"count": {"$sum": 1}}
        }}
    ]
    histogram_cursor = db.ai_logs.aggregate(histogram_pipeline)
    histogram_raw = await histogram_cursor.to_list(length=20)

    bucket_labels = {
        0: "0-1s", 1000: "1-2s", 2000: "2-5s", 5000: "5-10s",
        10000: "10-20s", 20000: "20-40s", 40000: "40s+"
    }
    response_time_histogram = [
        {"bucket": bucket_labels.get(h["_id"], str(h["_id"])), "count": h["count"]}
        for h in histogram_raw
    ]

    response_data = {
        "user": {
            "name": current_user["full_name"],
            "email": current_user["email"],
            "member_since": current_user["created_at"]
        },
        "stats": {
            "total_documents": total_docs,
            "ready_documents": ready_docs,
            "total_conversations": total_conversations,
            "total_ai_requests": current_user.get("total_ai_requests", 0)
        },
        "file_type_breakdown": {ft["_id"]: ft["count"] for ft in file_types},
        "recent_documents": recent_docs,
        "performance": {
            "total_tokens_used": total_tokens_used,
            "by_feature": [
                {
                    "feature": p["_id"],
                    "avg_response_time_ms": round(p["avg_duration_ms"], 2),
                    "total_requests": p["total_requests"],
                    "total_tokens": p["total_tokens"]
                } for p in perf_by_feature
            ],
            "by_model": [
                {
                    "model": p["_id"],
                    "avg_response_time_ms": round(p["avg_duration_ms"], 2),
                    "total_requests": p["total_requests"],
                    "total_tokens": p["total_tokens"]
                } for p in perf_by_model
            ],
            "response_time_histogram": response_time_histogram
        }
    }

    set_cache(cache_key, response_data, ttl_seconds=5)
    return response_data
