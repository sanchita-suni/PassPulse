const express = require('express');
const cors = require('cors');
require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined
);

const authRoutes = require('./routes/auth.routes');
const qrRoutes = require('./routes/qr.routes');
const checkinRoutes = require('./routes/checkin.routes');
const eventRoutes = require('./routes/event.routes');
const adminRoutes = require('./routes/admin.routes');
const bookingRoutes = require('./routes/booking.routes');

const app = express();

// SEC-004: behind the HTTPS proxy, take the client IP and protocol from X-Forwarded-* headers
app.set('trust proxy', 'loopback, uniquelocal');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'PassPulse API is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('PassPulse API Server');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error'
  });
});

module.exports = app;
