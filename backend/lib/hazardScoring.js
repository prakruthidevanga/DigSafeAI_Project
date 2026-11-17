/**
 * DigSafeAI - Transparent Integrated Hazard Scoring Engine
 * 
 * Implements the documented baseline formula from project documentation:
 *   H = 0.50 * P + 0.20 * D + 0.15 * V + 0.10 * M + 0.05 * G
 * 
 * Where:
 *   P = Proximity Factor: clip((10 - distance_to_utility_m) / 10, 0, 1)
 *   D = Excavation Depth Factor: clip(excavation_depth_m / 2.0, 0, 1)
 *   V = Ground Vibration Factor: normalized 0-1 (software simulated)
 *   M = Soil Moisture / Condition Factor: normalized 0-1 (software simulated)
 *   G = Gas Reading Factor: normalized 0-1 (software simulated)
 * 
 * Classification Cutoffs (0 - 1 scale):
 *   LOW:    H <= 0.33
 *   MEDIUM: H > 0.33 and H <= 0.66
 *   HIGH:   H > 0.66
 * 
 * Score on 0 - 100 scale: round(H * 100, 1)
 */

function clamp(val, min = 0, max = 1) {
  if (!Number.isFinite(val)) return min;
  return Math.min(Math.max(val, min), max);
}

/**
 * Calculates the transparent hazard score and its components.
 * 
 * @param {Object} params
 * @param {number} params.nearestDistanceMeters - Distance in meters to closest utility line
 * @param {number} params.depthMeters - Planned excavation depth in meters
 * @param {Object} [params.sensors] - Sensor readings (software simulated)
 * @param {number} [params.sensors.vibration] - Vibration level 0-1
 * @param {number} [params.sensors.soilCondition] - Soil moisture/condition index 0-1
 * @param {number} [params.sensors.soilMoisture] - Alias for soil condition 0-1
 * @param {number} [params.sensors.gasReading] - Combustible/toxic gas index 0-1
 * @param {Object} [params.imageInspection] - Optional inspection detections
 * @returns {Object} Calculated factors, total score (0-1), hazardScore (0-100), riskLevel, breakdown, contributing factors, recommendations
 */
function calculateIntegratedHazardScore({
  nearestDistanceMeters = null,
  depthMeters = 1.0,
  sensors = {},
  imageInspection = null,
}) {
  // 1. Proximity factor P: clip((10 - distance) / 10, 0, 1)
  // If distance >= 10m, factor is 0. If distance is 0m, factor is 1.0.
  // If no distance is provided (no utility records), default factor is 0.50 (cautionary).
  const hasDistance = Number.isFinite(nearestDistanceMeters) && nearestDistanceMeters >= 0;
  const proximityFactor = hasDistance
    ? clamp((10 - nearestDistanceMeters) / 10.0, 0, 1)
    : 0.50;

  // 2. Depth factor D: clip(depth / 2.0, 0, 1)
  // Depths >= 2.0m hit maximum depth hazard factor (1.0).
  const validDepth = Number.isFinite(depthMeters) && depthMeters > 0 ? depthMeters : 1.0;
  const depthFactor = clamp(validDepth / 2.0, 0, 1);

  // 3. Sensor factors (V, M, G)
  const sensorObj = sensors && typeof sensors === 'object' ? sensors : {};
  const vibration = Number.isFinite(sensorObj.vibration) ? clamp(sensorObj.vibration, 0, 1) : 0.20;
  const moisture = Number.isFinite(sensorObj.soilMoisture)
    ? clamp(sensorObj.soilMoisture, 0, 1)
    : Number.isFinite(sensorObj.soilCondition)
      ? clamp(sensorObj.soilCondition, 0, 1)
      : 0.30;
  const gasReading = Number.isFinite(sensorObj.gasReading) ? clamp(sensorObj.gasReading, 0, 1) : 0.05;

  // 4. Baseline Formula: H = 0.50P + 0.20D + 0.15V + 0.10M + 0.05G
  const pContribution = 0.50 * proximityFactor;
  const dContribution = 0.20 * depthFactor;
  const vContribution = 0.15 * vibration;
  const mContribution = 0.10 * moisture;
  const gContribution = 0.05 * gasReading;

  let rawScore = pContribution + dContribution + vContribution + mContribution + gContribution;
  rawScore = Math.round(rawScore * 1000) / 1000;

  // Optional transparent extension for confirmed image detections
  // When a verified pipe detection with high confidence (>0.75) is provided,
  // document the visual finding and include transparent visual confirmation metadata
  let visualConfirmation = null;
  if (imageInspection && Array.isArray(imageInspection.detections) && imageInspection.detections.length > 0) {
    const pipeDetections = imageInspection.detections.filter(d => d.class === 'pipe' || d.label === 'pipe');
    if (pipeDetections.length > 0) {
      const topPipe = pipeDetections.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      visualConfirmation = {
        detected: true,
        type: 'UNDERGROUND_PIPE',
        confidence: topPipe.confidence || 0.8,
        note: 'Optical inspection image identified utility pipe feature.',
      };
    }
  }

  // 5. Standard Cutoff Classification
  // LOW <= 0.33, MEDIUM > 0.33 and <= 0.66, HIGH > 0.66
  let riskLevel = 'LOW';
  if (rawScore > 0.66) {
    riskLevel = 'HIGH';
  } else if (rawScore > 0.33) {
    riskLevel = 'MEDIUM';
  }

  const hazardScore100 = Math.round(rawScore * 100 * 10) / 10;

  // 6. Detailed contributing factors for worker comprehension
  const contributingFactors = [];
  if (hasDistance) {
    if (nearestDistanceMeters <= 3.0) {
      contributingFactors.push(`Critical Proximity: Buried pipeline confirmed only ${nearestDistanceMeters.toFixed(1)}m from dig point (+${(pContribution * 100).toFixed(1)} pts).`);
    } else if (nearestDistanceMeters <= 8.0) {
      contributingFactors.push(`Moderate Proximity: Buried pipeline located ${nearestDistanceMeters.toFixed(1)}m from excavation perimeter (+${(pContribution * 100).toFixed(1)} pts).`);
    } else {
      contributingFactors.push(`Proximity Clearance: Closest mapped utility is ${nearestDistanceMeters.toFixed(1)}m away (+${(pContribution * 100).toFixed(1)} pts).`);
    }
  } else {
    contributingFactors.push(`Unverified Proximity: No mapped GIS records confirmed for immediate point; cautionary factor applied (+${(pContribution * 100).toFixed(1)} pts).`);
  }

  if (validDepth >= 2.0) {
    contributingFactors.push(`Deep Excavation: Planned depth of ${validDepth.toFixed(1)}m exceeds standard utility burial horizon (+${(dContribution * 100).toFixed(1)} pts).`);
  } else {
    contributingFactors.push(`Excavation Depth: Planned depth of ${validDepth.toFixed(1)}m (+${(dContribution * 100).toFixed(1)} pts).`);
  }

  if (vibration > 0.6) {
    contributingFactors.push(`High Ground Vibration: Simulated vibration ${vibration.toFixed(2)} indicates intense mechanical disturbance (+${(vContribution * 100).toFixed(1)} pts).`);
  }
  if (moisture > 0.7) {
    contributingFactors.push(`Saturated Soil Condition: Simulated moisture index ${moisture.toFixed(2)} increases trench collapse risk (+${(mContribution * 100).toFixed(1)} pts).`);
  }
  if (gasReading > 0.3) {
    contributingFactors.push(`Elevated Gas Detection: Simulated gas index ${gasReading.toFixed(2)} warrants immediate atmosphere verification (+${(gContribution * 100).toFixed(1)} pts).`);
  }
  if (visualConfirmation) {
    contributingFactors.push(`Visual Confirmation: Site inspection image identified pipe feature (${(visualConfirmation.confidence * 100).toFixed(0)}% confidence).`);
  }

  // 7. Safety recommendations tailored to score and conditions
  const safetyRecommendations = [];
  if (riskLevel === 'HIGH') {
    safetyRecommendations.push('MANDATORY HAND DIGGING: High utility strike hazard. Mechanical digging prohibited within 3 meters of marked utilities.');
    safetyRecommendations.push('UTILITY AGENCY CLEARANCE: Contact BWSSB / BESCOM emergency liaison before breaking ground.');
    safetyRecommendations.push('POTHOLING VERIFICATION: Expose existing pipes by manual vacuum excavation or hand tools to verify exact depth and alignment.');
    safetyRecommendations.push('TRENCH COLLAPSE PROTECTION: Provide shoring, shielding, or benching for excavations exceeding 1.5 meters depth.');
  } else if (riskLevel === 'MEDIUM') {
    safetyRecommendations.push('CONTROLLED EXCAVATION: Maintain 1.5 meter buffer clearance around marked utility lines.');
    safetyRecommendations.push('SURFACE MARKING: Paint high-visibility color markings on the ground along the verified utility route.');
    safetyRecommendations.push('CONTINUOUS VIGILANCE: Assign a dedicated safety spotter to observe the trench bucket at all times.');
    safetyRecommendations.push('MONITOR SENSORS: Continuously observe ground vibration and trench wall integrity.');
  } else {
    safetyRecommendations.push('STANDARD PRECAUTIONS: Follow standard excavation safety guidelines.');
    safetyRecommendations.push('STOP-WORK TRIGGER: Halt digging immediately if warning tape, unusual sand backfill, tiles, or conduits are uncovered.');
    safetyRecommendations.push('UNMAPPED ASSETS: Remember that GIS records may not show undocumented service laterals.');
  }

  return {
    hazardScore: hazardScore100, // 0 - 100
    normalizedScore: rawScore,   // 0.000 - 1.000
    riskLevel,                   // 'LOW' | 'MEDIUM' | 'HIGH'
    factors: {
      proximityFactor: Number(proximityFactor.toFixed(3)),
      depthFactor: Number(depthFactor.toFixed(3)),
      vibrationFactor: Number(vibration.toFixed(3)),
      moistureFactor: Number(moisture.toFixed(3)),
      gasReadingFactor: Number(gasReading.toFixed(3)),
    },
    formulaContributions: {
      proximity: Number((pContribution * 100).toFixed(1)),
      depth: Number((dContribution * 100).toFixed(1)),
      vibration: Number((vContribution * 100).toFixed(1)),
      moisture: Number((mContribution * 100).toFixed(1)),
      gas: Number((gContribution * 100).toFixed(1)),
    },
    formula: 'H = 0.50*P + 0.20*D + 0.15*V + 0.10*M + 0.05*G',
    contributingFactors,
    safetyRecommendations,
    visualConfirmation,
  };
}

module.exports = {
  calculateIntegratedHazardScore,
  clamp,
};
