from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
from bson import ObjectId
from app.auth.schemas import UserRegister, UserLogin, UserResponse, Token, RefreshRequest
from app.auth.utils import hash_password, verify_password, create_access_token, decode_token, create_refresh_token, get_refresh_token_expiry
from app.core.database import get_db
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserRegister):
    db = get_db()
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = {
        "full_name": user_data.full_name,
        "email": user_data.email,
        "hashed_password": hash_password(user_data.password),
        "role": "user",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "total_documents": 0,
        "total_conversations": 0,
        "total_ai_requests": 0
    }
    result = await db.users.insert_one(user)
    user["id"] = str(result.inserted_id)
    return UserResponse(**user)

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, user_data: UserLogin):
    db = get_db()
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token({"sub": user["email"]})
    refresh_token = create_refresh_token()

    await db.refresh_tokens.insert_one({
        "token": refresh_token,
        "user_email": user["email"],
        "expires_at": get_refresh_token_expiry(),
        "created_at": datetime.utcnow()
    })

    return Token(access_token=access_token, refresh_token=refresh_token)

@router.get("/me", response_model=UserResponse)
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    email = decode_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user["id"] = str(user["_id"])
    return UserResponse(**user)

@router.post("/refresh", response_model=Token)
async def refresh_token_endpoint(body: RefreshRequest):
    db = get_db()
    stored = await db.refresh_tokens.find_one({"token": body.refresh_token})

    if not stored:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if stored["expires_at"] < datetime.utcnow():
        await db.refresh_tokens.delete_one({"_id": stored["_id"]})
        raise HTTPException(status_code=401, detail="Refresh token expired, please login again")

    user = await db.users.find_one({"email": stored["user_email"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_access_token = create_access_token({"sub": user["email"]})
    new_refresh_token = create_refresh_token()

    await db.refresh_tokens.delete_one({"_id": stored["_id"]})
    await db.refresh_tokens.insert_one({
        "token": new_refresh_token,
        "user_email": user["email"],
        "expires_at": get_refresh_token_expiry(),
        "created_at": datetime.utcnow()
    })

    return Token(access_token=new_access_token, refresh_token=new_refresh_token)

@router.post("/logout")
async def logout(body: RefreshRequest):
    db = get_db()
    await db.refresh_tokens.delete_one({"token": body.refresh_token})
    return {"message": "Logged out successfully"}

from app.auth.utils import get_current_admin

@router.get("/admin/users", response_model=list[UserResponse])
async def list_all_users(current_admin: dict = Depends(get_current_admin)):
    db = get_db()
    cursor = db.users.find({})
    users = await cursor.to_list(length=100)
    result = []
    for u in users:
        u["id"] = str(u["_id"])
        result.append(UserResponse(**u))
    return result

@router.patch("/admin/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    role: str,
    current_admin: dict = Depends(get_current_admin)
):
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    if str(current_admin["_id"]) == user_id and role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin access")
    db = get_db()
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"Role updated to {role}"}

@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    if str(current_admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    db = get_db()
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.documents.delete_many({"user_id": user_id})
    await db.conversations.delete_many({"user_id": user_id})
    await db.refresh_tokens.delete_many({"user_email": current_admin.get("email", "")})
    return {"message": "User and their data deleted successfully"}

@router.patch("/admin/users/{user_id}/status")
async def toggle_user_status(
    user_id: str,
    is_active: bool,
    current_admin: dict = Depends(get_current_admin)
):
    db = get_db()
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": is_active}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"User {'activated' if is_active else 'deactivated'}"}
