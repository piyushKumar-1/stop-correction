const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const gtfsParser = require('../services/gtfsParser');

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../data/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const stopId = req.params.id;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `stop-${stopId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * GET /api/stops
 */
router.get('/', async (req, res) => {
    try {
        const options = {
            needsCorrection: req.query.needsCorrection === 'true' ? true :
                req.query.needsCorrection === 'false' ? false : undefined,
            isCorrected: req.query.isCorrected === 'true' ? true :
                req.query.isCorrected === 'false' ? false : undefined,
            isStage: req.query.isStage === 'true' ? true :
                req.query.isStage === 'false' ? false : undefined,
            search: req.query.search,
            lat: req.query.lat ? parseFloat(req.query.lat) : undefined,
            lon: req.query.lon ? parseFloat(req.query.lon) : undefined,
            radius: req.query.radius ? parseFloat(req.query.radius) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 100,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const result = await gtfsParser.getStops(options);
        res.json(result);
    } catch (error) {
        console.error('Error fetching stops:', error);
        res.status(500).json({ error: 'Failed to fetch stops' });
    }
});

/**
 * GET /api/stops/nearby
 */
router.get('/nearby', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);

        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ error: 'lat and lon are required' });
        }

        const result = await gtfsParser.getStops({
            lat,
            lon,
            radius: parseFloat(req.query.radius) || 500,
            limit: parseInt(req.query.limit) || 20,
            offset: 0
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching nearby stops:', error);
        res.status(500).json({ error: 'Failed to fetch nearby stops' });
    }
});

/**
 * GET /api/stops/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const stop = await gtfsParser.getStopById(req.params.id);

        if (!stop) {
            return res.status(404).json({ error: 'Stop not found' });
        }

        res.json(stop);
    } catch (error) {
        console.error('Error fetching stop:', error);
        res.status(500).json({ error: 'Failed to fetch stop' });
    }
});

/**
 * POST /api/stops/:id/correct
 */
router.post('/:id/correct', upload.single('photo'), async (req, res) => {
    try {
        const { lat, lon, surveyor } = req.body;
        const stopIds = req.params.id.split(',');

        if (lat === undefined || lon === undefined) {
            return res.status(400).json({ error: 'lat and lon are required' });
        }

        const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

        const result = await gtfsParser.correctStop(stopIds, lat, lon, surveyor, photoPath);

        if (!result.success) {
            return res.status(404).json({ error: result.error });
        }

        res.json({
            message: 'Stops corrected successfully',
            results: result.results
        });
    } catch (error) {
        console.error('Error correcting stops:', error);
        res.status(500).json({ error: 'Failed to correct stops' });
    }
});

/**
 * PATCH /api/stops/:id
 */
router.patch('/:id', async (req, res) => {
    try {
        const { lat, lon, surveyor } = req.body;
        const stopIds = req.params.id.split(',');

        if (lat === undefined || lon === undefined) {
            return res.status(400).json({ error: 'lat and lon are required' });
        }

        const result = await gtfsParser.correctStop(stopIds, lat, lon, surveyor);

        if (!result.success) {
            return res.status(404).json({ error: result.error });
        }

        res.json({
            message: 'Stops corrected successfully',
            results: result.results
        });
    } catch (error) {
        console.error('Error correcting stops:', error);
        res.status(500).json({ error: 'Failed to correct stops' });
    }
});

/**
 * POST /api/stops/manual
 */
router.post('/manual', upload.single('photo'), async (req, res) => {
    try {
        const { name, lat, lon, surveyor, towardsStopId, towardsStopName } = req.body;

        if (!name || lat === undefined || lon === undefined) {
            return res.status(400).json({ error: 'name, lat, and lon are required' });
        }

        const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

        const result = await gtfsParser.addManualStop(name, lat, lon, surveyor, photoPath, towardsStopId, towardsStopName);

        res.json({
            message: 'Manual stop added successfully',
            stop_id: result.stop_id
        });
    } catch (error) {
        console.error('Error adding manual stop:', error);
        res.status(500).json({ error: 'Failed to add manual stop' });
    }
});

module.exports = router;
