const mongoose = require('mongoose');

const utilitySchema = new mongoose.Schema({
  utilityType: { type: String, required: true },
  source: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  geometry: {
    type: { type: String, enum: ['Point', 'LineString', 'MultiLineString'] },
    coordinates: { type: mongoose.Schema.Types.Mixed }
  },
  depth: { type: Number },
  description: { type: String },
  name: { type: String },
  datasetName: { type: String },
  sourceFile: { type: String },
  recordId: { type: String },
  pipeId: { type: String },
  diameter: { type: Number },
  materialId: { type: String },
  length: { type: Number },
  status: { type: String },
  workConditionId: { type: String },
  voltageClass: { type: String },
  dateOfCommission: { type: String },
  dataSource: { type: String },
  zone: { type: String },
  district: { type: String },
  taluk: { type: String },
  attributes: { type: mongoose.Schema.Types.Mixed }
});

utilitySchema.index({ geometry: '2dsphere' });
utilitySchema.index({ sourceFile: 1, recordId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Utility', utilitySchema);
