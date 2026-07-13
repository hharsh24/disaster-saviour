/**
 * PRANA — Sensor Simulator
 * ─────────────────────────────────────────
 * Simulates real IoT sensor data being pushed
 * to the backend every second.
 *
 * Run: node sensor-simulator.js
 *
 * In production, replace this with your actual
 * Python/Arduino/Raspberry Pi sensor scripts.
 */

const WebSocket = require('ws');

const WS_URL    = 'ws://localhost:3001';
const ZONES     = ['SECTOR-A1','SECTOR-B2','SECTOR-C3','SECTOR-D1','SECTOR-E2'];

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

let ws;
let connected = false;

function connect() {
  console.log(`[SIM] Connecting to ${WS_URL}...`);
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    connected = true;
    console.log('[SIM] ✓ Connected to PRANA backend');
    console.log('[SIM] Pushing sensor data every 2 seconds...\n');
    startPushing();
  });

  ws.on('close', () => {
    connected = false;
    console.log('[SIM] Disconnected. Retrying in 3s...');
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[SIM] Error:', err.message);
  });
}

function startPushing() {
  setInterval(() => {
    if (!connected) return;

    // Pick a random zone to update
    const zoneId = ZONES[Math.floor(Math.random() * ZONES.length)];
    const c      = current[zoneId];

    // Slightly randomize each reading
    c.thermal   = +clamp(c.thermal   + rnd(-.12, .12),  33,   39  ).toFixed(2);
    c.sound     = +clamp(c.sound     + rnd(-2,   2  ),   5,   90  ).toFixed(0);
    c.vibration = +clamp(c.vibration + rnd(-3,   3  ),   1,   90  ).toFixed(0);
    c.co2       = +clamp(c.co2       + rnd(-15,  15 ), 400, 1800  ).toFixed(0);
    c.motion    = +clamp(c.motion    + rnd(-.3,  .3 ),   0,   15  ).toFixed(2);

    const msg = {
      type:    'SENSOR_UPDATE',
      payload: {
        zoneId,
        sensors: { ...c },
        source:  'sensor-simulator',
      },
    };

    ws.send(JSON.stringify(msg));
    console.log(`[SIM] ${zoneId} → thermal:${c.thermal}°C | sound:${c.sound}dB | co2:${c.co2}ppm`);

  }, 2000);
}

connect();
