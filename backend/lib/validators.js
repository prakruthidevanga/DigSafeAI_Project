function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function requireString(value, fieldName, minLength = 1) {
  if (typeof value !== 'string') return `${fieldName} is required.`;
  const trimmed = value.trim();
  if (trimmed.length < minLength) return `${fieldName} must be at least ${minLength} characters.`;
  return null;
}

function parseFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = {
  normalizeEmail,
  normalizeName,
  requireString,
  parseFiniteNumber,
};
