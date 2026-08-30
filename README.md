# GlowGrid Street Light — Database Backend (Vercel)

This is a small serverless API + Postgres database for the GlowGrid dashboard
(`index.html`). It gives the dashboard **persistent storage** for street
lights instead of keeping everything only in the browser tab's memory.

The dashboard is built to degrade gracefully: if this API isn't present it
just falls back to its built-in demo data and works exactly as before. Once
you deploy this and put `index.html` alongside it, the dashboard
automatically detects the API on load and switches to reading/writing
through it — no code changes needed on the frontend side.

## What's in here

```
glowgrid-backend/
├── api/
│   └── lights/
│       ├── index.js     → GET  /api/lights        (list all lights)
│       │                 POST /api/lights        (create/upsert a light)
│       └── [id].js      → GET    /api/lights/SL-01  (one light)
│                           PATCH  /api/lights/SL-01  (update status/telemetry)
│                           DELETE /api/lights/SL-01  (remove a light)
├── lib/
│   └── db.js             → shared Postgres client + row→JSON mapping
├── db/
│   └── schema.sql         → creates the `lights` table + seeds the 10 BIT campus lights
├── package.json
├── vercel.json
└── index.html              → the dashboard itself (put your copy here, at project root)
```

## 1. Put the dashboard file in this folder

Copy your `index.html` (the GlowGrid dashboard) into the root of this
project, next to `package.json`. Vercel serves any static files at the
project root automatically alongside the `/api` functions — no extra config
needed.

## 2. Push this project to GitHub

```bash
cd glowgrid-backend
git init
git add .
git commit -m "GlowGrid street light dashboard + database backend"
git branch -M main
git remote add origin https://github.com/<you>/<your-repo>.git
git push -u origin main
```

## 3. Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo
   you just pushed.
2. Framework preset: choose **"Other"** (no build step needed — it's static
   HTML + serverless functions).
3. Click **Deploy**. The first deploy will succeed even without a database
   yet — the API routes just won't work until step 4 is done.

## 4. Create a Postgres database and attach it

1. In your new Vercel project, go to the **Storage** tab.
2. Click **Create Database → Postgres** (this is Vercel's managed
   Postgres, powered by Neon).
3. Once created, click **Connect to Project** and select this project.
   Vercel automatically injects the `POSTGRES_URL` and related env vars —
   you don't need to copy/paste any connection strings yourself.

## 5. Run the schema

You need to run `db/schema.sql` once against the new database to create the
`lights` table and seed the 10 campus lights. Two ways to do this:

**Option A — Vercel's built-in SQL editor (easiest):**
1. Storage tab → your Postgres database → **Query** tab.
2. Paste the entire contents of `db/schema.sql` and run it.

**Option B — psql from your machine:**
```bash
vercel env pull .env.local      # pulls POSTGRES_URL etc. into a local file
# then, using the POSTGRES_URL value from .env.local:
psql "$POSTGRES_URL" -f db/schema.sql
```

## 6. Redeploy

Trigger a redeploy (Vercel dashboard → Deployments → ⋯ → Redeploy, or just
push a new commit). Your dashboard is now live at your `*.vercel.app` URL,
reading and writing lights through the database.

## How data flows

- **Adding a light** in the dashboard's "Add Light" form → `POST /api/lights`
  → inserted into Postgres.
- **Removing a light** (map popup, Manage panel, or Light Detail panel) →
  `DELETE /api/lights/:id`.
- **Live MQTT telemetry** — the dashboard itself connects directly to
  `broker.hivemq.com` from the browser (MQTT-over-WebSockets) and, for every
  reading it receives, calls `PATCH /api/lights/:id` to persist the latest
  voltage/current/power/PF and add the incremental energy (kWh) onto that
  light's running total.

**Note on telemetry persistence:** because the MQTT subscription lives in
the browser tab (serverless functions can't hold a persistent MQTT
connection open), telemetry is only written to the database while at least
one dashboard tab is open and connected. Status, zone, and location data
persist regardless. If you want telemetry to keep recording with no
dashboard open, the natural next step is a small always-on bridge (e.g. a
tiny Node process or a Cloudflare Worker with a Durable Object) that
subscribes to the same MQTT topic and calls the same `PATCH` endpoint — happy
to help build that if you need it.

## API reference

| Method | Path                | Body                                                              | Notes |
|--------|---------------------|--------------------------------------------------------------------|-------|
| GET    | `/api/lights`       | —                                                                    | Returns all lights as an array |
| POST   | `/api/lights`       | `{ id, s, z, lat, lon, type?, notes? }`                              | Creates or upserts a light |
| GET    | `/api/lights/:id`   | —                                                                    | One light |
| PATCH  | `/api/lights/:id`   | `{ status?, zone?, lat?, lon?, type?, notes?, voltage?, current?, power?, pf?, energyDeltaKwh? }` | Partial update; `energyDeltaKwh` is **added** to the running total, not overwritten |
| DELETE | `/api/lights/:id`   | —                                                                    | Removes a light |

All responses are JSON. Errors come back as `{ "error": "..." }` with a
4xx/5xx status code.
