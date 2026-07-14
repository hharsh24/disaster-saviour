/**
 * ══════════════════════════════════════════════════════════
 *  PRANA Backend v3 — PostgreSQL Persistence
 * ══════════════════════════════════════════════════════════
 *
 *  WHAT THIS SAVES (survives restart/refresh/redeploy):
 *  ✓ Zone assignments (which team is in which zone)
 *  ✓ Resource counts (how many drones, teams deployed)
 *  ✓ Drone statuses (mission/standby/charging/returning)
 *  ✓ Team statuses (available/deployed + which zone)
 *  ✓ Error log (all alerts, acknowledged or not)
 *  ✓ Command log (every action, who did it, when)
 *  ✓ Sensor readings (latest per zone)
 *  ✓ Survivor counts per zone
 *
 *  HOW TO RUN:
 *    1. Have a Postgres instance running (local, Docker, or hosted —
 *       Railway / Supabase / RDS / Render Postgres all work).
 *    2. Set DATABASE_URL in your environment or a .env file, e.g.:
 *         DATABASE_URL=postgres://user:pass@host:5432/prana
 *    3. npm install
 *    4. npm start   (schema.sql is applied automatically on boot)
 *
 *  RESET ALL DATA: node reset-db.js  (truncates all tables, keeps schema)
 */

'use strict';

const express  = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const cors     = require('cors');
const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid } = require('uuid');
const { Pool } = require('pg');
const { getRecommendations, checkStateRules, checkActionRules } = require('./decisionRules');

// ─────────────────────────────────────
//  DATABASE SETUP
// ─────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL is not set. Example:');
  console.error('  DATABASE_URL=postgres://user:pass@localhost:5432/prana node server.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Thin helper so call sites read like the old better-sqlite3 style
async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}
async function qOne(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

// ─────────────────────────────────────
//  SEED DEFAULT DATA (only on first run)
// ─────────────────────────────────────
async function seedIfEmpty() {
  const { count } = await qOne('SELECT COUNT(*)::int AS count FROM zones');
  if (count > 0) {
    console.log('[DB] Existing data loaded from Postgres');
    return;
  }
  console.log('[DB] First run — seeding fresh data...');

  const zones = [
    {id:'SECTOR-A1',type:'collapse',  x:.22,y:.22,r:.10,hc:7,hp:94,sr:78,ts:2.5,thermal:37.1,sound:48,vibration:42,co2:1620,motion:8.2},
    {id:'SECTOR-B2',type:'collapse',  x:.56,y:.28,r:.09,hc:4,hp:88,sr:71,ts:3.1,thermal:36.4,sound:38,vibration:28,co2:1340,motion:5.4},
    {id:'SECTOR-C3',type:'earthquake',x:.35,y:.60,r:.11,hc:9,hp:81,sr:66,ts:4.8,thermal:35.8,sound:31,vibration:61,co2:980, motion:3.1},
    {id:'SECTOR-D1',type:'earthquake',x:.74,y:.52,r:.08,hc:3,hp:73,sr:60,ts:5.2,thermal:35.2,sound:26,vibration:48,co2:740, motion:2.3},
    {id:'SECTOR-E2',type:'collapse',  x:.18,y:.77,r:.07,hc:2,hp:61,sr:51,ts:6.0,thermal:34.8,sound:21,vibration:18,co2:610, motion:1.4},
  ];
  for (const z of zones) {
    await q(
      `INSERT INTO zones(id,type,x,y,r,hc,hp,sr,ts,assigned,thermal,sound,vibration,co2,motion)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,$12,$13,$14)`,
      [z.id,z.type,z.x,z.y,z.r,z.hc,z.hp,z.sr,z.ts,z.thermal,z.sound,z.vibration,z.co2,z.motion]
    );
  }

  const resources = [
    {id:'rescue_teams', name:'Rescue Teams',    sub:'Mobilized field teams', total:6,  deployed:2, color:'#00c882'},
    {id:'medical_staff',name:'Medical Staff',   sub:'Paramedics & nurses',   total:12, deployed:8, color:'#2b6fff'},
    {id:'drones',       name:'Drone Units',     sub:'Aerial surveillance',   total:8,  deployed:6, color:'#e8930a'},
    {id:'ambulances',   name:'Ambulances',      sub:'Transport vehicles',    total:4,  deployed:2, color:'#2b6fff'},
    {id:'beacons',      name:'Acoustic Beacons',sub:'Survivor detection',    total:20, deployed:5, color:'#f03e5c'},
    {id:'thermal_cams', name:'Thermal Cameras', sub:'Heat imaging units',    total:6,  deployed:6, color:'#00c882'},
    {id:'cutting_tools',name:'Cutting Tools',   sub:'Extrication gear',      total:10, deployed:7, color:'#e8930a'},
    {id:'oxygen',       name:'O₂ Cylinders',    sub:'Medical oxygen',        total:30, deployed:22,color:'#2b6fff'},
  ];
  for (const r of resources) {
    await q(
      `INSERT INTO resources(id,name,sub,total,deployed,color) VALUES($1,$2,$3,$4,$5,$6)`,
      [r.id,r.name,r.sub,r.total,r.deployed,r.color]
    );
  }

  const drones = [
    {id:'DR-01',status:'mission',  zone:'SECTOR-A1',battery:78, task:'Thermal scan — survivors located'},
    {id:'DR-02',status:'mission',  zone:'SECTOR-B2',battery:64, task:'Acoustic beacon deployed'},
    {id:'DR-03',status:'mission',  zone:'SECTOR-C3',battery:91, task:'Mapping debris field'},
    {id:'DR-04',status:'mission',  zone:'SECTOR-D1',battery:55, task:'Human signal confirmed'},
    {id:'DR-05',status:'returning',zone:null,        battery:18, task:'Battery low — returning'},
    {id:'DR-06',status:'mission',  zone:'SECTOR-E2',battery:83, task:'Perimeter sweep active'},
    {id:'DR-07',status:'charging', zone:null,        battery:32, task:'Charging — ETA 12 min'},
    {id:'DR-08',status:'standby',  zone:null,        battery:100,task:'Ready for dispatch'},
  ];
  for (const d of drones) {
    await q(
      `INSERT INTO drones(id,status,zone,battery,task) VALUES($1,$2,$3,$4,$5)`,
      [d.id,d.status,d.zone,d.battery,d.task]
    );
  }

  await pushAlertRaw('CRITICAL','SECTOR-C3','9 survivors — team not yet assigned');
  await pushAlertRaw('HIGH',    'SECTOR-A1','CO₂ critical: 1620 ppm');

  console.log('[DB] Seed complete');
}

// ─────────────────────────────────────
//  LOAD FULL STATE FROM DB
// ─────────────────────────────────────
async function loadState() {
  const [zoneRows, teamRows, droneRows, resourceRows, errorRows, cmdRows] = await Promise.all([
    q('SELECT * FROM zones ORDER BY id'),
    q('SELECT * FROM teams ORDER BY id'),
    q('SELECT * FROM drones ORDER BY id'),
    q('SELECT * FROM resources ORDER BY id'),
    q('SELECT * FROM error_log ORDER BY timestamp DESC LIMIT 100'),
    q('SELECT * FROM command_log ORDER BY timestamp DESC LIMIT 100'),
  ]);

  return {
    zones: zoneRows.map(z => ({
      id:z.id, type:z.type, x:z.x, y:z.y, r:z.r,
      hc:z.hc, hp:z.hp, sr:z.sr, ts:z.ts, assigned:z.assigned || null,
      sensors:{thermal:z.thermal, sound:z.sound, vibration:z.vibration, co2:z.co2, motion:z.motion}
    })),
    teams: teamRows.map(t => ({
      id:t.id, name:t.name, role:t.role, members:t.members, color:t.color,
      status:t.status, assignedZone:t.assigned_zone || null
    })),
    drones: droneRows.map(d => ({
      id:d.id, status:d.status, zone:d.zone || null, battery:d.battery, task:d.task
    })),
    resources: resourceRows.map(r => ({
      id:r.id, name:r.name, sub:r.sub, total:r.total, deployed:r.deployed, color:r.color
    })),
    errorLog: errorRows.map(e => ({
      id:e.id, timestamp:e.timestamp, severity:e.severity, source:e.source, message:e.message,
      acknowledged: !!e.acknowledged, acknowledgedBy: e.ack_by || null
    })),
    commandLog: cmdRows.map(c => ({
      id:c.id, action:c.action, target:c.target, operatorId:c.operator_id, timestamp:c.timestamp
    })),
  };
}

// ─────────────────────────────────────
//  SERVER + WEBSOCKET
// ─────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'PRANA_v4.html'));
});

function clientCount() { return [...wss.clients].filter(c => c.readyState === WebSocket.OPEN).length; }
function sendTo(ws, msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
async function broadcastState() {
  const state = await loadState();
  const d = JSON.stringify({ type:'STATE_UPDATE', payload: state });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(d); });
}
function broadcastRaw(msg) {
  const d = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(d); });
}

async function pushAlertRaw(severity, source, message) {
  const a = { id:uuid(), timestamp:new Date().toISOString(), severity, source, message, acknowledged:false };
  await q(
    `INSERT INTO error_log(id,timestamp,severity,source,message,acknowledged) VALUES($1,$2,$3,$4,$5,false)`,
    [a.id, a.timestamp, a.severity, a.source, a.message]
  );
  return a;
}
async function pushAlert(severity, source, message) {
  const a = await pushAlertRaw(severity, source, message);
  broadcastRaw({ type:'ERROR_LOG', payload:a });
  return a;
}
async function logCmd(action, target, operatorId) {
  const e = { id:uuid(), action, target, operator_id: operatorId || 'SYSTEM', timestamp: new Date().toISOString() };
  await q(
    `INSERT INTO command_log(id,action,target,operator_id,timestamp) VALUES($1,$2,$3,$4,$5)`,
    [e.id, e.action, e.target, e.operator_id, e.timestamp]
  );
  broadcastRaw({ type:'COMMAND_LOG', payload:{ id:e.id, action, target, operatorId:e.operator_id, timestamp:e.timestamp } });
}

async function logDecision({ recommendation, ruleViolations, actionTaken, actionTarget, followedRecommendation, operatorId }) {
  const id = uuid();
  await q(
    `INSERT INTO decision_log(id,recommendation,rule_violations,action_taken,action_target,followed_recommendation,operator_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [id, JSON.stringify(recommendation || null), JSON.stringify(ruleViolations || []), actionTaken || null,
     actionTarget || null, followedRecommendation ?? null, operatorId || 'SYSTEM']
  );
  return id;
}

// ─────────────────────────────────────
//  VALIDATION HELPERS
// ─────────────────────────────────────
const SENSOR_BOUNDS = {
  thermal:   [-40, 200],
  sound:     [0, 200],
  vibration: [0, 200],
  co2:       [0, 20000],
  motion:    [0, 100],
};
function sanitizeSensors(sensors) {
  const out = {};
  for (const key of Object.keys(SENSOR_BOUNDS)) {
    if (sensors[key] === undefined) continue;
    const n = Number(sensors[key]);
    const [min, max] = SENSOR_BOUNDS[key];
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`Invalid sensor value for "${key}": ${sensors[key]}`);
    }
    out[key] = n;
  }
  return out;
}

// ─────────────────────────────────────
//  TEAM POOL
// ─────────────────────────────────────
const TEAM_POOL = [
  {id:'ALPHA',  name:'Team ALPHA',  role:'Search & Extraction',members:5,color:'#00c882'},
  {id:'BRAVO',  name:'Team BRAVO',  role:'Medical Response',   members:3,color:'#2b6fff'},
  {id:'CHARLIE',name:'Team CHARLIE',role:'Heavy Rescue',       members:4,color:'#f03e5c'},
  {id:'DELTA',  name:'Team DELTA',  role:'Urban Search',       members:3,color:'#e8930a'},
  {id:'ECHO',   name:'Team ECHO',   role:'Medical Triage',     members:2,color:'#8b52e8'},
  {id:'FOXTROT',name:'Team FOXTROT',role:'Support & Logistics',members:4,color:'#00c882'},
];

async function rebuildTeams(mobilized) {
  const existingRows = await q('SELECT * FROM teams');
  const existing = new Map(existingRows.map(t => [t.id, t]));
  await q('DELETE FROM teams');
  const active = TEAM_POOL.slice(0, Math.min(mobilized, TEAM_POOL.length));
  for (const tp of active) {
    const ex = existing.get(tp.id);
    await q(
      `INSERT INTO teams(id,name,role,members,color,status,assigned_zone) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [tp.id, tp.name, tp.role, tp.members, tp.color, ex ? ex.status : 'available', ex ? ex.assigned_zone : null]
    );
  }
}

async function syncDroneStatuses(targetDeployed) {
  const drones = await q('SELECT * FROM drones');
  const active = drones.filter(d => d.status === 'mission' || d.status === 'returning').length;
  const zones  = await q('SELECT id FROM zones');
  if (active < targetDeployed) {
    let need = targetDeployed - active;
    for (const d of drones) {
      if (need > 0 && (d.status === 'standby' || d.status === 'charging')) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        await q(`UPDATE drones SET status='mission',zone=$1,task='Dispatched to zone' WHERE id=$2`, [z ? z.id : null, d.id]);
        need--;
      }
    }
  } else if (active > targetDeployed) {
    let excess = active - targetDeployed;
    for (const d of drones) {
      if (excess > 0 && d.status === 'mission') {
        await q(`UPDATE drones SET status='standby',zone=NULL,task='Recalled — standby' WHERE id=$1`, [d.id]);
        excess--;
      }
    }
  }
}

// ─────────────────────────────────────
//  EVENT HANDLERS
// ─────────────────────────────────────
const handlers = {
  async ASSIGN_TEAM({teamId,zoneId,operatorId}, ws) {
    const zone = await qOne('SELECT * FROM zones WHERE id=$1', [zoneId]);
    const team = await qOne('SELECT * FROM teams WHERE id=$1', [teamId]);
    if (!zone) return sendTo(ws,{type:'ERROR',payload:{message:`Zone ${zoneId} not found`}});
    if (!team) return sendTo(ws,{type:'ERROR',payload:{message:`Team ${teamId} not found`}});
    if (zone.assigned) return sendTo(ws,{type:'ERROR',payload:{message:`Zone already has team`}});
    if (team.status!=='available') return sendTo(ws,{type:'ERROR',payload:{message:`Team not available`}});
    await q(`UPDATE zones SET assigned=$1, updated_at=NOW() WHERE id=$2`, [teamId, zoneId]);
    await q(`UPDATE teams SET status='deployed', assigned_zone=$1, updated_at=NOW() WHERE id=$2`, [zoneId, teamId]);
    await broadcastState();
    sendTo(ws,{type:'ACTION_SUCCESS',payload:{action:'ASSIGN_TEAM',teamId,zoneId}});
    await logCmd('ASSIGN_TEAM',`${teamId} → ${zoneId}`,operatorId);
    console.log(`[ASSIGN] ${teamId} → ${zoneId}`);
  },

  async RECALL_TEAM({teamId,operatorId,force}, ws) {
    const team = await qOne('SELECT * FROM teams WHERE id=$1', [teamId]);
    if (!team) return sendTo(ws,{type:'ERROR',payload:{message:`Team not found`}});

    // Safety check: refuse to blindly pull a team off an uncovered critical zone.
    const state = await loadState();
    const violations = checkActionRules(state, { type: 'RECALL_TEAM', teamId });
    const blocking = violations.filter(v => v.severity === 'BLOCK');
    if (blocking.length && !force) {
      await logDecision({ actionTaken: 'RECALL_TEAM_BLOCKED', actionTarget: teamId, operatorId, ruleViolations: blocking });
      return sendTo(ws, { type: 'ERROR', payload: { message: blocking[0].message, violations: blocking } });
    }

    if (team.assigned_zone) await q(`UPDATE zones SET assigned=NULL WHERE id=$1`, [team.assigned_zone]);
    await q(`UPDATE teams SET status='available', assigned_zone=NULL, updated_at=NOW() WHERE id=$1`, [teamId]);
    await broadcastState();
    await logCmd('RECALL_TEAM',teamId,operatorId);
    await logDecision({ actionTaken: 'RECALL_TEAM', actionTarget: teamId, operatorId, ruleViolations: violations });
    console.log(`[RECALL] ${teamId}${force && blocking.length ? ' (forced past warning)' : ''}`);
  },

  async UPDATE_RESOURCE({resourceId,deployed,operatorId}, ws) {
    const res = await qOne('SELECT * FROM resources WHERE id=$1', [resourceId]);
    if (!res) return sendTo(ws,{type:'ERROR',payload:{message:`Resource not found`}});
    const parsed = Number(deployed);
    if (!Number.isFinite(parsed)) return sendTo(ws,{type:'ERROR',payload:{message:`"deployed" must be a number`}});
    const newVal = Math.max(0, Math.min(res.total, Math.round(parsed)));
    await q(`UPDATE resources SET deployed=$1, updated_at=NOW() WHERE id=$2`, [newVal, resourceId]);
    if (resourceId==='rescue_teams') await rebuildTeams(newVal);
    if (resourceId==='drones')       await syncDroneStatuses(newVal);
    await broadcastState();
    await logCmd('UPDATE_RESOURCE',`${res.name}: ${res.deployed}→${newVal}`,operatorId);
    console.log(`[RESOURCE] ${res.name}: ${res.deployed} → ${newVal}`);
  },

  async DRONE_RTB({droneId,operatorId}, ws) {
    const drone = await qOne('SELECT id FROM drones WHERE id=$1', [droneId]);
    if (!drone) return sendTo(ws,{type:'ERROR',payload:{message:'Drone not found'}});
    await q(`UPDATE drones SET status='returning', zone=NULL, task=$1, updated_at=NOW() WHERE id=$2`, ['Manual RTB', droneId]);
    await broadcastState();
    await logCmd('DRONE_RTB',droneId,operatorId);
  },

  async DISPATCH_DRONE({droneId,zoneId,operatorId}, ws) {
    const drone = await qOne('SELECT * FROM drones WHERE id=$1', [droneId]);
    if (!drone) return sendTo(ws,{type:'ERROR',payload:{message:'Drone not found'}});
    if (drone.battery < 15) return sendTo(ws,{type:'ERROR',payload:{message:`Battery too low`}});
    await q(`UPDATE drones SET status='mission', zone=$1, task=$2, updated_at=NOW() WHERE id=$3`, [zoneId, `Dispatched to ${zoneId}`, droneId]);
    await broadcastState();
    await logCmd('DISPATCH_DRONE',`${droneId} → ${zoneId}`,operatorId);
  },

  async BROADCAST_ALERT({message,severity,operatorId}, ws) {
    if (!message || !severity) return sendTo(ws,{type:'ERROR',payload:{message:'message and severity required'}});
    broadcastRaw({type:'COMMANDER_ALERT',payload:{message,severity,from:operatorId}});
    await logCmd('BROADCAST',`[${severity}] ${message}`,operatorId);
  },

  async ACK_ERROR({errorId,operatorId}, ws) {
    if (!errorId) return sendTo(ws,{type:'ERROR',payload:{message:'errorId required'}});
    await q(`UPDATE error_log SET acknowledged=true, ack_by=$1, ack_at=NOW() WHERE id=$2`, [operatorId || 'SYSTEM', errorId]);
    broadcastRaw({type:'ERROR_ACKNOWLEDGED',payload:{id:errorId,acknowledgedBy:operatorId}});
  },

  async SENSOR_UPDATE({zoneId,sensors}, ws) {
    const zone = await qOne('SELECT id FROM zones WHERE id=$1', [zoneId]);
    if (!zone) {
      const message = `Zone ${zoneId} not found`;
      if (ws) return sendTo(ws,{type:'ERROR',payload:{message}});
      throw new Error(message);
    }
    let clean;
    try {
      clean = sanitizeSensors(sensors || {});
    } catch (e) {
      if (ws) return sendTo(ws,{type:'ERROR',payload:{message:e.message}});
      throw e;
    }
    await q(
      `UPDATE zones SET
        thermal=COALESCE($1,thermal), sound=COALESCE($2,sound),
        vibration=COALESCE($3,vibration), co2=COALESCE($4,co2),
        motion=COALESCE($5,motion), updated_at=NOW() WHERE id=$6`,
      [clean.thermal ?? null, clean.sound ?? null, clean.vibration ?? null, clean.co2 ?? null, clean.motion ?? null, zoneId]
    );
    await checkThresholds(zoneId);
    await broadcastState();
  },

  async ADJUST_SURVIVOR({zoneId,action,operatorId}, ws) {
    const zone = await qOne('SELECT * FROM zones WHERE id=$1', [zoneId]);
    if (!zone) return sendTo(ws,{type:'ERROR',payload:{message:'Zone not found'}});
    const newHc = Math.max(0, action==='add' ? zone.hc+1 : zone.hc-1);
    await q(`UPDATE zones SET hc=$1, updated_at=NOW() WHERE id=$2`, [newHc, zoneId]);
    await broadcastState();
    await logCmd('SURVIVOR_UPDATE',`${zoneId}: ${action} → ${newHc}`,operatorId);
  },

  async PING(_, ws) { sendTo(ws,{type:'PONG',payload:{ts:Date.now()}}); },
};

// ─────────────────────────────────────
//  THRESHOLD ALERTS
// ─────────────────────────────────────
const lastAlerted = {};
const ALERT_COOLDOWN_MS = 60_000;
async function checkThresholds(zoneId) {
  const z = await qOne('SELECT * FROM zones WHERE id=$1', [zoneId]);
  if (!z) return;
  const now = Date.now();
  const can = t => !lastAlerted[zoneId+':'+t] || now-lastAlerted[zoneId+':'+t] > ALERT_COOLDOWN_MS;
  const mark = t => { lastAlerted[zoneId+':'+t] = now; };
  if (z.co2>1500    && can('co2'))     { await pushAlert('CRITICAL',zoneId,`CO₂ critical: ${z.co2} ppm`);     mark('co2');     }
  if (z.thermal>38  && can('thermal')) { await pushAlert('HIGH',    zoneId,`Thermal peak ${z.thermal}°C`);     mark('thermal'); }
  if (z.sound>70    && can('sound'))   { await pushAlert('HIGH',    zoneId,`Sound ${z.sound} dB — vocalization`);mark('sound'); }
  if (z.sr<40 && !z.assigned && can('noTeam')) { await pushAlert('CRITICAL',zoneId,`SR ${Number(z.sr).toFixed(0)}% — no team assigned`); mark('noTeam'); }
}

// ─────────────────────────────────────
//  WEBSOCKET HANDLER
// ─────────────────────────────────────
wss.on('connection', async (ws, req) => {
  console.log(`[WS] Connected — ${req.socket.remoteAddress} | Total: ${clientCount()}`);
  sendTo(ws, {type:'INIT', payload: await loadState()});
  broadcastRaw({type:'CLIENT_COUNT', payload:{count:clientCount()}});

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return sendTo(ws,{type:'ERROR',payload:{message:'Invalid JSON'}}); }
    const h = handlers[msg.type];
    if (h) {
      try { await h(msg.payload || {}, ws); }
      catch (e) { console.error(`[ERR] ${msg.type}:`, e.message); sendTo(ws,{type:'ERROR',payload:{message:'Internal error processing request'}}); }
    } else {
      console.warn(`[WS] Unknown: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Disconnected | Total: ${clientCount()}`);
    broadcastRaw({type:'CLIENT_COUNT', payload:{count:clientCount()}});
  });
});

// ─────────────────────────────────────
//  SIMULATION LOOP — writes to DB every 4s
// ─────────────────────────────────────
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function rnd(a,b){return Math.random()*(b-a)+a;}

async function runSimulationTick() {
  const zones = await q('SELECT * FROM zones');
  for (const z of zones) {
    const lam = z.type==='collapse' ? 0.048 : 0.035;
    const newTs = Number(z.ts) + 4/3600;
    const newSr = z.hc>0 ? clamp(95*Math.exp(-lam*newTs)+rnd(-2,2), 1, 99) : Number(z.sr);
    await q(
      `UPDATE zones SET thermal=$1,sound=$2,vibration=$3,sr=$4,ts=$5,hp=$6,updated_at=NOW() WHERE id=$7`,
      [
        +clamp(Number(z.thermal)+rnd(-.15,.15), 33, 38.5).toFixed(2),
        +clamp(Number(z.sound)+rnd(-1.5,1.5), 5, 90).toFixed(0),
        +clamp(Number(z.vibration)+rnd(-2,2), 1, 90).toFixed(0),
        +newSr.toFixed(2),
        +newTs.toFixed(4),
        z.assigned ? Number(z.hp) : +clamp(Number(z.hp)-rnd(0,0.05),10,99).toFixed(1),
        z.id,
      ]
    );
    await checkThresholds(z.id);
  }

  const drones = await q('SELECT * FROM drones');
  for (const d of drones) {
    let { status, battery, zone, task } = d;
    battery = Number(battery);
    if (status==='mission')   battery = +clamp(battery-rnd(.05,.18),0,100).toFixed(1);
    if (status==='returning') battery = +clamp(battery-rnd(.02,.08),0,100).toFixed(1);
    if (status==='charging')  battery = +clamp(battery+rnd(.3,.6),  0,100).toFixed(1);
    if (status==='mission'  && battery<15){ status='returning'; zone=null; task='Battery critical — auto RTB'; await pushAlert('HIGH',d.id,`${d.id} auto-RTB: battery ${battery}%`); }
    if (status==='returning'&& battery<3) { status='charging';  zone=null; task='Charging — ETA '+Math.ceil(rnd(10,20))+' min'; }
    if (status==='charging' && battery>=100){ battery=100; status='standby'; task='Fully charged — ready'; await pushAlert('INFO',d.id,`${d.id} fully charged`); }
    await q(`UPDATE drones SET battery=$1,status=$2,zone=$3,task=$4,updated_at=NOW() WHERE id=$5`, [battery, status, zone || null, task, d.id]);
  }

  await broadcastState();
}

// ─────────────────────────────────────
//  REST API
// ─────────────────────────────────────
app.get('/api/state', async (_,res) => {
  try { res.json({ok:true,data: await loadState()}); }
  catch (e) { res.status(500).json({ok:false,message:e.message}); }
});

app.get('/api/commands', async (_,res) => {
  try {
    const rows = await q('SELECT * FROM command_log ORDER BY timestamp DESC LIMIT 100');
    res.json({ok:true,data:rows});
  } catch (e) { res.status(500).json({ok:false,message:e.message}); }
});

app.get('/api/zones/:id', async (req,res) => {
  const z = await qOne('SELECT * FROM zones WHERE id=$1', [req.params.id]);
  if (!z) return res.status(404).json({ok:false,message:'Zone not found'});
  res.json({ok:true,data:z});
});

app.post('/api/sensor', async (req,res) => {
  const {zoneId,sensors} = req.body;
  if (!zoneId || !sensors) return res.status(400).json({ok:false,message:'zoneId and sensors required'});
  const zone = await qOne('SELECT id FROM zones WHERE id=$1', [zoneId]);
  if (!zone) return res.status(404).json({ok:false,message:'Zone not found'});
  try {
    await handlers.SENSOR_UPDATE({zoneId,sensors}, null);
    res.json({ok:true,message:'Updated and broadcast to all dashboards'});
  } catch (e) {
    res.status(400).json({ok:false,message:e.message});
  }
});

app.post('/api/alert', async (req,res) => {
  const {severity,source,message} = req.body;
  if (!severity || !source || !message) return res.status(400).json({ok:false,message:'severity, source, message required'});
  const alert = await pushAlert(severity,source,message);
  res.json({ok:true,data:alert});
});

app.post('/api/action', async (req, res) => {
  const { type, payload } = req.body || {};
  const h = handlers[type];
  if (!h) return res.status(400).json({ ok:false, message:`Unknown action type: ${type}` });
  let captured = null;
  const fakeWs = { readyState: WebSocket.OPEN, send: raw => { captured = JSON.parse(raw); } };
  try {
    await h(payload || {}, fakeWs);
    if (captured && captured.type === 'ERROR') {
      return res.status(400).json({ ok:false, message: captured.payload.message });
    }
    res.json({ ok:true, message:'Action processed', data: captured });
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message });
  }
});

app.get('/api/recommendation', async (_,res) => {
  try {
    const state = await loadState();
    const recommendations = getRecommendations(state);
    const violations = checkStateRules(state);
    await logDecision({ recommendation: recommendations, ruleViolations: violations });
    res.json({
      ok: true,
      data: {
        recommendations: recommendations.map(z => ({ zoneId: z.id, score: +z.score.toFixed(1), hc: z.hc, sr: z.sr, ts: z.ts })),
        warnings: violations.filter(v => v.severity === 'WARN'),
        blocks: violations.filter(v => v.severity === 'BLOCK'),
      },
    });
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message });
  }
});

// ─────────────────────────────────────
//  AI ADVICE (natural-language, via Claude API — no training required)
// ─────────────────────────────────────
// This calls the real Anthropic API to turn the current state + rule-checker
// output into a short, human-readable recommendation. It is a THIN LAYER on
// top of decisionRules.js — the LLM explains and prioritizes in plain
// English, it does not invent its own scoring logic, and it never takes
// action directly (no tool calls to ASSIGN_TEAM etc.). A human still decides.
async function generateAdvice(state, recommendations, violations) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — see .env.example');
  }

  const context = {
    topZones: recommendations.map(z => ({ zoneId: z.id, score: +z.score.toFixed(1), survivors: z.hc, survivalRate: z.sr, hoursSinceIncident: z.ts })),
    availableTeams: state.teams.filter(t => t.status === 'available').map(t => t.id),
    ruleWarnings: violations.filter(v => v.severity === 'WARN').map(v => v.message),
    ruleBlocks: violations.filter(v => v.severity === 'BLOCK').map(v => v.message),
    unacknowledgedCriticalAlerts: state.errorLog.filter(e => e.severity === 'CRITICAL' && !e.acknowledged).map(e => `${e.source}: ${e.message}`),
  };

  const systemPrompt =
    'You are an advisory assistant for a disaster-response coordination dashboard. ' +
    'You are given a ranked list of zones (from a deterministic priority formula, not your own judgment), ' +
    'plus rule-checker warnings. Write a short (3-5 sentence) recommendation for the human operator: ' +
    'which zone to prioritize and why, and call out any rule warnings that need attention. ' +
    'Do not invent data not given to you. Do not claim certainty the data does not support. ' +
    'You are giving advice, not issuing commands — the operator makes the final call.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Current situation:\n${JSON.stringify(context, null, 2)}` }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return text;
}

app.get('/api/advice', async (_, res) => {
  try {
    const state = await loadState();
    const recommendations = getRecommendations(state);
    const violations = checkStateRules(state);
    const advice = await generateAdvice(state, recommendations, violations);
    await logDecision({ recommendation: recommendations, ruleViolations: violations, actionTaken: 'ADVICE_GENERATED' });
    res.json({ ok: true, data: { advice, recommendations, warnings: violations.filter(v => v.severity === 'WARN') } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get('/health', async (_,res) => {
  try {
    const { n } = await qOne('SELECT COUNT(*)::int AS n FROM zones');
    res.json({ ok:true, uptime: process.uptime().toFixed(0)+'s', clients: clientCount(), zones: n });
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message });
  }
});

// ─────────────────────────────────────
//  START
// ─────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  await ensureSchema();
  await seedIfEmpty();

  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   PRANA Backend v3 — PostgreSQL           ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║   WebSocket  ws://localhost:${PORT}         ║`);
    console.log(`║   REST API   http://localhost:${PORT}/api   ║`);
    console.log('║   Database   PostgreSQL (DATABASE_URL)    ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  });

  setInterval(() => {
    runSimulationTick().catch(e => console.error('[SIM ERROR]', e.message));
  }, 4000);
}

// ─────────────────────────────────────
//  GRACEFUL SHUTDOWN
// ─────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[SHUTDOWN] ${signal} received — closing connections...`);
  wss.clients.forEach(c => c.close());
  server.close(async () => {
    await pool.end();
    console.log('[SHUTDOWN] Done.');
    process.exit(0);
  });
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch(e => {
  console.error('[FATAL] Failed to start:', e);
  process.exit(1);
});
