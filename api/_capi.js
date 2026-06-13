// Meta Conversions API (server-side events) for UEP.
//
// Sends de-duplicated server events to the Meta dataset so ad optimization
// works even with browser tracking blocked. Browser Pixel + this server event
// share the same `event_id`, so Meta counts them once.
//
// Env:
//   FB_CAPI_TOKEN     — System User access token (required; never commit it)
//   FB_PIXEL_ID       — dataset / pixel id (defaults to the live UEP dataset)
//   FB_TEST_EVENT_CODE— optional, routes to Test Events tab while validating

const crypto = require("crypto");

const API_VERSION = "v21.0";
const PIXEL_ID = process.env.FB_PIXEL_ID || "1006892888698574";

function sha256(v) {
  if (v === undefined || v === null || v === "") return undefined;
  return crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex");
}
// Phone: digits only, no leading +, then hash.
function shaPhone(v) {
  if (!v) return undefined;
  const digits = String(v).replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (!digits) return undefined;
  return crypto.createHash("sha256").update(digits).digest("hex");
}
function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

// Fire-and-await one event. Never throws — returns a result object.
async function sendEvent({ eventName, eventId, eventSourceUrl, user = {}, custom = {}, actionSource = "website" }) {
  const token = process.env.FB_CAPI_TOKEN;
  if (!token) return { skipped: "no_token" };

  const name = splitName(user.name);
  const ud = {};
  const em = sha256(user.email);                 if (em) ud.em = [em];
  const ph = shaPhone(user.phone);               if (ph) ud.ph = [ph];
  const fn = sha256(name.first);                 if (fn) ud.fn = [fn];
  const ln = sha256(name.last);                  if (ln) ud.ln = [ln];
  const st = sha256(user.state);                 if (st) ud.st = [st];
  const zp = sha256(user.zip);                   if (zp) ud.zp = [zp];
  if (user.country) ud.country = [sha256(user.country)];
  if (user.fbp) ud.fbp = user.fbp;
  if (user.fbc) ud.fbc = user.fbc;
  if (user.ip) ud.client_ip_address = user.ip;
  if (user.userAgent) ud.client_user_agent = user.userAgent;

  const evt = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: ud,
    custom_data: custom,
  };
  if (eventId) evt.event_id = eventId;
  if (eventSourceUrl) evt.event_source_url = eventSourceUrl;

  const payload = { data: [evt] };
  if (process.env.FB_TEST_EVENT_CODE) payload.test_event_code = process.env.FB_TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.error("[uep:capi] non-200:", r.status, JSON.stringify(j));
    return j;
  } catch (err) {
    console.error("[uep:capi] send failed:", err && err.message);
    return { error: String(err && err.message) };
  }
}

module.exports = { sendEvent, PIXEL_ID };
