# Vortexedge Property Desk Cloud Backend

This backend stores the complete existing Property Desk state as one JSON document in D1. That preserves listings, requests, leads, groups, settings, imported source metadata and future fields without forcing a lossy table-by-table conversion.

## Files
- `schema.sql`: creates the canonical state table.
- `worker.js`: authenticated API with optimistic revision checks.
- `wrangler.toml`: Worker and D1 binding configuration.

## Important
The frontend is now connected to this API. It remains local-first and sync is explicit: connect with OWNER_KEY, then use Pull cloud or Upload this device in Settings. A pull replaces that device's current state after downloading a backup. Before the first migration, export a separate backup from the device holding your current records.

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

The API uses a single canonical state row and revision checks to prevent silent last-write-wins overwrites. The frontend provides explicit pull/upload, local backup before pull/upload, visible status and revision checks. It does not automatically merge simultaneous edits or sync in the background; avoid editing the same dataset on two devices at the same time.

## R2 media storage

The app's property photos are stored separately from the D1 app-state JSON in the private R2 bucket `vortexedge-property-media`. New photos upload directly to R2 when the owner key is connected. Legacy Base64 listing photos are migrated to R2 during the next explicit cloud upload; each listing then stores `photoKey` instead of the image bytes.

### Worker binding

Add this R2 binding to the Worker named `vortexedge-property-desk-api`:

- Variable name: `MEDIA`
- R2 bucket: `vortexedge-property-media`

The repository's `wrangler.toml` now declares the same binding for Wrangler deployments. Keep the bucket private; do not enable public `r2.dev` access.

### Current media API

All media endpoints require the existing `Authorization: Bearer OWNER_KEY` header.

- `POST /media?listingId=<id>&name=<filename>`: raw file body; allowed image/video/PDF MIME types; current conservative upload limit 90 MB per file.
- `GET /media/<key>`: private media download; byte-range requests are supported for media clients.
- `DELETE /media/<key>`: delete a stored object.
- `GET /health`: reports whether D1 and R2 bindings are present.

The 90 MB limit applies to the single-request Worker upload route. The Property Desk listing editor supports multiple photos, videos and PDF documents. Images are compressed in the browser before upload; videos and PDFs are uploaded as files. Each individual upload is limited to 90 MB by the current Worker route. Very large individual videos need a separate multipart upload flow; do not send large files as base64 or put them inside D1 JSON.

### Data safety

On the first Upload this device operation, the app downloads a JSON backup, uploads every existing listing `photo` data URL to R2, changes each listing to a `photoKey`, then uploads the compact state to D1. If a photo upload fails, the cloud state upload stops; retry after fixing the issue. Verify photos on another device before deleting any manual backups. A photo uploaded to R2 but not yet referenced by D1 may remain as an unused object; it is safer to retain it than to delete it automatically.

### Backups and media retention

The JSON backup contains listing records and R2 object keys; it does not package the actual photo, video or PDF bytes. Those files remain in the private R2 bucket. Keep the R2 bucket and Worker owner key active, and do not delete media objects or the bucket when moving or restoring a JSON backup. The app intentionally avoids deleting old R2 objects automatically so a listing edit or backup restore cannot accidentally destroy media still referenced by another saved copy.

### Free-tier warning

R2 Standard currently includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month, with additional usage billed. Monitor R2 Metrics and account billing.
