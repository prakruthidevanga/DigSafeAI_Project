const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const DIAMETER_SCRIPT = path.resolve(__dirname, '..', 'ml', 'diameter_service.py');
const INFERENCE_TIMEOUT_MS = 20000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

let daemonProcess = null;
let daemonInitPromise = null;
let isDaemonReady = false;
let daemonReadLine = null;
const queue = [];

// In-memory cache for diameter predictions: feature key -> prediction
const diameterCache = new Map();
const MAX_CACHE_SIZE = 10000;

function getFeatureCacheKey(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const start_lon = feature.start_lon ?? (feature.geometry?.coordinates?.[0]?.[0]);
  const start_lat = feature.start_lat ?? (feature.geometry?.coordinates?.[0]?.[1]);
  const end_lon = feature.end_lon ?? (feature.geometry?.coordinates?.slice(-1)?.[0]?.[0]);
  const end_lat = feature.end_lat ?? (feature.geometry?.coordinates?.slice(-1)?.[0]?.[1]);
  const mat = feature.MaterialID || feature.materialId || 'unknown';
  const ssid = feature.SSID || feature.ssid || 'unknown';

  if (start_lon == null || start_lat == null || end_lon == null || end_lat == null) {
    return null;
  }
  return `${Number(start_lon).toFixed(5)}:${Number(start_lat).toFixed(5)}:${Number(end_lon).toFixed(5)}:${Number(end_lat).toFixed(5)}:${mat}:${ssid}`;
}

function startDiameterDaemon() {
  if (daemonProcess && !daemonProcess.killed) {
    return daemonInitPromise;
  }

  const python = process.env.PYTHON_EXECUTABLE || 'python';
  daemonProcess = spawn(python, [DIAMETER_SCRIPT, '--daemon'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (typeof daemonProcess.unref === 'function') {
    daemonProcess.unref();
  }

  daemonInitPromise = new Promise((resolve) => {
    let resolved = false;
    let initTimer = null;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      if (initTimer) clearTimeout(initTimer);
      resolve(val);
    };

    initTimer = setTimeout(() => {
      finish(false);
    }, 20000);
    if (typeof initTimer.unref === 'function') {
      initTimer.unref();
    }

    daemonReadLine = readline.createInterface({ input: daemonProcess.stdout });
    const rl = daemonReadLine;

    rl.on('line', (line) => {
      const text = line.trim();
      if (!text) return;
      try {
        const msg = JSON.parse(text);
        if (!resolved && msg.status === 'READY') {
          isDaemonReady = true;
          finish(true);
          return;
        }
        if (!resolved && (msg.status === 'MODEL_NOT_FOUND' || msg.status === 'INFERENCE_UNAVAILABLE')) {
          isDaemonReady = false;
          finish(false);
          return;
        }

        // Handle queued inference request
        if (queue.length > 0) {
          const { resolve: reqResolve, reject: reqReject, timer } = queue.shift();
          clearTimeout(timer);
          if (msg.status === 'PREDICTION_AVAILABLE' || msg.status === 'NO_VALID_RECORDS') {
            reqResolve(msg);
          } else {
            reqReject(new Error(msg.message || 'Diameter model inference failed.'));
          }
        }
      } catch (err) {
        if (queue.length > 0) {
          const { reject: reqReject, timer } = queue.shift();
          clearTimeout(timer);
          reqReject(new Error('The Python diameter model process returned invalid output.'));
        }
      }
    });

    daemonProcess.stderr.on('data', () => {});

    daemonProcess.on('error', () => {
      cleanupDiameterDaemon();
      finish(false);
    });

    daemonProcess.on('close', () => {
      cleanupDiameterDaemon();
      finish(false);
    });
  });

  return daemonInitPromise;
}

function stopDiameterDaemon() {
  if (daemonReadLine) {
    try { daemonReadLine.close(); } catch {}
    daemonReadLine = null;
  }
  if (daemonProcess && !daemonProcess.killed) {
    try {
      daemonProcess.kill();
    } catch {}
  }
  cleanupDiameterDaemon();
}

function cleanupDiameterDaemon() {
  isDaemonReady = false;
  if (daemonReadLine) {
    try { daemonReadLine.close(); } catch {}
    daemonReadLine = null;
  }
  daemonProcess = null;
  daemonInitPromise = null;
  while (queue.length > 0) {
    const { reject: reqReject, timer } = queue.shift();
    clearTimeout(timer);
    reqReject(new Error('Diameter model worker process disconnected.'));
  }
}

/**
 * Fallback single-shot execution of Python diameter pipeline
 */
function singleShotPredictUtilityDiameters(features) {
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  const payload = JSON.stringify({ features });

  return new Promise((resolve, reject) => {
    const child = spawn(python, [DIAMETER_SCRIPT], {
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
      finish(new Error('Diameter model inference exceeded its time limit.'));
    }, INFERENCE_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(new Error('Diameter model inference returned too much output.'));
      }
    });

    child.stderr.on('data', () => {});

    child.stdin.on('error', () => {
      finish(new Error('The Python diameter model process did not accept input.'));
    });

    child.on('error', () => {
      finish(new Error('The Python diameter model process could not be started.'));
    });

    child.on('close', () => {
      if (settled) return;

      let response;
      try {
        response = JSON.parse(stdout.trim());
      } catch {
        finish(new Error('The Python diameter model returned invalid JSON.'));
        return;
      }

      if (response.status === 'PREDICTION_AVAILABLE') {
        finish(null, response);
        return;
      }

      if (response.status === 'NO_VALID_RECORDS') {
        finish(null, {
          status: 'NO_VALID_RECORDS',
          predictions: [],
          message: response.message
        });
        return;
      }

      finish(new Error(response.message || 'Diameter model inference failed.'));
    });

    child.stdin.end(payload);
  });
}

/**
 * Invokes the Python diameter prediction pipeline for a list of utility features,
 * with multi-tier caching (in-memory Map) and persistent worker process.
 * 
 * @param {Array<Object>} features - Array of utility objects with coordinates/attributes
 * @returns {Promise<Object>} Diameter prediction response
 */
async function predictUtilityDiameters(features) {
  if (!Array.isArray(features) || features.length === 0) {
    return {
      status: 'NO_VALID_RECORDS',
      predictions: [],
      message: 'No features provided.'
    };
  }

  const uncachedIndices = [];
  const uncachedFeatures = [];
  const cachedResults = new Array(features.length).fill(null);

  for (let i = 0; i < features.length; i++) {
    const key = getFeatureCacheKey(features[i]);
    if (key && diameterCache.has(key)) {
      cachedResults[i] = diameterCache.get(key);
    } else {
      uncachedIndices.push(i);
      uncachedFeatures.push(features[i]);
    }
  }

  // 100% cache hit: return immediately without touching Python (0ms latency!)
  if (uncachedFeatures.length === 0) {
    return {
      status: 'PREDICTION_AVAILABLE',
      predictions: cachedResults,
      count: features.length,
      model: 'XGBoost Regressor (Exp 3: n=200, d=11)',
      maeMm: 17.62,
      r2Score: 0.6652,
      limitation: 'AI-estimated pipe diameter is an approximation derived from municipal GIS line corridors. Not a certified physical measurement. Excavators must verify physical utility markings on-site.'
    };
  }

  // Predict uncached features via daemon or single-shot
  let rawResult;
  try {
    const ready = await startDiameterDaemon();
    if (ready && isDaemonReady && daemonProcess && !daemonProcess.killed) {
      rawResult = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = queue.findIndex(item => item.timer === timer);
          if (idx !== -1) queue.splice(idx, 1);
          reject(new Error('Diameter model inference exceeded its time limit.'));
        }, INFERENCE_TIMEOUT_MS);

        queue.push({ resolve, reject, timer });
        try {
          daemonProcess.stdin.write(JSON.stringify({ features: uncachedFeatures }) + '\n');
        } catch (err) {
          clearTimeout(timer);
          const idx = queue.findIndex(item => item.timer === timer);
          if (idx !== -1) queue.splice(idx, 1);
          singleShotPredictUtilityDiameters(uncachedFeatures).then(resolve).catch(reject);
        }
      });
    } else {
      rawResult = await singleShotPredictUtilityDiameters(uncachedFeatures);
    }
  } catch (err) {
    rawResult = await singleShotPredictUtilityDiameters(uncachedFeatures);
  }

  if (rawResult && Array.isArray(rawResult.predictions)) {
    uncachedIndices.forEach((origIdx, sliceIdx) => {
      const pred = rawResult.predictions[sliceIdx];
      cachedResults[origIdx] = pred;
      const key = getFeatureCacheKey(features[origIdx]);
      if (key && pred) {
        if (diameterCache.size >= MAX_CACHE_SIZE) {
          const firstKey = diameterCache.keys().next().value;
          diameterCache.delete(firstKey);
        }
        diameterCache.set(key, pred);
      }
    });

    return {
      ...rawResult,
      predictions: cachedResults,
      count: features.length,
    };
  }

  return rawResult;
}

module.exports = {
  DIAMETER_SCRIPT,
  predictUtilityDiameters,
  startDiameterDaemon,
  stopDiameterDaemon,
  diameterCache,
};
