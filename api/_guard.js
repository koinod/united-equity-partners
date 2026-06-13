// Cheap anti-spam: honeypot + per-IP rate limit (in-memory, per Vercel instance).
// Designed to stop amateur bots without touching real users. NOT a substitute for
// a CAPTCHA if/when serious abuse shows up.

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 5; // 5 submissions / IP / minute
const buckets = new Map();

function ipOf(req) {
  return (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim()
    || req.socket?.remoteAddress
    || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    buckets.set(ip, list);
    return true;
  }
  list.push(now);
  buckets.set(ip, list);
  return false;
}

// Body shape: `company` is the honeypot field (humans never see it,
// CSS-hidden). Bots that auto-fill all inputs trip the trap.
function trippedHoneypot(body) {
  return !!(body && typeof body.company === "string" && body.company.trim().length > 0);
}

function check(req, body) {
  const ip = ipOf(req);
  if (trippedHoneypot(body)) return { ok: false, reason: "honeypot", ip };
  if (rateLimited(ip))       return { ok: false, reason: "rate_limit", ip };
  return { ok: true, ip };
}

module.exports = { check, ipOf };
