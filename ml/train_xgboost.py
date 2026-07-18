import json
import os
import random

def train_mock_xgboost():
    """
    This script is meant to be run once offline to train the model.
    Since we are mocking the implementation for now, this just generates a dummy model file.
    In a real scenario, this would use xgboost.train() and save the booster.
    """
    model_path = os.path.join(os.path.dirname(__file__), "../models/xgboost_priority.json")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    
    dummy_model_data = {
        "model_type": "xgboost",
        "version": "1.0",
        "features": ["victim_count", "disaster_severity"],
        "trained_on": "synthetic_labels"
    }
    
    with open(model_path, "w") as f:
        json.dump(dummy_model_data, f, indent=4)
        
    print(f"Mock XGBoost model trained and saved to {model_path}")
    
    # Also create dummy .pt files
    for m in ["victim_model.pt", "disaster_model.pt"]:
        pt_path = os.path.join(os.path.dirname(__file__), f"../models/{m}")
        with open(pt_path, "w") as f:
            f.write("MOCK_PYTORCH_WEIGHTS")
        print(f"Mock PyTorch model saved to {pt_path}")

if __name__ == "__main__":
    train_mock_xgboost()
