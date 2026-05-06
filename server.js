// backend/server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB = require('./config/db');

const app = express();
connectDB();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/auth',     require('./routes/authRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/donors',   require('./routes/donorRoutes'));
app.use('/api/admin',    require('./routes/adminRoutes'));
app.use('/api/chatbot',  require('./routes/chatbotRoutes'));
app.use('/api/donation', require('./routes/donationRoutes'));

app.get('/api/health', (req, res) =>
  res.json({ status: 'OK', message: '🩸 BloodConnect API is running', timestamp: new Date() })
);

app.get('/api/config/maps-key', (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🩸 BloodConnect — Smart Blood Donation System`);
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`📡 API:    http://localhost:${PORT}/api`);
  console.log(`🌍 Env:    ${process.env.NODE_ENV || 'development'}\n`);
});



module.exports = app;
