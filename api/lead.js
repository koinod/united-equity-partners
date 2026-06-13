// POST /api/lead — handles the quiz funnel + "Request callback" + "Book a call".
//
// Modes (body.mode):
//   quiz_complete  -> a quiz lead captured contact info        -> Meta "Lead"
//   live_transfer  -> wants a call NOW (5-10 min, business hrs) -> Meta "Contact"   [URGENT]
//   appointment    -> booked a time window                     -> Meta "Schedule"  [URGENT]
//   (unset)        -> legacy hero/book forms                   -> Meta "Lead"
//
// Always: emails the agent inbox (source of truth) and fires the de-duplicated
// server-side Conversions API event sharing the browser Pixel's event_id.

const { sendLeadEmail } = require("./_mailer");
const { check, ipOf } = require("./_guard");
const { sendEvent } = require("./_capi");

const EVENT_BY_MODE = {
  live_transfer: "Contact",
  appointment:   "Schedule",
  quiz_complete: "Lead",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const guard = check(req, body);
    if (!guard.ok) {
      // Pretend success so bots don't iterate. Real users never see this branch.
      return res.status(200).json({ ok: true });
    }

    const name    = (body.name || "").toString().trim();
    const phone   = (body.phone || "").toString().trim();
    const email   = (body.email || "").toString().trim();
    const state   = (body.state || "").toString().trim().toUpperCase().slice(0, 2);
    const zip     = (body.zip || "").toString().trim().slice(0, 10);
    const age     = (body.age || "").toString().trim();
    const product = (body.product || "").toString().trim();
    const notes   = (body.notes || "").toString().trim();
    const source  = (body.source || "uep_website").toString().slice(0, 80);
    const mode    = (body.mode || "").toString().slice(0, 40);
    const prefTime = (body.preferred_time || "").toString().slice(0, 80);
    const eventId = (body.event_id || "").toString().slice(0, 100);
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 20).map(s => String(s).slice(0, 200)) : [];

    if (!name || !phone) {
      return res.status(400).json({ error: "name and phone are required" });
    }

    // Subject line: make hot, time-sensitive actions impossible to miss.
    let kindLabel, subject;
    if (mode === "live_transfer") {
      kindLabel = "CALL NOW";
      subject = `[UEP — CALL NOW · 5-10 MIN] ${name} · ${phone}${state ? " · " + state : ""}`;
    } else if (mode === "appointment") {
      kindLabel = "Appointment";
      subject = `[UEP — APPOINTMENT${prefTime ? " · " + prefTime : ""}] ${name} · ${phone}`;
    } else if (mode === "quiz_complete") {
      kindLabel = "Quiz lead";
      subject = `[UEP — Quiz lead] ${name}${product ? " · " + product : ""}${state ? " · " + state : ""}`;
    } else {
      const isBooking = /book|strategy/.test(source);
      kindLabel = isBooking ? "Booking" : "Callback";
      subject = `[UEP — ${kindLabel}] ${name}${product ? " · " + product : ""}${state ? " · " + state : ""}`;
    }

    const fields = [
      ["Action",      kindLabel + (prefTime ? " · " + prefTime : "")],
      ["Name",        name],
      ["Phone",       phone],
      ["Email",       email || "— (not provided; reply via phone)"],
      ["State",       state],
      ["ZIP",         zip],
      ["Age",         age],
      ["Best match",  product],
      ["Quiz answers", answers.length ? answers.join("\n") : ""],
      ["Notes",       notes],
    ];

    // Email is the source of truth — await it.
    await sendLeadEmail({
      kind: "lead",
      fields,
      replyTo: email || undefined,
      source,
      subjectLine: subject,
      ip: guard.ip,
    });

    // Server-side Conversions API (de-duped with the browser Pixel via event_id).
    // Non-fatal: a CAPI hiccup must never fail a real lead.
    try {
      const eventName = EVENT_BY_MODE[mode] || "Lead";
      await sendEvent({
        eventName,
        eventId: eventId || undefined,
        eventSourceUrl: (req.headers["referer"] || req.headers["referrer"] || "https://unitedequitypartners.com/quiz"),
        actionSource: "website",
        user: {
          email, phone, name, state, zip,
          country: "us",
          fbp: (body.fbp || "").toString() || undefined,
          fbc: (body.fbc || "").toString() || undefined,
          ip: ipOf(req),
          userAgent: (req.headers["user-agent"] || "").toString() || undefined,
        },
        custom: {
          content_name: "life_insurance_quiz",
          content_category: product || undefined,
          lead_mode: mode || "callback",
          currency: "USD",
          value: mode === "live_transfer" ? 50 : mode === "appointment" ? 40 : 25,
        },
      });
    } catch (capiErr) {
      console.error("[uep:lead] capi error (non-fatal):", capiErr && capiErr.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[uep:lead] failed:", err);
    return res.status(500).json({ error: "send_failed" });
  }
};
