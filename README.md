# Disaster Saviour

A backend API and Web UI for prioritizing disaster response and coordinating rescue efforts using machine learning. 

## Features
- Real-time incident reporting
- ML-driven severity analysis (ONNX & XGBoost)
- Automated prioritization dashboard
- SQLite embedded database for fast deployment

## Running locally

```bash
pip install -r requirements.txt
python main.py
```

Or deploy using Docker:
```bash
docker build -t disaster-saviour .
docker run -p 8000:7860 disaster-saviour
```
