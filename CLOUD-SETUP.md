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

## R2 media storage

The app's media files are stored separately from the D1 app-state JSON in the private R2 bucket `vortexedge-property-media`.

### Worker binding

Add this R2 binding to the Worker named `vortexedge-property-desk-api`:

- Variable name: `MEDIA`
- R2 bucket: `vortexedge-property-media`

The repository's `wrangler.toml` now declares the same binding for Wrangler deployments. Keep the bucket private; do not enable public `r2.dev` access.

### Current media API

All media endpoints require the existing `Authorization: Bearer OWNER_KEY` header.

- `POST /media?listingId=<id>&name=<filename>`: raw file body; allowed image/video/PDF MIME types; current conservative upload limit 90 MB per file.
- `GET /media/<key>`: private media download.
- `DELETE /media/<key>`: delete a stored object.
- `GET /health`: reports whether D1 and R2 bindings are present.

The 90 MB limit is deliberate for this first upload path. Very large individual videos need a separate S3-compatible multipart upload flow; do not send large files as base64 or put them inside D1 JSON.

### Data safety

Before migrating existing listings, export a Property Desk JSON backup. Existing `photo` data URLs must be uploaded to R2 and replaced by media-key metadata before cloud state sync. Do not delete the local originals until the migration has been verified on another device.

### Free-tier warning

R2 Standard currently includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month, with additional usage billed. Monitor R2 Metrics and account billing.
