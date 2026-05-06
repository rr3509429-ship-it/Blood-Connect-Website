// backend/models/Request.js
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requester_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requester_name: { type: String },
  blood_group:    { type: String, required: true },
  city:           { type: String, required: true },
  hospital:       { type: String, default: '' },
  units_needed:   { type: Number, default: 1 },
  isEmergency:    { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['pending','matched','accepted','completed','cancelled'],
    default: 'pending'
  },

  matched_donors:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  accepted_donor:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Transaction / Receipt ──────────────────────────────────────────────────
  transaction_id: { type: String, unique: true, sparse: true },

  notes:    { type: String, default: '' },
  location: { lat: { type: Number, default: 0 }, lng: { type: Number, default: 0 } },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
