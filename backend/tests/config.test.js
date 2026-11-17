const test = require('node:test');
const assert = require('node:assert/strict');
const { DEVELOPMENT_CORS_ORIGINS, getMongoUri, getRuntimeConfig } = require('../lib/config');

test('development configuration preserves localhost defaults', () => {
  const config = getRuntimeConfig({ NODE_ENV: 'development' });

  assert.equal(config.port, 5000);
  assert.equal(config.mongoUri, 'mongodb://localhost:27017/digsafe');
  assert.deepEqual(config.corsOrigins, DEVELOPMENT_CORS_ORIGINS);
  assert.equal(config.maxRequestSize, '10mb');
});

test('production configuration requires MongoDB, a strong JWT secret, and explicit exact CORS origins', () => {
  const base = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb+srv://example.invalid/digsafe',
    JWT_SECRET: 'a-secure-random-secret-with-at-least-32-chars',
    CORS_ORIGINS: 'https://app.example.com',
  };

  assert.deepEqual(getRuntimeConfig(base).corsOrigins, ['https://app.example.com']);
  assert.throws(() => getRuntimeConfig({ ...base, MONGO_URI: '' }), /MONGO_URI/);
  assert.throws(() => getRuntimeConfig({ ...base, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => getRuntimeConfig({ ...base, CORS_ORIGINS: '' }), /CORS_ORIGINS/);
  assert.throws(() => getRuntimeConfig({ ...base, CORS_ORIGINS: '*' }), /CORS_ORIGINS/);
  assert.throws(() => getRuntimeConfig({ ...base, CORS_ORIGINS: 'https://app.example.com/path' }), /exact HTTP or HTTPS origins/);
});

test('dataset connection configuration does not fall back to localhost in production', () => {
  assert.throws(() => getMongoUri({ NODE_ENV: 'production' }), /MONGO_URI/);
  assert.equal(getMongoUri({ NODE_ENV: 'development' }), 'mongodb://localhost:27017/digsafe');
});

test('configuration rejects malformed ports, Mongo URIs, and request-size limits', () => {
  const base = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://localhost:27017/digsafe',
    JWT_SECRET: 'a-secure-random-secret-with-at-least-32-chars',
    CORS_ORIGINS: 'https://app.example.com',
  };

  assert.throws(() => getRuntimeConfig({ ...base, PORT: '5000x' }), /PORT/);
  assert.throws(() => getRuntimeConfig({ ...base, PORT: '65536' }), /PORT/);
  assert.throws(() => getRuntimeConfig({ ...base, MONGO_URI: 'https://db.example.com' }), /MONGO_URI/);
  assert.throws(() => getRuntimeConfig({ ...base, MAX_REQUEST_SIZE: 'unlimited' }), /MAX_REQUEST_SIZE/);
});
