"""
Diameter inference subprocess for DigSafe AI.

Reads JSON payload from stdin:
{
  "features": [
    {
      "start_lon": 77.5946,
      "start_lat": 12.9716,
      "end_lon": 77.5950,
      "end_lat": 12.9720,
      "straight_line_span_m": 62.4, # optional (computed if missing)
      "coordinate_count": 2,        # optional (defaults to 2 if missing)
      "source_file": "...",         # optional (defaults to 'unknown')
      "MaterialID": "DI",           # optional (defaults to 'unknown')
      "Status": "In Service",       # optional (defaults to 'unknown')
      "SSID": "BWSSB_CENTRAL"       # optional (defaults to 'unknown')
    }
  ]
}

Or from geometry coordinates directly.

Outputs JSON to stdout:
{
  "status": "PREDICTION_AVAILABLE",
  "predictions": [
    {
      "predictedDiameterMm": 249.17,
      "confidenceIntervalMm": [-17.62, 17.62],
      "model": "XGBoost Regressor (Exp 3: n=200, d=11)",
      "isAiEstimated": true
    }
  ],
  "model": "XGBoost Regressor (Exp 3: n=200, d=11)",
  "maeMm": 17.62,
  "r2Score": 0.6652,
  "limitation": "AI-estimated pipe diameter is an approximation derived from municipal GIS line corridors. Not a certified physical measurement. Excavators must verify physical utility markings on-site."
}
"""

import sys
import json
import math
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "models" / "diameter_pipeline.joblib"

MODEL_LIMITATION = (
    "AI-estimated pipe diameter is an approximation derived from municipal GIS line corridors. "
    "Not a certified physical measurement. Excavators must verify physical utility markings on-site."
)
MODEL_MAE_MM = 17.62
MODEL_R2 = 0.6652
MODEL_NAME = "XGBoost Regressor (Exp 3: n=200, d=11)"

REQUIRED_NUMERIC = [
    "start_lon", "start_lat", "end_lon", "end_lat",
    "straight_line_span_m", "coordinate_count"
]
REQUIRED_CATEGORICAL = [
    "source_file", "MaterialID", "Status", "SSID"
]
ALL_COLUMNS = REQUIRED_NUMERIC + REQUIRED_CATEGORICAL


def parse_finite_number(val, name):
    if val is None or isinstance(val, bool):
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def calculate_utm_span(start_lon, start_lat, end_lon, end_lat):
    try:
        from pyproj import Transformer
        to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
        x0, y0 = to_utm.transform(start_lon, start_lat)
        x1, y1 = to_utm.transform(end_lon, end_lat)
        return round(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5, 2)
    except Exception:
        # Fallback haversine approximation if pyproj fails
        r = 6371000.0
        lat1, lon1 = math.radians(start_lat), math.radians(start_lon)
        lat2, lon2 = math.radians(end_lat), math.radians(end_lon)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
        return round(2 * r * math.asin(math.sqrt(a)), 2)


def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            print(json.dumps({
                "status": "INVALID_INPUT",
                "message": "Empty input provided."
            }))
            sys.exit(1)

        payload = json.loads(raw_input)
        if not isinstance(payload, dict):
            print(json.dumps({
                "status": "INVALID_INPUT",
                "message": "Input must be a JSON object."
            }))
            sys.exit(1)

        items = payload.get("features")
        if not isinstance(items, list) or len(items) == 0:
            print(json.dumps({
                "status": "INVALID_INPUT",
                "message": "'features' must be a non-empty list of utility records."
            }))
            sys.exit(1)

        if not MODEL_PATH.is_file():
            print(json.dumps({
                "status": "MODEL_NOT_FOUND",
                "message": f"Diameter pipeline artifact not found at {MODEL_PATH}."
            }))
            sys.exit(1)

        import joblib
        import pandas as pd
        import numpy as np

        pipeline = joblib.load(MODEL_PATH)

        rows = []
        valid_indices = []

        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue

            # Extract or compute coordinates
            start_lon = parse_finite_number(item.get("start_lon"), "start_lon")
            start_lat = parse_finite_number(item.get("start_lat"), "start_lat")
            end_lon = parse_finite_number(item.get("end_lon"), "end_lon")
            end_lat = parse_finite_number(item.get("end_lat"), "end_lat")

            # Check if geometry coordinates array provided instead
            geometry = item.get("geometry")
            if (start_lon is None or start_lat is None) and isinstance(geometry, dict):
                coords = geometry.get("coordinates")
                if isinstance(coords, list) and len(coords) > 0:
                    first = coords[0] if not isinstance(coords[0][0], list) else coords[0][0]
                    last = coords[-1] if not isinstance(coords[-1][0], list) else coords[-1][-1]
                    if len(first) >= 2 and len(last) >= 2:
                        start_lon = parse_finite_number(first[0], "start_lon")
                        start_lat = parse_finite_number(first[1], "start_lat")
                        end_lon = parse_finite_number(last[0], "end_lon")
                        end_lat = parse_finite_number(last[1], "end_lat")

            if (start_lon is None or start_lat is None or 
                end_lon is None or end_lat is None):
                # Cannot locate utility spatially
                continue

            span_m = parse_finite_number(item.get("straight_line_span_m"), "span")
            if span_m is None or span_m < 0:
                span_m = calculate_utm_span(start_lon, start_lat, end_lon, end_lat)

            coord_count = parse_finite_number(item.get("coordinate_count"), "coord_count")
            if coord_count is None or coord_count < 2:
                coord_count = 2

            source_file = str(item.get("source_file") or item.get("sourceFile") or "unknown")
            material_id = str(item.get("MaterialID") or item.get("materialId") or "unknown")
            status = str(item.get("Status") or item.get("status") or "unknown")
            ssid = str(item.get("SSID") or item.get("ssid") or "unknown")

            rows.append({
                "start_lon": start_lon,
                "start_lat": start_lat,
                "end_lon": end_lon,
                "end_lat": end_lat,
                "straight_line_span_m": span_m,
                "coordinate_count": int(coord_count),
                "source_file": source_file,
                "MaterialID": material_id,
                "Status": status,
                "SSID": ssid,
            })
            valid_indices.append(idx)

        if not rows:
            print(json.dumps({
                "status": "NO_VALID_RECORDS",
                "message": "None of the provided utility records had valid spatial coordinates."
            }))
            sys.exit(0)

        df = pd.DataFrame(rows, columns=ALL_COLUMNS)
        pred_diameters = pipeline.predict(df)

        results = [None] * len(items)
        for original_idx, pred_val in zip(valid_indices, pred_diameters):
            val_rounded = round(float(pred_val), 1)
            results[original_idx] = {
                "predictedDiameterMm": val_rounded,
                "model": MODEL_NAME,
                "maeMm": MODEL_MAE_MM,
                "r2Score": MODEL_R2,
                "isAiEstimated": True
            }

        response = {
            "status": "PREDICTION_AVAILABLE",
            "predictions": results,
            "count": len(rows),
            "model": MODEL_NAME,
            "maeMm": MODEL_MAE_MM,
            "r2Score": MODEL_R2,
            "limitation": MODEL_LIMITATION
        }
        print(json.dumps(response))

    except Exception as e:
        print(json.dumps({
            "status": "INFERENCE_ERROR",
            "message": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
