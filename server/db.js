const { Pool } = require('pg');

// PostgreSQL connection configuration
// Adjust these values to match your local setup
const pool = new Pool({
    user: process.env.DB_USER || 'piyush',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'stop_collector',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
});

/**
 * Initialize database schema
 */
async function initDb() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS corrections (
            stop_id VARCHAR(100) PRIMARY KEY,
            stop_name VARCHAR(255),
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            surveyor VARCHAR(100),
            photo_path TEXT,
            towards_stop_id VARCHAR(100),
            towards_stop_name VARCHAR(255),
            is_manual BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    try {
        await pool.query(createTableQuery);
        console.log('✅ Database schema initialized');
    } catch (err) {
        console.error('❌ Error initializing database:', err.message);
        throw err;
    }
}

module.exports = {
    query: async (text, params) => {
        try {
            return await pool.query(text, params);
        } catch (err) {
            console.error('❌ Database Query Error:', err.message);
            console.error('Query:', text);
            throw err;
        }
    },
    initDb,
};
