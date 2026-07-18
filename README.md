# Disaster Response App (Locked-in Architecture)

A single-server, offline-first disaster response coordination dashboard designed for a bulletproof hackathon demo.

## Features
- **FastAPI Backend:** Handles API routing and serves the static HTML/CSS/JS frontend without CORS issues.
- **SQLite Database:** Zero-setup, file-based database.
- **Session Auth:** Cookie-based login so you don't rely on external services.
- **YOLO & XGBoost Integration:** AI models process uploaded drone images, while an XGBoost ranking algorithm assigns priority scores to zones.
- **Live Updating Dashboard:** Leaflet maps and lists poll the backend automatically.

## Quickstart

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Generate the Mock XGBoost Model (Run Once)**
   ```bash
   python ml/train_xgboost.py
   ```

3. **Start the Server**
   ```bash
   uvicorn main:app --reload
   ```

4. **Open the App**
   Navigate to [http://localhost:8000](http://localhost:8000) in your browser.
   Login with default credentials: `admin` / `admin`
