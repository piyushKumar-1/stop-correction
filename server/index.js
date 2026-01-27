require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const stopsRouter = require('./routes/stops');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'data/uploads')));

// Routes
app.use('/api/stops', stopsRouter);
app.use('/api/export', exportRouter);

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  const gtfsParser = require('./services/gtfsParser');
  const stats = await gtfsParser.getStats();
  res.json(stats);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚌 Stop Collector Server running on http://localhost:${PORT}`);
  console.log(`📊 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`📍 Stops: http://localhost:${PORT}/api/stops`);
});

module.exports = app;
