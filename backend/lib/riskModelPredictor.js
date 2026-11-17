const path = require('path');
const { spawn } = require('child_process');

const INFERENCE_SCRIPT = path.resolve(__dirname, '..', 'ml', 'inference_service.py');
const INFERENCE_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function predictRisk(input) {
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

      // PREDICTION_AVAILABLE: at least one model succeeded — accept partial results
      if (response.status === 'PREDICTION_AVAILABLE' && response.riskPrediction) {
        finish(null, response.riskPrediction);
        return;
      }

      // INFERENCE_UNAVAILABLE: Python reported a structured error — surface the message
      if (response.status === 'INFERENCE_UNAVAILABLE') {
        finish(new Error(response.message || 'Model inference is unavailable.'));
        return;
      }

      // Non-zero exit without a parseable structured response
      if (exitCode !== 0) {
        finish(new Error('The Python model process returned an inference error.'));
        return;
      }

      finish(new Error('The Python model process did not produce a prediction.'));
    });

    child.stdin.end(serializedInput);
  });
}

module.exports = { INFERENCE_SCRIPT, predictRisk };
