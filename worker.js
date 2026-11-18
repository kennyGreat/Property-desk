/**
 * Vortexedge Property Desk Cloud API
 * Deploy with Cloudflare Workers + D1.
 * Required bindings: DB (D1), OWNER_KEY (secret).
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400"
};
function reply(data, status=200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store" }
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health" && request.method === "GET") {
      return reply({ ok: true, service: "Vortexedge Property Desk API", database: !!env.DB });
    }
    if (url.pathname !== "/state" || !["GET", "PUT"].includes(request.method)) {
      return reply({ error: "Not found" }, 404);
    }
    if (!env.DB || !env.OWNER_KEY) return reply({ error: "Server is not configured" }, 503);
    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.OWNER_KEY}`) return reply({ error: "Unauthorised" }, 401);
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
    if (payload.length > 5_000_000) return reply({ error: "Backup exceeds the 5 MB request limit" }, 413);
    const expected = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
    const current = await env.DB.prepare("SELECT revision FROM app_state WHERE id = 1").first();
    const actual = current ? current.revision : 0;
    if (actual !== expected) return reply({ error: "Revision conflict. Download the latest cloud state before saving.", revision: actual }, 409);
    const next = actual + 1;
    const now = new Date().toISOString();
    if (current) {
      const result = await env.DB.prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = ? WHERE id = 1 AND revision = ?")
        .bind(payload, next, now, actual).run();
      if (!result.meta || result.meta.changes !== 1) {
        return reply({ error: "Concurrent update detected. Reload cloud data before retrying." }, 409);
      }
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
};
