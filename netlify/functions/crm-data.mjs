import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "crm-data", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const action = url.searchParams.get("action");
    if (action === "load") {
      const data = await store.get("main", { type: "json" });
      if (data) {
        return new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("OK");
  }

  if (req.method === "POST") {
    const body = await req.json();
    if (body.action === "save" && body.data) {
      await store.setJSON("main", body.data);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
  }

  return new Response("Method not allowed", { status: 405 });
};
