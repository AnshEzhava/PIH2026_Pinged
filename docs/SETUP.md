# PIH2026 Pinged — Setup Guide

## Prerequisites

- Python 3.11+
- Node.js 18+
- Android Studio (for the emulator) or Expo Go (on physical device)

---

## Backend

### First-time setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Pre-warm the prediction cache (run once)

```powershell
python prewarm.py
```

This pre-computes results for all 22 popular diseases and writes them to `backend/cache/`. Subsequent requests for those diseases are served instantly.

### Start the server

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

---

## Frontend

```powershell
cd ..
npm install
npx expo start
```

Press `a` to open in the Android emulator.

The app connects to the backend at `http://10.0.2.2:8000/api` (Android emulator loopback). Ensure the backend is running before launching the app.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/diseases/popular` | List of 22 common diseases |
| GET | `/api/diseases/search?q=<text>` | Search diseases |
| GET | `/api/predict/{disease_id}?top_k=10` | Drug repurposing candidates |
| GET | `/api/drug/{drug_id}/details` | Drug properties and indications |
| GET | `/api/drug/{drug_id}/structure` | 2D/3D SDF structure |
| GET | `/api/drug/{drug_id}/network/{disease_id}` | Gene interaction network |
| POST | `/api/gemini/explain` | Drug mechanism explanation |
| POST | `/api/gemini/chat` | Follow-up Q&A |

---

## Environment Variables

Create `backend/.env`:

```
GEMINI_API_KEY=your_key_here
```

Gemini is optional. If not set, the explanation endpoints return a generic fallback.
