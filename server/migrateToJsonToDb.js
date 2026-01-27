const fs = require('fs');
const path = require('path');
const db = require('./db');

const CORRECTIONS_PATH = path.join(__dirname, 'data/corrections.json');

async function migrate() {
    console.log('🚀 Starting migration...');

    // 1. Initialize DB
    await db.initDb();

    // 2. Load JSON data
    if (!fs.existsSync(CORRECTIONS_PATH)) {
        console.log('ℹ️ No corrections.json found. Nothing to migrate.');
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'));
        const stopIds = Object.keys(data);
        console.log(`📊 Found ${stopIds.length} corrections to migrate.`);

        for (const stopId of stopIds) {
            const c = data[stopId];

            // Handle differences in structure between manual and regular
            const stopName = c.name || null;
            const lat = c.lat;
            const lon = c.lon;
            const surveyor = c.surveyor;
            const photoPath = c.photo || null;
            const towardsStopId = c.towards_stop_id || null;
            const towardsStopName = c.towards_stop_name || null;
            const isManual = c.is_manual || false;
            const createdAt = c.timestamp || new Date().toISOString();

            const query = `
                INSERT INTO corrections (
                    stop_id, stop_name, lat, lon, surveyor, 
                    photo_path, towards_stop_id, towards_stop_name, 
                    is_manual, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (stop_id) DO UPDATE SET
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    surveyor = EXCLUDED.surveyor,
                    photo_path = EXCLUDED.photo_path,
                    towards_stop_id = EXCLUDED.towards_stop_id,
                    towards_stop_name = EXCLUDED.towards_stop_name,
                    created_at = EXCLUDED.created_at;
            `;

            await db.query(query, [
                stopId, stopName, lat, lon, surveyor,
                photoPath, towardsStopId, towardsStopName,
                isManual, createdAt
            ]);
        }

        console.log('✅ Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        process.exit();
    }
}

migrate();
