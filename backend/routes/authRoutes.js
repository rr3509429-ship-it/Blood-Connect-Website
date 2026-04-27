// backend/routes/authRoutes.js
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { sendOTPEmail } = require('../utils/emailService');
const { protect }      = require('../middleware/authMiddleware');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ── Helper: build safe user object ────────────────────────────────────────────
function safeUser(user) {
  return {
    id:                 user._id,
    name:               user.name,
    email:              user.email,
    roles:              user.roles,           // array: ['donor','receiver']
    role:               user.role,            // legacy string
    blood_group:        user.blood_group,
    city:               user.city,
    phone:              user.phone,
    age:                user.age,
    weight:             user.weight,
    availability:       user.availability,
    total_donations:    user.total_donations,
    last_donation_date: user.last_donation_date,
    location:           user.location
  };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, roles, role, blood_group, city, phone, age, weight } = req.body;

    if (!name || !email || !password || !blood_group || !city) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // ── Resolve roles ─────────────────────────────────────────────────────────
    // Accept roles as array ['donor','receiver'] OR legacy role string 'both'
    let resolvedRoles = [];
    if (Array.isArray(roles) && roles.length > 0) {
      resolvedRoles = roles.filter(r => ['donor','receiver','admin'].includes(r));
    } else if (role === 'both') {
      resolvedRoles = ['donor', 'receiver'];
    } else if (role) {
      resolvedRoles = [role];
    }
    if (resolvedRoles.length === 0) resolvedRoles = ['donor'];

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (!existingUser.isVerified) {
        const otp = generateOTP();
        existingUser.otp      = otp;
        existingUser.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await existingUser.save();
        await sendOTPEmail(email, existingUser.name, otp);
        return res.status(200).json({
          message: 'Account exists but not verified. New OTP sent.',
          email,
          requiresVerification: true
        });
      }
      return res.status(400).json({ message: 'Email already registered. Please login.' });
    }

    const otp       = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({
      name, email, password,
      roles: resolvedRoles,
      blood_group, city,
      phone:  phone  || '',
      age:    age    || 0,
      weight: weight || 0,
      isVerified: process.env.NODE_ENV === 'development',  // Auto-verify in dev
      otp, otpExpiry
    });

    const emailSent = await sendOTPEmail(email, name, otp);

    res.status(201).json({
      message: emailSent
        ? 'Account created! Check your email for the OTP verification code.'
        : 'Account created! Email delivery failed — contact support.',
      email,
      requiresVerification: true,
      ...(process.env.NODE_ENV === 'development' && !emailSent && { devOtp: otp })
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error during signup', error: err.message });
  }
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    const user = await User.findOne({ email });
    if (!user)            return res.status(404).json({ message: 'User not found' });
    if (user.isVerified)  return res.status(400).json({ message: 'Already verified. Please login.' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP.' });
    if (new Date() > user.otpExpiry) return res.status(400).json({ message: 'OTP expired. Request a new one.' });

    user.isVerified = true;
    user.otp        = null;
    user.otpExpiry  = null;
    await user.save();

    const token = generateToken(user._id);
    res.json({ message: 'Email verified! Welcome to BloodConnect.', token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)           return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Already verified.' });

    const otp = generateOTP();
    user.otp       = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    await sendOTPEmail(email, user.name, otp);
    res.json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    if (!user.isVerified && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        message: 'Email not verified. Check your email for the OTP.',
        requiresVerification: true, email
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    const token = generateToken(user._id);
    res.json({ message: 'Login successful', token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

// ─── PUT /api/auth/update-profile ─────────────────────────────────────────────
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { name, city, phone, age, weight, availability, roles } = req.body;
    const user = await User.findById(req.user._id);
    if (name)                 user.name         = name;
    if (city)                 user.city         = city;
    if (phone  !== undefined) user.phone        = phone;
    if (age    !== undefined) user.age          = age;
    if (weight !== undefined) user.weight       = weight;
    if (availability !== undefined) user.availability = availability;
    // Allow role upgrades (e.g. donor adds receiver)
    if (Array.isArray(roles) && roles.length > 0) {
      user.roles = roles.filter(r => ['donor','receiver'].includes(r));
    }
    await user.save();
    res.json({ message: 'Profile updated', user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── PUT /api/auth/update-location ───────────────────────────────────────────
router.put('/update-location', protect, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await User.findByIdAndUpdate(req.user._id, { location: { lat, lng } });
    res.json({ message: 'Location updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
