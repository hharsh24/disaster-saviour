from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    long = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    
    # Model Outputs
    victim_count = Column(Integer, default=0)
    severity_label = Column(String, default="unknown")
    severity_score = Column(Integer, default=0)
    
    # Priority from XGBoost
    priority_score = Column(Float, default=0.0)
    
    # Status
    status = Column(String, default="pending")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class LoginSession(Base):
    __tablename__ = "login_sessions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    login_time = Column(DateTime, default=datetime.datetime.utcnow)
    is_active = Column(Boolean, default=True)
