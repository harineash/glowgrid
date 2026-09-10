-- GlowGrid Smart Street Light — database schema
-- Run this once against your Vercel Postgres database before first deploy
-- (Vercel dashboard → Storage → your DB → Query, or via `psql "$POSTGRES_URL" -f db/schema.sql`)

CREATE TABLE IF NOT EXISTS lights (
  id            TEXT PRIMARY KEY,             -- e.g. 'SL-01' (matches ESP32 firmware naming)
  status        TEXT NOT NULL DEFAULT 'online', -- 'online' | 'fault' | 'dim'
  zone          TEXT NOT NULL,                  -- 'A'..'F'
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  type          TEXT,                           -- fixture type, e.g. 'LED 40W'
  notes         TEXT,                           -- location name, e.g. 'Main Gate'
  voltage       DOUBLE PRECISION,
  current       DOUBLE PRECISION,
  power         DOUBLE PRECISION,
  power_factor  DOUBLE PRECISION,
  frequency     DOUBLE PRECISION,
  energy_kwh    DOUBLE PRECISION NOT NULL DEFAULT 0,
  daily_baseline_kwh DOUBLE PRECISION,           -- energy_kwh snapshot at the start of "today" (IST)
  baseline_date DATE,                            -- which IST calendar date that snapshot belongs to
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for existing deployments: adds the frequency column if the
-- table was created before it existed. Safe to re-run — no-ops if the
-- column is already there.
ALTER TABLE lights ADD COLUMN IF NOT EXISTS frequency DOUBLE PRECISION;

-- Migration for existing deployments: server-persisted daily energy
-- tracking (see api/lights/[id].js PATCH), so "Energy Today" is correct
-- on reload / on any device, not just whichever browser tab has been
-- open since midnight. Safe to re-run.
ALTER TABLE lights ADD COLUMN IF NOT EXISTS daily_baseline_kwh DOUBLE PRECISION;
ALTER TABLE lights ADD COLUMN IF NOT EXISTS baseline_date DATE;

-- Migration for existing deployments: on-device AI diagnostics fields.
-- The real ESP32/PZEM firmware publishes its own ML classification per
-- reading (status: NORMAL/DEGRADED/FAULT, confidence %, health score
-- 0-100, remaining-useful-life in days, and radio signal strength) on
-- topic "streetlights/data" instead of the dashboard computing status
-- client-side. These columns persist that so it's available on reload
-- and from any device. Safe to re-run.
ALTER TABLE lights ADD COLUMN IF NOT EXISTS ai_status  TEXT;             -- raw device value: 'NORMAL' | 'DEGRADED' | 'FAULT'
ALTER TABLE lights ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION; -- 0-100 (%)
ALTER TABLE lights ADD COLUMN IF NOT EXISTS health     DOUBLE PRECISION; -- 0-100 (%)
ALTER TABLE lights ADD COLUMN IF NOT EXISTS rul_days   DOUBLE PRECISION; -- estimated remaining useful life, in days
ALTER TABLE lights ADD COLUMN IF NOT EXISTS rssi       DOUBLE PRECISION; -- radio signal strength, dBm (negative)

-- Keep updated_at accurate even on plain UPDATEs that forget to set it
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lights_touch ON lights;
CREATE TRIGGER trg_lights_touch
  BEFORE UPDATE ON lights
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- Seed the 10 BIT Sathy campus lights (matches the dashboard's built-in
-- fallback data, so the first deploy looks identical to the demo).
INSERT INTO lights (id, status, zone, lat, lon, type, notes) VALUES
  ('SL-01', 'online', 'A', 11.4956, 77.2728, 'LED 40W',        'Main Gate'),
  ('SL-02', 'online', 'A', 11.4968, 77.2738, 'LED 60W',        'Admin Block'),
  ('SL-03', 'online', 'B', 11.4978, 77.2749, 'LED 60W',        'Central Library'),
  ('SL-04', 'fault',  'B', 11.4992, 77.2757, 'LED 40W',        'Academic Block I'),
  ('SL-05', 'online', 'B', 11.5002, 77.2745, 'LED 40W',        'Academic Block II'),
  ('SL-06', 'dim',    'C', 11.5012, 77.2731, 'LED 30W',        'Boys Hostel'),
  ('SL-07', 'online', 'C', 11.4998, 77.2721, 'LED 30W',        'Girls Hostel'),
  ('SL-08', 'online', 'D', 11.4980, 77.2717, 'High Mast 150W', 'Sports Ground'),
  ('SL-09', 'fault',  'D', 11.4966, 77.2753, 'LED 40W',        'Cafeteria / Food Court'),
  ('SL-10', 'online', 'E', 11.4988, 77.2737, 'LED 60W',        'Auditorium')
ON CONFLICT (id) DO NOTHING;
