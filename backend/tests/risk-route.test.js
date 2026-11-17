const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { predictRisk } = require('../lib/riskModelPredictor');
const { createRiskRouter } = require('../routes/riskRoutes');

const validInput = {
  location: 'Whitefield',
  latitude: 12.9,
  longitude: 77.5,
  depth: 2,
  radius: 10,
  utilities: [{ utilityType: 'water', distance: 5 }],
  utilityDataStatus: 'MATCHES_FOUND',
};

async function withRiskApi(t, predictor, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/risk', createRiskRouter({ predictor }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const token = jwt.sign({ userId: 'risk-test-user' }, JWT_SECRET, { expiresIn: '1h' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/risk/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validInput),
  });
  await run(response);
}

const testPrediction = {
  models: {
    random_forest: {
      predictedClass: 'High',
      classProbabilities: [
        { label: 'High', probability: 0.8 },
        { label: 'Low', probability: 0.1 },
        { label: 'Medium', probability: 0.1 },
      ],
    },
    xgboost: {
      predictedClass: 'High',
      classProbabilities: [
        { label: 'Low', probability: 0.2 },
        { label: 'Medium', probability: 0.3 },
        { label: 'High', probability: 0.5 },
      ],
    },
  },
  agreement: true,
  imputedFeatures: ['vibration_mm_s', 'soil_moisture_pct'],
  limitation: 'Synthetic labels and simulated sensors; not a real-world safety assessment.',
};

test('configured predictor returns both model predictions, probabilities, and agreement', async (t) => {
  await withRiskApi(t, async () => testPrediction, async (response) => {
    assert.equal(response.status, 200);
    const body = await response.json();
    // Response now includes availableModels, unavailableModels, and partialResult
    assert.equal(body.status, 'PREDICTION_AVAILABLE');
    assert.deepEqual(body.riskPrediction, testPrediction);
    assert.equal(body.limitation, testPrediction.limitation);
    assert.deepEqual(body.availableModels, ['random_forest', 'xgboost']);
    assert.deepEqual(body.unavailableModels, ['lightgbm']);
    assert.equal(body.partialResult, true);
  });
});

test('Node-to-Python risk inference is connected to the authenticated API', async (t) => {
  await withRiskApi(t, predictRisk, async (response) => {
    const body = await response.json();
    if (response.status === 200) {
      assert.equal(body.status, 'PREDICTION_AVAILABLE');
      // At least Random Forest must produce a result; XGBoost may also be present
      assert.ok(body.riskPrediction.models.random_forest,
        'Random Forest result must be present with an intact artifact');
      assert.ok(Array.isArray(body.availableModels), 'availableModels must be an array');
      assert.ok(body.availableModels.includes('random_forest'), 'RF must be in availableModels');
      assert.equal(typeof body.partialResult, 'boolean');
    } else {
      assert.equal(response.status, 503);
      assert.equal(body.status, 'INFERENCE_UNAVAILABLE');
      assert.equal(body.riskPrediction, null);
    }
  });
});

test('configured predictor abstains when utility matches are absent or unverified, while formula assessment succeeds', async (t) => {
  let predictorCalled = false;
  const app = express();
  app.use(express.json());
  app.use('/api/risk', createRiskRouter({
    predictor: async () => {
      predictorCalled = true;
      return testPrediction;
    },
  }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const token = jwt.sign({ userId: 'risk-test-user' }, JWT_SECRET, { expiresIn: '1h' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/risk/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...validInput, utilityDataStatus: 'NO_MATCHES_IN_AVAILABLE_DATA', utilities: [] }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ASSESSMENT_AVAILABLE_WITHOUT_ML');
  assert.equal(body.riskPrediction, null);
  assert.equal(body.mlAssessmentUnavailable, true);
  assert.equal(predictorCalled, false);
  assert.ok(body.hazardAssessment);
  assert.equal(body.finalRiskLevel, body.hazardAssessment.riskLevel);
  assert.ok(body.limitation.includes('No mapped utility lines were found'));
});

test('invalid request fields are rejected before invoking the predictor', async (t) => {
  let predictorCalled = false;
  const app = express();
  app.use(express.json());
  app.use('/api/risk', createRiskRouter({
    predictor: async () => {
      predictorCalled = true;
      return testPrediction;
    },
  }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const token = jwt.sign({ userId: 'risk-test-user' }, JWT_SECRET, { expiresIn: '1h' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/risk/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...validInput, depth: -1 }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, 'INVALID_INPUT');
  assert.equal(predictorCalled, false);
});

test('inference failure returns unavailable without a prediction', async (t) => {
  await withRiskApi(t, async () => {
    throw new Error('private model runtime details');
  }, async (response) => {
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.status, 'INFERENCE_UNAVAILABLE');
    assert.equal(body.riskPrediction, null);
    assert.doesNotMatch(JSON.stringify(body), /private model runtime details/);
  });
});

test('safety-first policy: ML High escalates final risk to HIGH and ML cannot downgrade formula HIGH', async (t) => {
  // Test 1: Formula gives Medium (e.g. depth 1m, distance 5m), but ML predicts High -> finalRiskLevel is HIGH
  const highMlPredictor = async () => ({
    models: {
      random_forest: {
        predictedClass: 'High',
        classProbabilities: [{ label: 'High', probability: 0.9 }, { label: 'Medium', probability: 0.1 }, { label: 'Low', probability: 0.0 }],
      },
    },
    safetyAssessment: { consensusClass: 'High' },
    imputedFeatures: [],
    limitation: 'Synthetic evaluation',
  });

  await withRiskApi(t, highMlPredictor, async (response) => {
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.finalRiskLevel, 'HIGH');
    assert.equal(body.hazardAssessment.riskLevel, 'HIGH');
  });

  // Test 2: Formula gives HIGH (critical proximity 0.5m, depth 2.5m), but ML predicts Medium -> finalRiskLevel remains HIGH (anti-downgrade)
  const medMlPredictor = async () => ({
    models: {
      random_forest: {
        predictedClass: 'Medium',
        classProbabilities: [{ label: 'High', probability: 0.1 }, { label: 'Medium', probability: 0.8 }, { label: 'Low', probability: 0.1 }],
      },
    },
    safetyAssessment: { consensusClass: 'Medium' },
    imputedFeatures: [],
    limitation: 'Synthetic evaluation',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/risk', createRiskRouter({ predictor: medMlPredictor }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const token = jwt.sign({ userId: 'risk-test-user' }, JWT_SECRET, { expiresIn: '1h' });
  const resp = await fetch(`http://127.0.0.1:${server.address().port}/api/risk/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validInput,
      depth: 2.5,
      utilities: [{ utilityType: 'water', distance: 0.5 }],
    }),
  });
  assert.equal(resp.status, 200);
  const respBody = await resp.json();
  assert.equal(respBody.finalRiskLevel, 'HIGH');
  assert.equal(respBody.hazardAssessment.riskLevel, 'HIGH');
});
