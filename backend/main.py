from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, chat, reply, settings

app = FastAPI(title="WhatsApp AI Assistant (Local)", version="1.0.0")

# Open CORS for local development — allow everything
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(reply.router)
app.include_router(settings.router)

@app.get("/")
async def root():
    return {"message": "WhatsApp AI Assistant API running locally", "docs": "http://localhost:8000/docs"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
