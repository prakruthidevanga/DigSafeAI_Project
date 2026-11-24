const express = require('express');
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validateRiskAssessmentInput } = require('../lib/riskScreening');
const RiskResult = require('../models/RiskResult');

const { predictRisk } = require('../lib/riskModelPredictor');
const REQUIRED_UTILITY_STATUS = 'MATCHES_FOUND';

/**
 * Validates a single model result object from the Python prediction output.
 * Returns true only if the result has a non-empty predictedClass and valid
 * class probabilities that sum to approximately 1.
 */
function isValidModelResult(modelResult) {
  if (
    !modelResult
    || typeof modelResult !== 'object'
    || typeof modelResult.predictedClass !== 'string'
    || !modelResult.predictedClass.trim()
    || !Array.isArray(modelResult.classProbabilities)
    || modelResult.classProbabilities.length === 0
    || !modelResult.classProbabilities.every((probability) =>
      probability
        && typeof probability.label === 'string'
        && probability.label.trim()
        && Number.isFinite(probability.probability)
        && probability.probability >= 0
        && probability.probability <= 1
    )
  ) {
    return false;
  }
  const totalProbability = modelResult.classProbabilities
    .reduce((total, probability) => total + probability.probability, 0);
  return Math.abs(totalProbability - 1) <= 0.01;
}

/**
 * Validates a risk prediction result from the Python inference service.
 * Accepts partial results — at least one of random_forest, xgboost, or lightgbm must be valid.
 * When multiple models produced results, agreement is verified across evaluated models.
 */
function isModelPrediction(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return false;
  }
  const models = result.models;
  if (!models || typeof models !== 'object') return false;

  const validModels = [];
  for (const name of ['random_forest', 'xgboost', 'lightgbm']) {
    if (models[name] && isValidModelResult(models[name])) {
      validModels.push(models[name]);
    }
  }

  // At least one model result is required
  if (validModels.length === 0) return false;

  // When multiple models produced results, verify agreement flag
  if (validModels.length > 1 && typeof result.agreement === 'boolean') {
    const uniqueClasses = new Set(validModels.map(m => m.predictedClass));
    if (result.agreement !== (uniqueClasses.size === 1)) return false;
  }

  if (!Array.isArray(result.imputedFeatures)) return false;
  if (!result.imputedFeatures.every((feature) => typeof feature === 'string')) return false;
  if (typeof result.limitation !== 'string' || !result.limitation.trim()) return false;

  return true;
}

function createRiskRouter({ predictor = null } = {}) {
  if (predictor !== null && typeof predictor !== 'function') {
    throw new TypeError('Risk predictor must be a function.');
  }

  const router = express.Router();
  router.use(authMiddleware);

  router.post('/analyze', async (req, res) => {
    const validationError = validateRiskAssessmentInput(req.body);
    if (validationError) {
      return res.status(400).json({ status: 'INVALID_INPUT', message: validationError });
    }

    // If utility context is incomplete (no confirmed mapped utilities), we do NOT run ML inference
    // because ML models require confirmed utility geometry and distance.
    // Instead, we proceed with a transparent, cautious formula-based assessment.
    const hasMappedUtilities = req.body.utilityDataStatus === REQUIRED_UTILITY_STATUS
      && Array.isArray(req.body.utilities)
      && req.body.utilities.length > 0;

    let prediction = null;
    let availableModels = [];
    let unavailableModels = ['random_forest', 'xgboost', 'lightgbm'];

    if (hasMappedUtilities) {
      if (!predictor) {
        return res.status(503).json({
          status: 'MODEL_NOT_CONFIGURED',
          riskPrediction: null,
          message: 'Excavation-risk prediction is unavailable because no compatible trained risk model is configured.',
          limitation: 'No rule-based fallback is used. Utility classification and image detections are not excavation-risk predictions.',
        });
      }

      try {
        const { location, latitude, longitude, depth, radius, utilities, utilityDataStatus, sensors } = req.body;
        prediction = await predictor({
          location,
          latitude,
          longitude,
          depth,
          radius,
          utilities,
          utilityDataStatus,
          sensors,
        });

        if (!isModelPrediction(prediction)) {
          return res.status(503).json({
            status: 'INFERENCE_UNAVAILABLE',
            riskPrediction: null,
            message: 'The configured risk model returned an invalid result.',
          });
        }

        availableModels = Object.keys(prediction.models || {});
        unavailableModels = ['random_forest', 'xgboost', 'lightgbm'].filter(
          (name) => !prediction.models[name]
        );
      } catch {
        console.error('Excavation-risk inference failed.');
        return res.status(503).json({
          status: 'INFERENCE_UNAVAILABLE',
          riskPrediction: null,
          message: 'Excavation-risk inference failed. No prediction was produced or saved.',
        });
      }
    }

    try {
      const { location, latitude, longitude, depth, radius, utilities } = req.body;
      const { calculateIntegratedHazardScore } = require('../lib/hazardScoring');

      // Determine nearest distance in meters
      const utilityDistances = (utilities || [])
        .map(u => Number(u.distance ?? u.distanceMeters))
        .filter(d => Number.isFinite(d) && d >= 0);
      const nearestDistanceMeters = utilityDistances.length > 0 ? Math.min(...utilityDistances) : null;

      // Extract optional image inspection
      const imageInspection = req.body.imageInspection || null;

      // Calculate transparent baseline hazard score: H = 0.50P + 0.20D + 0.15V + 0.10M + 0.05G
      const hazardAssessment = calculateIntegratedHazardScore({
        nearestDistanceMeters,
        depthMeters: depth,
        sensors: req.body.sensors || {},
        imageInspection,
      });

      // Harmonize Single Final Risk Category across all layers:
      // 1. Base is the transparent formula riskLevel ('LOW', 'MEDIUM', 'HIGH').
      // 2. ML consensus is derived adhering to Safety-First Protocol (any High -> High).
      // 3. Final risk category escalates to HIGH if either formula or ML consensus is High.
      // 4. ML never downgrades a higher formula risk level.
      let mlConsensusClass = null;
      if (prediction && prediction.models) {
        const validModels = Object.values(prediction.models).filter(m => m && m.predictedClass);
        mlConsensusClass = prediction.safetyAssessment?.consensusClass;
        if (!mlConsensusClass) {
          const hasHigh = validModels.some(m => m.predictedClass.toLowerCase() === 'high');
          const evaluatedClasses = validModels.map(m => m.predictedClass);
          const allAgree = evaluatedClasses.length > 0 && (new Set(evaluatedClasses)).size === 1;
          mlConsensusClass = hasHigh ? 'High' : (allAgree ? evaluatedClasses[0] : 'Medium');
        }
      }

      let finalRiskLevel = hazardAssessment.riskLevel; // 'LOW' | 'MEDIUM' | 'HIGH'
      if (mlConsensusClass && mlConsensusClass.toLowerCase() === 'high') {
        finalRiskLevel = 'HIGH';
      } else if (mlConsensusClass && mlConsensusClass.toLowerCase() === 'medium' && finalRiskLevel === 'LOW') {
        finalRiskLevel = 'MEDIUM';
      }
      // Guarantee that hazardAssessment.riskLevel reflects this single authoritative category
      hazardAssessment.riskLevel = finalRiskLevel;

      const coverageLimitation = !hasMappedUtilities
        ? 'No mapped utility lines were found in available dataset. Missing records do not establish utility absence. ML models abstained; transparent formula applied with cautionary proximity factor.'
        : (prediction?.limitation || 'Training labels are synthetic and rule-based; sensor readings are simulated.');

      // Persist analysis report in MongoDB if user is authenticated with a valid ObjectId
      let savedReport = null;
      if (req.user && req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
        try {
          if (RiskResult && typeof RiskResult === 'function') {
            const newReport = new RiskResult({
              userId: req.user.id,
              location: location,
              latitude: latitude,
              longitude: longitude,
              depth: depth,
              radius: radius,
              hazardScore: hazardAssessment.hazardScore,
              riskLevel: finalRiskLevel,
              warning: finalRiskLevel === 'HIGH' ? 'CRITICAL PROXIMITY: HIGH UTILITY STRIKE HAZARD' : null,
              nearbyUtilities: (utilities || []).slice(0, 15).map(u => ({
                utilityType: u.utilityType || 'pipeline',
                source: u.source || 'BWSSB',
                dataSource: u.dataSource || 'OpenCity / BWSSB',
                distance: Number(u.distance ?? u.distanceMeters ?? 0),
              })),
              sensorInformation: {
                vibration: req.body.sensors?.vibration ?? 0.20,
                acousticLevel: req.body.sensors?.acousticLevel ?? 0.30,
                soilCondition: req.body.sensors?.soilCondition ?? 0.30,
                soilMoisture: req.body.sensors?.soilMoisture ?? req.body.sensors?.soilCondition ?? 0.30,
                soilTemperature: req.body.sensors?.soilTemperature ?? 25.0,
                gasReading: req.body.sensors?.gasReading ?? 0.05,
                groundMovement: req.body.sensors?.groundMovement ?? req.body.sensors?.ground_movement_mm ?? 1.0,
                ground_movement_mm: req.body.sensors?.ground_movement_mm ?? req.body.sensors?.groundMovement ?? 1.0,
                source: req.body.sensors?.source || 'SIMULATED',
                dataSource: req.body.sensors?.dataSource || 'Software Simulation',
              },
              imageInspection: {
                performed: Boolean(imageInspection && (imageInspection.detections || imageInspection.status)),
                accepted: Boolean(imageInspection?.accepted),
                status: imageInspection?.status || 'NOT_PERFORMED',
                rejectionReason: imageInspection?.rejectionReason || null,
                model: imageInspection?.model || (imageInspection?.detections ? 'Vision Pipeline Engine' : 'None'),
                detectionCount: imageInspection?.detectionCount ?? (imageInspection?.detections ? imageInspection.detections.length : 0),
                detections: imageInspection?.detections || [],
                visualConfirmation: hazardAssessment.visualConfirmation,
              },
              hazardFormula: hazardAssessment.formula,
              formulaContributions: hazardAssessment.formulaContributions,
              factors: hazardAssessment.factors,
              assessmentMode: hasMappedUtilities ? 'INTEGRATED_HAZARD_ASSESSMENT' : 'CAUTIONARY_FORMULA_ASSESSMENT',
              models: prediction ? prediction.models : {},
              availableModels,
              agreement: prediction ? prediction.agreement : null,
              consensusClass: mlConsensusClass || finalRiskLevel,
              confidence: prediction && Number.isFinite(prediction.confidence) ? prediction.confidence : 1.0,
              contributingFactors: hazardAssessment.contributingFactors,
              safetyRecommendations: hazardAssessment.safetyRecommendations,
              explanation: `Hazard Score: ${hazardAssessment.hazardScore}/100 (${finalRiskLevel}). Computed using baseline formula: ${hazardAssessment.formula}.${mlConsensusClass ? ` ML consensus: ${mlConsensusClass}.` : ' ML inference abstained due to unverified utility context.'}`,
              dataProvenance: {
                source: hasMappedUtilities ? 'OpenCity / BWSSB GIS + Simulated Sensors + ML Evaluation' : 'Cautionary Baseline Formula + Simulated Sensors (No GIS Matches)',
                isSimulated: true,
                dataQuality: hasMappedUtilities ? 'Confirmed Mapped Datasets' : 'Unconfirmed Mapped Context',
              },
              limitation: coverageLimitation,
            });

            savedReport = await newReport.save();
          }
        } catch (saveErr) {
          console.warn('Could not auto-save RiskResult:', saveErr.message);
        }
      }

      return res.json({
        status: hasMappedUtilities ? 'PREDICTION_AVAILABLE' : 'ASSESSMENT_AVAILABLE_WITHOUT_ML',
        reportId: savedReport ? savedReport._id : null,
        report: savedReport,
        hazardAssessment,
        riskPrediction: prediction,
        finalRiskLevel,
        mlAssessmentUnavailable: !hasMappedUtilities,
        availableModels,
        unavailableModels,
        partialResult: hasMappedUtilities && unavailableModels.length > 0,
        limitation: coverageLimitation,
      });
    } catch (err) {
      console.error('Excavation risk assessment failed:', err.message);
      return res.status(500).json({
        status: 'ASSESSMENT_FAILED',
        riskPrediction: null,
        message: 'Excavation-risk assessment failed.',
      });
    }
  });

  return router;
}

module.exports = createRiskRouter({ predictor: predictRisk });
module.exports.createRiskRouter = createRiskRouter;
module.exports.isModelPrediction = isModelPrediction;
module.exports.isValidModelResult = isValidModelResult;
