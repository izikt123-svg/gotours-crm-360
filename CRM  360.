// netlify/functions/send-sms.mjs
// שליחת SMS דרך Twilio — ללא תלויות
// משתני סביבה ב-Netlify: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

export default async (req) => {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_FROM;

  if (!SID || !TOKEN || !FROM) {
    return json({ error: "חסרים משתני סביבה של טוויליו ב-Netlify" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "גוף הבקשה אינו JSON תקין" }, 400);
  }

  const message = String(body?.message || "").trim();
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];

  if (!message) return json({ error: "חסר תוכן הודעה" }, 400);
  if (!recipients.length) return json({ error: "אין נמענים" }, 400);

  const toE164 = (raw) => {
    let p = String(raw || "").replace(/[^\d+]/g, "");
    if (!p) return null;
    if (p.startsWith("+")) return p;
    if (p.startsWith("00")) return "+" + p.slice(2);
    if (p.startsWith("972")) return "+" + p;
    if (p.startsWith("0")) return "+972" + p.slice(1);
    return "+972" + p;
  };

  const auth = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const r of recipients) {
    const to = toE164(r?.phone);
    if (!to) {
      failed++;
      errors.push({ phone: r?.phone || "", error: "מספר לא תקין" });
      continue;
    }
    try {
      const form = new URLSearchParams({ To: to, From: FROM, Body: message });
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        sent++;
      } else {
        failed++;
        errors.push({ phone: to, error: data?.message || `Twilio ${resp.status}` });
      }
    } catch (e) {
      failed++;
      errors.push({ phone: to, error: String(e?.message || e) });
    }
  }

  return json({ sent, failed, total: recipients.length, errors });
};
