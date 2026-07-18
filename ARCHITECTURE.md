# PS11 — Drone-Based Disaster Mapping & Victim Detection
## Architecture + Antigravity Prompt Plan (v2 — SQLite + plain HTML/CSS)

Drop this file into your project root as `ARCHITECTURE.md` — Antigravity works best when
there's a spec file in the repo it can reference across sessions.

---

## 1. Locked-in architecture

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI — **also serves the frontend** | One server, one `uvicorn` command for the whole demo |
| Database | SQLite + SQLAlchemy | Zero setup, one file, no internet dependency during judging |
| Auth | Session-cookie login (FastAPI + passlib) | No external service, works fully offline |
| Frontend | Plain HTML/CSS/JS + Leaflet.js via CDN | No build step — open browser, done. Easy to debug live on stage |
| "Live" updates | JS `setInterval` polling every few seconds | No websocket complexity, good enough to *look* live |
| Ranking | XGBoost, trained offline on synthetic labels | Unchanged |
| Models | Your two trained models | Unchanged |

**Why single-server matters for a hackathon:** dropping Firebase/React means you're no longer
juggling two servers + a cloud service + API keys. Judges see `pip install -r requirements.txt`
→ `uvicorn main:app --reload` → open `localhost:8000` → everything works, no wifi needed.

**Data flow:** Upload page (image + picked location) → `POST /detect` → both models run →
feature vector → XGBoost priority score → row inserted into SQLite `zones` table → dashboard
page polls `GET /zones` every few seconds → map + list re-render → "Mark done" button →
`PATCH /zone/{id}` → status updated in SQLite → next poll reflects it.

## 2. Folder structure

```
disaster-response-app/
├── ARCHITECTURE.md
├── requirements.txt
├── main.py                  ← FastAPI app: API routes + serves static frontend
├── database.py               ← SQLAlchemy engine + session
├── models_db.py               ← SQLAlchemy ORM models: Zone, User
├── auth.py                     ← login + session cookie logic
├── ml/
│   ├── inference.py            ← loads trained models, runs prediction
│   └── train_xgboost.py        ← offline training script, run once
├── models/
│   ├── victim_model.pt
│   ├── disaster_model.pt
│   └── xgboost_priority.json
├── sample_data/                ← test images since no real drone
├── static/
│   ├── style.css
│   ├── login.js
│   ├── dashboard.js
│   └── upload.js
└── templates/
    ├── login.html
    ├── dashboard.html
    └── upload.html
```

## 3. Prompt plan — paste into Antigravity one at a time

Do them in order, check each before moving on. Use review/step-approval mode for **Prompt 6
(auth)** specifically — let the rest run autonomous.

---

**Prompt 1 — Scaffold**
> Create a FastAPI project with this exact structure: `main.py`, `database.py`, `models_db.py`,
> `auth.py`, `ml/inference.py`, `ml/train_xgboost.py`, `models/` (empty, for weight files),
> `sample_data/` (empty), `static/` (style.css, login.js, dashboard.js, upload.js — empty
> placeholders), `templates/` (login.html, dashboard.html, upload.html — empty placeholders).
> Create `requirements.txt` with fastapi, uvicorn, python-multipart, sqlalchemy, xgboost,
> ultralytics, passlib[bcrypt], itsdangerous, jinja2.

**Prompt 2 — Database models**
> In `database.py`, set up a SQLAlchemy engine pointing at `sqlite:///./disaster_app.db`, with
> `SessionLocal` and `Base`. In `models_db.py`, define a `Zone` model (id, lat, long,
> victim_count, severity_label, severity_score, priority_score, status default "pending",
> timestamp default now) and a `User` model (id, username unique, hashed_password). Add a
> function to create all tables, called on FastAPI startup in `main.py`.

**Prompt 3 — Backend skeleton + static serving**
> In `main.py`, set up the FastAPI app to serve `templates/*.html` as routes (`GET /` →
> login.html, `GET /dashboard` → dashboard.html, `GET /upload` → upload.html) and mount
> `static/` as a static files directory. Add a `GET /health` endpoint returning
> `{"status": "ok"}`. Confirm it runs with `uvicorn main:app --reload`.

**Prompt 4 — Model inference (YOLO / Ultralytics)**
> In `ml/inference.py`, use the `ultralytics` package to load both models with
> `YOLO("models/victim_model.pt")` and `YOLO("models/disaster_model.pt")`, loaded once at
> FastAPI startup and stored in app state (not per-request). Write `run_inference(image_path)`
> that:
> 1. Runs the victim model at a 0.4 confidence threshold, returns `victim_count` (number of
>    detections) and `victim_boxes` (list of `{xyxy, confidence}`).
> 2. Runs the disaster model, and for each detected box looks up a weight from a
>    `SEVERITY_WEIGHTS` dict — `{"flood": 1, "blocked_road": 2, "damage": 3}` (placeholder —
>    replace keys with my actual trained class names, printable via `model.names`). Takes the
>    highest weight found across all detections and maps it to `severity_label`
>    ("minor"/"moderate"/"severe") and a numeric `severity_score` (0/1/2) for the ranking model.
>    Also returns the raw `disaster_detections` list (`class`, `confidence`, `xyxy`) for the
>    dashboard to display.
> Return all fields as one dict from `run_inference`.

**Prompt 5 — XGBoost ranking**
> In `ml/train_xgboost.py`, generate synthetic training rows with features `victim_count` and
> `severity_score` (encode severity_label as 0/1/2), target `priority = 0.6*victim_count +
> 0.4*severity_score` plus small noise. Train an XGBoost regressor and save it to
> `models/xgboost_priority.json`. Add `predict_priority(victim_count, severity_score)` in
> `inference.py` that loads this model and returns a score.

**Prompt 6 — Detect endpoint + database write + auth** *(use review/step-approval mode)*
> Add `POST /detect` to `main.py`: accepts an image upload plus `lat`/`long` form fields, calls
> `run_inference` then `predict_priority`, inserts a new `Zone` row via SQLAlchemy with
> status="pending", and returns the result as JSON. Add `PATCH /zone/{id}` to update just the
> `status` field. Then in `auth.py`, add password hashing with passlib, a `POST /login` that
> checks username/password against the `User` table and sets a signed session cookie (use
> starlette's `SessionMiddleware`), and a dependency that protects `/detect`, `/zone/{id}`, and
> a new `GET /zones` (returns all zones as JSON) endpoint — redirect to `/` if not logged in.
> Add a small script to create one initial user in the database.

**Prompt 7 — Login page**
> Build `templates/login.html` with a simple username/password form and `static/login.js` that
> POSTs to `/login` via fetch and redirects to `/dashboard` on success, showing an error message
> on failure.

**Prompt 8 — Dashboard: map + task list**
> Build `templates/dashboard.html` with a Leaflet map (load Leaflet via CDN `<script>`/`<link>`
> tags, no npm needed) and a side panel list. In `static/dashboard.js`, fetch `GET /zones` on
> load and every 4 seconds after (`setInterval`), then: render a marker per zone colored by
> `priority_score` (red=high, yellow=medium, green=low), and render the list sorted by
> `priority_score` descending, excluding `status: "rescued"` zones. Each list row has a "Mark as
> rescued" button that calls `PATCH /zone/{id}` and removes the row on success.

**Prompt 9 — Upload page**
> Build `templates/upload.html` with a file input and a small Leaflet map where clicking sets
> `lat`/`long` hidden fields. In `static/upload.js`, on submit, POST the image + lat/long as
> multipart form data to `/detect`, show a loading state, then display the returned victim count,
> severity, and priority score.

**Prompt 10 — Polish**
> Add basic error handling (failed uploads, empty model results, not-logged-in redirects) across
> `main.py` and the JS files, plus a `README.md` explaining `pip install -r requirements.txt`,
> creating the initial user, and running `uvicorn main:app --reload`.

---

### Note on test data
Keep 5–10 sample images (FloodNet/xBD, or your own photos from height) in `sample_data/` and use
those on the upload page to demo `/detect` without a real drone.
