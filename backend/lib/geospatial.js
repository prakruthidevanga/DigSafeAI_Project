function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculateHaversineDistanceMeters(pointA, pointB) {
  if (!pointA || !pointB) return null;

  const lat1 = Number(pointA.latitude);
  const lng1 = Number(pointA.longitude);
  const lat2 = Number(pointB.latitude);
  const lng2 = Number(pointB.longitude);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;

  const earthRadiusMeters = 6371000;
  const latitudeDelta = ((lat2 - lat1) * Math.PI) / 180;
  const longitudeDelta = ((lng2 - lng1) * Math.PI) / 180;
  const lat1Radians = (lat1 * Math.PI) / 180;
  const lat2Radians = (lat2 * Math.PI) / 180;

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(lat1Radians) * Math.cos(lat2Radians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function isValidCoordinate(longitude, latitude) {
  return validateLongitude(longitude) && validateLatitude(latitude);
}

function toUnitVector(longitude, latitude) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeCosine = Math.cos(latitudeRadians);
  return [
    latitudeCosine * Math.cos(longitudeRadians),
    latitudeCosine * Math.sin(longitudeRadians),
    Math.sin(latitudeRadians),
  ];
}

function dotProduct(vectorA, vectorB) {
  return vectorA[0] * vectorB[0] + vectorA[1] * vectorB[1] + vectorA[2] * vectorB[2];
}

function crossProduct(vectorA, vectorB) {
  return [
    vectorA[1] * vectorB[2] - vectorA[2] * vectorB[1],
    vectorA[2] * vectorB[0] - vectorA[0] * vectorB[2],
    vectorA[0] * vectorB[1] - vectorA[1] * vectorB[0],
  ];
}

function vectorLength(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

function angularDistance(vectorA, vectorB) {
  return Math.atan2(vectorLength(crossProduct(vectorA, vectorB)), dotProduct(vectorA, vectorB));
}

function distanceToSegmentMeters(point, coordinateA, coordinateB) {
  if (
    !Array.isArray(coordinateA)
    || coordinateA.length < 2
    || !Array.isArray(coordinateB)
    || coordinateB.length < 2
  ) return null;

  const [longitudeA, latitudeA] = coordinateA.map(Number);
  const [longitudeB, latitudeB] = coordinateB.map(Number);
  if (!isValidCoordinate(longitudeA, latitudeA) || !isValidCoordinate(longitudeB, latitudeB)) return null;

  const pointVector = toUnitVector(point.longitude, point.latitude);
  const vectorA = toUnitVector(longitudeA, latitudeA);
  const vectorB = toUnitVector(longitudeB, latitudeB);
  const segmentAngle = angularDistance(vectorA, vectorB);
  const normal = crossProduct(vectorA, vectorB);
  const normalLength = vectorLength(normal);

  if (segmentAngle < 1e-12 || normalLength < 1e-12 || Math.PI - segmentAngle < 1e-12) {
    return Math.min(
      calculateHaversineDistanceMeters(point, { latitude: latitudeA, longitude: longitudeA }),
      calculateHaversineDistanceMeters(point, { latitude: latitudeB, longitude: longitudeB }),
    );
  }

  const unitNormal = normal.map(value => value / normalLength);
  const projection = pointVector.map((value, index) => value - dotProduct(pointVector, unitNormal) * unitNormal[index]);
  const projectionLength = vectorLength(projection);
  if (projectionLength < 1e-12) {
    return Math.min(
      calculateHaversineDistanceMeters(point, { latitude: latitudeA, longitude: longitudeA }),
      calculateHaversineDistanceMeters(point, { latitude: latitudeB, longitude: longitudeB }),
    );
  }

  const projectedVector = projection.map(value => value / projectionLength);
  const candidates = [projectedVector, projectedVector.map(value => -value)];
  for (const candidate of candidates) {
    const withinSegment = angularDistance(vectorA, candidate) + angularDistance(candidate, vectorB)
      <= segmentAngle + 1e-10;
    if (withinSegment) {
      return angularDistance(pointVector, candidate) * 6371000;
    }
  }

  return Math.min(
    calculateHaversineDistanceMeters(point, { latitude: latitudeA, longitude: longitudeA }),
    calculateHaversineDistanceMeters(point, { latitude: latitudeB, longitude: longitudeB }),
  );
}

function validateLatitude(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90;
}

function validateLongitude(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180;
}

function validateRadius(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 50000;
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lng ?? point.lon);
  if (!validateLatitude(latitude) || !validateLongitude(longitude)) return null;
  return { latitude, longitude };
}

function getDistanceToGeometry(point, geometry) {
  if (!point || !geometry) return null;

  const geometryType = geometry.type;
  if (geometryType === 'Point') {
    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const [longitude, latitude] = coordinates.map(Number);
    if (!isValidCoordinate(longitude, latitude)) return null;
    return calculateHaversineDistanceMeters(point, { latitude, longitude });
  }

  if (geometryType === 'LineString') {
    const coords = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const distances = coords.slice(1)
      .map((coordinate, index) => distanceToSegmentMeters(point, coords[index], coordinate))
      .filter(Number.isFinite);
    return distances.length ? Math.min(...distances) : null;
  }

  if (geometryType === 'MultiLineString') {
    const segments = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const distances = segments
      .flatMap(segment => Array.isArray(segment)
        ? segment.slice(1).map((coordinate, index) => distanceToSegmentMeters(point, segment[index], coordinate))
        : [])
      .filter(Number.isFinite);
    return distances.length ? Math.min(...distances) : null;
  }

  return null;
}

module.exports = {
  clamp,
  calculateHaversineDistanceMeters,
  validateLatitude,
  validateLongitude,
  validateRadius,
  normalizePoint,
  getDistanceToGeometry,
  distanceToSegmentMeters,
};
