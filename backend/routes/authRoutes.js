const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware, JWT_SECRET } = require('../middleware/authMiddleware');
const { normalizeEmail, normalizeName, requireString } = require('../lib/validators');

const router = express.Router();

router.get('/session', authMiddleware, (req, res) => {
  return res.json({ userId: req.user.id });
});

function signToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '24h' });
}

router.post('/signup', async (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const missingName = requireString(name, 'Name', 2);
    const missingEmail = requireString(email, 'Email', 3);
    const missingPassword = requireString(password, 'Password', 8);
    if (missingName) return res.status(400).json({ message: missingName });
    if (missingEmail) return res.status(400).json({ message: 'Please provide a valid email address.' });
    if (missingPassword) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    const token = signToken(newUser);
    return res.status(201).json({
      message: 'User created successfully',
      userId: newUser._id,
      name: newUser.name,
      token,
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    return res.status(500).json({ message: 'Unable to create an account right now.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user);
    return res.json({ message: 'Login successful', userId: user._id, name: user.name, token });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ message: 'Unable to log in right now.' });
  }
});

module.exports = router;
