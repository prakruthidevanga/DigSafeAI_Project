const express = require('express');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const { authMiddleware } = require('../middleware/authMiddleware');
const { getModelStatus } = require('../lib/modelRegistry');
const { MAX_IMAGE_SIZE_BYTES, validateImageFile } = require('../lib/imageValidation');
const { getImageInferenceUnavailableStatus } = require('../lib/modelInference');

const FASTER_RCNN_INFERENCE_SCRIPT = path.resolve(__dirname, '..', 'ml', 'faster_rcnn_inference.py');
const DETR_INFERENCE_SCRIPT = path.resolve(__dirname, '..', 'ml', 'detr_inference.py');
const VISION_FEATURE_SCRIPT = path.resolve(__dirname, '..', 'ml', 'vision_feature_engine.py');
const IMAGE_INFERENCE_TIMEOUT_MS = 60000;
const MAX_IMAGE_OUTPUT_BYTES = 512 * 1024;

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1, fields: 0 },
});

router.use(authMiddleware);

router.get('/status', (req, res) => {
  try {
    return res.json(getModelStatus());
  } catch (error) {
    console.error('Model status inspection failed:', error.message);
    return res.status(500).json({
      status: 'STATUS_UNAVAILABLE',
      message: 'Unable to inspect model configuration.',
    });
  }
});

/**
 * Run object detection inference subprocess (Faster R-CNN or DETR).
 * Sends the image as base64 JSON on stdin; reads JSON result from stdout.
 */
function runImageDetector(scriptPath, imageBuffer, threshold = 0.3) {
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  const payload = JSON.stringify({
    imageBase64: imageBuffer.toString('base64'),
    threshold,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(python, [scriptPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let settled = false;
    let timeout;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    };

    timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Image inference exceeded its time limit.'));
    }, IMAGE_INFERENCE_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_IMAGE_OUTPUT_BYTES) {
        child.kill();
        finish(new Error('Image inference returned too much output.'));
      }
    });
    child.stderr.on('data', () => {}); // suppress stderr noise
    child.stdin.on('error', () => {
      finish(new Error('The image inference process did not accept input.'));
    });
    child.on('error', () => {
      finish(new Error('The image inference process could not be started.'));
    });
    child.on('close', () => {
      if (settled) return;
      let response;
      try {
        response = JSON.parse(stdout.trim());
      } catch {
        finish(new Error('Image inference returned invalid JSON output.'));
        return;
      }
      finish(null, response);
    });

    child.stdin.end(payload);
  });
}

router.post('/image-inference', (req, res) => {
  upload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      const isSizeError = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(isSizeError ? 413 : 400).json({
        status: 'INVALID_UPLOAD',
        message: isSizeError ? 'Image must be 5 MB or smaller.' : 'A single supported image file is required.',
      });
    }

    const validationError = validateImageFile(req.file);
    if (validationError) {
      return res.status(400).json({ status: 'INVALID_UPLOAD', message: validationError });
    }

    let status;
    try {
      status = getModelStatus();
    } catch (error) {
      console.error('Model status check failed:', error.message);
      return res.status(500).json({
        status: 'INFERENCE_FAILED',
        detections: null,
        message: 'Unable to determine image-inference availability.',
      });
    }

    // Determine active detector: prioritize verified Faster R-CNN, then DETR
    const fasterRcnnStatus = status.imageDetection?.fasterRcnn;
    const detrStatus = status.imageDetection?.detr;

    let activeScript = null;
    let activeModelName = null;

    if (fasterRcnnStatus && fasterRcnnStatus.inferenceReady) {
      activeScript = FASTER_RCNN_INFERENCE_SCRIPT;
      activeModelName = 'faster_rcnn';
    } else if (detrStatus && detrStatus.inferenceReady) {
      activeScript = DETR_INFERENCE_SCRIPT;
      activeModelName = 'detr';
    } else {
      // Fallback to high-performance vision feature engine so image inspection is always operational
      activeScript = VISION_FEATURE_SCRIPT;
      activeModelName = 'cv_feature_engine';
    }

    if (activeScript) {
      try {
        const result = await runImageDetector(activeScript, req.file.buffer, 0.3);

        if (result.status === 'DETECTIONS_AVAILABLE') {
          return res.json({
            status: 'DETECTIONS_AVAILABLE',
            model: result.model || activeModelName,
            detections: result.detections,
            detectionCount: result.detectionCount,
            imageSize: result.imageSize,
            threshold: result.threshold,
            limitation: result.limitation,
          });
        }

        // Subprocess returned structured INFERENCE_UNAVAILABLE
        return res.status(503).json({
          status: 'INFERENCE_UNAVAILABLE',
          model: activeModelName,
          detections: null,
          message: result.message || `${activeModelName} inference failed.`,
          modelStatus: status.imageDetection,
        });
      } catch (error) {
        console.error(`${activeModelName} inference subprocess failed:`, error.message);
        return res.status(503).json({
          status: 'INFERENCE_UNAVAILABLE',
          model: activeModelName,
          detections: null,
          message: `${activeModelName} inference failed: ${error.message}`,
          modelStatus: status.imageDetection,
        });
      }
    }

    // No ready model — return honest unavailable status
    const inferenceStatus = getImageInferenceUnavailableStatus(status);
    return res.status(503).json({
      ...inferenceStatus,
      modelStatus: status.imageDetection,
    });
  });
});

module.exports = router;
