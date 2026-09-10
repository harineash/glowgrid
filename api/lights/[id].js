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
  //  - live telemetry ticks from MQTT (voltage/current/power/pf/frequency +
  //    an incremental energyDeltaKwh, added onto the running total rather
  //    than overwriting it). frequency is optional — only sent when the
  //    firmware actually reports it — so COALESCE just keeps the previous
  //    value on ticks that omit it.
  //
  //  Server-side daily energy reset: daily_baseline_kwh/baseline_date track
  //  the energy_kwh snapshot at the start of "today" in IST (the campus's
  //  timezone, not whichever browser happens to be open). Whenever a PATCH
  //  lands on a new IST calendar date, the baseline snapshots forward to
  //  the just-updated energy_kwh — same instant energy_kwh itself updates,
  //  so "today" correctly starts at 0 right after that first reading of
  //  the day, computed server-side so it's correct regardless of which
  //  device/tab is (or isn't) open when midnight passes.
  if (req.method === 'PATCH') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        status, zone, lat, lon, type, notes, voltage, current, power, pf, frequency, energyDeltaKwh,
        // On-device AI diagnostics — sent by firmware that already runs its
        // own ML classifier (topic "streetlights/data" carries confidence/
        // health/rul_days/rssi alongside the raw NORMAL/DEGRADED/FAULT
        // status). `aiStatus` is the raw device string; `status` above is
        // the dashboard's own online/dim/fault mapping of it.
        aiStatus, confidence, health, rulDays, rssi,
      } = body || {};

      if (status && !['online', 'fault', 'dim'].includes(status)) {
        return res.status(400).json({ error: 'status must be one of: online, fault, dim' });
      }
      if (aiStatus && !['NORMAL', 'DEGRADED', 'FAULT'].includes(aiStatus)) {
        return res.status(400).json({ error: 'aiStatus must be one of: NORMAL, DEGRADED, FAULT' });
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
          frequency    = COALESCE(${frequency}, frequency),
          ai_status    = COALESCE(${aiStatus}, ai_status),
          confidence   = COALESCE(${confidence}, confidence),
          health       = COALESCE(${health}, health),
          rul_days     = COALESCE(${rulDays}, rul_days),
          rssi         = COALESCE(${rssi}, rssi),
          energy_kwh   = energy_kwh + COALESCE(${energyDeltaKwh}, 0),
          daily_baseline_kwh = CASE
            WHEN baseline_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Kolkata')::date
            THEN energy_kwh + COALESCE(${energyDeltaKwh}, 0)
            ELSE daily_baseline_kwh
          END,
          baseline_date = (now() AT TIME ZONE 'Asia/Kolkata')::date,
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
