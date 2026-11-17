"""
DETR image inference subprocess for DigSafe AI.

Reads a base64-encoded image from stdin (JSON: {"imageBase64": "...", "threshold": 0.5}),
runs inference with the local DETR model (dataset2_detr_model/), and writes JSON to stdout.

Output on success:
  {"status": "DETECTIONS_AVAILABLE", "model": "detr", "detections": [...], "imageSize": [w, h]}

Each detection:
  {"class": "pipe"|"object", "confidence": 0.87, "boundingBox": {"x": 10, "y": 20, "width": 100, "height": 50}}

Output on error:
  {"status": "INFERENCE_UNAVAILABLE", "message": "..."}

IMPORTANT: This model was trained on a synthetic/limited dataset.
  - Labels are 'pipe' and 'object' only.
  - Results are experimental and not validated for real-world safety decisions.
  - Do not rely on absence of detections to confirm that no utilities are present.
"""

import base64
import json
import sys
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent / "vision" / "detr" / "dataset2_detr_model"
MODEL_LIMITATION = (
    "DETR detections are experimental. The model was trained on a limited synthetic dataset "
    "with two labels (pipe, object). Results are not validated for real-world utility identification. "
    "Absence of detections does not confirm absence of underground utilities."
)
DEFAULT_THRESHOLD = 0.5
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded limit


def load_model():
    """Load DETR processor and model from the local directory. No network access."""
    from transformers import DetrForObjectDetection, DetrImageProcessor

    if not MODEL_DIR.is_dir():
        raise FileNotFoundError(
            f"DETR model directory not found: {MODEL_DIR}. "
            "Ensure dataset2_detr_model/ is extracted."
        )
    required_files = ["config.json", "model.safetensors", "preprocessor_config.json"]
    missing = [f for f in required_files if not (MODEL_DIR / f).is_file()]
    if missing:
        raise FileNotFoundError(
            f"DETR model directory is missing required files: {', '.join(missing)}"
        )

    processor = DetrImageProcessor.from_pretrained(
        str(MODEL_DIR), local_files_only=True
    )
    model = DetrForObjectDetection.from_pretrained(
        str(MODEL_DIR), local_files_only=True
    )
    model.eval()
    return processor, model


def run_inference(processor, model, image_bytes, threshold=DEFAULT_THRESHOLD):
    """Run DETR inference on raw image bytes. Returns a list of detection dicts."""
    import torch
    from PIL import Image
    import io

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Decoded image exceeds maximum size of {MAX_IMAGE_BYTES // (1024*1024)} MB.")

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot decode image: {exc}") from exc

    image_width, image_height = image.size

    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    # Convert to (cx, cy, w, h) relative boxes → absolute pixel boxes
    target_sizes = torch.tensor([[image_height, image_width]])
    results = processor.post_process_object_detection(
        outputs, threshold=threshold, target_sizes=target_sizes
    )[0]

    id2label = model.config.id2label  # {0: "pipe", 1: "object"}
    detections = []

    for score, label_id, box in zip(results["scores"], results["labels"], results["boxes"]):
        confidence = float(score.item())
        if not (0.0 <= confidence <= 1.0):
            continue

        label_int = int(label_id.item())
        class_name = id2label.get(label_int, f"LABEL_{label_int}")

        # box is [x_min, y_min, x_max, y_max] in absolute pixels
        x_min, y_min, x_max, y_max = [round(float(v.item()), 1) for v in box]
        width = round(x_max - x_min, 1)
        height = round(y_max - y_min, 1)

        # Validate box is within image bounds
        if width <= 0 or height <= 0:
            continue
        if x_min < 0 or y_min < 0 or x_max > image_width or y_max > image_height:
            # Clamp to image bounds rather than discarding
            x_min = max(0.0, x_min)
            y_min = max(0.0, y_min)
            x_max = min(float(image_width), x_max)
            y_max = min(float(image_height), y_max)
            width = round(x_max - x_min, 1)
            height = round(y_max - y_min, 1)
            if width <= 0 or height <= 0:
                continue

        detections.append({
            "class": class_name,
            "confidence": round(confidence, 4),
            "boundingBox": {
                "x": round(x_min, 1),
                "y": round(y_min, 1),
                "width": width,
                "height": height,
            },
            "model": "detr",
        })

    return detections, (image_width, image_height)


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Invalid JSON input: {exc}"}))
        return 1

    if not isinstance(payload, dict):
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": "Input must be a JSON object."}))
        return 1

    image_b64 = payload.get("imageBase64", "")
    threshold = float(payload.get("threshold", DEFAULT_THRESHOLD))
    if not (0.0 < threshold <= 1.0):
        threshold = DEFAULT_THRESHOLD

    if not image_b64:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": "imageBase64 field is required."}))
        return 1

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Cannot decode base64 image: {exc}"}))
        return 1

    try:
        processor, model = load_model()
        detections, (img_w, img_h) = run_inference(processor, model, image_bytes, threshold)
    except FileNotFoundError as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": str(exc)}))
        return 1
    except (ImportError, ModuleNotFoundError) as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Missing dependency: {exc}"}))
        return 1
    except MemoryError:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": "Insufficient memory to load the DETR model."}))
        return 1
    except ValueError as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": str(exc)}))
        return 1
    except Exception as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Inference error: {type(exc).__name__}: {exc}"}))
        return 1

    print(json.dumps({
        "status": "DETECTIONS_AVAILABLE",
        "model": "detr",
        "detections": detections,
        "detectionCount": len(detections),
        "imageSize": {"width": img_w, "height": img_h},
        "threshold": threshold,
        "limitation": MODEL_LIMITATION,
    }, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
