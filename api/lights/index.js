import { sql, rowToLight } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT * FROM lights ORDER BY id`;
      return res.status(200).json(rows.map(rowToLight));
    } catch (err) {
      console.error('GET /api/lights failed:', err);
      return res.status(500).json({ error: 'Could not load lights', detail: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { id, s, z, lat, lon, type, notes } = body || {};

      if (!id || typeof id !== 'string' || id.length > 32) {
        return res.status(400).json({ error: 'A valid "id" (light number) is required' });
      }
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: '"lat" and "lon" must be numbers' });
      }
      if (!z || typeof z !== 'string') {
        return res.status(400).json({ error: '"z" (zone) is required' });
      }

      const status = ['online', 'fault', 'dim'].includes(s) ? s : 'online';

      await sql`
        INSERT INTO lights (id, status, zone, lat, lon, type, notes)
        VALUES (${id}, ${status}, ${z}, ${lat}, ${lon}, ${type || null}, ${notes || null})
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          zone   = EXCLUDED.zone,
          lat    = EXCLUDED.lat,
          lon    = EXCLUDED.lon,
          type   = EXCLUDED.type,
          notes  = EXCLUDED.notes,
          updated_at = now()
      `;

      return res.status(201).json({ ok: true, id });
    } catch (err) {
      console.error('POST /api/lights failed:', err);
      return res.status(500).json({ error: 'Could not save light', detail: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
