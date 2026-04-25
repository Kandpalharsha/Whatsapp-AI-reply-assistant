from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime
from core.auth import hash_password, verify_password, create_access_token
from core.database import users_col, settings_col
from models.schemas import SignupRequest, LoginRequest, AuthResponse

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest):
    if await users_col().find_one({"email": body.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    result = await users_col().insert_one({
        "name": body.name, "email": body.email,
        "password_hash": hash_password(body.password), "created_at": datetime.utcnow()
    })
    user_id = str(result.inserted_id)
    await settings_col().insert_one({
        "user_id": user_id, "bot_enabled": True, "human_delay": True,
        "style_cloning": True, "notifications": True, "response_tone": "casual",
        "gender_tone": "neutral", "delay_min_seconds": 2, "delay_max_seconds": 8, "blacklist": []
    })
    return AuthResponse(access_token=create_access_token(user_id), user_id=user_id, name=body.name, email=body.email)

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    user = await users_col().find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthResponse(
        access_token=create_access_token(str(user["_id"])),
        user_id=str(user["_id"]), name=user["name"], email=user["email"]
    )
