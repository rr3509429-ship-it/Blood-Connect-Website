// backend/routes/donationRoutes.js
const express    = require('express');
const router     = express.Router();
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const Donation   = require('../models/Donation');
const Receipt    = require('../models/Receipt');
const User       = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// ── Helper: generate unique transaction ID ────────────────────────────────────
function makeTxnId() {
  const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uid = uuidv4().slice(0, 8).toUpperCase();
  return `BDC-${ts}-${uid}`;
}

// ── Helper: stream a professional PDF receipt to res ─────────────────────────
function streamReceiptPDF(res, data) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="BloodConnect-Receipt-${data.transaction_id}.pdf"`
  );
  doc.pipe(res);

  const RED   = '#D32F2F';
  const DRED  = '#B71C1C';
  const GREY  = '#424242';
  const LGREY = '#F5F5F5';
  const GREEN = '#2E7D32';

  // ── Banner ──────────────────────────────────────────────────────────────────
  doc.rect(0, 0, 612, 130).fill(DRED);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(26)
     .text('BloodConnect', 50, 28, { align: 'center' });
  doc.font('Helvetica').fontSize(13)
     .text('Smart Blood Donation Management System', 50, 62, { align: 'center' });
  doc.fontSize(11)
     .text(`Official ${data.type === 'donation' ? 'Donation' : 'Blood Request'} Receipt`, 50, 85, { align: 'center' });

  // ── Transaction badge ───────────────────────────────────────────────────────
  doc.rect(50, 148, 512, 36).fillAndStroke('#FFF3F3', RED);
  doc.fillColor(RED).font('Helvetica-Bold').fontSize(10)
     .text(`Transaction ID: ${data.transaction_id}`, 60, 154)
     .text(`Date: ${data.date}`, 350, 154);

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.moveTo(50, 198).lineTo(562, 198).strokeColor(RED).lineWidth(2).stroke();

  let y = 212;

  const sectionHeader = (label, yPos) => {
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(13).text(label, 50, yPos);
    doc.moveTo(50, yPos + 18).lineTo(562, yPos + 18).strokeColor('#EEEEEE').lineWidth(1).stroke();
    return yPos + 28;
  };

  const infoRow = (label, value, yPos, highlight = false) => {
    doc.rect(50, yPos, 512, 22).fill(highlight ? '#FFF3F3' : LGREY);
    doc.fillColor('#757575').font('Helvetica').fontSize(10).text(label, 58, yPos + 6);
    doc.fillColor(highlight ? RED : GREY).font('Helvetica-Bold').fontSize(10)
       .text(String(value || '—'), 200, yPos + 6);
    return yPos + 24;
  };

  // ── Donor Info ──────────────────────────────────────────────────────────────
  y = sectionHeader('DONOR INFORMATION', y);
  y = infoRow('Full Name',   data.donor_name,         y);
  y = infoRow('Blood Group', data.donor_blood_group,  y, true);
  y = infoRow('City',        data.donor_city,         y);
  y = infoRow('Phone',       data.donor_phone,        y);
  y = infoRow('Email',       data.donor_email,        y);

  y += 10;

  // ── Receiver Info (if present) ───────────────────────────────────────────────
  if (data.receiver_name) {
    y = sectionHeader('RECEIVER INFORMATION', y);
    y = infoRow('Full Name', data.receiver_name, y);
    y = infoRow('City',      data.receiver_city, y);
    y += 10;
  }

  // ── Donation Details ─────────────────────────────────────────────────────────
  y = sectionHeader('DONATION DETAILS', y);
  y = infoRow('Blood Group',  data.donor_blood_group, y, true);
  y = infoRow('Units',        `${data.units || 1} unit(s)`, y);
  y = infoRow('Location',     data.location || data.donor_city, y);
  y = infoRow('Hospital',     data.hospital, y);
  y = infoRow('Date & Time',  data.date, y);

  y += 16;

  // ── Status stamp ─────────────────────────────────────────────────────────────
  const stampColor = (data.status || '').toLowerCase() === 'completed' ? GREEN : RED;
  doc.rect(50, y, 512, 44).fill(stampColor);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
     .text(`✔  ${(data.status || 'COMPLETED').toUpperCase()}  ✔`, 50, y + 13, { align: 'center', width: 512 });

  y += 60;

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.moveTo(50, y).lineTo(562, y).strokeColor('#E0E0E0').lineWidth(0.5).stroke();
  y += 10;
  doc.fillColor('#9E9E9E').font('Helvetica').fontSize(9)
     .text('BloodConnect — Smart Blood Donation Management System', 50, y, { align: 'center' })
     .text('This is an official computer-generated receipt. No signature required.', 50, y + 13, { align: 'center' })
     .text(`Generated: ${new Date().toLocaleString()}`, 50, y + 26, { align: 'center' });

  doc.end();
}

// ─── GET /api/donation/receipt/:id — Download PDF receipt ────────────────────
// FIX: Also accept token via query param so browser can open directly in new tab
// without needing Authorization header (browsers can't add custom headers to window.open)
const jwt = require('jsonwebtoken');

router.get('/receipt/:id', async (req, res) => {
  // Support both Authorization header (API calls) and ?token= (direct browser download)
  let userId = null;
  let userRoles = [];

  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId    = decoded.id;
    userRoles = decoded.roles || [];
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // Attach minimal user to req so existing logic below works unchanged
  req.user = { _id: { toString: () => userId }, roles: userRoles };

  try {
    // Accept both receipt_id (legacy) and transaction_id
    const donation = await Donation.findOne({
      $or: [{ receipt_id: req.params.id }, { transaction_id: req.params.id }]
    })
      .populate('donor_id',   'name blood_group city phone email')
      .populate('receiver_id','name city phone');

    if (!donation) {
      // Try receipt collection
      const receipt = await Receipt.findOne({ transaction_id: req.params.id })
        .populate('donor_id',   'name blood_group city phone email')
        .populate('receiver_id','name city');
      if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

      return streamReceiptPDF(res, {
        transaction_id:   receipt.transaction_id,
        type:             receipt.type,
        donor_name:       receipt.donor_id?.name || '—',
        donor_blood_group:receipt.blood_group,
        donor_city:       receipt.donor_id?.city || '—',
        donor_phone:      receipt.donor_id?.phone || '—',
        donor_email:      receipt.donor_id?.email || '—',
        receiver_name:    receipt.receiver_id?.name,
        receiver_city:    receipt.receiver_id?.city,
        units:            receipt.units,
        location:         receipt.location,
        hospital:         receipt.hospital,
        date:             new Date(receipt.generated_at).toLocaleString(),
        status:           receipt.status
      });
    }

    // Authorisation check
    const uid = req.user._id.toString();
    const isAdmin    = req.user.roles.includes('admin');
    const isDonor    = donation.donor_id._id.toString() === uid;
    const isReceiver = donation.receiver_id?._id?.toString() === uid;
    if (!isAdmin && !isDonor && !isReceiver) {
      return res.status(403).json({ message: 'Not authorized to view this receipt' });
    }

    streamReceiptPDF(res, {
      transaction_id:    donation.transaction_id || donation.receipt_id,
      type:              'donation',
      donor_name:        donation.donor_id.name,
      donor_blood_group: donation.blood_group,
      donor_city:        donation.donor_id.city || '—',
      donor_phone:       donation.donor_id.phone || '—',
      donor_email:       donation.donor_id.email || '—',
      receiver_name:     donation.receiver_id?.name,
      receiver_city:     donation.receiver_id?.city,
      units:             donation.units,
      location:          donation.city,
      hospital:          donation.hospital,
      date:              new Date(donation.date).toLocaleString(),
      status:            donation.status
    });

  } catch (err) {
    console.error('PDF receipt error:', err);
    res.status(500).json({ message: 'Failed to generate receipt', error: err.message });
  }
});

// ─── POST /api/donation/generate-receipt — Generate receipt on demand ─────────
router.post('/generate-receipt', protect, async (req, res) => {
  try {
    const { donation_id } = req.body;
    const donation = await Donation.findById(donation_id)
      .populate('donor_id',   'name blood_group city phone email')
      .populate('receiver_id','name city');

    if (!donation) return res.status(404).json({ message: 'Donation not found' });

    const uid = req.user._id.toString();
    if (
      donation.donor_id._id.toString() !== uid &&
      donation.receiver_id?._id?.toString() !== uid &&
      !req.user.roles.includes('admin')
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Ensure a transaction_id exists
    if (!donation.transaction_id) {
      donation.transaction_id = makeTxnId();
      await donation.save();
    }

    // Store receipt record
    await Receipt.findOneAndUpdate(
      { transaction_id: donation.transaction_id },
      {
        transaction_id: donation.transaction_id,
        type:           'donation',
        donor_id:       donation.donor_id._id,
        receiver_id:    donation.receiver_id?._id || null,
        donation_id:    donation._id,
        blood_group:    donation.blood_group,
        units:          donation.units,
        city:           donation.city,
        hospital:       donation.hospital,
        status:         donation.status
      },
      { upsert: true }
    );

    res.json({
      message:        'Receipt generated',
      transaction_id: donation.transaction_id,
      receipt_url:    `/api/donation/receipt/${donation.transaction_id}`
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET /api/donation/my-donations — Logged-in user's donations ──────────────
router.get('/my-donations', protect, async (req, res) => {
  try {
    const donations = await Donation.find({
      $or: [{ donor_id: req.user._id }, { receiver_id: req.user._id }]
    })
      .populate('donor_id',   'name blood_group city')
      .populate('receiver_id','name city')
      .sort({ date: -1 });
    res.json({ donations });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/donation/nearby-donors — Get donors near a location ─────────────
router.get('/nearby-donors', protect, async (req, res) => {
  try {
    const { lat, lng, radius = 50, blood_group } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng are required' });

    const query = {
      isVerified:   true,
      availability: true,
      roles:        'donor',
      'location.lat': { $ne: 0 },
      'location.lng': { $ne: 0 }
    };
    if (blood_group) query.blood_group = blood_group;

    const donors = await User.find(query).select('-password -otp -otpExpiry');

    // Haversine filter
    const R   = 6371;
    const lat1 = parseFloat(lat);
    const lng1 = parseFloat(lng);
    const rad  = parseFloat(radius);

    const nearby = donors
      .map(d => {
        const dLat = ((d.location.lat - lat1) * Math.PI) / 180;
        const dLng = ((d.location.lng - lng1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) * Math.cos((d.location.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return { ...d.toObject(), distance: Math.round(dist * 10) / 10 };
      })
      .filter(d => d.distance <= rad)
      .sort((a, b) => a.distance - b.distance);

    res.json({ donors: nearby, count: nearby.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
