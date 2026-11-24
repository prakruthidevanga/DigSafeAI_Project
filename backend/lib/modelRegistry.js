const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MODEL_ROOT = path.resolve(__dirname, '..', 'ml');
const MODEL_ARTIFACTS = {
  riskRandomForest: path.join(MODEL_ROOT, 'models', 'random_forest.joblib'),
  riskXgboost: path.join(MODEL_ROOT, 'models', 'xgboost.joblib'),
  riskLightgbm: path.join(MODEL_ROOT, 'models', 'lightgbm.joblib'),
  riskFeatureColumns: path.join(MODEL_ROOT, 'models', 'feature_columns.joblib'),
  riskLabelEncoder: path.join(MODEL_ROOT, 'models', 'risk_label_encoder.joblib'),
  diameterPipeline: path.join(MODEL_ROOT, 'models', 'diameter_pipeline.joblib'),
  utilityClassifier: path.join(MODEL_ROOT, 'risk', 'digsafeai_utility_model (1).pkl'),
  xgboostUtilityClassifier: path.join(MODEL_ROOT, 'risk', 'digsafeai_xgboost_utility_model.json'),
  yolo: path.join(MODEL_ROOT, 'vision', 'yolo', 'yolo11n.pt.zip'),
  // DETR: use the extracted model directory, not the zip archive
  detr: path.join(MODEL_ROOT, 'vision', 'detr', 'dataset2_detr_model'),
  fasterRcnn: path.join(MODEL_ROOT, 'vision', 'faster_rcnn', 'faster_rcnn_model (1).pth.zip'),
};

// Required files inside the extracted DETR directory for inference to be ready
const DETR_REQUIRED_FILES = ['config.json', 'model.safetensors', 'preprocessor_config.json'];

const PYTHON_MODULES = [
  'joblib',
  'numpy',
  'pandas',
  'sklearn',
  'xgboost',
  'torch',
  'torchvision',
  'transformers',
  'safetensors',
  'ultralytics',
  'timm',
];
const RISK_MODEL_DEPENDENCIES = ['joblib', 'numpy', 'pandas', 'sklearn', 'xgboost'];
const RISK_COMPATIBLE_VERSIONS = {
  sklearn: ['1.6.1', '1.7.2'],
  xgboost: ['3.4.1', '3.2.0'],
};
const RISK_MODEL_VERSIONS = { sklearn: '1.6.1', xgboost: '3.4.1' };

function artifactExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

function directoryExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

/**
 * Returns true only if the DETR model directory exists and contains
 * all required inference files.
 */
function detrModelReady(modelDir) {
  if (!directoryExists(modelDir)) return false;
  return DETR_REQUIRED_FILES.every((filename) =>
    artifactExists(path.join(modelDir, filename))
  );
}

let cachedPythonDependencies = null;

function inspectPythonDependencies(forceRefresh = false) {
  if (!forceRefresh && cachedPythonDependencies) {
    return cachedPythonDependencies;
  }
  const binary = process.env.PYTHON_EXECUTABLE || 'python';
  const script = [
    'import importlib.metadata, importlib.util, json',
    `modules = ${JSON.stringify(PYTHON_MODULES)}`,
    'available = {name: importlib.util.find_spec(name) is not None for name in modules}',
    'distributions = {"sklearn": "scikit-learn", "xgboost": "xgboost"}',
    'versions = {name: importlib.metadata.version(dist) if available[name] else None for name, dist in distributions.items()}',
    'print(json.dumps({"modules": available, "versions": versions}))',
  ].join('; ');
  const result = spawnSync(binary, ['-c', script], { encoding: 'utf8', timeout: 5000 });

  if (result.error) {
    cachedPythonDependencies = { available: false, binary, modules: {}, error: result.error.message };
    return cachedPythonDependencies;
  }
  if (result.status !== 0) {
    cachedPythonDependencies = {
      available: false,
      binary,
      modules: {},
      error: (result.stderr || 'Python dependency inspection failed.').trim(),
    };
    return cachedPythonDependencies;
  }

  try {
    const inspection = JSON.parse(result.stdout.trim());
    cachedPythonDependencies = {
      available: true,
      binary,
      modules: inspection.modules,
      versions: inspection.versions,
      error: null,
    };
    return cachedPythonDependencies;
  } catch (error) {
    cachedPythonDependencies = { available: false, binary, modules: {}, error: 'Python dependency inspection returned invalid output.' };
    return cachedPythonDependencies;
  }
}

function relativeArtifactPath(filePath) {
  return path.relative(path.resolve(MODEL_ROOT, '..', '..'), filePath).split(path.sep).join('/');
}

function createImageModelStatus({ artifact, present, dependencies, supportedTask, requirements, notes, isDirectory = false }) {
  const missingDependencies = requirements.filter((moduleName) => !dependencies.modules[moduleName]);
  const ready = present && missingDependencies.length === 0;
  return {
    status: !present
      ? 'ARTIFACT_NOT_FOUND'
      : missingDependencies.length
        ? 'DEPENDENCIES_MISSING'
        : 'READY',
    artifact: relativeArtifactPath(artifact),
    artifactPresent: present,
    isDirectory,
    loaded: false,
    inferenceReady: ready,
    supportedTask,
    requiredDependencies: requirements,
    missingDependencies,
    message: !present
      ? (isDirectory
          ? 'The expected model directory was not found or is missing required files.'
          : 'The expected model artifact was not found.')
      : missingDependencies.length
        ? `Inference dependencies are missing: ${missingDependencies.join(', ')}.`
        : notes,
    notes,
  };
}

let cachedModelStatus = null;
let lastModelStatusTime = 0;
const MODEL_STATUS_TTL = 30 * 1000; // 30 seconds

function getModelStatus(options = {}) {
  const hasCustomInput = Boolean(options && (options.dependencyStatus !== undefined || options.forceRefresh));
  const now = Date.now();
  if (!hasCustomInput && cachedModelStatus && (now - lastModelStatusTime < MODEL_STATUS_TTL)) {
    return cachedModelStatus;
  }
  const dependencyStatus = options.dependencyStatus || inspectPythonDependencies(options.forceRefresh);
  const riskArtifacts = [
    MODEL_ARTIFACTS.riskRandomForest,
    MODEL_ARTIFACTS.riskXgboost,
    MODEL_ARTIFACTS.riskLightgbm,
    MODEL_ARTIFACTS.riskFeatureColumns,
    MODEL_ARTIFACTS.riskLabelEncoder,
  ].map((artifact) => ({
    path: relativeArtifactPath(artifact),
    present: artifactExists(artifact),
  }));
  const riskArtifactsPresent = riskArtifacts.every((artifact) => artifact.present);
  const missingRiskDependencies = RISK_MODEL_DEPENDENCIES
    .filter((moduleName) => !dependencyStatus.modules[moduleName]);
  const incompatibleRiskDependencies = Object.entries(RISK_MODEL_VERSIONS)
    .filter(([moduleName, version]) => {
      if (!dependencyStatus.modules[moduleName]) return false;
      const detectedVersion = dependencyStatus.versions ? dependencyStatus.versions[moduleName] : null;
      if (!detectedVersion) return true;
      const compatibleList = RISK_COMPATIBLE_VERSIONS[moduleName] || [version];
      return !compatibleList.includes(detectedVersion);
    })
    .map(([moduleName, version]) => `${moduleName}==${version}`);
  const unavailableRiskDependencies = [...missingRiskDependencies, ...incompatibleRiskDependencies];
  const utilityClassifierPresent = artifactExists(MODEL_ARTIFACTS.utilityClassifier);
  const xgboostPresent = artifactExists(MODEL_ARTIFACTS.xgboostUtilityClassifier);

  // DETR: check the extracted directory, not the zip
  const detrPresent = detrModelReady(MODEL_ARTIFACTS.detr);
  const detrRequirements = ['torch', 'transformers', 'safetensors', 'timm'];

  const result = {
    generatedAt: new Date().toISOString(),
    excavationRisk: {
      status: !riskArtifactsPresent
        ? 'ARTIFACTS_NOT_FOUND'
        : unavailableRiskDependencies.length
          ? 'DEPENDENCIES_MISSING'
          : 'READY',
      task: 'excavation-risk prediction',
      loaded: false,
      inferenceReady: riskArtifactsPresent && unavailableRiskDependencies.length === 0,
      artifacts: riskArtifacts,
      requiredDependencies: RISK_MODEL_DEPENDENCIES,
      requiredVersions: RISK_MODEL_VERSIONS,
      missingDependencies: unavailableRiskDependencies,
      message: !riskArtifactsPresent
        ? 'One or more trained risk-model artifacts are missing.'
        : unavailableRiskDependencies.length
          ? `Risk-model dependencies are missing or incompatible: ${unavailableRiskDependencies.join(', ')}.`
          : 'Trained risk models are available for inference. Outputs are experimental and not real-world validated. At least Random Forest is available; XGBoost may be unavailable if its artifact is corrupted.',
      limitation: 'Training labels are synthetic and rule-based; sensor readings are simulated.',
    },
    utilityClassification: {
      status: utilityClassifierPresent || xgboostPresent ? 'PRESENT_UNVERIFIED' : 'ARTIFACT_NOT_FOUND',
      task: null,
      loaded: false,
      inferenceReady: false,
      artifacts: [
        {
          path: relativeArtifactPath(MODEL_ARTIFACTS.utilityClassifier),
          present: utilityClassifierPresent,
          knownFeatures: ['coordinate_count', 'Diameter', 'Length', 'SHAPE.STLength()', 'geometry_type', 'MaterialID', 'Status', 'WorkConditionID'],
          target: null,
          preprocessing: 'Pickle opcode metadata indicates a scikit-learn Pipeline with a ColumnTransformer, median numeric imputation, and most-frequent/one-hot categorical preprocessing.',
        },
        {
          path: relativeArtifactPath(MODEL_ARTIFACTS.xgboostUtilityClassifier),
          present: xgboostPresent,
          knownFeatures: null,
          target: null,
          preprocessing: 'XGBoost JSON booster specifies binary:logistic with 30 input features; feature names and class labels are absent.',
        },
      ],
      message: 'The available classifier artifacts have no sufficiently verified target/feature contract for safe inference.',
    },
    diameterPrediction: {
      status: artifactExists(MODEL_ARTIFACTS.diameterPipeline) ? 'READY' : 'ARTIFACT_MISSING',
      task: 'utility nominal diameter prediction (mm)',
      loaded: artifactExists(MODEL_ARTIFACTS.diameterPipeline),
      inferenceReady: artifactExists(MODEL_ARTIFACTS.diameterPipeline),
      artifact: relativeArtifactPath(MODEL_ARTIFACTS.diameterPipeline),
      modelName: 'XGBoost Regressor (Exp 3: n=200, d=11)',
      maeMm: 17.62,
      r2Score: 0.6652,
      message: artifactExists(MODEL_ARTIFACTS.diameterPipeline)
        ? 'Diameter prediction pipeline is packaged and ready for inference.'
        : 'Diameter prediction pipeline artifact is missing.',
      limitation: 'AI-estimated pipe diameter is an approximation derived from municipal GIS line corridors. Not a certified physical measurement.',
    },
    imageDetection: {
      fasterRcnn: createImageModelStatus({
        artifact: MODEL_ARTIFACTS.fasterRcnn,
        present: artifactExists(MODEL_ARTIFACTS.fasterRcnn) || artifactExists(path.join(MODEL_ROOT, 'vision', 'faster_rcnn', 'faster_rcnn_model.pth.zip.part0')),
        dependencies: dependencyStatus,
        supportedTask: 'underground utility object detection; classes: pipe, object',
        requirements: ['torch', 'torchvision'],
        notes: 'Faster R-CNN (ResNet-50 FPN) artifact is verified and operational for inference via faster_rcnn_inference.py adapter. Labels: pipe, object.',
      }),
      detr: createImageModelStatus({
        artifact: MODEL_ARTIFACTS.detr,
        present: detrPresent,
        dependencies: dependencyStatus,
        supportedTask: 'object detection; configured labels: pipe, object',
        requirements: detrRequirements,
        notes: 'DETR model directory is present with config and weights, but blocked on missing Python dependencies (transformers, safetensors, timm).',
        isDirectory: true,
      }),
      yolo: createImageModelStatus({
        artifact: MODEL_ARTIFACTS.yolo,
        present: artifactExists(MODEL_ARTIFACTS.yolo),
        dependencies: dependencyStatus,
        supportedTask: null,
        requirements: ['torch', 'ultralytics'],
        notes: 'YOLO artifact contains generic pretrained COCO classes (person, car, etc.), not trained on underground utilities. Ineligible for utility detection.',
      }),
    },
    python: {
      available: dependencyStatus.available,
      binary: dependencyStatus.binary,
      modules: dependencyStatus.modules,
      versions: dependencyStatus.versions || {},
      error: dependencyStatus.error,
    },
  };

  if (!hasCustomInput) {
    cachedModelStatus = result;
    lastModelStatusTime = now;
  }
  return result;
}

module.exports = {
  MODEL_ARTIFACTS,
  RISK_MODEL_DEPENDENCIES,
  RISK_MODEL_VERSIONS,
  artifactExists,
  directoryExists,
  detrModelReady,
  getModelStatus,
  inspectPythonDependencies,
};
