# 🚨 Disaster Saviour — AI Drone Disaster Response App

A single-server, offline-first disaster response coordination dashboard built for hackathon demo.

## ✨ Features
- **FastAPI Backend** — Handles API routing and serves the frontend
- **SQLite Database** — Zero-setup, file-based, no internet needed
- **Session Auth** — Cookie-based login, works fully offline
- **YOLO & XGBoost AI** — Processes drone images, detects victims & disaster severity
- **Live Dashboard** — Leaflet map + zone list auto-updates every few seconds
- **🟢 Active Operators Panel** — Shows who is logged in live, refreshes every 5 seconds

## 📁 Project Structure

```
disaster-saviour/
├── main.py                  ← FastAPI app (routes + API)
├── auth.py                  ← Login / logout / session tracking
├── database.py              ← SQLAlchemy SQLite setup
├── models_db.py             ← DB models: User, Zone, LoginSession
├── ml/
│   ├── inference.py         ← YOLO + XGBoost inference
│   └── train_xgboost.py     ← Run once to train priority model
├── models/
│   ├── victim_model.pt      ← ⚠️ Add your trained YOLO best.pt here
│   ├── disaster_model.pt    ← ⚠️ Add your trained YOLO best.pt here
│   └── xgboost_priority.json
├── templates/               ← HTML pages (login, dashboard, upload)
└── static/                  ← CSS + JS files
```

## 🚀 Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

### 2. Add Your Trained Models
Copy your YOLO `best.pt` files into the `models/` folder:
```
models/victim_model.pt      ← rename your victim detection best.pt
models/disaster_model.pt    ← rename your disaster detection best.pt
```

### 3. Train XGBoost Priority Model (Run Once)
```bash
python ml/train_xgboost.py
```

### 4. Start the Server
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Open the App
```
http://localhost:8000
```
Login with default credentials: `admin` / `admin`

## 📌 Key Pages

| Page | URL |
|---|---|
| Login | http://localhost:8000 |
| Dashboard (live map) | http://localhost:8000/dashboard |
| Upload drone image | http://localhost:8000/upload |
| API docs | http://localhost:8000/docs |

## 🔗 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | Login |
| POST | `/api/logout` | Logout |
| POST | `/api/detect` | Upload image → run AI detection |
| GET | `/api/zones` | Get all disaster zones |
| PATCH | `/api/zone/{id}` | Mark zone as rescued |
| GET | `/api/active-sessions` | Get currently logged-in operators |
