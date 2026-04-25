from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal


# 🔐 AUTH SCHEMAS
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user_id: str
    name: str
    email: str


# ⚙️ SETTINGS
class UserSettings(BaseModel):
    bot_enabled: bool = True
    human_delay: bool = True
    style_cloning: bool = True
    notifications: bool = True

    response_tone: Literal["casual", "formal", "friendly", "brief"] = "casual"
    gender_tone: Literal["neutral", "male", "female"] = "neutral"

    delay_min_seconds: int = 2
    delay_max_seconds: int = 8

    # 🔥 FIXED: no mutable default bug
    blacklist: List[str] = Field(default_factory=list)
    training_contact_ids: List[str] = Field(default_factory=list)


class UserSettingsUpdate(BaseModel):
    bot_enabled: Optional[bool] = None
    human_delay: Optional[bool] = None
    style_cloning: Optional[bool] = None
    notifications: Optional[bool] = None

    response_tone: Optional[Literal["casual", "formal", "friendly", "brief"]] = None
    gender_tone: Optional[Literal["neutral", "male", "female"]] = None
    delay_min_seconds: Optional[int] = None
    delay_max_seconds: Optional[int] = None

    blacklist: Optional[List[str]] = None
    training_contact_ids: Optional[List[str]] = None


# 📂 CHAT
class ChatUploadResponse(BaseModel):
    chat_id: str
    contact_name: str
    messages_parsed: int
    messages_embedded: int
    status: str


class ChatUploadTextRequest(BaseModel):
    file_name: str
    raw_text: str
    your_name: str
    contact_name: str


# 🤖 AI REQUEST
class Message(BaseModel):
    role: str  # "in" or "out"
    text: str


class GenerateReplyRequest(BaseModel):
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    incoming_message: str

    # 🔥 FIXED: no shared list bug
    conversation_history: Optional[List[Message]] = Field(default_factory=list)


class RetrievedMessage(BaseModel):
    incoming: str
    reply: str
    similarity: float


class GenerateReplyResponse(BaseModel):
    reply: str
    retrieved_messages: List[RetrievedMessage]
    rag_context_used: bool
    processing_time_ms: int
