const {
  getDistanceToGeometry,
  validateLatitude,
  validateLongitude,
  validateRadius,
} = require('./geospatial');
const { parseFiniteNumber } = require('./validators');

const MAX_PROXIMITY_RESULTS = 500;
const KML_UTILITY_SOURCE = 'OpenCity / BWSSB';

function parseUtilitySearchInput(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return { error: 'Search parameters must be an object.' };
  }
  const { lat, lng, radius } = query;
  const latitude = parseFiniteNumber(lat);
  const longitude = parseFiniteNumber(lng);
  const parsedRadius = parseFiniteNumber(radius);

  if (latitude === null || longitude === null || parsedRadius === null) {
    return { error: 'Latitude, longitude, and radius must be valid numbers.' };
  }
  if (!validateLatitude(latitude) || !validateLongitude(longitude)) {
    return { error: 'Latitude and longitude must be valid geographic coordinates.' };
  }
  if (!validateRadius(parsedRadius)) {
    return { error: 'Radius must be greater than 0 and no more than 50000 meters.' };
  }

  return {
    point: { latitude, longitude },
    radius: parsedRadius,
    error: null,
  };
}

function findUtilitiesWithinRadius(records, point, radius, limit = MAX_PROXIMITY_RESULTS) {
  return records
    .map((utility) => {
      const distance = getDistanceToGeometry(point, utility.geometry);
      if (!Number.isFinite(distance) || distance > radius) return null;

      return {
        _id: utility._id,
        utilityType: utility.utilityType,
        source: utility.source,
        datasetName: utility.datasetName,
        sourceFile: utility.sourceFile,
        recordId: utility.recordId,
        dataSource: utility.dataSource,
        name: utility.name,
        geometry: utility.geometry,
        attributes: utility.attributes && typeof utility.attributes === 'object'
          ? utility.attributes
          : {},
        distance: Number(distance.toFixed(1)),
        distanceMeters: distance,
      };
    })
    .filter(Boolean)
    .sort((utilityA, utilityB) => utilityA.distanceMeters - utilityB.distanceMeters)
    .slice(0, limit)
    .map(({ distanceMeters, ...utility }) => utility);
}

module.exports = {
  KML_UTILITY_SOURCE,
  MAX_PROXIMITY_RESULTS,
  parseUtilitySearchInput,
  findUtilitiesWithinRadius,
};
