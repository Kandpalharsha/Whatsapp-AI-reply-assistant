# WhatsApp AI Reply Assistant

An AI-powered WhatsApp reply assistant that learns from exported chats and generates replies in the user's texting style. The app includes chat training, RAG-based example retrieval, notification-driven auto reply on Android, blacklist controls, delay settings, and reply persona tuning.

## Project Structure

- `backend/` - FastAPI API, chat parsing, retrieval, AI generation, MongoDB integration
- `frontend/` - React Native Android app and native notification listener logic
- `START_HERE.md` - local setup guide

## Core Features

- Train on one or more exported WhatsApp chats
- Generate style-aware replies for non-blacklisted chats
- Android notification listener with quick-reply automation
- Duplicate suppression and self-reply protection
- Adjustable delay settings and reply persona (`neutral`, `male`, `female`)
- Inbox debugging surface for auto-reply status

## Local Development

### Backend

```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```powershell
cd frontend
npm install
npx react-native start --port 8082
```

In a second terminal:

```powershell
cd frontend
npx react-native run-android --port 8082
```

If using a real Android phone over USB, keep the backend running and map the backend port:

```powershell
adb reverse tcp:8000 tcp:8000
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values:

- `OPENAI_API_KEY`
- `MONGODB_URL`
- `MONGODB_DB`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRE_MINUTES`
- `FAISS_INDEX_DIR`
- `EMBEDDINGS_MODEL`

## Deployment

This project is split into:

1. `backend` deploy target
   - deploy as a Python/FastAPI service
   - requires MongoDB access
   - requires persistent storage for `faiss_indices/` if you want trained data to survive restarts

2. `frontend` distribution target
   - build an Android APK/AAB
   - point `frontend/src/services/api.ts` at your deployed backend URL

### Docker Deployment (backend)

```powershell
docker compose up --build
```

This starts the backend on `http://localhost:8000`.

### Recommended Production Notes

- Do not commit `.env` files or API keys
- Replace the default JWT secret
- Persist `backend/faiss_indices`
- Use a managed MongoDB instance for production
- Switch the frontend API base URL to your deployed backend before releasing the Android app

## GitHub Prep

The project root now includes:

- `.gitignore`
- `README.md`
- `backend/.env.example`
- `backend/Dockerfile`
- `docker-compose.yml`

These files make the project ready to publish to GitHub without leaking secrets.
