const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const gtfsParser = require('../services/gtfsParser');

/**
 * GET /api/export
 * Export corrected stops.txt file
 */
router.get('/', async (req, res) => {
    try {
        const stops = await gtfsParser.getStopsForExport();
        const format = req.query.format || 'csv';

        if (format === 'json') {
            res.json(stops);
            return;
        }

        // Generate CSV
        const csv = stringify(stops, {
            header: true,
            columns: ['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon', 'location_type']
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=stops.txt');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting stops:', error);
        res.status(500).json({ error: 'Failed to export stops' });
    }
});

/**
 * GET /api/export/corrections
 * Export only the corrections made
 */
router.get('/corrections', async (req, res) => {
    try {
        const allStops = await gtfsParser.getStops({ isCorrected: true, limit: 10000 });

        const corrections = allStops.stops.map(s => ({
            stop_id: s.stop_id,
            stop_name: s.stop_name,
            original_lat: s.original_lat,
            original_lon: s.original_lon,
            corrected_lat: s.stop_lat,
            corrected_lon: s.stop_lon,
            surveyor: s.correction_info?.surveyor,
            timestamp: s.correction_info?.timestamp
        }));

        res.json({
            total: corrections.length,
            corrections
        });
    } catch (error) {
        console.error('Error exporting corrections:', error);
        res.status(500).json({ error: 'Failed to export corrections' });
    }
});

module.exports = router;
