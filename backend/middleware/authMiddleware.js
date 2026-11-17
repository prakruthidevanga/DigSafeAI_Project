const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/config');
const JWT_SECRET = getJwtSecret();

function authMiddleware(req, res, next) {
  const authorizationHeader = req.headers.authorization || '';
  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || typeof payload.userId !== 'string' || !payload.userId) {
      return res.status(401).json({ message: 'Invalid authentication payload' });
    }
    req.user = { id: payload.userId };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authentication token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
