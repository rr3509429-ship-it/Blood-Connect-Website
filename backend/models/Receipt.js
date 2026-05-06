// backend/models/Receipt.js
const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  transaction_id: { type: String, required: true, unique: true },
  type:           { type: String, enum: ['donation','request'], default: 'donation' },

  donor_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  donation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', default: null },
  request_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null },

  blood_group: { type: String },
  units:       { type: Number, default: 1 },
  location:    { type: String, default: '' },
  hospital:    { type: String, default: '' },
  city:        { type: String, default: '' },
  status:      { type: String, default: 'completed' },

  generated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Receipt', receiptSchema);
