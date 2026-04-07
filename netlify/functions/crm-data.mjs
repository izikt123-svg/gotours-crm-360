import { getStore } from "@netlify/blobs";

const STORE_NAME = "crm-data";
const DATA_KEY = "main";
const VERSION_KEY = "version";
const LOCK_KEY = "write-lock";
const LOCK_TTL = 10000; // 10 seconds

export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store",
    "Access-Control-Allow-Origin": "*",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }

  try {
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const url = new URL(req.url);

    // GET - read data (optionally check version only)
    if (req.method === "GET") {
      const checkOnly = url.searchParams.get("check");
      const clientVersion = url.searchParams.get("v");

      // Return current version number for polling
      if (checkOnly === "1") {
        const ver = await store.get(VERSION_KEY, { type: "text" });
        return new Response(JSON.stringify({ ok: true, version: ver || "0" }), { headers });
      }

      // Return full data, optionally skip if version matches
      const ver = await store.get(VERSION_KEY, { type: "text" });
      if (clientVersion && clientVersion === ver) {
        return new Response(JSON.stringify({ ok: true, unchanged: true, version: ver }), { headers });
      }

      const data = await store.get(DATA_KEY, { type: "json" });
      return new Response(JSON.stringify({ ok: true, data: data || null, version: ver || "0" }), { headers });
    }

    // POST - write data with optimistic locking
    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch (parseErr) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON in request body" }), { status: 400, headers });
      }

      if (!body || !body.data) {
        return new Response(JSON.stringify({ ok: false, error: "Missing data field" }), { status: 400, headers });
      }

      // Simple write lock to prevent concurrent writes
      const lockVal = await store.get(LOCK_KEY, { type: "text" });
      if (lockVal) {
        const lockTime = parseInt(lockVal, 10);
        if (Date.now() - lockTime < LOCK_TTL) {
          return new Response(JSON.stringify({ ok: false, error: "Write conflict, retry" }), { status: 409, headers });
        }
      }

      // Acquire lock
      await store.set(LOCK_KEY, String(Date.now()));

      try {
        const newVersion = String(Date.now());
        await store.setJSON(DATA_KEY, body.data);
        await store.set(VERSION_KEY, newVersion);
        // Release lock
        await store.delete(LOCK_KEY);
        return new Response(JSON.stringify({ ok: true, version: newVersion }), { headers });
      } catch (writeErr) {
        // Release lock on error
        try { await store.delete(LOCK_KEY); } catch (_) {}
        throw writeErr;
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "Internal server error" }), { status: 500, headers });
  }
};
