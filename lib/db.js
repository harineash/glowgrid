// Shared Postgres client for all /api routes.
// @vercel/postgres automatically picks up the POSTGRES_URL / POSTGRES_URL_NON_POOLING
// env vars that Vercel injects once you attach a Postgres store to this project
// (Vercel dashboard → Storage → Create Database → Postgres → Connect to Project).
import { sql } from '@vercel/postgres';

export { sql };

// Converts a DB row (snake_case, separate telemetry columns) into the
// shape the frontend's LIGHT_NODES / LIGHT_LIVE_DATA expect.
export function rowToLight(row) {
  const hasLiveData = row.voltage !== null && row.voltage !== undefined;
  const energyKwh = Number(row.energy_kwh) || 0;
  // kwhToday is derived, not stored directly: the PATCH endpoint keeps
  // daily_baseline_kwh pinned to energy_kwh's value at the start of
  // "today" (IST), so today's usage is just the gap between the two.
  // A light with no baseline yet (brand new / never PATCHed) shows 0
  // rather than the full lifetime total.
  const hasBaseline = row.daily_baseline_kwh !== null && row.daily_baseline_kwh !== undefined;
  const kwhToday = hasBaseline ? Math.max(0, energyKwh - Number(row.daily_baseline_kwh)) : 0;
  return {
    id: row.id,
    s: row.status,
    z: row.zone,
    lat: Number(row.lat),
    lon: Number(row.lon),
    type: row.type || undefined,
    notes: row.notes || undefined,
    ...(hasLiveData && {
      live: {
        voltage: Number(row.voltage),
        current: Number(row.current),
        power: Number(row.power),
        pf: Number(row.power_factor),
        freq: row.frequency !== null && row.frequency !== undefined ? Number(row.frequency) : null,
        kwh: energyKwh,
        kwhToday,
        ts: row.updated_at,
        // On-device AI diagnostics (from the ESP32/PZEM ML classifier —
        // topic "streetlights/data"). Any of these can be null on older
        // rows / firmware that doesn't report them yet.
        aiStatus: row.ai_status || null,
        confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
        health: row.health !== null && row.health !== undefined ? Number(row.health) : null,
        rulDays: row.rul_days !== null && row.rul_days !== undefined ? Number(row.rul_days) : null,
        rssi: row.rssi !== null && row.rssi !== undefined ? Number(row.rssi) : null,
      },
    }),
  };
}
