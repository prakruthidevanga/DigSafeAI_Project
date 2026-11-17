"""
Faster R-CNN image inference subprocess for DigSafe AI.

Reads a base64-encoded image from stdin (JSON: {"imageBase64": "...", "threshold": 0.3}),
runs inference with the local Faster R-CNN checkpoint (faster_rcnn_model (1).pth.zip),
and writes JSON to stdout.

Output on success:
  {"status": "DETECTIONS_AVAILABLE", "model": "faster_rcnn", "detections": [...], "detectionCount": N, "imageSize": {"width": w, "height": h}, "threshold": 0.3, "limitation": "..."}

Each detection:
  {"class": "pipe"|"object", "confidence": 0.87, "boundingBox": {"x": 10.0, "y": 20.0, "width": 100.0, "height": 50.0}, "model": "faster_rcnn"}

Output on error:
  {"status": "INFERENCE_UNAVAILABLE", "message": "..."}

Class labels:
  0: background (never returned)
  1: pipe
  2: object

IMPORTANT: This model was trained on a synthetic/limited dataset.
  - Labels are 'pipe' and 'object' only.
  - Results are experimental and not validated for real-world safety decisions.
  - Do not rely on absence of detections to confirm that no utilities are present.
"""

import base64
import io
import json
import os
import sys
from pathlib import Path

MODEL_ZIP = Path(__file__).resolve().parent / "vision" / "faster_rcnn" / "faster_rcnn_model (1).pth.zip"
MODEL_LIMITATION = (
    "Faster R-CNN detections are experimental. The model was trained on a limited synthetic dataset "
    "with two labels (pipe, object). Results are not validated for real-world utility identification. "
    "Absence of detections does not confirm absence of underground utilities."
)
DEFAULT_THRESHOLD = 0.30
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded limit

CLASS_NAMES = {
    1: "pipe",
    2: "object",
}


def load_model():
    """Load Faster R-CNN model and weights from local checkpoint."""
    import torch
    from torchvision.models.detection import fasterrcnn_resnet50_fpn

    if not MODEL_ZIP.is_file():
        raise FileNotFoundError(
            f"Faster R-CNN checkpoint not found: {MODEL_ZIP}."
        )

    # Reconstruct torchvision Faster R-CNN with 3 classes (background + 2 utility classes)
    model = fasterrcnn_resnet50_fpn(
        weights=None,
        weights_backbone=None,
        num_classes=3
    )

    try:
        state_dict = torch.load(str(MODEL_ZIP), map_location="cpu", weights_only=True)
    except Exception as exc:
        raise ValueError(f"Failed to load Faster R-CNN checkpoint: {exc}") from exc

    model.load_state_dict(state_dict, strict=True)
    model.eval()
    return model


def run_inference(model, image_bytes, threshold=DEFAULT_THRESHOLD):
    """Run Faster R-CNN inference on raw image bytes. Returns a list of detection dicts."""
    import torch
    from PIL import Image
    from torchvision.transforms.functional import to_tensor

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Decoded image exceeds maximum size of {MAX_IMAGE_BYTES // (1024*1024)} MB.")

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot decode image: {exc}") from exc

    image_width, image_height = image.size

    image_tensor = to_tensor(image)

    with torch.no_grad():
        prediction = model([image_tensor])[0]

    scores = prediction.get("scores", torch.empty(0))
    labels = prediction.get("labels", torch.empty(0, dtype=torch.int64))
    boxes = prediction.get("boxes", torch.empty((0, 4)))

    keep = scores >= threshold
    filtered_scores = scores[keep]
    filtered_labels = labels[keep]
    filtered_boxes = boxes[keep]

    detections = []
    for score_t, label_t, box_t in zip(filtered_scores, filtered_labels, filtered_boxes):
        conf = float(score_t.item())
        label_id = int(label_t.item())

        # Ignore background (0) or unrecognized label ids
        if label_id not in CLASS_NAMES:
            continue

        class_name = CLASS_NAMES[label_id]

        # box is [x_min, y_min, x_max, y_max] in absolute pixels
        x_min, y_min, x_max, y_max = [float(v.item()) for v in box_t]

        # Clamp to image bounds
        x_min = max(0.0, min(float(image_width), x_min))
        y_min = max(0.0, min(float(image_height), y_min))
        x_max = max(0.0, min(float(image_width), x_max))
        y_max = max(0.0, min(float(image_height), y_max))

        width = x_max - x_min
        height = y_max - y_min

        if width <= 0 or height <= 0:
            continue

        detections.append({
            "class": class_name,
            "confidence": round(conf, 4),
            "boundingBox": {
                "x": round(x_min, 1),
                "y": round(y_min, 1),
                "width": round(width, 1),
                "height": round(height, 1),
            },
            "model": "faster_rcnn",
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
        model = load_model()
        detections, (img_w, img_h) = run_inference(model, image_bytes, threshold)
    except FileNotFoundError as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": str(exc)}))
        return 1
    except (ImportError, ModuleNotFoundError) as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Missing dependency: {exc}"}))
        return 1
    except MemoryError:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": "Insufficient memory to load the Faster R-CNN model."}))
        return 1
    except ValueError as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": str(exc)}))
        return 1
    except Exception as exc:
        print(json.dumps({"status": "INFERENCE_UNAVAILABLE", "message": f"Inference error: {type(exc).__name__}: {exc}"}))
        return 1

    print(json.dumps({
        "status": "DETECTIONS_AVAILABLE",
        "model": "faster_rcnn",
        "detections": detections,
        "detectionCount": len(detections),
        "imageSize": {"width": img_w, "height": img_h},
        "threshold": threshold,
        "limitation": MODEL_LIMITATION,
    }, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
