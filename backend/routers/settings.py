from fastapi import APIRouter, Depends
from core.auth import get_current_user
from core.database import settings_col
from models.schemas import UserSettings, UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/", response_model=UserSettings)
async def get_settings(user_id: str = Depends(get_current_user)):
    doc = await settings_col().find_one({"user_id": user_id}) or {}
    doc.pop("_id", None); doc.pop("user_id", None)
    return UserSettings(**doc)

@router.patch("/", response_model=UserSettings)
async def update_settings(body: UserSettingsUpdate, user_id: str = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await settings_col().update_one({"user_id": user_id}, {"$set": updates}, upsert=True)
    doc = await settings_col().find_one({"user_id": user_id}) or {}
    doc.pop("_id", None); doc.pop("user_id", None)
    return UserSettings(**doc)

@router.post("/blacklist/{contact}")
async def add_blacklist(contact: str, user_id: str = Depends(get_current_user)):
    await settings_col().update_one({"user_id": user_id}, {"$addToSet": {"blacklist": contact}})
    return {"status": "added"}

@router.delete("/blacklist/{contact}")
async def remove_blacklist(contact: str, user_id: str = Depends(get_current_user)):
    await settings_col().update_one({"user_id": user_id}, {"$pull": {"blacklist": contact}})
    return {"status": "removed"}
