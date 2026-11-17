const express = require('express');
const SensorReading = require('../models/SensorReading');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.post('/simulate', async (req, res) => {
  const vibration = Number((Math.random() * 1).toFixed(2));
  const acousticLevel = Number((Math.random() * 1).toFixed(2));
  const soilCondition = Number((Math.random() * 1).toFixed(2));
  const soilMoisture = soilCondition; // 0-1 normalized moisture / soil condition
  const soilTemperature = Number((18 + Math.random() * 17).toFixed(1)); // realistic soil temperature 18-35 deg C
  const gasReading = Number((Math.random() * 0.4).toFixed(2)); // realistic simulated atmospheric gas index (0-0.4)
  const groundMovement = Number((Math.random() * 1.5).toFixed(2)); // realistic simulated ground movement 0-1.5 mm

  // Return the simulated values immediately without waiting for DB persistence.
  // The response is not contingent on DB availability so sensor simulation
  // works in degraded mode when MongoDB is unreachable.
  res.json({
    message: 'Sensor data generated via software simulation.',
    data: {
      vibration,
      acousticLevel,
      soilCondition,
      soilMoisture,
      soilTemperature,
      gasReading,
      groundMovement,
      ground_movement_mm: groundMovement,
      source: 'SIMULATED',
      dataSource: 'Software Simulation',
    },
    dataSource: 'SIMULATED',
  });

  // Attempt background persistence — failure is logged but does not affect the response.
  try {
    const reading = new SensorReading({
      vibration,
      acousticLevel,
      soilCondition,
      soilMoisture,
      soilTemperature,
      gasReading,
      groundMovement,
      source: 'SIMULATED',
      dataSource: 'Software Simulation',
    });
    await reading.save();
  } catch (error) {
    console.warn('Sensor reading could not be persisted to the database:', error.message);
  }
});

module.exports = router;
