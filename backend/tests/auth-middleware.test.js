const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/authMiddleware');

function invokeMiddleware(authorization) {
  const req = { headers: { authorization } };
  let statusCode = 200;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, responseBody, nextCalled };
}

test('auth middleware rejects missing and malformed bearer tokens', () => {
  const missing = invokeMiddleware(undefined);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.nextCalled, false);

  const malformed = invokeMiddleware('Bearer not-a-jwt');
  assert.equal(malformed.statusCode, 401);
  assert.equal(malformed.responseBody.message, 'Invalid or expired authentication token');
  assert.equal(malformed.nextCalled, false);
});

test('auth middleware rejects expired JWTs', () => {
  const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' });
  const result = invokeMiddleware(`Bearer ${token}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.responseBody.message, 'Invalid or expired authentication token');
  assert.equal(result.nextCalled, false);
});

test('auth middleware accepts a valid JWT and exposes its user ID', () => {
  const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
  const result = invokeMiddleware(`Bearer ${token}`);

  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.user, { id: 'user-123' });
});

test('auth middleware rejects tokens without a string user ID', () => {
  const token = jwt.sign({ userId: { value: 'user-123' } }, JWT_SECRET, { expiresIn: '1h' });
  const result = invokeMiddleware(`Bearer ${token}`);

  assert.equal(result.statusCode, 401);
  assert.equal(result.responseBody.message, 'Invalid authentication payload');
  assert.equal(result.nextCalled, false);
});
