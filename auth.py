from passlib.context import CryptContext
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from database import get_db
import models_db
from pydantic import BaseModel
import secrets

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class LoginRequest(BaseModel):
    username: str
    password: str

auth_router = APIRouter()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_current_user(request: Request, db: Session = Depends(get_db)):
    username = request.session.get("user")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    user = db.query(models_db.User).filter(models_db.User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@auth_router.post("/api/login")
def login(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    import datetime
    user = db.query(models_db.User).filter(models_db.User.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    request.session["user"] = user.username

    # Record login session in DB
    session_entry = models_db.LoginSession(
        username=user.username,
        login_time=datetime.datetime.utcnow(),
        is_active=True
    )
    db.add(session_entry)
    db.commit()
    db.refresh(session_entry)
    # Store session DB id so logout can deactivate it
    request.session["session_db_id"] = session_entry.id

    return {"message": "Login successful"}

@auth_router.post("/api/signup")
def signup(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models_db.User).filter(models_db.User.username == login_data.username).first()
    if user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed_pw = get_password_hash(login_data.password)
    new_user = models_db.User(username=login_data.username, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    return {"message": "User created successfully. You can now login."}

@auth_router.post("/api/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    session_db_id = request.session.get("session_db_id")
    if session_db_id:
        # Mark this session as inactive in DB
        session_entry = db.query(models_db.LoginSession).filter(
            models_db.LoginSession.id == session_db_id
        ).first()
        if session_entry:
            session_entry.is_active = False
            db.commit()
    request.session.clear()
    return {"message": "Logged out"}

