import os
import random
import io
import numpy as np
import onnxruntime as ort

try:
    import xgboost as xgb
except ImportError:
    xgb = None

from PIL import Image

VICTIM_MODEL_PATH   = os.path.join(os.path.dirname(__file__), '../models/victim_model.onnx')
DISASTER_MODEL_PATH = os.path.join(os.path.dirname(__file__), '../models/disaster_model.onnx')
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
            victim_session = ort.InferenceSession(VICTIM_MODEL_PATH)
            print('Victim ONNX loaded OK')
    except Exception as e:
        print(f'Victim ONNX failed: {e}')

    try:
        if os.path.exists(DISASTER_MODEL_PATH):
            disaster_session = ort.InferenceSession(DISASTER_MODEL_PATH)
            print('Disaster ONNX loaded OK')
    except Exception as e:
        print(f'Disaster ONNX failed: {e}')

def predict_priority(victim_count, severity_score):
    try:
        if xgb_model:
            X = np.array([[victim_count, severity_score]], dtype=np.float32)
            pred = xgb_model.predict(xgb.DMatrix(X))[0]
            return round(float(pred), 3)
    except Exception:
        pass
    return round(0.6 * victim_count + 0.4 * severity_score, 3)

def run_inference(image_bytes: bytes):
    victim_count = 0
    victim_boxes = []
    
    # Process Image for ONNX
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        image_resized = image.resize((320, 320), Image.LANCZOS)
        img_data = np.array(image_resized).astype('float32') / 255.0
        img_data = np.transpose(img_data, (2, 0, 1))
        img_data = np.expand_dims(img_data, axis=0)
    except Exception as e:
        print('Image parsing failed')
        return None

    if victim_session:
        try:
            outputs = victim_session.run(None, {victim_session.get_inputs()[0].name: img_data})[0]
            # ONNX YOLOv8 shape: (1, 5, 2100) -> [x, y, w, h, conf]
            outputs = outputs[0].transpose()
            for row in outputs:
                conf = float(row[4])
                if conf > 0.4:
                    victim_count += 1
                    # Dummy box coords for frontend since we don't need precise NMS for demo
                    victim_boxes.append({'xyxy': [float(row[0]), float(row[1]), float(row[2]), float(row[3])], 'confidence': round(conf, 3)})
            # Basic NMS simulation (cap victims at reasonable max to avoid overlap duplicates in demo)
            victim_count = min(victim_count, 8)
            victim_boxes = victim_boxes[:victim_count]
        except Exception as e:
            print(f'Victim ONNX inference error: {e}')

    disaster_detections = []
    max_weight = 0

    if disaster_session:
        try:
            outputs = disaster_session.run(None, {disaster_session.get_inputs()[0].name: img_data})[0]
            outputs = outputs[0].transpose()
            
            # Simple max confidence class selection (simplified NMS for demo)
            best_conf = 0
            best_cls = 0
            best_box = [0,0,0,0]
            
            for row in outputs:
                class_scores = row[4:]
                cls_idx = np.argmax(class_scores)
                conf = float(class_scores[cls_idx])
                if conf > best_conf and conf > 0.3:
                    best_conf = conf
                    best_cls = cls_idx
                    best_box = [float(row[0]), float(row[1]), float(row[2]), float(row[3])]
            
            if best_conf > 0.3:
                # Assuming classes map somewhat closely, picking generic names for demo
                cls_name = DISASTER_CLASSES[best_cls % len(DISASTER_CLASSES)]
                disaster_detections.append({'class': cls_name, 'confidence': round(best_conf, 3), 'xyxy': best_box})
                max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name.lower(), 1))
        except Exception as e:
            print(f'Disaster ONNX inference error: {e}')

    if max_weight >= 3:
        severity_label, severity_score = 'severe', 2
    elif max_weight == 2:
        severity_label, severity_score = 'moderate', 1
    else:
        severity_label, severity_score = 'minor', 0

    priority_score = predict_priority(victim_count, severity_score)
    priority_score = round(min(9.99, max(0.01, priority_score)), 3)

    return {
        'victim_count':        victim_count,
        'victim_boxes':        victim_boxes,
        'disaster_detections': disaster_detections,
        'severity_label':      severity_label,
        'severity_score':      severity_score,
        'priority_score':      priority_score
    }
