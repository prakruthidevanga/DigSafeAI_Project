import pandas as pd
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import pickle
import os

# This is a separate educational ML experiment for the DigSafe AI prototype.
# It is not connected to the live Node.js risk-analysis API.
# Since we don't have real excavation accident data, we use simulation-derived data.

print("Generating simulation-derived training data...")

# Features: depth (m), radius (m), min_utility_distance (m), vibration, acousticLevel
np.random.seed(42)
num_samples = 500

depths = np.random.uniform(0.5, 10.0, num_samples)
radiuses = np.random.uniform(2.0, 20.0, num_samples)
distances = np.random.uniform(1.0, 50.0, num_samples)
vibrations = np.random.uniform(0.0, 1.0, num_samples)
acoustics = np.random.uniform(0.0, 1.0, num_samples)

# Simple rule to generate simulation-derived labels (0=LOW, 1=MEDIUM, 2=HIGH)
labels = []
for i in range(num_samples):
    risk_score = 0
    if depths[i] > 5: risk_score += 1
    if distances[i] < 5: risk_score += 2
    elif distances[i] < 15: risk_score += 1
    if vibrations[i] > 0.7: risk_score += 1
    
    if risk_score >= 3:
        labels.append(2) # HIGH
    elif risk_score >= 1:
        labels.append(1) # MEDIUM
    else:
        labels.append(0) # LOW

data = pd.DataFrame({
    'depth': depths,
    'radius': radiuses,
    'min_utility_distance': distances,
    'vibration': vibrations,
    'acousticLevel': acoustics,
    'risk_label': labels
})

X = data.drop('risk_label', axis=1)
y = data['risk_label']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("Training separate educational Decision Tree model...")
model = DecisionTreeClassifier(max_depth=3) # Keep it simple and explainable
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"Model Accuracy on Simulation-Derived Data: {acc * 100:.2f}%")

# Save model
model_path = os.path.join(os.path.dirname(__file__), 'risk_model.pkl')
with open(model_path, 'wb') as f:
    pickle.dump(model, f)

print(f"Model saved to {model_path}")
print("NOTE: This Decision Tree is not connected to the live risk-analysis API.")
print("NOTE: Training scenarios are simulation-derived. Do NOT present as real accident labels.")
