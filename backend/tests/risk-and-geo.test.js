const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateHaversineDistanceMeters,
  getDistanceToGeometry,
  validateLatitude,
  validateLongitude,
} = require('../lib/geospatial');
const { validateRiskAssessmentInput } = require('../lib/riskScreening');
const { normalizeEmail, normalizeName } = require('../lib/validators');
const { artifactExists, getModelStatus } = require('../lib/modelRegistry');
const { getImageInferenceUnavailableStatus } = require('../lib/modelInference');
const { MAX_IMAGE_SIZE_BYTES, validateImageFile } = require('../lib/imageValidation');
const { findUtilitiesWithinRadius, parseUtilitySearchInput } = require('../lib/utilityProximity');

test('calculateHaversineDistanceMeters returns expected distance for known coordinates', () => {
  const pointA = { latitude: 12.9716, longitude: 77.5946 };
  const pointB = { latitude: 12.9726, longitude: 77.5956 };

  const distance = calculateHaversineDistanceMeters(pointA, pointB);
  assert.ok(Number.isFinite(distance));
  assert.ok(distance > 0);
  assert.ok(distance < 500);
});

test('validateLatitude and validateLongitude reject invalid coordinates', () => {
  assert.equal(validateLatitude(90), true);
  assert.equal(validateLatitude(91), false);
  assert.equal(validateLongitude(180), true);
  assert.equal(validateLongitude(-181), false);
});

test('line distance measures the nearest point on a segment, not only its vertices', () => {
  const distance = getDistanceToGeometry(
    { latitude: 1, longitude: 0.5 },
    { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
  );

  assert.ok(Math.abs(distance - 111194.9) < 2);
});

test('KML and GeoJSON coordinates are interpreted as longitude then latitude', () => {
  const distance = getDistanceToGeometry(
    { latitude: 12.9716, longitude: 77.5946 },
    { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.595, 12.9716]] },
  );

  assert.ok(distance < 0.01);
  assert.equal(getDistanceToGeometry(
    { latitude: 12.9716, longitude: 77.5946 },
    { type: 'LineString', coordinates: [[200, 95], [201, 96]] },
  ), null);
});

test('MultiLineString distance finds the closest constituent pipeline segment', () => {
  const distance = getDistanceToGeometry(
    { latitude: 12.9, longitude: 77.55 },
    { type: 'MultiLineString', coordinates: [[[77.5, 12.9], [77.6, 12.9]], [[77.7, 12.9], [77.8, 12.9]]] },
  );

  assert.ok(distance < 1);
});

test('proximity results include the radius boundary and exclude records beyond it', () => {
  const point = { latitude: 0, longitude: 0.5 };
  const utility = {
    utilityType: 'water',
    source: 'BWSSB',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
  };
  const exactDistance = getDistanceToGeometry(point, utility.geometry);

  assert.equal(findUtilitiesWithinRadius([utility], point, exactDistance).length, 1);
  assert.equal(findUtilitiesWithinRadius([utility], point, exactDistance - 0.01).length, 0);
});

test('proximity results preserve source and available attributes while representing missing attributes', () => {
  const [match] = findUtilitiesWithinRadius([{
    utilityType: 'sewerage',
    source: 'BWSSB',
    sourceFile: 'sewer.kml',
    dataSource: 'OpenCity / BWSSB',
    geometry: { type: 'LineString', coordinates: [[77.5, 12.9], [77.6, 12.9]] },
  }], { latitude: 12.9, longitude: 77.55 }, 100);

  assert.equal(match.utilityType, 'sewerage');
  assert.equal(match.sourceFile, 'sewer.kml');
  assert.equal(match.dataSource, 'OpenCity / BWSSB');
  assert.deepEqual(match.attributes, {});
  assert.ok(match.distance < 1);
});

test('proximity lookup returns an empty list when the available geometry has no match', () => {
  assert.deepEqual(findUtilitiesWithinRadius([], { latitude: 12.9, longitude: 77.5 }, 25), []);
});

test('utility search input rejects malformed, out-of-range, and unsupported radii', () => {
  assert.match(parseUtilitySearchInput({ lat: '', lng: '77.5', radius: '10' }).error, /valid numbers/);
  assert.match(parseUtilitySearchInput({ lat: '91', lng: '77.5', radius: '10' }).error, /geographic coordinates/);
  assert.match(parseUtilitySearchInput({ lat: '12.9', lng: '77.5', radius: '-1' }).error, /Radius/);
  assert.match(parseUtilitySearchInput({ lat: '12.9', lng: '77.5', radius: '50001' }).error, /Radius/);
  assert.match(parseUtilitySearchInput({ lat: ['12.9'], lng: '77.5', radius: '10' }).error, /valid numbers/);
  assert.deepEqual(parseUtilitySearchInput({ lat: '12.9', lng: '77.5', radius: '10' }), {
    point: { latitude: 12.9, longitude: 77.5 },
    radius: 10,
    error: null,
  });
});

test('normalizeEmail and normalizeName trim and lowercase values', () => {
  assert.equal(normalizeEmail(' USER@Example.com '), 'user@example.com');
  assert.equal(normalizeName('  Alice Smith  '), 'Alice Smith');
});

test('risk assessment input rejects invalid values without producing a score', () => {
  const invalid = validateRiskAssessmentInput({
    location: 'Whitefield',
    latitude: 12.9,
    longitude: 77.5,
    depth: 0,
    radius: 10,
    utilities: [],
  });
  assert.match(invalid, /depth/);
});

test('valid risk input passes structural validation', () => {
  assert.equal(validateRiskAssessmentInput({
    location: 'Whitefield',
    latitude: 12.9,
    longitude: 77.5,
    depth: 2,
    radius: 10,
    utilities: [],
    sensors: { vibration: 0.5 },
  }), null);
});

test('risk assessment input rejects malformed numbers and negative utility distances', () => {
  const base = {
    location: 'Whitefield',
    latitude: 12.9,
    longitude: 77.5,
    depth: 2,
    radius: 10,
    utilities: [],
  };
  assert.match(validateRiskAssessmentInput({ ...base, latitude: null }), /coordinates/);
  assert.match(validateRiskAssessmentInput({ ...base, depth: '2m' }), /depth/);
  assert.match(validateRiskAssessmentInput({ ...base, radius: 50001 }), /Radius/);
  assert.match(validateRiskAssessmentInput({
    ...base,
    utilities: [{ utilityType: 'water', distance: -0.1 }],
  }), /non-negative distance/);
  assert.match(validateRiskAssessmentInput({ ...base, utilities: [null] }), /utility record/);
  assert.match(validateRiskAssessmentInput(null), /JSON object/);
});

test('risk input rejects unsupported sensor features and out-of-range normalized values', () => {
  const base = {
    location: 'Whitefield',
    latitude: 12.9,
    longitude: 77.5,
    depth: 2,
    radius: 10,
    utilities: [],
  };
  assert.match(validateRiskAssessmentInput({ ...base, sensors: { vibrationFrequency: 42 } }), /Unsupported sensor field/);
  assert.match(validateRiskAssessmentInput({ ...base, sensors: { vibration: 1.2 } }), /normalized value/);
});

test('risk model status never treats utility classifiers as excavation-risk models', () => {
  const modelStatus = getModelStatus({
    dependencyStatus: {
      available: true,
      binary: 'python-test',
      modules: {
        joblib: true,
        numpy: true,
        pandas: true,
        sklearn: false,
        xgboost: false,
        torch: false,
        torchvision: false,
        transformers: false,
        safetensors: false,
        ultralytics: false,
      },
      error: null,
    },
  });

  assert.equal(modelStatus.excavationRisk.status, 'DEPENDENCIES_MISSING');
  assert.equal(modelStatus.excavationRisk.inferenceReady, false);
  assert.deepEqual(modelStatus.excavationRisk.missingDependencies, ['sklearn', 'xgboost']);
  assert.ok(modelStatus.excavationRisk.artifacts.every((artifact) => artifact.present));
  assert.equal(modelStatus.utilityClassification.task, null);
  assert.equal(modelStatus.utilityClassification.artifacts[0].target, null);
});

test('risk model status requires compatible sklearn and XGBoost versions', () => {
  const modules = {
    joblib: true,
    numpy: true,
    pandas: true,
    sklearn: true,
    xgboost: true,
    torch: false,
    torchvision: false,
    transformers: false,
    safetensors: false,
    ultralytics: false,
  };
  const exactVersions = getModelStatus({
    dependencyStatus: {
      available: true,
      binary: 'python-test',
      modules,
      versions: { sklearn: '1.6.1', xgboost: '3.4.1' },
      error: null,
    },
  });
  assert.equal(exactVersions.excavationRisk.inferenceReady, true);
  assert.equal(exactVersions.excavationRisk.status, 'READY');

  const mismatchedVersion = getModelStatus({
    dependencyStatus: {
      available: true,
      binary: 'python-test',
      modules,
      versions: { sklearn: '1.6.1', xgboost: '2.1.4' },
      error: null,
    },
  });
  assert.equal(mismatchedVersion.excavationRisk.inferenceReady, false);
  assert.deepEqual(mismatchedVersion.excavationRisk.missingDependencies, ['xgboost==3.4.1']);
});

test('missing artifact checks return false without loading artifact contents', () => {
  assert.equal(artifactExists('C:\\nonexistent\\digsafe-model.pkl'), false);
});

test('image inference reports unavailable without fabricating detections', () => {
  const result = getImageInferenceUnavailableStatus({
    imageDetection: {
      detr: { loaded: false, inferenceReady: false },
    },
  });
  assert.equal(result.status, 'MODEL_NOT_CONFIGURED');
  assert.equal(result.detections, null);
});

test('image inference failure status never returns detections even if status is misconfigured as ready', () => {
  const result = getImageInferenceUnavailableStatus({
    imageDetection: {
      detr: { loaded: true, inferenceReady: true },
    },
  });
  assert.equal(result.status, 'INFERENCE_UNAVAILABLE');
  assert.equal(result.detections, null);
});

test('image upload accepts matching supported signatures and rejects mismatches and oversized files', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(validateImageFile({ buffer: png, size: png.length, mimetype: 'image/png' }), null);
  assert.match(validateImageFile({ buffer: png, size: png.length, mimetype: 'image/jpeg' }), /does not match/);
  assert.match(validateImageFile({
    buffer: png,
    size: MAX_IMAGE_SIZE_BYTES + 1,
    mimetype: 'image/png',
  }), /5 MB or smaller/);
});
