# Vortexedge Property Desk Cloud Backend

This backend stores the complete existing Property Desk state as one JSON document in D1. That preserves listings, requests, leads, groups, settings, imported source metadata and future fields without forcing a lossy table-by-table conversion.

## Files
- `schema.sql`: creates the canonical state table.
- `worker.js`: authenticated API with optimistic revision checks.
- `wrangler.toml`: Worker and D1 binding configuration.

## Important
The existing app is still local-only until its frontend is connected to this API. Do not delete browser data or assume another device can see it yet. Export a backup on the device holding your current records before migration.

## Cloudflare setup
1. In the Cloudflare D1 database `vortexedge-property-desk`, open Console and execute the contents of `schema.sql`.
2. Install Wrangler locally and authenticate: `npx wrangler login`.
3. Set a long random owner secret (at least 32 random characters) as a Worker secret:
   `npx wrangler secret put OWNER_KEY`
4. Deploy from this folder: `npx wrangler deploy`.
5. Test `https://YOUR-WORKER.workers.dev/health`. It should return `ok: true`.
6. Keep the Worker URL and OWNER_KEY private. Never put OWNER_KEY in this repository or in frontend source.

## API
- `GET /health`: public service health check (no data).
- `GET /state`: requires `Authorization: Bearer OWNER_KEY`; returns state and revision.
- `PUT /state`: same authorization; JSON body: `{"expectedRevision":0,"state":{...}} `. A 409 means another device updated the state; fetch the latest state and merge before retrying.

## Security and sync behavior
The owner key is a shared secret, not individual user accounts. Anyone who obtains it can access the entire business dataset. Rotate it if exposed. CORS is open because the static GitHub Pages app may be served from a changing origin; authorization is enforced by the secret. For a public commercial product, replace this shared-key design with proper per-user authentication and access controls.

The API uses a single canonical state row and revision checks to prevent silent last-write-wins overwrites. The frontend must implement explicit initial migration, conflict-aware merge, and a visible sync status before cloud sync is enabled.
