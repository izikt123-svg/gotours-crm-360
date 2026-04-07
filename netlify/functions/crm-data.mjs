import { getStore } from "@netlify/blobs";

const STORE_NAME = "crm-data";
const DATA_KEY = "main";
const VERSION_KEY = "version";

export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store",
  };

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

    // POST - write data
    if (req.method === "POST") {
      const body = await req.json();
      const newVersion = String(Date.now());
      await store.setJSON(DATA_KEY, body.data);
      await store.set(VERSION_KEY, newVersion);
      return new Response(JSON.stringify({ ok: true, version: newVersion }), { headers });
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "Internal server error" }), { status: 500, headers });
  }
};
