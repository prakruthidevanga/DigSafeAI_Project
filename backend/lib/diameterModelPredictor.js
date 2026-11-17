const path = require('path');
const { spawn } = require('child_process');

const DIAMETER_SCRIPT = path.resolve(__dirname, '..', 'ml', 'diameter_service.py');
const INFERENCE_TIMEOUT_MS = 20000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * Invokes the Python diameter prediction pipeline for a list of utility features.
 * 
 * @param {Array<Object>} features - Array of utility objects with coordinates/attributes
 * @returns {Promise<Object>} Diameter prediction response
 */
function predictUtilityDiameters(features) {
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

    child.on('close', (exitCode) => {
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

module.exports = {
  DIAMETER_SCRIPT,
  predictUtilityDiameters
};
