# Local Setup — Start Here

## What you need installed
- Python 3.11
- Node.js 20+
- MongoDB Community (free) — mongodb.com/try/download/community
- Android Studio + Android emulator (or a real Android phone)

---

## Step 1 — Add your OpenAI key

Open `backend/.env` and replace the placeholder:
```
OPENAI_API_KEY=sk-your-actual-key-here
```
Get a key at: platform.openai.com → API keys → Create new secret key

---

## Step 2 — Start MongoDB

### Windows
MongoDB installs as a Windows Service and starts automatically.
If it's not running: open Services → find "MongoDB" → Start

### Mac
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### Linux (Ubuntu)
```bash
sudo systemctl start mongod
```

Verify it's running:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
# Should print: { ok: 1 }
```

---

## Step 3 — Start the backend

Open a terminal in the `backend/` folder:

```bash
# Create virtual environment (first time only)
python -m venv .venv

# Activate it
# Windows:
.venv\Scripts\activate
# Mac / Linux:
source .venv/bin/activate

# Install packages (first time only — takes 3-5 mins)
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

Test it: open http://localhost:8000/docs in your browser
You should see the interactive API docs (Swagger UI).

---

## Step 4 — Start the frontend

### First time setup
```bash
cd frontend
npm install
```

### Every time — need 2 terminals

**Terminal 1 — Metro bundler:**
```bash
cd frontend
npx react-native start
```

**Terminal 2 — Run on Android emulator:**
```bash
cd frontend
npx react-native run-android
```

> If using a real Android device via USB, enable USB Debugging first:
> Settings → About Phone → tap Build Number 7 times → Developer Options → USB Debugging ON
> Then check device is detected: `adb devices`

---

## Step 5 — Use the app

1. Sign up with any email/password (stored locally in your MongoDB)
2. Go to Train tab → enter your name exactly as in WhatsApp → pick your exported .txt file
3. Wait for the pipeline to finish (parse → embed → index → ready)
4. Go to Chats tab → tap the contact → send a message
5. Watch the AI reply in your style with the RAG context shown

---

## Changing the API URL

If you're running the app on a **real device** (not an emulator):
Open `frontend/src/services/api.ts` line 7 and change:
```ts
const BASE_URL = 'http://10.0.2.2:8000';   // emulator
// to:
const BASE_URL = 'http://192.168.1.X:8000'; // your PC's local WiFi IP
```

Find your IP: run `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

---

## Folder structure

```
whatsapp-ai-assistant/
├── backend/
│   ├── main.py           ← FastAPI entry point
│   ├── .env              ← Your secret keys (never commit this)
│   ├── requirements.txt
│   ├── core/             ← Config, auth, database
│   ├── routers/          ← API routes (auth, chat, reply, settings)
│   ├── services/         ← RAG engine + AI generation
│   ├── models/           ← Pydantic schemas
│   └── faiss_indices/    ← Created automatically when you train
│
└── frontend/
    ├── App.tsx
    ├── src/
    │   ├── AppNavigator.tsx
    │   ├── screens/      ← Login, Upload, Contacts, Chat, Settings
    │   ├── store/        ← Zustand global state
    │   ├── services/     ← API client
    │   └── utils/        ← Theme colors and spacing
    └── package.json
```

---

## Common errors and fixes

| Error | Fix |
|---|---|
| `Connection refused` on app | Backend not running — start uvicorn |
| `No messages found for 'Name'` | Your name must match WhatsApp export exactly (case-sensitive) |
| `FAISS error on Mac M1/M2` | Run: `pip install faiss-cpu --no-binary faiss-cpu` |
| `Metro bundler port in use` | Run: `npx react-native start --reset-cache` |
| `adb: device not found` | Enable USB debugging on phone, reconnect cable |
| `ModuleNotFoundError` | Activate venv: `source .venv/bin/activate` |
| App crashes on launch | Run `npx react-native run-android` again |
