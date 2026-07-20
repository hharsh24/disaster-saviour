import os
import random
import io
import hashlib
import numpy as np

# Force CPU only
os.environ["CUDA_VISIBLE_DEVICES"] = ""

# Check if we should skip heavy YOLO models (set SKIP_YOLO=true on Render)
SKIP_YOLO = os.environ.get("SKIP_YOLO", "false").lower() == "true"

try:
    import torch
    torch.set_num_threads(1)
    original_load = torch.load
    def safe_load(*args, **kwargs):
        kwargs['weights_only'] = False
        return original_load(*args, **kwargs)
    torch.load = safe_load
    from ultralytics import YOLO
except Exception:
    YOLO = None

try:
    import xgboost as xgb
except ImportError:
    xgb = None

from PIL import Image

VICTIM_MODEL_PATH   = os.path.join(os.path.dirname(__file__), "../models/victim_model.pt")
DISASTER_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/disaster_model.pt")
XGBOOST_MODEL_PATH  = os.path.join(os.path.dirname(__file__), "../models/xgboost_priority.json")

victim_model   = None
disaster_model = None
xgb_model      = None

SEVERITY_WEIGHTS = {
    "minor_damage": 1, "flood": 1,
    "fire": 2, "blocked_road": 2, "damaged_building": 2,
    "damage": 3, "collapse": 3, "earthquake": 3, "landslide": 3,
}

DISASTER_CLASSES = ["fire", "flood", "landslide", "damaged_building", "collapse"]


def load_models():
    """Load XGBoost always. Load YOLO only if SKIP_YOLO is not set."""
    global victim_model, disaster_model, xgb_model

    # Always load XGBoost (lightweight ~0.1MB)
    if xgb is not None and os.path.exists(XGBOOST_MODEL_PATH):
        try:
            xgb_model = xgb.Booster()
            xgb_model.load_model(XGBOOST_MODEL_PATH)
            print("XGBoost loaded OK")
        except Exception as e:
            print(f"XGBoost failed: {e}")

    # Load YOLO only if not skipped (skip on free tier to avoid OOM)
    if SKIP_YOLO:
        print("SKIP_YOLO=true — using smart mock for YOLO (XGBoost still real)")
        return

    if YOLO is not None:
        if os.path.exists(VICTIM_MODEL_PATH):
            try:
                victim_model = YOLO(VICTIM_MODEL_PATH)
                victim_model.to("cpu")
                print("Victim YOLO loaded OK")
            except Exception as e:
                print(f"Victim YOLO failed: {e}")

        if os.path.exists(DISASTER_MODEL_PATH):
            try:
                disaster_model = YOLO(DISASTER_MODEL_PATH)
                disaster_model.to("cpu")
                print("Disaster YOLO loaded OK")
            except Exception as e:
                print(f"Disaster YOLO failed: {e}")


def _smart_mock(image_bytes: bytes):
    """
    Deterministic mock inference based on image content.
    Same image → always same result. Realistic for demo.
    """
    h = hashlib.md5(image_bytes).hexdigest()
    rng = random.Random(int(h, 16))
    victim_count = rng.randint(1, 9)
    disaster_cls = rng.choice(DISASTER_CLASSES)
    confidence   = round(rng.uniform(0.72, 0.97), 2)
    return victim_count, disaster_cls, confidence


def predict_priority(victim_count, severity_score):
    """XGBoost prediction (real ML). Falls back to formula if model missing."""
    try:
        if xgb_model:
            X = np.array([[victim_count, severity_score]], dtype=np.float32)
            pred = xgb_model.predict(xgb.DMatrix(X))[0]
            return round(float(pred), 3)
    except Exception as e:
        print(f"XGBoost predict error: {e}")
    return round(0.6 * victim_count + 0.4 * severity_score, 3)


def run_inference(image_bytes: bytes):
    """
    Full pipeline: YOLO (or smart mock) → XGBoost priority score.
    XGBoost always runs as real ML.
    YOLO runs if loaded, otherwise smart mock gives realistic results.
    """
    # --- Victim Detection ---
    victim_count = 0
    victim_boxes = []

    if victim_model and image_bytes:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            image = image.resize((320, 320), Image.LANCZOS)
            import torch
            with torch.no_grad():
                results = victim_model(image, conf=0.4, verbose=False, device="cpu")
            for r in results:
                for box in r.boxes:
                    victim_count += 1
                    victim_boxes.append({
                        "xyxy": box.xyxy[0].tolist(),
                        "confidence": round(float(box.conf[0]), 3)
                    })
        except Exception as e:
            print(f"Victim YOLO inference error: {e}")
            victim_count = 0
    else:
        print("Warning: victim_model not loaded, returning 0 victims.")
        victim_count = 0

    # --- Disaster Detection ---
    disaster_detections = []
    max_weight = 0

    if disaster_model and image_bytes:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            image = image.resize((320, 320), Image.LANCZOS)
            import torch
            with torch.no_grad():
                results = disaster_model(image, verbose=False, device="cpu")
            for r in results:
                if r.probs is not None:
                    cls_name = r.names[r.probs.top1]
                    conf = round(float(r.probs.top1conf), 3)
                    disaster_detections.append({"class": cls_name, "confidence": conf, "xyxy": []})
                    max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name.lower(), 1))
                else:
                    for box in r.boxes:
                        cls_name = r.names[int(box.cls[0])]
                        conf = round(float(box.conf[0]), 3)
                        disaster_detections.append({"class": cls_name, "confidence": conf, "xyxy": box.xyxy[0].tolist()})
                        max_weight = max(max_weight, SEVERITY_WEIGHTS.get(cls_name.lower(), 1))
        except Exception as e:
            print(f"Disaster YOLO inference error: {e}")
    else:
        print("Warning: disaster_model not loaded, returning no disaster detections.")

    # Severity mapping
    if max_weight >= 3:
        severity_label, severity_score = "severe", 2
    elif max_weight == 2:
        severity_label, severity_score = "moderate", 1
    else:
        severity_label, severity_score = "minor", 0

    # --- XGBoost Priority (always real ML) ---
    priority_score = predict_priority(victim_count, severity_score)
    priority_score = round(min(9.99, max(0.01, priority_score)), 3)

    return {
        "victim_count":        victim_count,
        "victim_boxes":        victim_boxes,
        "disaster_detections": disaster_detections,
        "severity_label":      severity_label,
        "severity_score":      severity_score,
        "priority_score":      priority_score
    }
