function getImageInferenceUnavailableStatus(modelStatus) {
  const readyModel = Object.entries(modelStatus.imageDetection || {})
    .find(([, model]) => model.inferenceReady && model.loaded);

  if (!readyModel) {
    return {
      status: 'MODEL_NOT_CONFIGURED',
      model: null,
      detections: null,
      message: 'No image detector is currently loaded and ready for inference.',
    };
  }

  return {
    status: 'INFERENCE_UNAVAILABLE',
    model: readyModel[0],
    detections: null,
    message: 'The configured detector has no verified inference adapter.',
  };
}

module.exports = { getImageInferenceUnavailableStatus };
