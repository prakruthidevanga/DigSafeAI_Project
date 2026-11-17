const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const utilityRoutes = require('../routes/utilityRoutes');
const riskRoutes = require('../routes/riskRoutes');

test('utility endpoints require authentication and risk analysis abstains without matched utility context', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/utilities', utilityRoutes);
  app.use('/api/risk', riskRoutes);
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ userId: 'test-user' }, JWT_SECRET, { expiresIn: '1h' });
  const authorizedHeaders = { Authorization: `Bearer ${token}` };

  const unauthorizedRead = await fetch(`${baseUrl}/utilities/summary`);
  assert.equal(unauthorizedRead.status, 401);
  const unauthorizedWrite = await fetch(`${baseUrl}/utilities/seed`, { method: 'POST' });
  assert.equal(unauthorizedWrite.status, 401);
  const unauthorizedRisk = await fetch(`${baseUrl}/risk/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(unauthorizedRisk.status, 401);

  const malformedSearch = await fetch(`${baseUrl}/utilities/proximity?lat=&lng=77.5&radius=-1`, {
    headers: authorizedHeaders,
  });
  assert.equal(malformedSearch.status, 400);
  assert.equal((await malformedSearch.json()).status, 'INVALID_INPUT');

  const validRiskInputWithoutUtilities = await fetch(`${baseUrl}/risk/analyze`, {
    method: 'POST',
    headers: { ...authorizedHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Whitefield',
      latitude: 12.9,
      longitude: 77.5,
      depth: 2,
      radius: 10,
      utilities: [],
      utilityDataStatus: 'NO_MATCHES_IN_AVAILABLE_DATA',
    }),
  });
  assert.equal(validRiskInputWithoutUtilities.status, 200);
  const riskResponse = await validRiskInputWithoutUtilities.json();
  assert.equal(riskResponse.status, 'ASSESSMENT_AVAILABLE_WITHOUT_ML');
  assert.equal(riskResponse.riskPrediction, null);
  assert.equal(riskResponse.mlAssessmentUnavailable, true);
  assert.ok(riskResponse.hazardAssessment);
  assert.equal(riskResponse.finalRiskLevel, riskResponse.hazardAssessment.riskLevel);

  const invalidRiskInput = await fetch(`${baseUrl}/risk/analyze`, {
    method: 'POST',
    headers: { ...authorizedHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Whitefield',
      latitude: 12.9,
      longitude: 77.5,
      depth: 2,
      radius: 10,
      utilities: [{ utilityType: 'water', distance: -1 }],
    }),
  });
  assert.equal(invalidRiskInput.status, 400);
});
