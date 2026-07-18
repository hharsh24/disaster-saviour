import random
import os

# Mock paths - in a real scenario you would load these once when the app starts
VICTIM_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/victim_model.pt")
DISASTER_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/disaster_model.pt")
XGBOOST_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/xgboost_priority.json")

def load_models():
    """Mock function to simulate loading PyTorch and XGBoost models"""
    print(f"Loading victim model from {VICTIM_MODEL_PATH}")
    print(f"Loading disaster model from {DISASTER_MODEL_PATH}")
    print(f"Loading XGBoost priority model from {XGBOOST_MODEL_PATH}")
    # In reality: model = torch.load(...), xgb = xgboost.Booster(...)
    pass

def run_inference(image_bytes: bytes):
    """
    Simulates running inference on the two computer vision models,
    extracting a feature vector, and running XGBoost for priority.
    """
    # 1. Run model 1 (Victim Detection)
    # Simulated prediction: 0 to 5 victims found
    victim_count = random.randint(0, 5)
    
    # 2. Run model 2 (Disaster Classification)
    disasters = ["flood", "fire", "collapse", "earthquake"]
    disaster_type = random.choice(disasters)
    
    # 3. Create Feature Vector
    # In reality this might be concated embeddings or specific metrics
    # Here we mock it based on the predictions
    severity_map = {"fire": 0.9, "collapse": 0.8, "flood": 0.6, "earthquake": 0.7}
    disaster_severity = severity_map.get(disaster_type, 0.5)
    
    feature_vector = [victim_count, disaster_severity]
    
    # 4. Run XGBoost Priority Scoring
    # Simulated XGBoost model logic: More victims + higher severity = higher priority (0.0 to 1.0)
    base_score = (victim_count * 0.15) + (disaster_severity * 0.4)
    # Add some noise to simulate model variance
    priority_score = min(0.99, max(0.01, base_score + random.uniform(-0.1, 0.1)))
    
    return {
        "victim_count": victim_count,
        "disaster_type": disaster_type,
        "priority_score": round(priority_score, 3),
        "feature_vector": feature_vector
    }
