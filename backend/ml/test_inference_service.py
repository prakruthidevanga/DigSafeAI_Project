"""
Tests for inference_service.py.

Tests cover:
  - Input validation (missing fields, invalid values, unmatched utility status)
  - Feature ordering and model class decoding with fake models
  - Single-model-available path (RF without XGBoost)
  - All-models-failed path
  - Non-finite input rejection
  - Round-trip with saved model artifacts (skipped if dependencies absent)
"""

import importlib.util
import unittest

from inference_service import load_models, predict, validate_request, build_feature_frame


FEATURE_COLUMNS = [
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
VALID_REQUEST = {
    "location": "Whitefield",
    "latitude": 12.9,
    "longitude": 77.5,
    "depth": 2,
    "radius": 10,
    "utilities": [{"utilityType": "water", "distance": 5}],
    "utilityDataStatus": "MATCHES_FOUND",
}


class FakePipeline:
    def __init__(self, classes, predicted, probabilities):
        self.classes_ = classes
        self.predicted = predicted
        self.probabilities = probabilities
        self.received_columns = None

    def predict(self, frame):
        self.received_columns = list(frame.columns)
        return [self.predicted]

    def predict_proba(self, frame):
        self.received_columns = list(frame.columns)
        return [self.probabilities]


class FakeLabelEncoder:
    classes_ = ["High", "Low", "Medium"]

    def inverse_transform(self, values):
        return [self.classes_[value] for value in values]


class BrokenModel:
    """A model that always raises on predict/predict_proba."""
    classes_ = [0, 1, 2]

    def predict(self, frame):
        raise RuntimeError("Simulated inference failure")

    def predict_proba(self, frame):
        raise RuntimeError("Simulated inference failure")


class InferenceServiceTests(unittest.TestCase):

    # -----------------------------------------------------------------------
    # Validation tests
    # -----------------------------------------------------------------------

    def test_validation_rejects_missing_invalid_and_unmatched_requests(self):
        with self.assertRaisesRegex(ValueError, "JSON object"):
            validate_request(None)
        with self.assertRaisesRegex(ValueError, "location"):
            validate_request({**VALID_REQUEST, "location": ""})
        with self.assertRaisesRegex(ValueError, "geographic coordinates"):
            validate_request({**VALID_REQUEST, "latitude": 91})
        with self.assertRaisesRegex(ValueError, "greater than 0"):
            validate_request({**VALID_REQUEST, "depth": 0})
        with self.assertRaisesRegex(ValueError, "utility matches"):
            validate_request({**VALID_REQUEST, "utilityDataStatus": "NO_MATCHES"})
        with self.assertRaisesRegex(ValueError, "(?i)at least one"):
            validate_request({**VALID_REQUEST, "utilities": []})

    def test_validation_rejects_non_finite_inputs(self):
        with self.assertRaisesRegex(ValueError, "finite number"):
            validate_request({**VALID_REQUEST, "depth": float("inf")})
        with self.assertRaisesRegex(ValueError, "finite number"):
            validate_request({**VALID_REQUEST, "latitude": float("nan")})
        with self.assertRaisesRegex(ValueError, "finite number"):
            validate_request({**VALID_REQUEST, "depth": "not-a-number"})

    def test_validation_rejects_negative_utility_distance(self):
        bad_req = {**VALID_REQUEST, "utilities": [{"utilityType": "water", "distance": -1}]}
        with self.assertRaisesRegex(ValueError, "non-negative"):
            validate_request(bad_req)

    # -----------------------------------------------------------------------
    # Both-models-available path
    # -----------------------------------------------------------------------

    def test_prediction_uses_saved_feature_order_and_model_classes(self):
        random_forest = FakePipeline(
            classes=[2, 0, 1],
            predicted=0,
            probabilities=[0.7, 0.1, 0.2],
        )
        xgboost = FakePipeline(
            classes=[1, 2, 0],
            predicted=2,
            probabilities=[0.2, 0.6, 0.2],
        )
        result = predict(VALID_REQUEST, {
            "random_forest": random_forest,
            "xgboost": xgboost,
            "feature_columns": FEATURE_COLUMNS,
            "label_encoder": FakeLabelEncoder(),
            "load_errors": {},
        })

        self.assertEqual(random_forest.received_columns, FEATURE_COLUMNS)
        self.assertEqual(xgboost.received_columns, FEATURE_COLUMNS)
        self.assertEqual(result["models"]["random_forest"]["predictedClass"], "High")
        self.assertEqual(
            result["models"]["random_forest"]["classProbabilities"],
            [
                {"label": "High", "probability": 0.1},
                {"label": "Low", "probability": 0.2},
                {"label": "Medium", "probability": 0.7},
            ],
        )
        self.assertEqual(result["models"]["xgboost"]["predictedClass"], "Medium")
        self.assertFalse(result["agreement"])
        self.assertEqual(result["imputedFeatures"], [
            "vibration",
            "soil_moisture",
            "soil_temperature_c",
            "gas_reading",
            "ground_movement_mm",
        ])
        self.assertIn("not validated real-world safety assessments", result["limitation"])

    # -----------------------------------------------------------------------
    # Single-model-available path (RF only, XGBoost absent)
    # -----------------------------------------------------------------------

    def test_rf_only_prediction_succeeds_when_xgboost_is_none(self):
        """When XGBoost is None (e.g. corrupted), RF alone produces a valid result."""
        random_forest = FakePipeline(
            classes=[0, 1, 2],
            predicted=2,
            probabilities=[0.1, 0.2, 0.7],
        )
        result = predict(VALID_REQUEST, {
            "random_forest": random_forest,
            "xgboost": None,
            "feature_columns": FEATURE_COLUMNS,
            "label_encoder": FakeLabelEncoder(),
            "load_errors": {"xgboost": "input stream corrupted"},
        })

        self.assertIn("random_forest", result["models"])
        self.assertNotIn("xgboost", result["models"])
        self.assertEqual(result["models"]["random_forest"]["predictedClass"], "Medium")
        # agreement is absent when only one model ran
        self.assertNotIn("agreement", result)
        # modelErrors surfaces the XGBoost failure
        self.assertIn("xgboost", result.get("modelErrors", {}))
        self.assertIn("not validated real-world safety assessments", result["limitation"])

    # -----------------------------------------------------------------------
    # All-models-failed path
    # -----------------------------------------------------------------------

    def test_all_models_failed_raises_value_error(self):
        """When all models are None, predict() must raise ValueError."""
        with self.assertRaises(ValueError):
            predict(VALID_REQUEST, {
                "random_forest": None,
                "xgboost": None,
                "feature_columns": FEATURE_COLUMNS,
                "label_encoder": FakeLabelEncoder(),
                "load_errors": {
                    "random_forest": "artifact not found",
                    "xgboost": "input stream corrupted",
                },
            })

    def test_broken_model_inference_falls_back_to_other_model(self):
        """If one model raises during inference, the other should still produce results."""
        broken = BrokenModel()
        working = FakePipeline(
            classes=[0, 1, 2],
            predicted=0,
            probabilities=[0.8, 0.1, 0.1],
        )
        result = predict(VALID_REQUEST, {
            "random_forest": broken,
            "xgboost": working,
            "feature_columns": FEATURE_COLUMNS,
            "label_encoder": FakeLabelEncoder(),
            "load_errors": {},
        })
        self.assertIn("xgboost", result["models"])
        self.assertNotIn("random_forest", result["models"])
        self.assertIn("random_forest", result.get("modelErrors", {}))

    # -----------------------------------------------------------------------
    # Round-trip with saved model artifacts
    # -----------------------------------------------------------------------

    @unittest.skipUnless(
        all(importlib.util.find_spec(name) for name in ("joblib", "numpy", "pandas", "sklearn", "xgboost")),
        "Install backend/ml/requirements.txt to load the trained model artifacts.",
    )
    def test_saved_models_load_and_produce_class_probabilities(self):
        """
        Load the actual saved artifacts and run inference.
        Accepts partial results in case one model artifact is still unavailable.
        At least one model (Random Forest) must produce a valid result.
        """
        models = load_models()
        self.assertEqual(models["feature_columns"], FEATURE_COLUMNS)

        result = predict(VALID_REQUEST, models)

        # At least RF must have produced a result
        self.assertTrue(
            len(result["models"]) >= 1,
            f"Expected at least one model result, got: {list(result['models'].keys())}"
        )
        self.assertIn("random_forest", result["models"],
                      "Random Forest must produce a result with intact artifact")

        for model_name, model_result in result["models"].items():
            self.assertTrue(model_result["predictedClass"],
                            f"{model_name} predictedClass is empty")
            class_labels = {p["label"] for p in model_result["classProbabilities"]}
            self.assertEqual(class_labels, {"High", "Low", "Medium"},
                             f"{model_name} class labels mismatch: {class_labels}")
            proba_sum = sum(p["probability"] for p in model_result["classProbabilities"])
            self.assertAlmostEqual(proba_sum, 1, places=5,
                                   msg=f"{model_name} probabilities do not sum to 1: {proba_sum}")

        self.assertIn("imputedFeatures", result)
        self.assertIn("limitation", result)

        # If both models ran, agreement must be present and consistent
        if "random_forest" in result["models"] and "xgboost" in result["models"]:
            self.assertIn("agreement", result)
            expected_agreement = (
                result["models"]["random_forest"]["predictedClass"]
                == result["models"]["xgboost"]["predictedClass"]
            )
            self.assertEqual(result["agreement"], expected_agreement)


if __name__ == "__main__":
    unittest.main()
