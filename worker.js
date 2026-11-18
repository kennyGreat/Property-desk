/**
 * Vortexedge Property Desk Cloud API
 * Bindings: DB (D1), MEDIA (R2); secret: OWNER_KEY.
 *
 * /health                 public health check
 * /state                  owner-key protected D1 app-state GET/PUT
 * POST /media             owner-key protected raw-body R2 upload
 * GET /media/<object-key> owner-key protected media download
 * DELETE /media/<object-key> owner-key protected deletion
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Content-Length, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Range, Accept-Ranges",
  "Access-Control-Max-Age": "86400"
};

function reply(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", ...extra }
  });
}
function safeName(value) {
  return String(value || "upload").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0,100) || "upload";
}
function authorised(request, env) {
  return !!env.OWNER_KEY && request.headers.get("Authorization") === `Bearer ${env.OWNER_KEY}`;
}
function contentTypeAllowed(type) {
  return /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime|3gpp|x-msvideo)|application\/pdf)$/i.test(type || "");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health" && request.method === "GET") {
      return reply({ ok: true, service: "Vortexedge Property Desk API", database: !!env.DB, media: !!env.MEDIA });
    }

    if (!env.OWNER_KEY) return reply({ error: "Server owner key is not configured" }, 503);
    if (!authorised(request, env)) return reply({ error: "Unauthorised" }, 401);

    if (url.pathname === "/state" && ["GET", "PUT"].includes(request.method)) {
      if (!env.DB) return reply({ error: "D1 database binding DB is missing" }, 503);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload, revision, updated_at FROM app_state WHERE id = 1").first();
        if (!row) return reply({ state: null, revision: 0, updatedAt: null });
        let state;
        try { state = JSON.parse(row.payload); } catch { return reply({ error: "Stored state is invalid JSON" }, 500); }
        return reply({ state, revision: row.revision, updatedAt: row.updated_at });
      }
      let body;
      try { body = await request.json(); } catch { return reply({ error: "Request body must be JSON" }, 400); }
      if (!body || typeof body.state !== "object" || body.state === null || Array.isArray(body.state)) {
        return reply({ error: "A valid Property Desk state object is required" }, 400);
      }
      const payload = JSON.stringify(body.state);
      // Keep app-state compact: binary media belongs in R2, not in D1.
      if (payload.length > 4_000_000) return reply({ error: "App data exceeds the 4 MB state limit. Store media files in R2, not as embedded data URLs." }, 413);
      const expected = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
      const current = await env.DB.prepare("SELECT revision FROM app_state WHERE id = 1").first();
      const actual = current ? current.revision : 0;
      if (actual !== expected) return reply({ error: "Revision conflict. Download the latest cloud state before saving.", revision: actual }, 409);
      const next = actual + 1;
      const now = new Date().toISOString();
      if (current) {
        const result = await env.DB.prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = ? WHERE id = 1 AND revision = ?")
          .bind(payload, next, now, actual).run();
        if (!result.meta || result.meta.changes !== 1) return reply({ error: "Concurrent update detected. Reload cloud data before retrying." }, 409);
      } else {
        try {
          await env.DB.prepare("INSERT INTO app_state (id, payload, revision, updated_at) VALUES (1, ?, ?, ?)")
            .bind(payload, next, now).run();
        } catch {
          return reply({ error: "Another device initialized the cloud state. Download it before saving.", revision: 1 }, 409);
        }
      }
      return reply({ ok: true, revision: next, updatedAt: now });
    }

    if (url.pathname === "/media" && request.method === "POST") {
      if (!env.MEDIA) return reply({ error: "R2 bucket binding MEDIA is missing" }, 503);
      const type = request.headers.get("Content-Type") || "application/octet-stream";
      if (!contentTypeAllowed(type)) return reply({ error: "Unsupported file type. Upload images, supported videos or PDF documents." }, 415);
      const rawLength = request.headers.get("Content-Length");
      if (!rawLength || !/^\\d+$/.test(rawLength)) return reply({ error: "A known Content-Length is required for this upload." }, 411);
      const length = Number(rawLength);
      // Single-request upload path is capped; larger videos need multipart uploads.
      if (length > 90 * 1024 * 1024) return reply({ error: "This upload path supports files up to 90 MB. Large videos require multipart upload." }, 413);
      if (!request.body || length === 0) return reply({ error: "Upload body is empty" }, 400);
      const listingId = safeName(url.searchParams.get("listingId") || "unassigned");
      const filename = safeName(url.searchParams.get("name") || "upload");
      const key = `properties/${listingId}/${crypto.randomUUID()}-${filename}`;
      const object = await env.MEDIA.put(key, request.body, {
        httpMetadata: { contentType: type, cacheControl: "private, no-store" },
        customMetadata: { listingId, originalName: filename, uploadedAt: new Date().toISOString() }
      });
      return reply({ ok: true, key, size: object.size, etag: object.etag, contentType: type, name: filename });
    }

    if (url.pathname.startsWith("/media/")) {
      if (!env.MEDIA) return reply({ error: "R2 bucket binding MEDIA is missing" }, 503);
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      if (!key || key.includes("..") || key.startsWith("/")) return reply({ error: "Invalid media key" }, 400);
      if (request.method === "GET") {
        const rangeHeader = request.headers.get("Range");
        const object = await env.MEDIA.get(key, rangeHeader ? { range: request.headers } : undefined);
        if (!object) return reply({ error: "Media not found" }, 404);
        const headers = new Headers(cors);
        object.writeHttpMetadata(headers);
        headers.set("Cache-Control", "private, no-store");
        headers.set("ETag", object.httpEtag);
        headers.set("Accept-Ranges", "bytes");
        let status = 200;
        if (rangeHeader && object.range) {
          const offset = object.range.offset;
          const length = object.range.length;
          headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
          headers.set("Content-Length", String(length));
          status = 206;
        } else {
          headers.set("Content-Length", String(object.size));
        }
        return new Response(object.body, { status, headers });
      }
      if (request.method === "DELETE") {
        await env.MEDIA.delete(key);
        return reply({ ok: true, deleted: key });
      }
    }

    return reply({ error: "Not found" }, 404);
  }
};
