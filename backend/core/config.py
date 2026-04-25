from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "whatsapp_ai"
    jwt_secret: str = "localsecret1234567890abcdef"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080
    faiss_index_dir: str = "./faiss_indices"
    embeddings_model: str = "all-MiniLM-L6-v2"

    class Config:
        env_file = ".env"


# ✅ VERY IMPORTANT — ADD THIS BACK
def get_settings():
    return Settings()