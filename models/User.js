// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true },

  // ── DUAL ROLE SYSTEM ────────────────────────────────────────────────────────
  // roles array supports: ['donor'], ['receiver'], ['donor','receiver'], ['admin']
  roles: {
    type: [String],
    enum: ['donor', 'receiver', 'admin'],
    default: ['donor'],
    validate: {
      validator: (arr) => arr.length > 0,
      message: 'At least one role is required'
    }
  },
  // Legacy single-role field kept for backward compatibility
  role: { type: String, enum: ['donor', 'receiver', 'both', 'admin'], default: 'donor' },

  blood_group: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], required: true },
  city:        { type: String, required: true, trim: true },
  phone:       { type: String, default: '' },
  age:         { type: Number, default: 0 },
  weight:      { type: Number, default: 0 },

  // ── LOCATION ─────────────────────────────────────────────────────────────────
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },

  // ── DONOR FIELDS ──────────────────────────────────────────────────────────────
  availability:       { type: Boolean, default: true },
  last_donation_date: { type: Date,    default: null },
  response_rate:      { type: Number,  default: 100 },
  total_donations:    { type: Number,  default: 0 },

  // ── VERIFICATION ──────────────────────────────────────────────────────────────
  isVerified: { type: Boolean, default: false },
  otp:        { type: String,  default: null },
  otpExpiry:  { type: Date,    default: null },

  createdAt: { type: Date, default: Date.now }
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
userSchema.virtual('isDonor').get(function () {
  return this.roles.includes('donor');
});
userSchema.virtual('isReceiver').get(function () {
  return this.roles.includes('receiver');
});
userSchema.virtual('isBoth').get(function () {
  return this.roles.includes('donor') && this.roles.includes('receiver');
});

// ── Pre-save: hash password + sync legacy role field ─────────────────────────
userSchema.pre('save', async function (next) {
  // Sync legacy role field
  if (this.roles.includes('donor') && this.roles.includes('receiver')) {
    this.role = 'both';
  } else if (this.roles.includes('admin')) {
    this.role = 'admin';
  } else {
    this.role = this.roles[0] || 'donor';
  }

  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
