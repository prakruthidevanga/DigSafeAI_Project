const express = require('express');
const Utility = require('../models/Utility');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  calculateHaversineDistanceMeters,
  getDistanceToGeometry,
  validateLatitude,
  validateLongitude,
} = require('../lib/geospatial');
const { KML_UTILITY_SOURCE, MAX_PROXIMITY_RESULTS, findUtilitiesWithinRadius, parseUtilitySearchInput } = require('../lib/utilityProximity');
const { parseFiniteNumber } = require('../lib/validators');
const { predictUtilityDiameters } = require('../lib/diameterModelPredictor');

const router = express.Router();
router.use(authMiddleware);
const KML_PIPELINE_TYPES = ['water', 'sewerage'];
const KML_GEOMETRY_TYPES = ['LineString', 'MultiLineString'];

function getUtilityDistanceMeters(utility, point) {
  if (!utility || !point) return null;

  if (utility.geometry && utility.geometry.type) {
    const geometryDistance = getDistanceToGeometry(point, utility.geometry);
    if (Number.isFinite(geometryDistance)) return geometryDistance;
  }

  const legacyLatitude = parseFiniteNumber(utility.latitude);
  const legacyLongitude = parseFiniteNumber(utility.longitude);
  if (legacyLatitude !== null && legacyLongitude !== null
    && validateLatitude(legacyLatitude) && validateLongitude(legacyLongitude)) {
    return calculateHaversineDistanceMeters(point, { latitude: legacyLatitude, longitude: legacyLongitude });
  }

  const distance = parseFiniteNumber(utility.distance);
  if (distance !== null && distance >= 0) return distance;

  return null;
}

let summaryCache = null;
let summaryCacheExpiry = 0;
const SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000; // 15-minute in-memory cache

let isKmlDatasetAvailableCache = null;
let kmlAvailabilityExpiry = 0;
const KML_CHECK_TTL_MS = 10 * 60 * 1000; // 10-minute check cache

async function checkKmlDatasetAvailable(sourceQuery) {
  const now = Date.now();
  if (isKmlDatasetAvailableCache !== null && now < kmlAvailabilityExpiry) {
    return isKmlDatasetAvailableCache;
  }
  const count = await Utility.countDocuments(sourceQuery);
  isKmlDatasetAvailableCache = count > 0;
  kmlAvailabilityExpiry = now + KML_CHECK_TTL_MS;
  return isKmlDatasetAvailableCache;
}

function isUtilityTypeAllowed(utilityType, allowedList) {
  if (!allowedList || allowedList.length === 0) return true;
  return allowedList.includes(utilityType); 
}

router.get('/summary', async (req, res) => {
  try {
    const now = Date.now();
    if (summaryCache && now < summaryCacheExpiry) {
      return res.json(summaryCache);
    }

    const groups = await Utility.aggregate([
      {
        $group: {
          _id: {
            utilityType: '$utilityType',
            source: '$source',
            dataSource: '$dataSource',
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          utilityType: '$_id.utilityType',
          source: '$_id.source',
          dataSource: '$_id.dataSource',
          count: 1,
        },
      },
    ]);
    const responsePayload = { groups };
    summaryCache = responsePayload;
    summaryCacheExpiry = now + SUMMARY_CACHE_TTL_MS;
    return res.json(responsePayload);
  } catch (error) {
    console.error('Summary query failed:', error.message);
    return res.status(500).json({ message: 'Unable to load utility summary.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const requestedLimit = Number(req.query.limit ?? 100);

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    const limit = Math.min(requestedLimit, 500);
    const total = await Utility.countDocuments();
    const totalPages = Math.ceil(total / limit);
    const data = page > totalPages
      ? []
      : await Utility.find().sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean();

    return res.json({
      data,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error('Utility list query failed:', error.message);
    return res.status(500).json({ message: 'Unable to load utility data.' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const count = await Utility.countDocuments();
    if (count > 0) {
      return res.json({ message: 'Sample/Demo utility records already exist.' });
    }

    const sampleUtilities = [
      { utilityType: 'electrical', source: 'Sample Demo', dataSource: 'Sample Demo', latitude: 12.9716, longitude: 77.5946, description: 'Demo HT Line', name: 'Demo electrical line', datasetName: 'Sample/Demo dataset' },
      { utilityType: 'water', source: 'Sample Demo', dataSource: 'Sample Demo', latitude: 12.9720, longitude: 77.5950, description: 'Demo water main', name: 'Demo water line', datasetName: 'Sample/Demo dataset' },
      { utilityType: 'sewerage', source: 'Sample Demo', dataSource: 'Sample Demo', latitude: 12.9710, longitude: 77.5940, description: 'Demo sewer line', name: 'Demo sewer line', datasetName: 'Sample/Demo dataset' },
      { utilityType: 'electrical', source: 'Sample Demo', dataSource: 'Sample Demo', latitude: 12.9699, longitude: 77.5980, description: 'Demo LT Line', name: 'Demo electrical spur', datasetName: 'Sample/Demo dataset' },
      { utilityType: 'manhole', source: 'Sample Demo', dataSource: 'Sample Demo', latitude: 12.9718, longitude: 77.5948, description: 'Demo manhole', name: 'Demo manhole', datasetName: 'Sample/Demo dataset' },
    ];

    await Utility.insertMany(sampleUtilities);
    return res.json({ message: 'Sample/Demo utility records added to the database.' });
  } catch (error) {
    console.error('Seed utility records failed:', error.message);
    return res.status(500).json({ message: 'Unable to load sample utility data.' });
  }
});

router.get('/nearby', async (req, res) => {
  try {
    const search = parseUtilitySearchInput(req.query);
    if (search.error) {
      return res.status(400).json({ message: search.error });
    }
    const { point, radius } = search;
    const requestedTypes = typeof req.query.type === 'string' ? req.query.type.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) : [];

    const latitudeBuffer = radius / 111320;
    const longitudeBuffer = radius / (111320 * Math.cos((point.latitude * Math.PI) / 180));

    const pointQuery = {
      latitude: { $gte: point.latitude - latitudeBuffer, $lte: point.latitude + latitudeBuffer },
      longitude: { $gte: point.longitude - longitudeBuffer, $lte: point.longitude + longitudeBuffer },
    };
    if (requestedTypes.length > 0) pointQuery.utilityType = { $in: requestedTypes };

    const pointRecords = await Utility.find(pointQuery).lean();
    const geometryQuery = {
      geometry: {
        $geoWithin: {
          $centerSphere: [[point.longitude, point.latitude], radius / 6371000],
        },
      },
    };
    if (requestedTypes.length > 0) geometryQuery.utilityType = { $in: requestedTypes };

    const geometryRecords = await Utility.find(geometryQuery).lean();

    const combined = [...pointRecords, ...geometryRecords];
    const uniqueById = new Map();

    for (const utility of combined) {
      const key = String(utility._id);
      if (uniqueById.has(key)) continue;

      const distanceMeters = getUtilityDistanceMeters(utility, point);
      if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters > radius) continue;
      if (requestedTypes.length > 0 && !isUtilityTypeAllowed(utility.utilityType, requestedTypes)) continue;

      uniqueById.set(key, {
        ...utility,
        distance: Number(distanceMeters.toFixed(1)),
      });
    }

    const sortedResults = [...uniqueById.values()].sort((left, right) => left.distance - right.distance);
    return res.json(sortedResults);
  } catch (error) {
    console.error('Nearby utility query failed:', error.message);
    return res.status(500).json({ message: 'Unable to fetch nearby utility records.' });
  }
});

router.get('/proximity', async (req, res) => {
  try {
    const search = parseUtilitySearchInput(req.query);
    if (search.error) {
      return res.status(400).json({ status: 'INVALID_INPUT', message: search.error });
    }
    const { point, radius } = search;
    const sourceQuery = { dataSource: KML_UTILITY_SOURCE, utilityType: { $in: KML_PIPELINE_TYPES } };
    const hasDataset = await checkKmlDatasetAvailable(sourceQuery);
    if (!hasDataset) {
      return res.json({
        status: 'DATASET_NOT_IMPORTED',
        source: KML_UTILITY_SOURCE,
        utilities: [],
        truncated: false,
        message: 'The mapped BWSSB KML utility records are not available in the database. Import the project datasets to enable proximity lookup.',
        limitation: 'No utility match cannot be determined because the mapped dataset is unavailable.',
      });
    }

    const candidates = await Utility.find({
      ...sourceQuery,
      'geometry.type': { $in: KML_GEOMETRY_TYPES },
      geometry: {
        $near: {
          $geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
          $maxDistance: radius,
        },
      },
    }).limit(MAX_PROXIMITY_RESULTS + 1).lean();

    const truncated = candidates.length > MAX_PROXIMITY_RESULTS;
    const utilities = findUtilitiesWithinRadius(candidates, point, radius, MAX_PROXIMITY_RESULTS);
    const hasMatches = utilities.length > 0;

    // Optional AI diameter enrichment for utilities that lack a recorded diameter
    if (hasMatches) {
      try {
        const recordsToPredict = utilities.map((u) => ({
          ...u,
          geometry: u.geometry,
          source_file: u.sourceFile,
          MaterialID: u.materialId,
          Status: u.status,
          SSID: u.ssid,
        }));
        const diameterResult = await predictUtilityDiameters(recordsToPredict);
        if (diameterResult && Array.isArray(diameterResult.predictions)) {
          utilities.forEach((u, idx) => {
            const pred = diameterResult.predictions[idx];
            const hasRecordedDiameter = Number.isFinite(u.diameter) && u.diameter > 0;
            u.recordedDiameter = hasRecordedDiameter ? u.diameter : null;

            if (!hasRecordedDiameter && pred && Number.isFinite(pred.predictedDiameterMm)) {
              // Only populate AI estimated diameter when recorded diameter is missing
              u.estimatedDiameter = pred.predictedDiameterMm;
              u.diameterModel = pred.model;
              u.diameterEstimationType = 'AI_ESTIMATED';
              u.diameterModelMaeMm = pred.maeMm;
              u.diameterModelR2 = pred.r2Score;
            } else if (hasRecordedDiameter) {
              // Recorded diameter exists: keep recorded value only; do not replace or mix with estimation
              u.estimatedDiameter = null;
              u.diameterEstimationType = 'RECORDED_ONLY';
            } else {
              u.estimatedDiameter = null;
              u.diameterEstimationType = 'UNAVAILABLE';
            }
          });
        }
      } catch (err) {
        console.warn('Diameter enrichment skipped:', err.message);
        utilities.forEach((u) => {
          const hasRecorded = Number.isFinite(u.diameter) && u.diameter > 0;
          u.recordedDiameter = hasRecorded ? u.diameter : null;
          u.estimatedDiameter = null;
          u.diameterEstimationType = hasRecorded ? 'RECORDED_ONLY' : 'UNAVAILABLE';
        });
      }
    }

    return res.json({
      status: hasMatches ? 'MATCHES_FOUND' : 'NO_MATCHES_IN_AVAILABLE_DATA',
      source: KML_UTILITY_SOURCE,
      utilities,
      truncated,
      message: hasMatches
        ? 'Mapped utility lines were found in the available dataset.'
        : 'No mapped utility lines were found within this radius in the available dataset.',
      limitation: 'Dataset coverage may be incomplete. No match does not confirm that no underground utility exists. Pipe depth is not available in these records.',
    });
  } catch (error) {
    console.error('Utility proximity query failed:', error.message);
    return res.status(500).json({
      status: 'PROXIMITY_UNAVAILABLE',
      message: 'Unable to search mapped utility records.',
    });
  }
});

/**
 * Dedicated endpoint for predicting utility diameters from raw feature data
 */
router.post('/predict-diameter', async (req, res) => {
  try {
    const { features } = req.body;
    if (!Array.isArray(features) || features.length === 0) {
      return res.status(400).json({
        status: 'INVALID_INPUT',
        message: "'features' must be a non-empty array of utility objects.",
      });
    }

    const result = await predictUtilityDiameters(features);
    return res.json(result);
  } catch (error) {
    console.error('Diameter prediction endpoint failed:', error.message);
    return res.status(503).json({
      status: 'INFERENCE_UNAVAILABLE',
      message: error.message || 'Unable to predict utility diameters.',
    });
  }
});

module.exports = router;
