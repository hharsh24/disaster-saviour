from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager
import os

from database import engine, get_db
import models_db
from auth import auth_router, get_current_user, get_password_hash
from ml.inference import run_inference, load_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models after server starts — avoids OOM crash on startup"""
    print("Loading ML models...")
    load_models()
    print("ML models ready!")
    yield
    print("Shutting down...")

# Create DB tables
models_db.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Disaster Response App", lifespan=lifespan)

# Add SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key="super-secret-hackathon-key")

# Include Auth Router
app.include_router(auth_router)

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Setup templates
templates = Jinja2Templates(directory="templates")

# Ensure we have a default user for testing
def create_default_user():
    db = next(get_db())
    if not db.query(models_db.User).filter(models_db.User.username == "admin").first():
        hashed_pw = get_password_hash("admin")
        db.add(models_db.User(username="admin", hashed_password=hashed_pw))
        db.commit()
create_default_user()

@app.get("/")
def read_root(request: Request):
    """Serve the intro briefing page"""
    return templates.TemplateResponse(name="intro.html", request=request)

@app.get("/login")
def get_login(request: Request):
    """Serve the login page"""
    if request.session.get("user"):
        return RedirectResponse(url="/dashboard")
    return templates.TemplateResponse(name="login.html", request=request)

@app.get("/dashboard")
def get_dashboard(request: Request):
    """Serve the dashboard page. Redirect if not logged in."""
    if not request.session.get("user"):
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(name="dashboard.html", request=request, context={"user": request.session.get("user")})

@app.get("/upload")
def get_upload_page(request: Request):
    """Serve the upload page. Redirect if not logged in."""
    if not request.session.get("user"):
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(name="upload.html", request=request)

# --- API ENDPOINTS ---

@app.get("/health")
@app.head("/health")
def health_check():
    """Simple health check endpoint — supports HEAD for Render port detection"""
    return {"status": "ok"}

from ml.exif_utils import extract_gps_from_bytes

@app.post("/api/detect")
async def detect_zone(
    lat: float = Form(None),
    long: float = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: models_db.User = Depends(get_current_user)
):
    """
    Upload page (image + picked location) -> POST /detect 
    -> both models run -> feature vector -> XGBoost priority score 
    -> row inserted into SQLite zones table
    """
    image_bytes = await file.read() if file else b""
    
    # Extract GPS from EXIF
    exif_lat, exif_long = extract_gps_from_bytes(image_bytes)
    
    # Use EXIF if available, otherwise fallback to form data
    final_lat = exif_lat if exif_lat is not None else lat
    final_long = exif_long if exif_long is not None else long
    
    if final_lat is None or final_long is None:
        # Fallback to a deterministic random location based on the image (near Delhi)
        import random
        import hashlib
        h = hashlib.md5(image_bytes).hexdigest()
        rng = random.Random(h)
        final_lat = 28.6139 + rng.uniform(-0.1, 0.1)
        final_long = 77.2090 + rng.uniform(-0.1, 0.1)
    
    # Run ML Inference
    inference_results = run_inference(image_bytes)
    
    if inference_results is None:
        raise HTTPException(status_code=400, detail="Invalid or unreadable image file provided.")
    
    # Check if a zone already exists at this location (within ~11 meters, i.e., 0.0001 deg)
    existing_zone = db.query(models_db.Zone).filter(
        models_db.Zone.lat >= final_lat - 0.0001,
        models_db.Zone.lat <= final_lat + 0.0001,
        models_db.Zone.long >= final_long - 0.0001,
        models_db.Zone.long <= final_long + 0.0001
    ).first()
    
    if existing_zone:
        if existing_zone.status == "rescued":
            raise HTTPException(status_code=400, detail="This area has already been rescued. No new active zone created.")
        else:
            # Update existing active zone instead of creating duplicate
            existing_zone.victim_count = inference_results["victim_count"]
            existing_zone.severity_label = inference_results["severity_label"]
            existing_zone.severity_score = inference_results["severity_score"]
            existing_zone.priority_score = inference_results["priority_score"]
            db.commit()
            db.refresh(existing_zone)
            return {"message": "Active zone updated with new intel", "zone_id": existing_zone.id, "results": inference_results}

    # Create new Zone Record
    new_zone = models_db.Zone(
        lat=final_lat,
        long=final_long,
        victim_count=inference_results["victim_count"],
        severity_label=inference_results["severity_label"],
        severity_score=inference_results["severity_score"],
        priority_score=inference_results["priority_score"],
        status="pending"
    )
    
    db.add(new_zone)
    db.commit()
    db.refresh(new_zone)
    
    return {"message": "Detection processed", "zone_id": new_zone.id, "results": inference_results}

@app.get("/api/zones")
def get_zones(db: Session = Depends(get_db), current_user: models_db.User = Depends(get_current_user)):
    """dashboard page polls GET /zones every few seconds"""
    active_zones = db.query(models_db.Zone).filter(models_db.Zone.status != "rescued").order_by(models_db.Zone.priority_score.desc()).all()
    rescued_zones = db.query(models_db.Zone).filter(models_db.Zone.status == "rescued").order_by(models_db.Zone.id.desc()).all()
    
    def format_zone(z):
        return {
            "id": z.id,
            "lat": z.lat,
            "long": z.long,
            "victim_count": z.victim_count,
            "severity_label": z.severity_label,
            "severity_score": z.severity_score,
            "priority_score": z.priority_score,
            "status": z.status,
            "timestamp": z.timestamp.isoformat() if z.timestamp else None
        }

    return {
        "active_zones": [format_zone(z) for z in active_zones],
        "rescued_zones": [format_zone(z) for z in rescued_zones]
    }

@app.patch("/api/zone/{zone_id}")
def update_zone_status(zone_id: int, db: Session = Depends(get_db), current_user: models_db.User = Depends(get_current_user)):
    """Mark rescued button -> PATCH /zone/{id} -> status updated in SQLite"""
    zone = db.query(models_db.Zone).filter(models_db.Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    zone.status = "rescued"
    db.commit()
    return {"message": "Zone marked as rescued"}

@app.get("/api/active-sessions")
def get_active_sessions(db: Session = Depends(get_db), current_user: models_db.User = Depends(get_current_user)):
    """Return list of users who are currently logged in (active sessions)"""
    active_sessions = db.query(models_db.LoginSession).filter(
        models_db.LoginSession.is_active == True
    ).order_by(models_db.LoginSession.login_time.desc()).all()

    return {
        "active_sessions": [
            {
                "username": s.username,
                "login_time": s.login_time.isoformat() if s.login_time else None
            }
            for s in active_sessions
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get('PORT', 8000)), reload=True)
