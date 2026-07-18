from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import os

from database import engine, get_db
import models_db
from auth import auth_router, get_current_user, sessions, get_password_hash
from ml.inference import run_inference, load_models

# Create DB tables
models_db.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Disaster Response App")

# Include Auth Router
app.include_router(auth_router)

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Setup templates
templates = Jinja2Templates(directory="templates")

# Mock load models
load_models()

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
    """Serve the login page"""
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/dashboard")
def get_dashboard(request: Request, current_user: models_db.User = Depends(get_current_user)):
    """Serve the dashboard page, protected by session"""
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": current_user.username})

@app.get("/upload")
def get_upload_page(request: Request):
    """Serve the upload page. In a real app this might be an endpoint drones hit, 
    but we provide a UI to manually upload images for the demo."""
    return templates.TemplateResponse("upload.html", {"request": request})

# --- API ENDPOINTS ---

@app.post("/api/detect")
async def detect_zone(
    lat: float = Form(...),
    lng: float = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    """
    Upload page (image + picked location) -> POST /detect 
    -> both models run -> feature vector -> XGBoost priority score 
    -> row inserted into SQLite zones table
    """
    image_bytes = await file.read() if file else b""
    
    # Run ML Inference
    inference_results = run_inference(image_bytes)
    
    # Create Zone Record
    new_zone = models_db.Zone(
        lat=lat,
        lng=lng,
        victim_count=inference_results["victim_count"],
        disaster_type=inference_results["disaster_type"],
        priority_score=inference_results["priority_score"],
        is_done=False
    )
    
    db.add(new_zone)
    db.commit()
    db.refresh(new_zone)
    
    return {"message": "Detection processed", "zone_id": new_zone.id, "results": inference_results}

@app.get("/api/zones")
def get_zones(db: Session = Depends(get_db)):
    """dashboard page polls GET /zones every few seconds"""
    zones = db.query(models_db.Zone).filter(models_db.Zone.is_done == False).order_by(models_db.Zone.priority_score.desc()).all()
    return {"zones": [
        {
            "id": z.id,
            "lat": z.lat,
            "lng": z.lng,
            "victim_count": z.victim_count,
            "disaster_type": z.disaster_type,
            "priority_score": z.priority_score,
            "is_done": z.is_done
        } for z in zones
    ]}

@app.patch("/api/zone/{zone_id}")
def update_zone_status(zone_id: int, db: Session = Depends(get_db)):
    """Mark done button -> PATCH /zone/{id} -> status updated in SQLite"""
    zone = db.query(models_db.Zone).filter(models_db.Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    zone.is_done = True
    db.commit()
    return {"message": "Zone marked as done"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
