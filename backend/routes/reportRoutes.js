const express = require('express');
const mongoose = require('mongoose');
const RiskResult = require('../models/RiskResult');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.get('/summary', async (req, res) => {
  try {
    const userFilter = { userId: req.user.id };
    const [totalReports, historicalHighRiskReports] = await Promise.all([
      RiskResult.countDocuments(userFilter),
      RiskResult.countDocuments({ ...userFilter, riskLevel: 'HIGH' }),
    ]);
    return res.json({ totalReports, historicalHighRiskReports });
  } catch (error) {
    console.error('Report summary failed:', error.message);
    return res.status(500).json({ message: 'Unable to fetch report summary.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const userFilter = { userId: req.user.id };
    const [totalReports, highRiskReports, mediumRiskReports, lowRiskReports, recentReports] = await Promise.all([
      RiskResult.countDocuments(userFilter),
      RiskResult.countDocuments({ ...userFilter, riskLevel: 'HIGH' }),
      RiskResult.countDocuments({ ...userFilter, riskLevel: 'MEDIUM' }),
      RiskResult.countDocuments({ ...userFilter, riskLevel: 'LOW' }),
      RiskResult.find(userFilter).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    return res.json({
      totalReports,
      highRiskReports,
      mediumRiskReports,
      lowRiskReports,
      recentReports,
    });
  } catch (error) {
    console.error('Report stats failed:', error.message);
    return res.status(500).json({ message: 'Unable to fetch report statistics.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const pageValue = req.query.page ?? '1';
    const limitValue = req.query.limit ?? '25';
    if (
      typeof pageValue !== 'string'
      || !/^[1-9]\d*$/.test(pageValue)
      || typeof limitValue !== 'string'
      || !/^[1-9]\d*$/.test(limitValue)
    ) {
      return res.status(400).json({ message: 'Page and limit must be positive integers up to 200.' });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) || limit > 200) {
      return res.status(400).json({ message: 'Page and limit must be positive integers up to 200.' });
    }

    const total = await RiskResult.countDocuments({ userId: req.user.id });
    const reports = await RiskResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      data: reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Report listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to fetch user reports.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid report ID.' });
    }

    const report = await RiskResult.findOne({ _id: req.params.id, userId: req.user.id });
    if (!report) {
      return res.status(404).json({ message: 'Report not found.' });
    }
    return res.json(report);
  } catch (error) {
    console.error('Report fetch failed:', error.message);
    return res.status(500).json({ message: 'Unable to fetch report.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid report ID.' });
    }

    const report = await RiskResult.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!report) {
      return res.status(404).json({ message: 'Report not found.' });
    }
    return res.json({ message: 'Report deleted successfully.' });
  } catch (error) {
    console.error('Report deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to delete report.' });
  }
});

module.exports = router;
