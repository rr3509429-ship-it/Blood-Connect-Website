// backend/routes/adminRoutes.js
const express     = require('express');
const router      = express.Router();
const jwt         = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const User        = require('../models/User');
const Request     = require('../models/Request');
const Donation    = require('../models/Donation');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ── Hardcoded admin credentials ───────────────────────────────────────────────
const ADMIN_USERNAME = 'Onlyadmin';
const ADMIN_PASSWORD = 'admin123';

// ── POST /api/admin/login  (NO email, NO DB lookup) ───────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD)
    return res.status(401).json({ message: 'Invalid admin credentials' });

  // Issue a special admin JWT (no DB user needed)
  const token = jwt.sign(
    { id: 'admin', roles: ['admin'], name: 'Onlyadmin' },
    process.env.JWT_SECRET || 'bloodconnect_secret',
    { expiresIn: '8h' }
  );
  res.json({
    message: 'Admin login successful',
    token,
    user: { id: 'admin', name: 'Onlyadmin', role: 'admin', roles: ['admin'] }
  });
});

// ── CSV helper ────────────────────────────────────────────────────────────────
const toCSV = (data, fields) => {
  if (!data.length) return fields.join(',') + '\n';
  const rows = data.map(row =>
    fields.map(f => {
      const val = f.split('.').reduce((o, k) => (o ? o[k] : ''), row);
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [fields.join(','), ...rows].join('\n');
};

router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}).select('-password -otp -otpExpiry').sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/requests', protect, adminOnly, async (req, res) => {
  try {
    const requests = await Request.find({})
      .populate('requester_id', 'name email city')
      .populate('accepted_donor', 'name email')
      .sort({ createdAt: -1 });
    res.json({ requests, total: requests.length });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/analytics', protect, adminOnly, async (req, res) => {
  try {
    const totalUsers        = await User.countDocuments();
    const totalDonors       = await User.countDocuments({ roles: 'donor' });
    const totalReceivers    = await User.countDocuments({ roles: 'receiver' });
    const totalBoth         = await User.countDocuments({ roles: { $all: ['donor','receiver'] } });
    const totalRequests     = await Request.countDocuments();
    const completedRequests = await Request.countDocuments({ status: 'completed' });
    const pendingRequests   = await Request.countDocuments({ status: { $in: ['pending','matched'] } });
    const emergencyRequests = await Request.countDocuments({ isEmergency: true });
    const totalDonations    = await Donation.countDocuments({ status: 'completed' });

    const bloodGroupDemand = await Request.aggregate([
      { $group: { _id: '$blood_group', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyRequests = await Request.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      totalUsers, totalDonors, totalReceivers, totalBoth,
      totalRequests, completedRequests, pendingRequests, emergencyRequests, totalDonations,
      successRate: totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0,
      bloodGroupDemand, monthlyRequests
    });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

router.get('/export-users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}).select('-password -otp -otpExpiry').lean();
    const mapped = users.map(u => ({ ...u, roles: (u.roles || []).join('+') }));
    const fields = ['name','email','roles','blood_group','city','phone','isVerified','availability','total_donations','createdAt'];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(toCSV(mapped, fields));
  } catch (err) { res.status(500).json({ message: 'Export failed' }); }
});

router.get('/export-requests', protect, adminOnly, async (req, res) => {
  try {
    const requests = await Request.find({}).populate('requester_id','name email').lean();
    const mapped = requests.map(r => ({
      blood_group: r.blood_group, city: r.city, hospital: r.hospital,
      status: r.status, isEmergency: r.isEmergency, units_needed: r.units_needed,
      requester_name: r.requester_id?.name || '', requester_email: r.requester_id?.email || '',
      createdAt: r.createdAt
    }));
    const fields = ['blood_group','city','hospital','status','isEmergency','units_needed','requester_name','requester_email','createdAt'];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
    res.send(toCSV(mapped, fields));
  } catch (err) { res.status(500).json({ message: 'Export failed' }); }
});

router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── GET /api/admin/donations — all donation history ───────────────────────────
router.get('/donations', protect, adminOnly, async (req, res) => {
  try {
    const donations = await Donation.find({})
      .populate('donor_id',    'name email blood_group city')
      .populate('receiver_id', 'name email city')
      .sort({ date: -1 });
    res.json({ donations, total: donations.length });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── DELETE /api/admin/delete-completed — delete users who donated OR received ─
router.delete('/delete-completed', protect, adminOnly, async (req, res) => {
  try {
    // Find users who have total_donations > 0 (completed donors)
    const donorIds = (await User.find({ total_donations: { $gt: 0 } }).select('_id')).map(u => u._id);
    // Find receiver IDs from completed requests
    const completedRequests = await Request.find({ status: 'completed' }).select('requester_id');
    const receiverIds = completedRequests.map(r => r.requester_id).filter(Boolean);
    // Merge unique IDs
    const allIds = [...new Set([...donorIds.map(String), ...receiverIds.map(String)])];
    if (allIds.length === 0) return res.json({ message: 'No completed users found', deleted: 0 });
    await User.deleteMany({ _id: { $in: allIds } });
    res.json({ message: `${allIds.length} completed user(s) deleted`, deleted: allIds.length });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

// ── GET /api/admin/report-pdf — full PDF report ───────────────────────────────
router.get('/report-pdf', protect, adminOnly, async (req, res) => {
  try {
    const [users, requests, donations] = await Promise.all([
      User.find({}).select('-password -otp -otpExpiry').lean(),
      Request.find({}).populate('requester_id','name email').lean(),
      Donation.find({}).populate('donor_id','name blood_group city').populate('receiver_id','name city').lean()
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="BloodConnect-AdminReport.pdf"');
    doc.pipe(res);

    const RED   = '#D32F2F';
    const DRED  = '#B71C1C';
    const GREY  = '#616161';
    const LGREY = '#F5F5F5';
    const now   = new Date().toLocaleString();

    // ── Banner ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, 612, 110).fill(DRED);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22)
       .text('🩸 BloodConnect Admin Report', 40, 24, { align: 'center' });
    doc.font('Helvetica').fontSize(11)
       .text('Smart Blood Donation Management System', 40, 54, { align: 'center' });
    doc.fontSize(9)
       .text(`Generated: ${now}`, 40, 76, { align: 'center' });

    let y = 126;

    // ── Section helper ────────────────────────────────────────────────────────
    const section = (title) => {
      doc.rect(40, y, 515, 28).fill(RED);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(13)
         .text(title, 50, y + 7);
      y += 36;
    };

    const tableHeader = (cols) => {
      doc.rect(40, y, 515, 20).fill('#EEEEEE');
      let x = 48;
      cols.forEach(([label, w]) => {
        doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8).text(label, x, y + 6, { width: w - 4 });
        x += w;
      });
      y += 22;
    };

    const tableRow = (cols, rowIndex) => {
      if (y > 750) { doc.addPage(); y = 40; }
      if (rowIndex % 2 === 0) doc.rect(40, y, 515, 18).fill(LGREY);
      let x = 48;
      cols.forEach(([val, w]) => {
        doc.fillColor('#212121').font('Helvetica').fontSize(8)
           .text(String(val || '—').slice(0, 40), x, y + 5, { width: w - 4 });
        x += w;
      });
      y += 20;
    };

    // ── Summary stats ─────────────────────────────────────────────────────────
    section('SUMMARY STATISTICS');
    const stats = [
      ['Total Users', users.length], ['Total Requests', requests.length],
      ['Total Donations', donations.length],
      ['Completed Requests', requests.filter(r => r.status === 'completed').length],
    ];
    stats.forEach(([k, v], i) => {
      doc.rect(40 + (i % 2) * 258, y, 250, 36).fillAndStroke('#FFF3F3', RED);
      doc.fillColor(RED).font('Helvetica-Bold').fontSize(18).text(String(v), 50 + (i % 2) * 258, y + 2);
      doc.fillColor(GREY).font('Helvetica').fontSize(9).text(k, 50 + (i % 2) * 258, y + 22);
      if (i % 2 === 1) y += 44;
    });
    y += 44 + 12;

    // ── Donors / Users table ──────────────────────────────────────────────────
    section('ALL USERS');
    tableHeader([['Name', 130], ['Email', 160], ['Role', 60], ['Blood', 50], ['City', 80], ['Donations', 50]]);
    users.slice(0, 80).forEach((u, i) => tableRow([
      [u.name, 130], [u.email, 160],
      [(u.roles || [u.role || 'donor']).join('+'), 60],
      [u.blood_group, 50], [u.city, 80], [u.total_donations || 0, 50]
    ], i));
    y += 12;

    // ── Requests table ────────────────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = 40; }
    section('BLOOD REQUESTS');
    tableHeader([['Blood', 50], ['City', 90], ['Hospital', 120], ['Requester', 120], ['Status', 75], ['Emergency', 60]]);
    requests.slice(0, 80).forEach((r, i) => tableRow([
      [r.blood_group, 50], [r.city, 90], [r.hospital, 120],
      [r.requester_id ? r.requester_id.name : '—', 120],
      [r.status, 75], [r.isEmergency ? 'YES' : 'No', 60]
    ], i));
    y += 12;

    // ── Donation history table ────────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = 40; }
    section('DONATION HISTORY');
    tableHeader([['Donor', 130], ['Blood', 55], ['Receiver', 130], ['City', 90], ['Units', 50], ['Status', 70]]);
    donations.slice(0, 80).forEach((d, i) => tableRow([
      [d.donor_id ? d.donor_id.name : '—', 130],
      [d.blood_group, 55],
      [d.receiver_id ? d.receiver_id.name : 'Walk-in', 130],
      [d.city, 90], [d.units || 1, 50], [d.status, 70]
    ], i));

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.rect(0, 800, 612, 42).fill(DRED);
    doc.fillColor('white').font('Helvetica').fontSize(9)
       .text('© BloodConnect — Confidential Admin Report. Saving Lives Together.', 40, 812, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PDF report error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

module.exports = router;
