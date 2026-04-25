import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

from core.auth import get_current_user
from core.database import contacts_col, messages_col
from models.schemas import ChatUploadResponse, ChatUploadTextRequest
from services.rag_service import build_index, parse_whatsapp_export

router = APIRouter(prefix="/chat", tags=["chat"])


async def _store_chat_content(
    *,
    content: bytes,
    your_name: str,
    contact_name: str,
    user_id: str,
    source_file_name: Optional[str],
):
    if len(content) > 5_000_000:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    try:
        decoded_text = content.decode("utf-8")
    except UnicodeDecodeError:
        decoded_text = content.decode("latin-1")

    pairs, all_messages = parse_whatsapp_export(decoded_text, your_name)

    if not pairs:
        raise HTTPException(
            status_code=400,
            detail="No valid conversation pairs found. Make sure your name matches correctly.",
        )

    contact_id = str(uuid.uuid4())

    await contacts_col().insert_one(
        {
            "contact_id": contact_id,
            "user_id": user_id,
            "name": contact_name,
            "messages_trained": len(pairs),
            "created_at": datetime.utcnow(),
            "bot_enabled": True,
            "source_file_name": source_file_name,
        }
    )

    await messages_col().insert_one(
        {
            "contact_id": contact_id,
            "user_id": user_id,
            "messages": all_messages,
            "created_at": datetime.utcnow(),
        }
    )

    embedded = build_index(user_id, contact_id, pairs)

    return ChatUploadResponse(
        chat_id=contact_id,
        contact_name=contact_name,
        messages_parsed=len(all_messages),
        messages_embedded=embedded,
        status="ready",
    )


@router.post("/upload", response_model=ChatUploadResponse)
async def upload_chat(
    file: Optional[UploadFile] = File(None),
    file_name: Optional[str] = Form(None),
    raw_text: Optional[str] = Form(None),
    your_name: str = Form(...),
    contact_name: str = Form(...),
    user_id: str = Depends(get_current_user),
):
    if raw_text is not None:
        content = raw_text.encode("utf-8")
    elif file is not None:
        content = await file.read()
    else:
        raise HTTPException(status_code=400, detail="No chat file content received")

    return await _store_chat_content(
        content=content,
        your_name=your_name,
        contact_name=contact_name,
        user_id=user_id,
        source_file_name=file_name or getattr(file, "filename", None),
    )


@router.post("/upload-text", response_model=ChatUploadResponse)
async def upload_chat_text(
    body: ChatUploadTextRequest = Body(...),
    user_id: str = Depends(get_current_user),
):
    return await _store_chat_content(
        content=body.raw_text.encode("utf-8"),
        your_name=body.your_name,
        contact_name=body.contact_name,
        user_id=user_id,
        source_file_name=body.file_name,
    )


@router.get("/contacts")
async def get_contacts(user_id: str = Depends(get_current_user)):
    contacts = []
    async for doc in contacts_col().find({"user_id": user_id}):
        contacts.append(
            {
                "id": doc["contact_id"],
                "name": doc["name"],
                "messages_trained": doc.get("messages_trained", 0),
                "bot_enabled": doc.get("bot_enabled", True),
            }
        )
    return contacts


@router.patch("/contacts/{contact_id}/bot")
async def toggle_bot(
    contact_id: str,
    enabled: bool,
    user_id: str = Depends(get_current_user),
):
    await contacts_col().update_one(
        {"contact_id": contact_id, "user_id": user_id},
        {"$set": {"bot_enabled": enabled}},
    )
    return {"status": "ok", "bot_enabled": enabled}
