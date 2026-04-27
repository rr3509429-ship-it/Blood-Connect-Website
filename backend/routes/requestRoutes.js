// backend/routes/requestRoutes.js
const express  = require('express');
const router   = express.Router();
const Request  = require('../models/Request');
const User     = require('../models/User');
const { protect }              = require('../middleware/authMiddleware');
const { matchDonors }          = require('../utils/matching');
const { sendDonorNotification } = require('../utils/emailService');

// ─── POST /api/requests — Create blood request ───────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { blood_group, city, hospital, units_needed, isEmergency, notes, location } = req.body;

    const request = await Request.create({
      requester_id:  req.user._id,
      requester_name: req.user.name,
      blood_group,
      city,
      hospital:     hospital      || '',
      units_needed: units_needed  || 1,
      isEmergency:  isEmergency   || false,
      notes:        notes         || '',
      location:     location      || { lat: 0, lng: 0 }
    });

    // Smart matching
    const isDev = process.env.NODE_ENV === 'development';
    const allDonors = await User.find({ roles: 'donor', ...(isDev ? {} : { isVerified: true }), availability: true });
    const matched   = matchDonors(allDonors, request);
    request.matched_donors = matched.map(d => d._id);
    request.status         = matched.length > 0 ? 'matched' : 'pending';
    await request.save();

    // Async email notifications
    matched.forEach(async (donor) => {
      const d = await User.findById(donor._id);
      if (d?.email) sendDonorNotification(d.email, d.name, request).catch(console.error);
    });

    res.status(201).json({
      message: 'Blood request created successfully',
      request,
      matchedDonors: matched.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET /api/requests ────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    const roles = req.user.roles || [];
    if (!roles.includes('admin')) {
      if (roles.includes('receiver') && !roles.includes('donor')) {
        query.requester_id = req.user._id;
      } else if (roles.includes('donor') && !roles.includes('receiver')) {
        query.status = { $in: ['pending', 'matched'] };
      }
      // 'both' roles: show all
    }
    const requests = await Request.find(query)
      .populate('requester_id', 'name city phone')
      .populate('accepted_donor', 'name blood_group phone')
      .sort({ isEmergency: -1, createdAt: -1 })
      .limit(50);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/requests/my-requests — requester's own requests ─────────────────
router.get('/my-requests', protect, async (req, res) => {
  try {
    const requests = await Request.find({ requester_id: req.user._id })
      .populate('accepted_donor', 'name blood_group phone')
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/requests/donor-requests ────────────────────────────────────────
router.get('/donor-requests', protect, async (req, res) => {
  try {
    const requests = await Request.find({
      matched_donors: req.user._id,
      status: { $in: ['pending','matched'] }
    })
      .populate('requester_id', 'name city phone email')
      .sort({ isEmergency: -1, createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/requests/:id ────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('requester_id',  'name city phone email')
      .populate('matched_donors','name blood_group city phone availability')
      .populate('accepted_donor','name blood_group phone');
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json({ request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /api/requests/:id/status ────────────────────────────────────────────
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (
      request.requester_id.toString() !== req.user._id.toString() &&
      !req.user.roles.includes('admin')
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    request.status    = status;
    request.updatedAt = new Date();
    await request.save();
    res.json({ message: 'Status updated', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /api/requests/:id ─────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (
      request.requester_id.toString() !== req.user._id.toString() &&
      !req.user.roles.includes('admin')
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    request.status = 'cancelled';
    await request.save();
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
