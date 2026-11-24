const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { calculateIntegratedHazardScore } = require('../lib/hazardScoring');

const VISION_SCRIPT = path.resolve(__dirname, '..', 'ml', 'vision_feature_engine.py');

function runVisionEngine(payload) {
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  return new Promise((resolve, reject) => {
    const child = spawn(python, [VISION_SCRIPT], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse vision engine output: ${stdout || stderr}`));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

test('vision engine rejects paved road surfaces without utility pipelines', async () => {
  // Generate a 100x100 grey asphalt image (100x100 uncompressed PPM converted to base64)
  // PPM header: P6 100 100 255 \n followed by 100*100*3 bytes of grey (70, 70, 70)
  const width = 100;
  const height = 100;
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  const data = Buffer.alloc(width * height * 3, 70); // solid grey
  const ppmBuffer = Buffer.concat([header, data]);

  const result = await runVisionEngine({
    imageBase64: ppmBuffer.toString('base64'),
    threshold: 0.75,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, 'REJECTED_UNRELATED_IMAGE');
  assert.equal(result.isValidPipelineImage, false);
  assert.match(result.rejectionReason, /road|highway|pavement|No underground utility/i);
});

test('vision engine rejects images with human skin tones/faces', async () => {
  const width = 100;
  const height = 100;
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  // Peach skin tone: R=230, G=175, B=140
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = 230;     // R
    data[i * 3 + 1] = 175; // G
    data[i * 3 + 2] = 140; // B
  }
  const ppmBuffer = Buffer.concat([header, data]);

  const result = await runVisionEngine({
    imageBase64: ppmBuffer.toString('base64'),
    threshold: 0.75,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, 'REJECTED_UNRELATED_IMAGE');
  assert.equal(result.isValidPipelineImage, false);
  assert.match(result.rejectionReason, /human|portrait|people/i);
});

test('vision engine accurately detects and accepts yellow gas pipeline in excavation trench', async () => {
  const width = 200;
  const height = 150;
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  const data = Buffer.alloc(width * height * 3);

  // Background: Earth soil (R=120, G=80, B=45)
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = 120;
    data[i * 3 + 1] = 80;
    data[i * 3 + 2] = 45;
  }

  // Draw cylindrical yellow gas pipeline (y from 60 to 90, x from 20 to 180)
  for (let y = 60; y < 90; y++) {
    const shd = Math.sin(((y - 60) / 30) * Math.PI);
    for (let x = 20; x < 180; x++) {
      const idx = (y * width + x) * 3;
      data[idx] = Math.round(245 * (0.7 + 0.3 * shd));   // R (high)
      data[idx + 1] = Math.round(190 * (0.7 + 0.3 * shd)); // G (high)
      data[idx + 2] = Math.round(20 * shd);               // B (low)
    }
  }

  const ppmBuffer = Buffer.concat([header, data]);
  const result = await runVisionEngine({
    imageBase64: ppmBuffer.toString('base64'),
    threshold: 0.75,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, 'ACCEPTED_PIPELINE');
  assert.equal(result.isValidPipelineImage, true);
  assert.equal(result.primaryUtility, 'GAS');
  assert.ok(result.detectionCount >= 1);
  assert.ok(result.detections[0].confidence >= 0.75);
});

test('hazard scoring ignores rejected unrelated images and incorporates accepted pipeline images', () => {
  // Case A: Rejected Image -> Must not confirm visual pipe
  const rejectedScore = calculateIntegratedHazardScore({
    nearestDistanceMeters: 8.0,
    depthMeters: 1.5,
    sensors: {},
    imageInspection: {
      status: 'REJECTED_UNRELATED_IMAGE',
      accepted: false,
      isValidPipelineImage: false,
      detections: [],
    },
  });

  assert.equal(rejectedScore.visualConfirmation, null);

  // Case B: Accepted Pipeline Image -> Confirms visual utility
  const acceptedScore = calculateIntegratedHazardScore({
    nearestDistanceMeters: 8.0,
    depthMeters: 1.5,
    sensors: {},
    imageInspection: {
      status: 'ACCEPTED_PIPELINE',
      accepted: true,
      isValidPipelineImage: true,
      detections: [
        {
          class: 'pipe',
          category: 'GAS',
          utilityType: 'gas_pipeline',
          label: 'Gas Pipeline (Polyethylene)',
          confidence: 0.94,
          infrastructure: 'UNDERGROUND_PIPELINE',
        },
      ],
    },
  });

  assert.ok(acceptedScore.visualConfirmation !== null);
  assert.equal(acceptedScore.visualConfirmation.detected, true);
  assert.equal(acceptedScore.visualConfirmation.type, 'GAS_PIPELINE');
  assert.equal(acceptedScore.visualConfirmation.confidence, 0.94);
});
