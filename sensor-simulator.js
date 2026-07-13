/**
 * PRANA — Sensor Simulator (HTTPS version)
 * ─────────────────────────────────────────
 * Simulates real IoT sensor data being pushed
 * to the backend every 2 seconds via plain HTTPS POST
 * (no WebSocket needed).
 *
 * Run: node sensor-simulator.js
 *
 * Change BACKEND_URL below to 'http://localhost:3001' for local testing.
 */

const BACKEND_URL = 'https://prana-the-decider.onrender.com';
const ZONES       = ['SECTOR-A1','SECTOR-B2','SECTOR-C3','SECTOR-D1','SECTOR-E2'];

// Sensor base values per zone
const BASE = {
  'SECTOR-A1': { thermal:37.1, sound:48, vibration:42,  co2:1620, motion:8.2  },
  'SECTOR-B2': { thermal:36.4, sound:38, vibration:28,  co2:1340, motion:5.4  },
  'SECTOR-C3': { thermal:35.8, sound:31, vibration:61,  co2:980,  motion:3.1  },
  'SECTOR-D1': { thermal:35.2, sound:26, vibration:48,  co2:740,  motion:2.3  },
  'SECTOR-E2': { thermal:34.8, sound:21, vibration:18,  co2:610,  motion:1.4  },
};

// Track current simulated values
const current = JSON.parse(JSON.stringify(BASE));

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function rnd(a, b) { return Math.random() * (b - a) + a; }

console.log(`[SIM] Pushing sensor data to ${BACKEND_URL} every 2 seconds via HTTPS...\n`);

async function pushTick() {
  const zoneId = ZONES[Math.floor(Math.random() * ZONES.length)];
  const c      = current[zoneId];

  c.thermal   = +clamp(c.thermal   + rnd(-.12, .12),  33,   39  ).toFixed(2);
  c.sound     = +clamp(c.sound     + rnd(-2,   2  ),   5,   90  ).toFixed(0);
  c.vibration = +clamp(c.vibration + rnd(-3,   3  ),   1,   90  ).toFixed(0);
  c.co2       = +clamp(c.co2       + rnd(-15,  15 ), 400, 1800  ).toFixed(0);
  c.motion    = +clamp(c.motion    + rnd(-.3,  .3 ),   0,   15  ).toFixed(2);

  try {
    const res = await fetch(`${BACKEND_URL}/api/sensor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId, sensors: { ...c }, source: 'sensor-simulator' }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'Unknown error');
    console.log(`[SIM] ${zoneId} → thermal:${c.thermal}°C | sound:${c.sound}dB | co2:${c.co2}ppm`);
  } catch (e) {
    console.error(`[SIM] Push failed: ${e.message}`);
  }
}

setInterval(pushTick, 2000);
pushTick();
