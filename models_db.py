from sqlalchemy import Column, Integer, String, Float, Boolean
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    
    # Model Outputs
    victim_count = Column(Integer, default=0)
    disaster_type = Column(String, default="unknown")
    
    # Priority from XGBoost
    priority_score = Column(Float, default=0.0)
    
    # Status
    is_done = Column(Boolean, default=False)
