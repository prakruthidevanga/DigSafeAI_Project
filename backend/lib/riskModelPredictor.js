const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const INFERENCE_SCRIPT = path.resolve(__dirname, '..', 'ml', 'inference_service.py');
const INFERENCE_TIMEOUT_MS = 25000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

let daemonProcess = null;
let daemonInitPromise = null;
let isDaemonReady = false;
let daemonReadLine = null;
const queue = [];

function startRiskDaemon() {
  if (daemonProcess && !daemonProcess.killed) {
    return daemonInitPromise;
  }

  const python = process.env.PYTHON_EXECUTABLE || 'python';
  daemonProcess = spawn(python, [INFERENCE_SCRIPT, '--daemon'], {
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
    }, 25000);
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
        if (!resolved && msg.status === 'INFERENCE_UNAVAILABLE') {
          isDaemonReady = false;
          finish(false);
          return;
        }

        // Handle queued inference response
        if (queue.length > 0) {
          const { resolve: reqResolve, reject: reqReject, timer } = queue.shift();
          clearTimeout(timer);
          if (msg.status === 'PREDICTION_AVAILABLE' && msg.riskPrediction) {
            reqResolve(msg.riskPrediction);
          } else if (msg.status === 'INFERENCE_UNAVAILABLE') {
            reqReject(new Error(msg.message || 'Model inference is unavailable.'));
          } else {
            reqReject(new Error(msg.message || 'The Python model process returned invalid output.'));
          }
        }
      } catch (err) {
        if (queue.length > 0) {
          const { reject: reqReject, timer } = queue.shift();
          clearTimeout(timer);
          reqReject(new Error('The Python model process returned invalid output.'));
        }
      }
    });

    daemonProcess.stderr.on('data', () => {});

    daemonProcess.on('error', () => {
      cleanupDaemon();
      finish(false);
    });

    daemonProcess.on('close', () => {
      cleanupDaemon();
      finish(false);
    });
  });

  return daemonInitPromise;
}

function stopRiskDaemon() {
  if (daemonReadLine) {
    try { daemonReadLine.close(); } catch {}
    daemonReadLine = null;
  }
  if (daemonProcess && !daemonProcess.killed) {
    try {
      if (daemonProcess.stdin) {
        daemonProcess.stdin.end();
      }
      daemonProcess.kill();
    } catch {}
  }
  cleanupDaemon();
}

function cleanupDaemon() {
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
    reqReject(new Error('Model worker process disconnected.'));
  }
}

function singleShotPredictRisk(input) {
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  const serializedInput = JSON.stringify(input);

  return new Promise((resolve, reject) => {
    const child = spawn(python, [INFERENCE_SCRIPT], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    let timeout;

    const finish = (error, prediction) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(prediction);
    };

    timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Model inference exceeded its time limit.'));
    }, INFERENCE_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(new Error('Model inference returned too much output.'));
      }
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {
      finish(new Error('The Python model process did not accept the request.'));
    });
    child.on('error', () => {
      finish(new Error('The Python model process could not be started.'));
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      let response;
      try {
        response = JSON.parse(stdout.trim());
      } catch {
        finish(new Error('The Python model process returned invalid output.'));
        return;
      }
      if (response.status === 'PREDICTION_AVAILABLE' && response.riskPrediction) {
        finish(null, response.riskPrediction);
        return;
      }
      if (response.status === 'INFERENCE_UNAVAILABLE') {
        finish(new Error(response.message || 'Model inference is unavailable.'));
        return;
      }
      if (exitCode !== 0) {
        finish(new Error('The Python model process returned an inference error.'));
        return;
      }
      finish(new Error('The Python model process did not produce a prediction.'));
    });

    child.stdin.end(serializedInput);
  });
}

function predictRisk(input) {
  // If daemon is ready or can start, use persistent worker for sub-100ms inference
  const readyPromise = startRiskDaemon();
  return readyPromise.then((ready) => {
    if (ready && daemonProcess && !daemonProcess.killed && isDaemonReady) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = queue.findIndex(item => item.timer === timer);
          if (idx !== -1) queue.splice(idx, 1);
          reject(new Error('Model inference exceeded its time limit.'));
        }, INFERENCE_TIMEOUT_MS);

        queue.push({ resolve, reject, timer });
        try {
          daemonProcess.stdin.write(JSON.stringify(input) + '\n');
        } catch (err) {
          clearTimeout(timer);
          const idx = queue.findIndex(item => item.timer === timer);
          if (idx !== -1) queue.splice(idx, 1);
          singleShotPredictRisk(input).then(resolve).catch(reject);
        }
      });
    }
    // Fallback to single shot if daemon not ready
    return singleShotPredictRisk(input);
  }).catch(() => {
    return singleShotPredictRisk(input);
  });
}

module.exports = { INFERENCE_SCRIPT, predictRisk, startRiskDaemon, stopRiskDaemon };
