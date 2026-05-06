// backend/routes/donorRoutes.js
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const User     = require('../models/User');
const Request  = require('../models/Request');
const Donation = require('../models/Donation');
const { protect }         = require('../middleware/authMiddleware');
const { checkEligibility }= require('../utils/eligibility');

const makeTxnId = () => {
  const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uid = uuidv4().slice(0, 8).toUpperCase();
  return `BDC-${ts}-${uid}`;
};

// ─── GET /api/donors — available donors list ──────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { blood_group, city } = req.query;
    const query = { roles: 'donor', isVerified: true, availability: true };
    if (blood_group) query.blood_group = blood_group;
    if (city) query.city = new RegExp(city, 'i');
    const donors = await User.find(query).select('-password -otp -otpExpiry');
    res.json({ donors });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /api/donors/availability ────────────────────────────────────────────
router.put('/availability', protect, async (req, res) => {
  try {
    const { availability } = req.body;
    await User.findByIdAndUpdate(req.user._id, { availability });
    res.json({ message: `You are now ${availability ? 'available' : 'unavailable'} for donation` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/donors/accept/:requestId ──────────────────────────────────────
router.post('/accept/:requestId', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (['accepted','completed'].includes(request.status)) {
      return res.status(400).json({ message: 'This request has already been accepted' });
    }

    const donor = await User.findById(req.user._id);
    const { eligible, reasons } = checkEligibility(donor);
    if (!eligible) return res.status(400).json({ message: 'Not eligible to donate', reasons });

    const txnId    = makeTxnId();
    const donation = await Donation.create({
      donor_id:       req.user._id,
      receiver_id:    request.requester_id,
      request_id:     request._id,
      blood_group:    request.blood_group,
      hospital:       request.hospital,
      city:           request.city,
      location:       request.location,
      status:         'pending',
      receipt_id:     txnId,      // legacy
      transaction_id: txnId       // new
    });

    request.status         = 'accepted';
    request.accepted_donor = req.user._id;
    request.transaction_id = txnId;
    await request.save();

    donor.response_rate = Math.min(100, (donor.response_rate || 90) + 2);
    await donor.save();

    res.json({ message: 'Request accepted! Proceed to donate.', donation, transactionId: txnId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/donors/reject/:requestId ──────────────────────────────────────
router.post('/reject/:requestId', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    request.matched_donors = request.matched_donors.filter(
      id => id.toString() !== req.user._id.toString()
    );
    await request.save();
    await User.findByIdAndUpdate(req.user._id, { $inc: { response_rate: -1 } });
    res.json({ message: 'Request declined' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/donors/complete/:donationId ────────────────────────────────────
router.post('/complete/:donationId', protect, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.donationId);
    if (!donation) return res.status(404).json({ message: 'Donation not found' });
    if (donation.donor_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    donation.status = 'completed';
    await donation.save();

    if (donation.request_id) {
      await Request.findByIdAndUpdate(donation.request_id, { status: 'completed' });
    }

    const donor = await User.findById(req.user._id);
    donor.last_donation_date = new Date();
    donor.total_donations    = (donor.total_donations || 0) + 1;
    donor.availability       = false;
    await donor.save();

    res.json({
      message:       'Donation completed! Thank you for saving a life.',
      transactionId: donation.transaction_id || donation.receipt_id,
      receiptUrl:    `/api/donation/receipt/${donation.transaction_id || donation.receipt_id}`
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/donors/history ──────────────────────────────────────────────────
router.get('/history', protect, async (req, res) => {
  try {
    const donations = await Donation.find({ donor_id: req.user._id })
      .populate('receiver_id', 'name city')
      .populate('request_id', 'blood_group city hospital')
      .sort({ date: -1 });
    res.json({ donations });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/donors/eligibility ─────────────────────────────────────────────
router.get('/eligibility', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(checkEligibility(user));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
