from passlib.context import CryptContext
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from database import get_db
import models_db
from pydantic import BaseModel
import secrets

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Extremely simple in-memory session store for hackathon purposes
# In a real app, use a Redis store or a signed JWT cookie.
sessions = {}

class LoginRequest(BaseModel):
    username: str
    password: str

auth_router = APIRouter()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_current_user(request: Request, db: Session = Depends(get_db)):
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    username = sessions[session_id]
    user = db.query(models_db.User).filter(models_db.User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@auth_router.post("/api/login")
def login(login_data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(models_db.User).filter(models_db.User.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    session_id = secrets.token_hex(16)
    sessions[session_id] = user.username
    
    # Set HTTP-only cookie
    response.set_cookie(key="session_id", value=session_id, httponly=True, samesite="lax")
    return {"message": "Login successful"}

@auth_router.post("/api/logout")
def logout(request: Request, response: Response):
    session_id = request.cookies.get("session_id")
    if session_id in sessions:
        del sessions[session_id]
    response.delete_cookie("session_id")
    return {"message": "Logged out"}
