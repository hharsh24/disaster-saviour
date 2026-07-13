-- PRANA — PostgreSQL Schema
-- Run automatically by server.js on startup (safe to re-run, uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS zones (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  x REAL, y REAL, r REAL,
  hc INTEGER DEFAULT 0, hp REAL DEFAULT 50,
  sr REAL DEFAULT 50,   ts REAL DEFAULT 0,
  assigned    TEXT,
  thermal REAL, sound REAL, vibration REAL, co2 REAL, motion REAL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,
  name TEXT, role TEXT, members INTEGER, color TEXT,
  status        TEXT DEFAULT 'available',
  assigned_zone TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drones (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'standby',
  zone TEXT, battery REAL DEFAULT 100, task TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT, sub TEXT, total INTEGER, deployed INTEGER DEFAULT 0, color TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_log (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ, severity TEXT, source TEXT, message TEXT,
  acknowledged BOOLEAN DEFAULT FALSE, ack_by TEXT, ack_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY,
  action TEXT, target TEXT, operator_id TEXT, timestamp TIMESTAMPTZ
);

-- Bonus: append-only sensor history (not overwritten like zones.thermal etc).
-- Not wired into server.js yet — kept here so it's ready when you want trend graphs.
CREATE TABLE IF NOT EXISTS sensor_history (
  id         BIGSERIAL PRIMARY KEY,
  zone_id    TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  thermal REAL, sound REAL, vibration REAL, co2 REAL, motion REAL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_history_zone_time ON sensor_history(zone_id, recorded_at DESC);
