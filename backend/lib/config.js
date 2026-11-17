const DEVELOPMENT_MONGO_URI = 'mongodb://localhost:27017/digsafe';
const DEVELOPMENT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
];

function parsePort(value) {
  if (value === undefined || value === '') return 5000;
  if (!/^\d+$/.test(String(value))) throw new Error('PORT must be a valid integer.');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535.');
  }
  return port;
}

function parseOrigins(value, isProduction) {
  const configuredOrigins = value === undefined
    ? (isProduction ? [] : DEVELOPMENT_CORS_ORIGINS)
    : String(value).split(',').map(origin => origin.trim()).filter(Boolean);
  if (configuredOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one allowed origin.');
  }

  const origins = configuredOrigins.map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain valid HTTP or HTTPS origins.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.origin !== origin
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error('CORS_ORIGINS entries must be exact HTTP or HTTPS origins without paths or credentials.');
    }
    return parsed.origin;
  });

  if (new Set(origins).size !== origins.length) {
    throw new Error('CORS_ORIGINS must not contain duplicate origins.');
  }
  return origins;
}

function getJwtSecret(env = process.env) {
  if (env.NODE_ENV === 'production') {
    if (typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must contain at least 32 characters in production.');
    }
    return env.JWT_SECRET;
  }
  return env.JWT_SECRET || 'digsafe-local-development-secret';
}

function getMongoUri(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const mongoUri = env.MONGO_URI || (isProduction ? '' : DEVELOPMENT_MONGO_URI);
  if (!mongoUri) throw new Error('MONGO_URI must be configured in production.');
  let parsedMongoUri;
  try {
    parsedMongoUri = new URL(mongoUri);
  } catch {
    throw new Error('MONGO_URI must be a valid MongoDB connection URI.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsedMongoUri.protocol) || !parsedMongoUri.hostname) {
    throw new Error('MONGO_URI must use mongodb:// or mongodb+srv://.');
  }
  return mongoUri;
}

function getRuntimeConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const maxRequestSize = env.MAX_REQUEST_SIZE || '10mb';
  if (!/^\d+(?:kb|mb|gb)$/i.test(maxRequestSize)) {
    throw new Error('MAX_REQUEST_SIZE must be a number followed by KB, MB, or GB.');
  }

  return {
    isProduction,
    port: parsePort(env.PORT, isProduction),
    mongoUri: getMongoUri(env),
    jwtSecret: getJwtSecret(env),
    corsOrigins: parseOrigins(env.CORS_ORIGINS, isProduction),
    maxRequestSize,
  };
}

module.exports = {
  DEVELOPMENT_CORS_ORIGINS,
  getJwtSecret,
  getMongoUri,
  getRuntimeConfig,
};
