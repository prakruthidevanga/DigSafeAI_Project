const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const RiskResult = require('../models/RiskResult');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const reportRoutes = require('../routes/reportRoutes');

test('report endpoints paginate and scope list, summary, view, and delete by authenticated user', async (t) => {
  const originals = {
    countDocuments: RiskResult.countDocuments,
    find: RiskResult.find,
    findOne: RiskResult.findOne,
    findOneAndDelete: RiskResult.findOneAndDelete,
  };
  const requestedFilters = [];
  let requestedSkip;
  let requestedLimit;
  const pageReports = [{ _id: 'report-26', location: 'Whitefield' }];

  RiskResult.countDocuments = async (filter) => {
    requestedFilters.push(filter);
    return filter.riskLevel === 'HIGH' ? 4 : 51;
  };
  RiskResult.find = (filter) => {
    requestedFilters.push(filter);
    return {
      sort() { return this; },
      skip(value) { requestedSkip = value; return this; },
      limit(value) { requestedLimit = value; return this; },
      lean: async () => pageReports,
    };
  };
  RiskResult.findOne = async (filter) => {
    requestedFilters.push(filter);
    return null;
  };
  RiskResult.findOneAndDelete = async (filter) => {
    requestedFilters.push(filter);
    return null;
  };

  t.after(() => {
    RiskResult.countDocuments = originals.countDocuments;
    RiskResult.find = originals.find;
    RiskResult.findOne = originals.findOne;
    RiskResult.findOneAndDelete = originals.findOneAndDelete;
  });

  const app = express();
  app.use('/api/reports', reportRoutes);
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/reports`;
  const userId = '507f1f77bcf86cd799439011';
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
  const headers = { Authorization: `Bearer ${token}` };

  const unauthorized = await fetch(`${baseUrl}?page=2`);
  assert.equal(unauthorized.status, 401);
  assert.equal((await fetch(`${baseUrl}/summary`)).status, 401);

  const invalidPage = await fetch(`${baseUrl}?page=2x`, { headers });
  assert.equal(invalidPage.status, 400);
  const invalidLimit = await fetch(`${baseUrl}?limit=201`, { headers });
  assert.equal(invalidLimit.status, 400);

  const listingResponse = await fetch(`${baseUrl}?page=2&limit=25`, { headers });
  assert.equal(listingResponse.status, 200);
  const listing = await listingResponse.json();
  assert.deepEqual(listing.data, pageReports);
  assert.deepEqual(listing.pagination, { page: 2, limit: 25, total: 51, totalPages: 3 });
  assert.equal(requestedSkip, 25);
  assert.equal(requestedLimit, 25);
  assert.deepEqual(requestedFilters[requestedFilters.length - 1], { userId });

  const summaryResponse = await fetch(`${baseUrl}/summary`, { headers });
  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(await summaryResponse.json(), { totalReports: 51, historicalHighRiskReports: 4 });
  assert.deepEqual(requestedFilters.slice(-2), [
    { userId },
    { userId, riskLevel: 'HIGH' },
  ]);

  const reportId = '507f1f77bcf86cd799439012';
  const viewResponse = await fetch(`${baseUrl}/${reportId}`, { headers });
  assert.equal(viewResponse.status, 404);
  assert.deepEqual(requestedFilters[requestedFilters.length - 1], { _id: reportId, userId });

  const deleteResponse = await fetch(`${baseUrl}/${reportId}`, { method: 'DELETE', headers });
  assert.equal(deleteResponse.status, 404);
  assert.deepEqual(requestedFilters[requestedFilters.length - 1], { _id: reportId, userId });
});
