const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { getRuntimeConfig } = require('./lib/config');

dotenv.config();

function getHealthStatus(readyState, uptimeSeconds = Math.round(process.uptime()), timestamp = new Date().toISOString()) {
  const databaseConnected = readyState === 1;
  return {
    status: databaseConnected ? 'ok' : 'degraded',
    application: 'ok',
    database: databaseConnected ? 'connected' : 'disconnected',
    uptimeSeconds,
    timestamp,
  };
}

function createErrorHandler(isProduction) {
  return (error, req, res, next) => {
    if (error && error.type === 'entity.parse.failed') {
      return res.status(400).json({ status: 'INVALID_INPUT', message: 'Request body must contain valid JSON.' });
    }
    if (error && error.type === 'entity.too.large') {
      return res.status(413).json({ status: 'INVALID_INPUT', message: 'Request body exceeds the allowed size.' });
    }
    if (error && error.code === 'CORS_ORIGIN_NOT_ALLOWED') {
      return res.status(403).json({ message: 'Request origin is not allowed.' });
    }
    if (error && error.name === 'UnauthorizedError') {
      return res.status(401).json({ message: 'Invalid or expired authentication token' });
    }
    if (isProduction) {
      console.error('Unhandled request error.');
    } else {
      console.error('Unhandled error:', error);
    }
    return res.status(500).json({ message: 'Internal server error' });
  };
}

function createApp(config = getRuntimeConfig(), mongoConnection = mongoose.connection) {
  const app = express();

  app.use(cors({
    origin: function originMatches(requestOrigin, callback) {
      if (!requestOrigin) return callback(null, true);
      // Allow exact match or any vercel.app preview deployment
      if (
        config.corsOrigins.includes(requestOrigin) ||
        requestOrigin.endsWith('.vercel.app') ||
        requestOrigin.includes('localhost')
      ) {
        return callback(null, true);
      }
      const error = new Error('CORS origin not allowed');
      error.code = 'CORS_ORIGIN_NOT_ALLOWED';
      return callback(error);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: config.maxRequestSize }));
  app.use(express.urlencoded({ extended: true, limit: config.maxRequestSize }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again later.' },
  });
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => {
    const health = getHealthStatus(mongoConnection.readyState);
    return res.status(health.status === 'ok' ? 200 : 503).json(health);
  });

  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/utilities', require('./routes/utilityRoutes'));
  app.use('/api/simulation', require('./routes/simulationRoutes'));
  app.use('/api/risk', require('./routes/riskRoutes'));
  app.use('/api/models', require('./routes/modelRoutes'));
  app.use('/api/reports', require('./routes/reportRoutes'));

  app.use(createErrorHandler(config.isProduction));

  return app;
}

async function startServer(config = getRuntimeConfig(), connect = (...args) => mongoose.connect(...args)) {
  try {
    await connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.');
  } catch (error) {
    if (config.isProduction) {
      console.error('MongoDB connection failed; production server was not started.');
      throw new Error('Production startup requires a reachable MongoDB database.');
    }
    console.error('MongoDB connection failed; check the configured development database.');
    console.warn('Application will start in degraded mode; database-backed operations will fail until MongoDB is reachable.');
  }

  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`DigSafe AI server running on port ${config.port}${mongoose.connection.readyState === 1 ? '' : ' in degraded mode'}`);
  });
  return server;
}

const shutdown = async (signal) => {
  console.log(`Received ${signal}; shutting down gracefully.`);
  await mongoose.disconnect();
  process.exit(0);
};

if (require.main === module) {
  let config;
  try {
    config = getRuntimeConfig();
  } catch (error) {
    console.error(`Startup configuration error: ${error.message}`);
    process.exitCode = 1;
  }

  if (config) {
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    startServer(config).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { createApp, createErrorHandler, getHealthStatus, startServer };
