const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const db = require('../db');

const GTFS_PATH = path.join(__dirname, '../chennai.bus.gtfs/stops.txt');
const STOP_TIMES_PATH = path.join(__dirname, '../chennai.bus.gtfs/stop_times.txt');

// Placeholder coordinates that indicate "needs correction"
const PLACEHOLDER_LAT = 12.549663;
const PLACEHOLDER_LON = 80.143925;

let stopsCache = null;
let tripToStops = new Map(); // trip_id -> [stop_id, ...]
let stopToSampleTrip = new Map(); // stop_id -> trip_id
let stageStopsSet = new Set(); // Set of stop_ids that are stage stops
let initializedSequences = false;

/**
 * Initialize sequences and stage stops from stop_times.txt
 */
async function initSequences() {
    if (initializedSequences || !fs.existsSync(STOP_TIMES_PATH)) return;

    try {
        console.log('⏳ Parsing stop_times.txt for sequences...');
        const stopTimesContent = fs.readFileSync(STOP_TIMES_PATH, 'utf-8');
        const stopTimes = parse(stopTimesContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        for (const row of stopTimes) {
            const tripId = row.trip_id;
            const stopId = row.stop_id;

            if (!tripToStops.has(tripId)) {
                tripToStops.set(tripId, []);
            }
            tripToStops.get(tripId).push({
                stop_id: stopId,
                sequence: parseInt(row.stop_sequence)
            });

            if (!stopToSampleTrip.has(stopId)) {
                stopToSampleTrip.set(stopId, tripId);
            }

            if (row.stop_headsign && row.stop_headsign.includes("'isStageStop': true")) {
                stageStopsSet.add(stopId);
            }
        }

        for (const [tripId, stops] of tripToStops) {
            stops.sort((a, b) => a.sequence - b.sequence);
        }

        initializedSequences = true;
        console.log('✅ Stop sequences initialized');
    } catch (e) {
        console.error('Error parsing stop_times:', e.message);
    }
}

/**
 * Fetch all corrections from DB
 */
async function getCorrectionsFromDb() {
    const query = 'SELECT * FROM corrections';
    const result = await db.query(query);
    const correctionsMap = {};
    result.rows.forEach(row => {
        correctionsMap[row.stop_id] = {
            lat: row.lat,
            lon: row.lon,
            name: row.stop_name,
            surveyor: row.surveyor,
            photo: row.photo_path,
            towards_stop_id: row.towards_stop_id,
            towards_stop_name: row.towards_stop_name,
            timestamp: row.created_at,
            is_manual: row.is_manual
        };
    });
    return correctionsMap;
}

/**
 * Parse stops.txt and merge with corrections from DB
 */
async function parseStops() {
    await initSequences();
    const correctionsMap = await getCorrectionsFromDb();

    const fileContent = fs.readFileSync(GTFS_PATH, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    const stopNames = new Map();
    records.forEach(r => stopNames.set(r.stop_id, r.stop_name));

    const stops = records.map(record => {
        const stopId = record.stop_id;
        const originalLat = parseFloat(record.stop_lat);
        const originalLon = parseFloat(record.stop_lon);
        const correction = correctionsMap[stopId];

        const hasPlaceholder = Math.abs(originalLat - PLACEHOLDER_LAT) < 0.0001 &&
            Math.abs(originalLon - PLACEHOLDER_LON) < 0.0001;

        let sampleSequence = [];
        const tripId = stopToSampleTrip.get(stopId);
        if (tripId && tripToStops.has(tripId)) {
            sampleSequence = tripToStops.get(tripId).map(s => ({
                stop_id: s.stop_id,
                stop_name: stopNames.get(s.stop_id) || 'Unknown',
                is_current: s.stop_id === stopId,
                is_stage: stageStopsSet.has(s.stop_id)
            }));
        }

        return {
            stop_id: stopId,
            stop_code: record.stop_code,
            stop_name: record.stop_name,
            stop_lat: correction ? correction.lat : originalLat,
            stop_lon: correction ? correction.lon : originalLon,
            original_lat: originalLat,
            original_lon: originalLon,
            location_type: parseInt(record.location_type) || 0,
            needs_correction: hasPlaceholder && !correction,
            is_corrected: !!correction,
            is_manual: false,
            is_stage: stageStopsSet.has(stopId),
            sample_sequence: sampleSequence,
            correction_info: correction || null
        };
    });

    // Add manual stops from DB
    Object.keys(correctionsMap).forEach(id => {
        if (id.startsWith('MANUAL_')) {
            const c = correctionsMap[id];
            stops.push({
                stop_id: id,
                stop_code: '',
                stop_name: c.name,
                stop_lat: c.lat,
                stop_lon: c.lon,
                original_lat: null,
                original_lon: null,
                location_type: 0,
                needs_correction: false,
                is_corrected: true,
                correction_info: c,
                sample_sequence: [],
                is_manual: true
            });
        }
    });

    stopsCache = stops;
    return stopsCache;
}

/**
 * Get stops with filters
 */
async function getStops(options = {}) {
    const stops = await parseStops();
    let filtered = [...stops];

    // Default sorting by name if no distance search
    if (!(options.lat !== undefined && options.lon !== undefined && options.radius)) {
        filtered.sort((a, b) => a.stop_name.localeCompare(b.stop_name));
    }

    if (options.needsCorrection !== undefined) {
        filtered = filtered.filter(s => s.needs_correction === options.needsCorrection);
    }
    if (options.isCorrected !== undefined) {
        filtered = filtered.filter(s => s.is_corrected === options.isCorrected);
    }
    if (options.isStage !== undefined) {
        filtered = filtered.filter(s => s.is_stage === options.isStage);
    }
    if (options.search) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter(s => s.stop_name.toLowerCase().includes(searchLower));
    }
    if (options.lat !== undefined && options.lon !== undefined && options.radius) {
        filtered = filtered.filter(s => {
            const distance = getDistanceMeters(options.lat, options.lon, s.stop_lat, s.stop_lon);
            return distance <= options.radius;
        }).map(s => ({
            ...s,
            distance: Math.round(getDistanceMeters(options.lat, options.lon, s.stop_lat, s.stop_lon))
        })).sort((a, b) => a.distance - b.distance);
    }

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    return {
        total: filtered.length,
        limit,
        offset,
        stops: filtered.slice(offset, offset + limit)
    };
}

/**
 * Get single stop by ID
 */
async function getStopById(stopId) {
    const stops = await parseStops();
    return stops.find(s => s.stop_id === stopId) || null;
}

/**
 * Submit correction to DB
 */
async function correctStop(stopIds, lat, lon, surveyorName = 'unknown', photoPath = null) {
    const idsToCorrect = Array.isArray(stopIds) ? stopIds : [stopIds];
    const results = [];

    const query = `
        INSERT INTO corrections (stop_id, lat, lon, surveyor, photo_path)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (stop_id) DO UPDATE SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            surveyor = EXCLUDED.surveyor,
            photo_path = EXCLUDED.photo_path,
            created_at = NOW();
    `;

    for (const stopId of idsToCorrect) {
        try {
            await db.query(query, [stopId, parseFloat(lat), parseFloat(lon), surveyorName, photoPath]);
            results.push({ stop_id: stopId, success: true });
        } catch (err) {
            results.push({ stop_id: stopId, success: false, error: err.message });
        }
    }

    stopsCache = null; // Invalidate cache
    return { success: true, results };
}

/**
 * Add manual stop to DB
 */
async function addManualStop(name, lat, lon, surveyorName = 'unknown', photoPath = null, towardsStopId = null, towardsStopName = null) {
    const stopId = `MANUAL_${Date.now()}`;
    const query = `
        INSERT INTO corrections (
            stop_id, stop_name, lat, lon, surveyor, 
            photo_path, towards_stop_id, towards_stop_name, is_manual
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE);
    `;

    try {
        await db.query(query, [
            stopId, name, parseFloat(lat), parseFloat(lon), surveyorName,
            photoPath, towardsStopId, towardsStopName
        ]);
        stopsCache = null;
        return { success: true, stop_id: stopId };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Get stats from DB and GTFS
 */
async function getStats() {
    const stops = await parseStops();
    const needsCorrection = stops.filter(s => s.needs_correction).length;
    const corrected = stops.filter(s => s.is_corrected).length;
    const hasRealCoords = stops.filter(s => !s.needs_correction && !s.is_corrected).length;

    return {
        total: stops.length,
        needs_correction: needsCorrection,
        corrected: corrected,
        has_real_coords: hasRealCoords,
        progress_percentage: Math.round((corrected / (needsCorrection + corrected)) * 100) || 0
    };
}

/**
 * Get corrected stops for export
 */
async function getStopsForExport() {
    const stops = await parseStops();
    return stops.sort((a, b) => a.stop_id.localeCompare(b.stop_id)).map(s => ({
        stop_id: s.stop_id,
        stop_code: s.stop_code,
        stop_name: s.stop_name,
        stop_lat: s.stop_lat,
        stop_lon: s.stop_lon,
        location_type: s.location_type
    }));
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function clearCache() {
    stopsCache = null;
}

module.exports = {
    parseStops,
    getStops,
    getStopById,
    correctStop,
    addManualStop,
    getStats,
    getStopsForExport,
    getDistanceMeters,
    clearCache
};
