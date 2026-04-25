from motor.motor_asyncio import AsyncIOMotorClient
from core.config import get_settings

settings = get_settings()
_client = None

def get_client():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_url)
    return _client

def get_db():
    return get_client()[settings.mongodb_db]

def users_col():    return get_db()["users"]
def messages_col(): return get_db()["messages"]
def settings_col(): return get_db()["settings"]
def contacts_col(): return get_db()["contacts"]
