const { validateLatitude, validateLongitude, validateRadius } = require('./geospatial');
const { parseFiniteNumber } = require('./validators');

function validateRiskAssessmentInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'Request body must be a JSON object.';
  }
  const { location, latitude, longitude, depth, radius, utilities, sensors } = input;
  const parsedLatitude = parseFiniteNumber(latitude);
  const parsedLongitude = parseFiniteNumber(longitude);
  const parsedDepth = parseFiniteNumber(depth);
  const parsedRadius = parseFiniteNumber(radius);

  if (typeof location !== 'string' || location.trim().length < 2) {
    return 'A location name is required.';
  }
  if (parsedLatitude === null || parsedLongitude === null
    || !validateLatitude(parsedLatitude) || !validateLongitude(parsedLongitude)) {
    return 'Latitude and longitude must be valid geographic coordinates.';
  }
  if (parsedDepth === null || parsedDepth <= 0) {
    return 'Excavation depth must be a valid number greater than 0 meters.';
  }
  if (parsedRadius === null || !validateRadius(parsedRadius)) {
    return 'Radius must be greater than 0 and no more than 50000 meters.';
  }
  if (!Array.isArray(utilities)) {
    return 'Utility data must be an array.';
  }
  for (const utility of utilities) {
    if (!utility || typeof utility !== 'object' || Array.isArray(utility)) {
      return 'Each utility record must be an object.';
    }
    if (typeof utility.utilityType !== 'string' || !utility.utilityType.trim()) {
      return 'Each utility record must include a utility type.';
    }
    const distance = parseFiniteNumber(utility.distance);
    if (distance === null || distance < 0) {
      return 'Each utility record must include a valid non-negative distance in meters.';
    }
  }
  if (sensors !== undefined && sensors !== null && (typeof sensors !== 'object' || Array.isArray(sensors))) {
    return 'Sensor readings must be provided as an object.';
  }
  if (sensors) {
    const supportedFields = new Set([
      'vibration',
      'acousticLevel',
      'soilCondition',
      'soilMoisture',
      'gasReading',
      'soilTemperature',
      'groundMovement',
      'ground_movement_mm',
      'source',
      'dataSource',
    ]);
    for (const [field, value] of Object.entries(sensors)) {
      if (!supportedFields.has(field)) return `Unsupported sensor field: ${field}.`;
      if (field === 'source' || field === 'dataSource') {
        if (typeof value !== 'string') return `Sensor ${field} must be a string.`;
      } else if (field === 'soilTemperature') {
        const tempValue = parseFiniteNumber(value);
        if (tempValue === null || tempValue < -50 || tempValue > 100) {
          return 'Sensor soilTemperature must be a realistic temperature value.';
        }
      } else if (field === 'groundMovement' || field === 'ground_movement_mm') {
        const movementValue = parseFiniteNumber(value);
        if (movementValue === null || movementValue < 0 || movementValue > 500) {
          return `Sensor ${field} must be a non-negative number in millimeters.`;
        }
      } else {
        const normalizedValue = parseFiniteNumber(value);
        if (normalizedValue === null || normalizedValue < 0 || normalizedValue > 1) {
          return `Sensor ${field} must be a normalized value between 0 and 1.`;
        }
      }
    }
  }

  return null;
}

module.exports = { validateRiskAssessmentInput };
