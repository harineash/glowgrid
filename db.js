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
        kwh: Number(row.energy_kwh),
        ts: row.updated_at,
      },
    }),
  };
}
