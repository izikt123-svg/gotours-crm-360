import { getStore } from "@netlify/blobs";

const STORE_NAME = "crm-data";
const DATA_KEY = "main";
const VERSION_KEY = "version";
const LOCK_KEY = "write-lock";
const LOCK_TTL = 10000;

export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const url = new URL(req.url);
    const quoteId = url.searchParams.get("id");

    if (!quoteId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing quote ID" }), { status: 400, headers });
    }

    // GET - retrieve a single quote for public view
    if (req.method === "GET") {
      const data = await store.get(DATA_KEY, { type: "json" });
      if (!data || !Array.isArray(data.quotes)) {
        return new Response(JSON.stringify({ ok: false, error: "Quote not found" }), { status: 404, headers });
      }
      const quote = data.quotes.find(q => String(q.id) === String(quoteId));
      if (!quote) {
        return new Response(JSON.stringify({ ok: false, error: "Quote not found" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, quote }), { headers });
    }

    // POST - sign a quote (from public page)
    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
      }

      if (!body.signature) {
        return new Response(JSON.stringify({ ok: false, error: "Missing signature" }), { status: 400, headers });
      }

      // Get client IP for legal verification
      const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";

      // Acquire lock
      const lockVal = await store.get(LOCK_KEY, { type: "text" });
      if (lockVal) {
        const lockTime = parseInt(lockVal, 10);
        if (Date.now() - lockTime < LOCK_TTL) {
          return new Response(JSON.stringify({ ok: false, error: "Server busy, please try again" }), { status: 409, headers });
        }
      }
      await store.set(LOCK_KEY, String(Date.now()));

      try {
        const data = await store.get(DATA_KEY, { type: "json" });
        if (!data || !Array.isArray(data.quotes)) {
          await store.delete(LOCK_KEY);
          return new Response(JSON.stringify({ ok: false, error: "Quote not found" }), { status: 404, headers });
        }

        const idx = data.quotes.findIndex(q => String(q.id) === String(quoteId));
        if (idx < 0) {
          await store.delete(LOCK_KEY);
          return new Response(JSON.stringify({ ok: false, error: "Quote not found" }), { status: 404, headers });
        }

        const now = new Date().toISOString();
        data.quotes[idx].signature = body.signature;
        data.quotes[idx].signatureTimestamp = now;
        data.quotes[idx].signatureIP = clientIP;
        data.quotes[idx].signedAt = now;
        data.quotes[idx].status = "נחתמה";

        const newVersion = String(Date.now());
        await store.setJSON(DATA_KEY, data);
        await store.set(VERSION_KEY, newVersion);
        await store.delete(LOCK_KEY);

        return new Response(JSON.stringify({ ok: true, signedAt: now, ip: clientIP }), { headers });
      } catch (err) {
        try { await store.delete(LOCK_KEY); } catch (_) {}
        throw err;
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "Internal server error" }), { status: 500, headers });
  }
};
