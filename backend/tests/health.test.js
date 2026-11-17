const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createApp, createErrorHandler, getHealthStatus, startServer } = require('../server');

const config = {
  isProduction: true,
  corsOrigins: ['https://app.example.com'],
  maxRequestSize: '10mb',
};

test('health status distinguishes application readiness from database connectivity', () => {
  assert.deepEqual(
    getHealthStatus(1, 12, '2026-10-23T00:00:00.000Z'),
    {
      status: 'ok',
      application: 'ok',
      database: 'connected',
      uptimeSeconds: 12,
      timestamp: '2026-10-23T00:00:00.000Z',
    },
  );
  assert.equal(getHealthStatus(0).status, 'degraded');
  assert.equal(getHealthStatus(0).application, 'ok');
  assert.equal(getHealthStatus(0).database, 'disconnected');
});

test('health endpoint returns connection status without a URI', async (t) => {
  const app = createApp(config, { readyState: 0 });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.application, 'ok');
  assert.equal(body.database, 'disconnected');
  assert.equal(body.mongoUri, undefined);
});

test('health endpoint returns HTTP 200 when MongoDB is connected', async (t) => {
  const app = createApp(config, { readyState: 1 });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.application, 'ok');
  assert.equal(body.database, 'connected');
});

test('CORS allows only the configured production origin', async (t) => {
  const app = createApp(config, { readyState: 1 });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const url = `http://127.0.0.1:${server.address().port}/health`;

  const allowed = await fetch(url, { headers: { Origin: 'https://app.example.com' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example.com');

  const denied = await fetch(url, { headers: { Origin: 'https://other.example.com' } });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { message: 'Request origin is not allowed.' });
});

test('production error responses do not expose internal error messages or stack traces', () => {
  const handler = createErrorHandler(true);
  let responseStatus;
  let responseBody;
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    handler(new Error('secret-value C:\\private\\database.pem'), {}, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(responseStatus, 500);
  assert.deepEqual(responseBody, { message: 'Internal server error' });
  assert.doesNotMatch(JSON.stringify(responseBody), /secret-value|database\.pem|stack/i);
});

test('production server startup fails safely when MongoDB cannot be reached', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      startServer({
        ...config,
        mongoUri: 'mongodb://db.example.invalid/digsafe',
      }, async () => {
        throw new Error('private connection details');
      }),
      /reachable MongoDB database/,
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('malformed JSON receives a safe client error instead of an internal error', async (t) => {
  const app = createApp(config, { readyState: 1 });
  app.post('/invalid-json', express.json(), (req, res) => res.json({ ok: true }));
  app.use(createErrorHandler(true));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/invalid-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    status: 'INVALID_INPUT',
    message: 'Request body must contain valid JSON.',
  });
});
