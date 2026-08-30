import { sql, rowToLight } from '../../lib/db.js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'A light id is required in the URL, e.g. /api/lights/SL-01' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT * FROM lights WHERE id = ${id}`;
      if (!rows.length) return res.status(404).json({ error: `No light with id "${id}"` });
      return res.status(200).json(rowToLight(rows[0]));
    } catch (err) {
      console.error(`GET /api/lights/${id} failed:`, err);
      return res.status(500).json({ error: 'Could not load light', detail: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { rowCount } = await sql`DELETE FROM lights WHERE id = ${id}`;
      if (!rowCount) return res.status(404).json({ error: `No light with id "${id}"` });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`DELETE /api/lights/${id} failed:`, err);
      return res.status(500).json({ error: 'Could not delete light', detail: err.message });
    }
  }

  // PATCH is used two ways by the dashboard:
  //  - status/zone/location edits from the UI
  //  - live telemetry ticks from MQTT (voltage/current/power/pf + an
  //    incremental energyDeltaKwh, added onto the running total rather
  //    than overwriting it)
  if (req.method === 'PATCH') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { status, zone, lat, lon, type, notes, voltage, current, power, pf, energyDeltaKwh } = body || {};

      if (status && !['online', 'fault', 'dim'].includes(status)) {
        return res.status(400).json({ error: 'status must be one of: online, fault, dim' });
      }

      const { rowCount } = await sql`
        UPDATE lights SET
          status       = COALESCE(${status}, status),
          zone         = COALESCE(${zone}, zone),
          lat          = COALESCE(${lat}, lat),
          lon          = COALESCE(${lon}, lon),
          type         = COALESCE(${type}, type),
          notes        = COALESCE(${notes}, notes),
          voltage      = COALESCE(${voltage}, voltage),
          current      = COALESCE(${current}, current),
          power        = COALESCE(${power}, power),
          power_factor = COALESCE(${pf}, power_factor),
          energy_kwh   = energy_kwh + COALESCE(${energyDeltaKwh}, 0),
          updated_at   = now()
        WHERE id = ${id}
      `;

      if (!rowCount) return res.status(404).json({ error: `No light with id "${id}"` });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`PATCH /api/lights/${id} failed:`, err);
      return res.status(500).json({ error: 'Could not update light', detail: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
