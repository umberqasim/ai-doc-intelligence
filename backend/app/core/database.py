from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def connect_db():
    db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db_instance.db = db_instance.client[settings.DATABASE_NAME]
    print(f"✅ Connected to MongoDB: {settings.DATABASE_NAME}")
    await create_indexes()

async def create_indexes():
    db = db_instance.db
    await db.users.create_index("email", unique=True)
    await db.documents.create_index("user_id")
    await db.documents.create_index("created_at")
    await db.documents.create_index([("user_id", 1), ("status", 1)])
    await db.conversations.create_index("user_id")
    await db.conversations.create_index("document_id")
    await db.conversations.create_index([("document_id", 1), ("user_id", 1), ("created_at", -1)])
    await db.refresh_tokens.create_index("token", unique=True)
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.ai_logs.create_index("user_id")
    await db.ai_logs.create_index([("user_id", 1), ("feature", 1)])
    await db.ai_results.create_index([("document_id", 1), ("user_id", 1), ("feature", 1), ("sub_type", 1)])
    print("✅ Database indexes created")

async def close_db():
    if db_instance.client:
        db_instance.client.close()
        print("❌ MongoDB connection closed")

def get_db():
    return db_instance.db
