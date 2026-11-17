const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema({
  vibration: { type: Number, required: true, min: 0, max: 1 },
  acousticLevel: { type: Number, required: true, min: 0, max: 1 },
  soilCondition: { type: Number, required: true, min: 0, max: 1 },
  soilMoisture: { type: Number, min: 0, max: 1 },
  soilTemperature: { type: Number },
  gasReading: { type: Number, min: 0, max: 1 },
  groundMovement: { type: Number },
  source: { type: String, default: 'SIMULATED' },
  dataSource: { type: String, default: 'Software Simulation' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
