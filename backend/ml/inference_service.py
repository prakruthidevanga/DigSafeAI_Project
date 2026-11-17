import json
import math
import sys
from pathlib import Path


MODEL_DIR = Path(__file__).resolve().parent / "models"
EXPECTED_FEATURES = [
    "utility_start_lon",
    "utility_start_lat",
    "utility_length_approx_m",
    "utility_coord_count",
    "excavation_longitude",
    "excavation_latitude",
    "distance_to_utility_m",
    "excavation_depth_m",
    "vibration",
    "soil_moisture",
    "soil_temperature_c",
    "gas_reading",
    "ground_movement_mm",
]

SUPPORTED_SENSOR_FIELDS = {
    "vibration",
    "acousticLevel",
    "soilCondition",
    "soilMoisture",
    "soilTemperature",
    "gasReading",
    "groundMovement",
    "ground_movement_mm",
    "source",
    "dataSource",
}

MODEL_LIMITATION = (
    "These models use synthetic, rule-based training labels and simulated sensor data. "
    "Their predictions are not validated real-world safety assessments. "
    "Do not rely on these outputs for actual excavation decisions; consult official "
    "utility records and qualified personnel before any excavation work."
)


def parse_finite_number(value, field_name):
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a finite number.")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a finite number.") from None
    if not math.isfinite(parsed):
        raise ValueError(f"{field_name} must be a finite number.")
    return parsed


def validate_request(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    if not isinstance(payload.get("location"), str) or len(payload["location"].strip()) < 2:
        raise ValueError("A location name is required.")

    latitude = parse_finite_number(payload.get("latitude"), "Latitude")
    longitude = parse_finite_number(payload.get("longitude"), "Longitude")
    depth = parse_finite_number(payload.get("depth"), "Excavation depth")
    radius = parse_finite_number(payload.get("radius"), "Radius")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Latitude and longitude must be valid geographic coordinates.")
    if depth <= 0:
        raise ValueError("Excavation depth must be greater than 0 meters.")
    if radius <= 0 or radius > 50000:
        raise ValueError("Radius must be greater than 0 and no more than 50000 meters.")
    if payload.get("utilityDataStatus") != "MATCHES_FOUND":
        raise ValueError("Confirmed mapped utility matches are required for prediction.")

    utilities = payload.get("utilities")
    if not isinstance(utilities, list) or not utilities:
        raise ValueError("At least one matched utility record is required.")
    distances = []
    nearest_utility = None
    min_dist = float("inf")

    for utility in utilities:
        if not isinstance(utility, dict):
            raise ValueError("Each utility record must be an object.")
        if not isinstance(utility.get("utilityType"), str) or not utility["utilityType"].strip():
            raise ValueError("Each utility record must include a utility type.")
        distance = parse_finite_number(utility.get("distance"), "Utility distance")
        if distance < 0:
            raise ValueError("Utility distance must be non-negative.")
        distances.append(distance)
        if distance < min_dist:
            min_dist = distance
            nearest_utility = utility

    sensors_dict = {}
    sensors = payload.get("sensors")
    if sensors is not None:
        if not isinstance(sensors, dict):
            raise ValueError("Sensor readings must be provided as an object.")
        for field, value in sensors.items():
            if field not in SUPPORTED_SENSOR_FIELDS:
                raise ValueError(f"Unsupported sensor field: {field}.")
            if field in ("source", "dataSource"):
                if not isinstance(value, str):
                    raise ValueError(f"Sensor {field} must be a string.")
            else:
                reading = parse_finite_number(value, f"Sensor {field}")
                # Some sensors (like temperature or moisture) can be scaled, but normalized 0-1 or standard ranges
                if field in ("vibration", "acousticLevel", "soilCondition"):
                    if reading < 0 or reading > 1:
                        raise ValueError(f"Sensor {field} must be between 0 and 1.")
                sensors_dict[field] = reading

    # Extract nearest utility metadata if available
    nearest_u_lon = longitude
    nearest_u_lat = latitude
    nearest_u_len = 50.0
    nearest_u_coords = 2

    if nearest_utility:
        # Check geometry or explicit properties
        geom = nearest_utility.get("geometry")
        if isinstance(geom, dict):
            coords = geom.get("coordinates")
            if isinstance(coords, list) and len(coords) > 0:
                first = coords[0] if not isinstance(coords[0][0], list) else coords[0][0]
                if len(first) >= 2:
                    nearest_u_lon = float(first[0])
                    nearest_u_lat = float(first[1])
                nearest_u_coords = len(coords)
        elif nearest_utility.get("longitude") is not None and nearest_utility.get("latitude") is not None:
            nearest_u_lon = float(nearest_utility["longitude"])
            nearest_u_lat = float(nearest_utility["latitude"])

        if nearest_utility.get("length") is not None:
            try:
                nearest_u_len = float(nearest_utility["length"])
            except (ValueError, TypeError):
                pass

    return {
        "latitude": latitude,
        "longitude": longitude,
        "depth": depth,
        "nearest_utility_distance": min(distances),
        "nearest_utility_lon": nearest_u_lon,
        "nearest_utility_lat": nearest_u_lat,
        "nearest_utility_len": nearest_u_len,
        "nearest_utility_coords": nearest_u_coords,
        "sensors": sensors_dict,
    }


def _load_single_artifact(path, name):
    """Load a single joblib artifact. Returns (object, None) on success or (None, error_str) on failure."""
    import joblib
    try:
        obj = joblib.load(path)
        return obj, None
    except Exception as exc:
        return None, f"{name}: {type(exc).__name__}: {exc}"


def load_models(model_dir=MODEL_DIR):
    """
    Load all model artifacts independently. Each model is loaded in its own
    try/except so a corrupted model does not prevent others from being used.

    Returns a dict with keys:
      random_forest    – loaded model or None
      xgboost          – loaded model or None
      lightgbm         – loaded model or None
      feature_columns  – list of 9 feature names for RF/XGBoost
      lgbm_features    – list of 13 feature names for LightGBM
      label_encoder    – label encoder for RF/XGBoost
      load_errors      – dict of {model_name: error_string} for any failed loads
    """
    artifact_paths = {
        "random_forest": model_dir / "random_forest.joblib",
        "xgboost": model_dir / "xgboost.joblib",
        "lightgbm": model_dir / "lightgbm.joblib",
        "feature_columns": model_dir / "feature_columns.joblib",
        "label_encoder": model_dir / "risk_label_encoder.joblib",
    }

    # feature_columns and label_encoder are required
    for required in ("feature_columns", "label_encoder"):
        if not artifact_paths[required].is_file():
            raise FileNotFoundError(
                f"Required artifact is missing: {artifact_paths[required]}"
            )

    feature_columns_obj, fc_err = _load_single_artifact(
        artifact_paths["feature_columns"], "feature_columns"
    )
    if fc_err:
        raise ValueError(f"Cannot load feature_columns.joblib: {fc_err}")

    feature_columns = list(feature_columns_obj)
    if any(not isinstance(name, str) or not name for name in feature_columns):
        raise ValueError("The saved feature list contains an invalid feature name.")
    if len(set(feature_columns)) != len(feature_columns):
        raise ValueError("The saved feature list contains duplicate names.")

    label_encoder_obj, le_err = _load_single_artifact(
        artifact_paths["label_encoder"], "label_encoder"
    )
    if le_err:
        raise ValueError(f"Cannot load risk_label_encoder.joblib: {le_err}")
    if not hasattr(label_encoder_obj, "classes_"):
        raise ValueError("The saved risk label encoder does not expose classes_.")

    load_errors = {}
    loaded_models = {}

    for model_name in ("random_forest", "xgboost", "lightgbm"):
        artifact_path = artifact_paths[model_name]
        if not artifact_path.is_file():
            load_errors[model_name] = f"Artifact not found: {artifact_path}"
            loaded_models[model_name] = None
            continue

        model, err = _load_single_artifact(artifact_path, model_name)
        if err:
            load_errors[model_name] = err
            loaded_models[model_name] = None
            continue

        if not callable(getattr(model, "predict", None)) or not callable(
            getattr(model, "predict_proba", None)
        ):
            load_errors[model_name] = f"{model_name}: model must support predict and predict_proba."
            loaded_models[model_name] = None
            continue
        if not hasattr(model, "classes_"):
            load_errors[model_name] = f"{model_name}: model does not expose classes_."
            loaded_models[model_name] = None
            continue

        loaded_models[model_name] = model

    available_count = sum(1 for m in loaded_models.values() if m is not None)
    if available_count == 0:
        error_details = "; ".join(load_errors.values()) if load_errors else "Unknown error."
        raise ValueError(
            f"No trained risk model could be loaded. Errors: {error_details}"
        )

    return {
        "random_forest": loaded_models["random_forest"],
        "xgboost": loaded_models["xgboost"],
        "lightgbm": loaded_models["lightgbm"],
        "feature_columns": feature_columns,
        "label_encoder": label_encoder_obj,
        "load_errors": load_errors,
    }


def build_feature_frame(feature_columns, request_values):
    """
    Builds the standardized 13-feature frame for all three models:
    Random Forest, XGBoost, and LightGBM.
    
    Features in canonical order:
      1. utility_start_lon
      2. utility_start_lat
      3. utility_length_approx_m
      4. utility_coord_count
      5. excavation_longitude
      6. excavation_latitude
      7. distance_to_utility_m
      8. excavation_depth_m
      9. vibration
      10. soil_moisture
      11. soil_temperature_c
      12. gas_reading
      13. ground_movement_mm
    """
    import numpy as np
    import pandas as pd

    sensors = request_values.get("sensors") or {}

    # Extract sensor values or flag as missing
    vibration = sensors.get("vibration")
    soil_moisture = sensors.get("soilMoisture") if "soilMoisture" in sensors else sensors.get("soilCondition")
    soil_temp = sensors.get("soilTemperature")
    gas_reading = sensors.get("gasReading")
    ground_movement = sensors.get("groundMovement") if "groundMovement" in sensors else sensors.get("ground_movement_mm")

    feature_values = {
        "utility_start_lon": request_values.get("nearest_utility_lon"),
        "utility_start_lat": request_values.get("nearest_utility_lat"),
        "utility_length_approx_m": request_values.get("nearest_utility_len"),
        "utility_coord_count": request_values.get("nearest_utility_coords"),
        "excavation_longitude": request_values.get("longitude"),
        "excavation_latitude": request_values.get("latitude"),
        "distance_to_utility_m": request_values.get("nearest_utility_distance"),
        "excavation_depth_m": request_values.get("depth"),
        "vibration": vibration,
        "soil_moisture": soil_moisture,
        "soil_temperature_c": soil_temp,
        "gas_reading": gas_reading,
        "ground_movement_mm": ground_movement,
    }

    # Identify missing features (especially sensors)
    missing_features = [name for name in feature_columns if feature_values.get(name) is None]

    # Preprocessing / imputation:
    # If simulated sensors are omitted from request, use the documented neutral training medians
    # rather than failing, but transparently report them in imputedFeatures
    default_medians = {
        "utility_start_lon": request_values.get("longitude"),
        "utility_start_lat": request_values.get("latitude"),
        "utility_length_approx_m": 50.0,
        "utility_coord_count": 2,
        "excavation_longitude": request_values.get("longitude"),
        "excavation_latitude": request_values.get("latitude"),
        "distance_to_utility_m": request_values.get("nearest_utility_distance"),
        "excavation_depth_m": request_values.get("depth"),
        "vibration": 0.20,
        "soil_moisture": 0.30,
        "soil_temperature_c": 25.0,
        "gas_reading": 0.05,
        "ground_movement_mm": 1.0,
    }

    ordered_values = []
    for name in feature_columns:
        val = feature_values.get(name)
        if val is None:
            val = default_medians.get(name, 0.0)
        ordered_values.append(float(val))

    frame = pd.DataFrame([ordered_values], columns=feature_columns)
    return frame, missing_features


def decode_class(class_value, label_encoder):
    value = class_value.item() if hasattr(class_value, "item") else class_value
    # Standardize to titlecase: High, Low, Medium
    canonical = {
        "0": "High", "1": "Low", "2": "Medium",
        0: "High", 1: "Low", 2: "Medium",
        "HIGH": "High", "LOW": "Low", "MEDIUM": "Medium",
        "High": "High", "Low": "Low", "Medium": "Medium"
    }
    if value in canonical:
        return canonical[value]

    labels = [str(label) for label in label_encoder.classes_]
    if str(value) in labels:
        val_str = str(value).title()
        return val_str
    if isinstance(value, (int, float)) and math.isfinite(value) and float(value).is_integer():
        index = int(value)
        if 0 <= index < len(labels):
            decoded = str(label_encoder.inverse_transform([index])[0]).title()
            return decoded
    raise ValueError(f"Model class {value!r} cannot be decoded by the saved risk label encoder.")


def predict(payload, loaded_models=None):
    request_values = validate_request(payload)
    models = loaded_models or load_models()
    feature_columns = models["feature_columns"]
    frame, missing_features = build_feature_frame(feature_columns, request_values)
    label_encoder = models["label_encoder"]

    model_results = {}
    model_errors = dict(models.get("load_errors", {}))

    model_configs = [
        ("random_forest", models.get("random_forest")),
        ("xgboost", models.get("xgboost")),
        ("lightgbm", models.get("lightgbm")),
    ]

    for name, model in model_configs:
        if model is None:
            continue

        try:
            classes = list(model.classes_)
            probabilities = model.predict_proba(frame)
            if len(probabilities) != 1 or len(probabilities[0]) != len(classes):
                raise ValueError(f"The saved {name} model returned an invalid probability shape.")
            predicted_values = model.predict(frame)
            if len(predicted_values) != 1:
                raise ValueError(f"The saved {name} model returned an invalid prediction shape.")

            class_probabilities = []
            for class_value, probability in zip(classes, probabilities[0]):
                numeric_probability = float(probability)
                if not math.isfinite(numeric_probability) or not 0 <= numeric_probability <= 1:
                    raise ValueError(f"The saved {name} model returned an invalid class probability.")
                class_probabilities.append({
                    "label": decode_class(class_value, label_encoder),
                    "probability": numeric_probability,
                })

            # Sort probabilities consistently: High, Low, Medium
            order = {"High": 0, "Low": 1, "Medium": 2}
            class_probabilities.sort(key=lambda x: order.get(x["label"], 99))

            model_results[name] = {
                "predictedClass": decode_class(predicted_values[0], label_encoder),
                "classProbabilities": class_probabilities,
            }
        except Exception as exc:
            model_errors[name] = f"{name} inference error: {type(exc).__name__}: {exc}"

    if not model_results:
        error_details = "; ".join(model_errors.values()) if model_errors else "Unknown error."
        raise ValueError(f"No model produced a valid prediction. Errors: {error_details}")

    # Calculate agreement across all evaluated models
    evaluated_classes = [r["predictedClass"] for r in model_results.values()]
    all_agree = len(set(evaluated_classes)) == 1 if len(evaluated_classes) > 1 else None

    # Safety-First Consensus Policy:
    # If ANY model predicts High, consensus MUST be High (civil strike precaution).
    # If all models agree, use the agreed class.
    # Otherwise, default to Medium.
    has_high = any(c == "High" for c in evaluated_classes)
    consensus_class = "High" if has_high else (evaluated_classes[0] if all_agree else "Medium")

    result = {
        "models": model_results,
        "imputedFeatures": missing_features,
        "limitation": MODEL_LIMITATION,
        "safetyAssessment": {
            "consensusClass": consensus_class,
            "unanimous": all_agree if all_agree is not None else True,
            "highRiskFlag": has_high,
            "disagreementNote": (
                "Models are in full agreement." if all_agree
                else "Model disagreement detected: Safety-first protocol prioritizes any High-risk detection; precautionary excavation procedures apply."
            )
        }
    }
    if all_agree is not None:
        result["agreement"] = all_agree
    if model_errors:
        result["modelErrors"] = {
            name: error for name, error in model_errors.items()
            if name not in model_results
        }

    return result


def main():
    try:
        payload = json.load(sys.stdin)
        result = predict(payload)
    except (json.JSONDecodeError, ValueError, FileNotFoundError, ImportError) as error:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": str(error)}))
        return 1
    print(json.dumps({"status": "PREDICTION_AVAILABLE", "riskPrediction": result}, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
