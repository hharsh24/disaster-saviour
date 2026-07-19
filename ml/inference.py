import os
import torch

original_load = torch.load
def safe_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = safe_load

import random
import io
import numpy as np
from PIL import Image

try:
    from ultralytics import YOLO
except ImportError:
    print("Warning: ultralytics not installed.")
    YOLO = None

try:
    import xgboost as xgb
except ImportError:
    print("Warning: xgboost not installed.")
    xgb = None

VICTIM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/victim_model.pt")
DISASTER_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/disaster_model.pt")
XGBOOST_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/xgboost_priority.json")

victim_model = None
disaster_model = None
xgb_model = None

SEVERITY_WEIGHTS = {
    "minor_damage": 1,
    "flood": 1,
    "fire": 2,
    "blocked_road": 2,
    "damage": 3,
    "collapse": 3,
    "earthquake": 3
}

def load_models():
    """Load the trained YOLO and XGBoost models on server startup."""
    global victim_model, disaster_model, xgb_model
    
    if YOLO is not None:
        if os.path.exists(VICTIM_MODEL_PATH):
            try: victim_model = YOLO(VICTIM_MODEL_PATH)
            except Exception as e: print(f"Failed victim model: {e}")
        
        if os.path.exists(DISASTER_MODEL_PATH):
            try: disaster_model = YOLO(DISASTER_MODEL_PATH)
            except Exception as e: print(f"Failed disaster model: {e}")

    if xgb is not None and os.path.exists(XGBOOST_MODEL_PATH):
        try:
            xgb_model = xgb.Booster()
            xgb_model.load_model(XGBOOST_MODEL_PATH)
        except Exception as e:
            print(f"Failed to load XGBoost model: {e}")

def predict_priority(victim_count, severity_score):
    if xgb_model:
        X = np.array([[victim_count, severity_score]])
        dtest = xgb.DMatrix(X)
        pred = xgb_model.predict(dtest)[0]
        return float(pred)
    else:
        # Fallback if model not loaded
        noise = random.uniform(-0.1, 0.1)
        return float((0.6 * victim_count) + (0.4 * severity_score) + noise)

def run_inference(image_bytes: bytes):
    import hashlib
    # Make mock logic deterministic for the same image
    h = hashlib.md5(image_bytes).hexdigest()
    random.seed(int(h, 16))
    
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {
            "victim_count": 0,
            "victim_boxes": [],
            "disaster_detections": [],
            "severity_label": "unknown",
            "severity_score": 0,
            "priority_score": 0.0
        }
    
    # 1. Victim Model (Threshold 0.4)
    victim_count = 0
    victim_boxes = []
    if victim_model:
        results_v = victim_model(image, conf=0.4, verbose=False)
        for r in results_v:
            for box in r.boxes:
                victim_count += 1
                victim_boxes.append({
                    "xyxy": box.xyxy[0].tolist(),
                    "confidence": float(box.conf[0])
                })
    else:
        victim_count = random.randint(0, 5)

    # 2. Disaster Model
    disaster_detections = []
    max_weight = 0
    
    if disaster_model:
        results_d = disaster_model(image, verbose=False)
        for r in results_d:
            if r.probs is not None:
                # Classification model
                top1_idx = r.probs.top1
                cls_name = r.names[top1_idx]
                conf = float(r.probs.top1conf)
                disaster_detections.append({"class": cls_name, "confidence": conf, "xyxy": []})
                max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name.lower(), 1))
            else:
                # Object detection model
                for box in r.boxes:
                    cls_name = r.names[int(box.cls[0])]
                    conf = float(box.conf[0])
                    disaster_detections.append({
                        "class": cls_name, 
                        "confidence": conf, 
                        "xyxy": box.xyxy[0].tolist()
                    })
                    max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name.lower(), 1))
    else:
        mock_cls = random.choice(["flood", "fire", "collapse", "earthquake"])
        disaster_detections.append({"class": mock_cls, "confidence": 0.9, "xyxy": []})
        max_weight = SEVERITY_WEIGHTS.get(mock_cls, 1)

    # Map max_weight to severity_label and severity_score
    if max_weight >= 3:
        severity_label = "severe"
        severity_score = 2
    elif max_weight == 2:
        severity_label = "moderate"
        severity_score = 1
    elif max_weight == 1:
        severity_label = "minor"
        severity_score = 0
    else:
        severity_label = "unknown"
        severity_score = 0
        
    if not disaster_model and not victim_model:
        severity_score = random.randint(0, 2)

    # 3. XGBoost Priority Scoring
    priority_score = predict_priority(victim_count, severity_score)
    priority_score = min(0.99, max(0.01, priority_score))
    
    return {
        "victim_count": victim_count,
        "victim_boxes": victim_boxes,
        "disaster_detections": disaster_detections,
        "severity_label": severity_label,
        "severity_score": severity_score,
        "priority_score": round(priority_score, 3)
    }
