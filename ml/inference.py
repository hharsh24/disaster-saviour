import os
import random
import io
import numpy as np

try:
    import xgboost as xgb
except ImportError:
    xgb = None

from PIL import Image
from ultralytics import YOLO

VICTIM_MODEL_PATH   = os.path.join(os.path.dirname(__file__), '../models/victim_model.pt')
DISASTER_MODEL_PATH = os.path.join(os.path.dirname(__file__), '../models/disaster_model.pt')
XGBOOST_MODEL_PATH  = os.path.join(os.path.dirname(__file__), '../models/xgboost_priority.json')

victim_session = None
disaster_session = None
xgb_model = None

SEVERITY_WEIGHTS = {
    'minor_damage': 1, 'flood': 1,
    'fire': 2, 'blocked_road': 2, 'damaged_building': 2,
    'damage': 3, 'collapse': 3, 'earthquake': 3, 'landslide': 3,
}

DISASTER_CLASSES = ['fire', 'flood', 'landslide', 'damaged_building', 'collapse']

def load_models():
    global victim_session, disaster_session, xgb_model

    if xgb is not None and os.path.exists(XGBOOST_MODEL_PATH):
        try:
            xgb_model = xgb.Booster()
            xgb_model.load_model(XGBOOST_MODEL_PATH)
            print('XGBoost loaded OK')
        except Exception as e:
            print(f'XGBoost failed: {e}')

    try:
        if os.path.exists(VICTIM_MODEL_PATH):
            victim_session = YOLO(VICTIM_MODEL_PATH)
            print('Victim YOLO loaded OK')
    except Exception as e:
        print(f'Victim YOLO failed: {e}')

    try:
        if os.path.exists(DISASTER_MODEL_PATH):
            disaster_session = YOLO(DISASTER_MODEL_PATH)
            print('Disaster YOLO loaded OK')
    except Exception as e:
        print(f'Disaster YOLO failed: {e}')

def predict_priority(victim_count, severity_score):
    try:
        if xgb_model:
            X = np.array([[victim_count, severity_score]], dtype=np.float32)
            pred = xgb_model.predict(xgb.DMatrix(X))[0]
            return round(float(pred), 3)
    except Exception:
        pass
    # Fallback normalizer to keep score in [0, 1] range for frontend percentage
    norm_victim = min(victim_count, 10) / 10.0
    norm_severity = min(severity_score, 2) / 2.0
    return round(0.6 * norm_victim + 0.4 * norm_severity, 3)

def run_inference(image_bytes: bytes):
    victim_count = 0
    victim_boxes = []
    
    # Process Image
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    except Exception as e:
        print('Image parsing failed')
        return None

    if victim_session:
        try:
            results = victim_session(image, conf=0.4, verbose=False)[0]
            for box in results.boxes:
                victim_count += 1
                conf = float(box.conf[0])
                b = box.xyxy[0].tolist()
                victim_boxes.append({'xyxy': [b[0], b[1], b[2], b[3]], 'confidence': round(conf, 3)})
            
            # Basic NMS simulation (cap victims at reasonable max to avoid overlap duplicates in demo)
            victim_count = min(victim_count, 8)
            victim_boxes = victim_boxes[:victim_count]
        except Exception as e:
            print(f'Victim YOLO inference error: {e}')

    disaster_detections = []
    max_weight = 0

    if disaster_session:
        try:
            results = disaster_session(image, conf=0.3, verbose=False)[0]
            
            best_conf = 0
            best_cls = 0
            best_box = [0,0,0,0]
            
            for box in results.boxes:
                conf = float(box.conf[0])
                if conf > best_conf:
                    best_conf = conf
                    best_cls = int(box.cls[0])
                    b = box.xyxy[0].tolist()
                    best_box = [b[0], b[1], b[2], b[3]]
            
            if best_conf > 0.3:
                # Attempt to map to known names
                try:
                    cls_name = results.names[best_cls].lower()
                except:
                    cls_name = DISASTER_CLASSES[best_cls % len(DISASTER_CLASSES)]
                    
                disaster_detections.append({'class': cls_name, 'confidence': round(best_conf, 3), 'xyxy': best_box})
                max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name, 1))
        except Exception as e:
            print(f'Disaster YOLO inference error: {e}')

    if max_weight >= 3:
        severity_label, severity_score = 'severe', 2
    elif max_weight == 2:
        severity_label, severity_score = 'moderate', 1
    else:
        severity_label, severity_score = 'minor', 0

    priority_score = predict_priority(victim_count, severity_score)
    priority_score = round(min(1.0, max(0.01, priority_score)), 3)

    return {
        'victim_count':        victim_count,
        'victim_boxes':        victim_boxes,
        'disaster_detections': disaster_detections,
        'severity_label':      severity_label,
        'severity_score':      severity_score,
        'priority_score':      priority_score
    }
