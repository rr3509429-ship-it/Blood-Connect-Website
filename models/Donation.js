// backend/models/Donation.js
const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donor_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  request_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null },

  blood_group:    { type: String, required: true },
  units:          { type: Number, default: 1 },
  hospital:       { type: String, default: '' },
  city:           { type: String, default: '' },

  // ── Location ──────────────────────────────────────────────────────────────
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },

  status:     { type: String, enum: ['pending','completed','cancelled'], default: 'pending' },

  // ── Unique IDs ─────────────────────────────────────────────────────────────
  receipt_id:     { type: String, unique: true, sparse: true }, // legacy
  transaction_id: { type: String, unique: true, sparse: true }, // new standard ID

  notes: { type: String, default: '' },
  date:  { type: Date,   default: Date.now }
});

module.exports = mongoose.model('Donation', donationSchema);
