from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# We use an SQLite database file stored in the same directory
SQLALCHEMY_DATABASE_URL = "sqlite:///./disaster_app.db"

# Setting check_same_thread=False is needed for SQLite in FastAPI when sharing the connection across threads
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
