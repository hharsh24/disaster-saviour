/**
 * PRANA — Reset Database (PostgreSQL)
 * Truncates all tables so the next server start reseeds fresh default data.
 * Run: node reset-db.js
 */
'use strict';
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const tables = ['zones', 'teams', 'drones', 'resources', 'error_log', 'command_log', 'sensor_history'];
  // CASCADE handles the sensor_history -> zones foreign key
  await pool.query(`TRUNCATE ${tables.join(', ')} CASCADE`);
  console.log('✓ All tables truncated');
  console.log('✓ Run "node server.js" to recreate with fresh seed data');
  await pool.end();
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  process.exit(1);
});
