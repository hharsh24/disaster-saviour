
# PRANA Backend — Setup & Integration Guide

## What You Need
- Node.js v18+ (https://nodejs.org)
- A PostgreSQL database (local install, Docker, or a hosted service like
  Railway, Supabase, Render Postgres, or RDS)
- The PRANA_v4.html frontend file

---

## STEP 0 — Get a PostgreSQL Database

Any of these work:

**Local Postgres:**
```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16
createdb prana

# Ubuntu/Debian
sudo apt install postgresql
sudo -u postgres createdb prana
```

**Docker (no local install needed):**
```bash
docker run --name prana-pg -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=prana -p 5432:5432 -d postgres:16
```

**Hosted (recommended for deployment):** create a free/small Postgres
instance on Railway, Supabase, Render, or Neon, and copy the connection
string it gives you.

Then copy `.env.example` to `.env` and set your connection string:
```bash
cp .env.example .env
```
```
DATABASE_URL=postgres://user:password@localhost:5432/prana
```
If your host requires SSL (most hosted providers do), also set:
```
PGSSL=true
```

---

## STEP 1 — Install & Start Backend

```bash
# Go into the backend folder
cd prana-backend

# Install dependencies (only once)
npm install

# Start the backend (schema is created automatically on first boot)
npm start
```

You should see:
```
╔══════════════════════════════════════════╗
║   PRANA Backend v3 — PostgreSQL           ║
╠══════════════════════════════════════════╣
║   WebSocket  ws://localhost:3001          ║
║   REST API   http://localhost:3001/api    ║
║   Database   PostgreSQL (DATABASE_URL)    ║
╚══════════════════════════════════════════╝
```

If `DATABASE_URL` isn't set, or Postgres isn't reachable, the server exits
immediately with a clear error instead of failing silently.

---

## STEP 2 — Open Frontend

Just open `PRANA_v4.html` in your browser.

The frontend already has `WS_URL = 'ws://localhost:3001'` set.
The green banner at the top will say **"Connected to PRANA backend"**.

If backend is OFF → automatically falls back to simulation mode.

---

## STEP 3 — Test It Works

Open the URL in TWO browser tabs.

1. In Tab 1: Go to Overview → Resource Allocation → increase Rescue Teams to 4
2. In Tab 2: Go to Rescue Dispatch
3. **Tab 2 instantly shows 4 teams** — this is real-time sync working.

Try assigning a team in Tab 1 → Tab 2 updates immediately.

---

## STEP 4 — Push Real Sensor Data

### Option A: Node.js Simulator (test without hardware)
```bash
# In a new terminal
node sensor-simulator.js
```
This pushes random-but-realistic sensor readings every 2 seconds.
You'll see the sensor values change live on the dashboard.

### Option B: Python (real hardware)
```bash
pip install websocket-client requests

# WebSocket mode (real-time, recommended)
python sensor_pusher.py --zone SECTOR-A1

# REST mode (simpler)
python sensor_pusher.py --mode rest --zone SECTOR-A1

# Push all 5 zones simultaneously
python sensor_pusher.py --mode multi
```

Edit `sensor_pusher.py` and replace the `read_thermal()`, `read_sound()` etc.
functions with your actual hardware SDK calls.

### Option C: Direct REST API (any language)
```bash
curl -X POST http://localhost:3001/api/sensor \
  -H "Content-Type: application/json" \
  -d '{
    "zoneId": "SECTOR-A1",
    "source": "raspberry-pi-1",
    "sensors": {
      "thermal": 37.4,
      "sound": 52,
      "vibration": 38,
      "co2": 1580,
      "motion": 7.2
    }
  }'
```

---

## REST API Reference

| Method | Endpoint              | What it does                          |
|--------|-----------------------|---------------------------------------|
| GET    | /health               | Check if server is running            |
| GET    | /api/state            | Get full current state (all data)     |
| GET    | /api/zones/:id        | Get one zone's data                   |
| POST   | /api/sensor           | Push sensor data from IoT/hardware    |
| POST   | /api/resource         | Update resource allocation            |
| POST   | /api/alert            | Inject a manual alert                 |
| GET    | /api/commands         | Get command history                   |

---

## WebSocket Message Reference

### Frontend → Backend (actions you take in dashboard)
| Type              | Payload                          | What happens                     |
|-------------------|----------------------------------|----------------------------------|
| ASSIGN_TEAM       | { teamId, zoneId }               | Team deployed to zone            |
| RECALL_TEAM       | { teamId }                       | Team pulled back                 |
| UPDATE_RESOURCE   | { resourceId, deployed }         | Resource count updated           |
| DISPATCH_DRONE    | { droneId, zoneId }              | Drone sent to zone               |
| DRONE_RTB         | { droneId }                      | Drone recalled to base           |
| BROADCAST_ALERT   | { message, severity }            | Message to all operators         |
| ACK_ERROR         | { errorId }                      | Error acknowledged               |
| SENSOR_UPDATE     | { zoneId, sensors }              | Push sensor data                 |
| PING              | {}                               | Keep connection alive            |

### Backend → Frontend (what backend pushes to you)
| Type              | Payload                          | When it fires                    |
|-------------------|----------------------------------|----------------------------------|
| INIT              | Full STATE object                | When you first connect           |
| STATE_UPDATE      | Partial state (any keys)         | After any change                 |
| ERROR_LOG         | Single alert object              | When threshold crossed           |
| ERROR_ACKNOWLEDGED| { id, acknowledgedBy }           | When someone acks an error       |
| COMMAND_LOG       | Single command object            | After every operator action      |
| COMMANDER_ALERT   | { message, severity, from }      | Broadcast from commander         |
| CLIENT_COUNT      | { count }                        | When someone connects/disconnects|
| ACTION_SUCCESS    | { action, teamId?, zoneId? }     | Confirms your action worked      |
| ERROR             | { message }                      | If your request was invalid      |

---

## File Structure
```
prana-backend/
├── server.js           ← Main backend (run this)
├── schema.sql           ← PostgreSQL schema (applied automatically on boot)
├── reset-db.js          ← Truncates all tables for a fresh start
├── .env.example         ← Copy to .env and set DATABASE_URL
├── sensor-simulator.js ← Test sensor data (Node.js)
├── sensor_pusher.py    ← Real IoT integration (Python)
├── package.json        ← Dependencies
└── README.md           ← This file

PRANA_v4.html           ← Frontend (open in browser)
```

## Notes on the PostgreSQL Migration

- The database is no longer a local file — it's a real Postgres instance,
  reachable via `DATABASE_URL`. This means you can host the database
  separately from the app server, and multiple app instances can share
  one database if you ever scale horizontally.
- `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run on
  every boot — existing data is never touched.
- A `sensor_history` table is included in the schema (append-only,
  indexed by zone + time) for future trend/graph features. It isn't wired
  into any handler yet — `zones.thermal/co2/etc.` still only holds the
  latest reading per zone.
- All sensor values pushed via `SENSOR_UPDATE` / `POST /api/sensor` are now
  validated against sane physical ranges before being written — malformed
  or out-of-range hardware readings are rejected with a clear error
  instead of silently corrupting the zone's state.
- `npm run reset-db` now truncates all tables (keeping the schema) instead
  of deleting a SQLite file.

---

## Deploying to a Real Server (production)

```bash
# Install PM2 process manager
npm install -g pm2

# Start and keep running permanently
pm2 start server.js --name prana-backend
pm2 save

# View logs
pm2 logs prana-backend
```

Then change frontend WS_URL to your server's IP:
```javascript
const WS_URL = 'wss://your-server-ip-or-domain.com/ws';
```

Multiple laptops/tablets on the same WiFi network can all open
PRANA_v4.html and connect to the same backend — they all see
each other's actions in real time.
