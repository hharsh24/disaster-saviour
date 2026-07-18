import os
import random
import numpy as np
import xgboost as xgb

def train_xgboost_model():
    """
    Generate synthetic training rows with features victim_count and severity_score, 
    target priority = 0.6*victim_count + 0.4*severity_score + noise.
    Train an XGBoost regressor and save it.
    """
    print("Generating synthetic data...")
    num_samples = 1000
    
    # Generate features: victim_count (0-10) and severity_score (0, 1, 2)
    X = np.zeros((num_samples, 2))
    y = np.zeros(num_samples)
    
    for i in range(num_samples):
        victim_count = random.randint(0, 10)
        severity_score = random.randint(0, 2)
        
        noise = random.uniform(-0.1, 0.1)
        priority = (0.6 * victim_count) + (0.4 * severity_score) + noise
        
        X[i, 0] = victim_count
        X[i, 1] = severity_score
        y[i] = priority

    print("Training XGBoost Regressor (Native API)...")
    dtrain = xgb.DMatrix(X, label=y)
    params = {
        'max_depth': 3,
        'eta': 0.1,
        'objective': 'reg:squarederror'
    }
    model = xgb.train(params, dtrain, num_boost_round=100)
    
    model_path = os.path.join(os.path.dirname(__file__), "../models/xgboost_priority.json")
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    
    model.save_model(model_path)
    print(f"XGBoost model trained and saved to {model_path}")

if __name__ == "__main__":
    train_xgboost_model()

