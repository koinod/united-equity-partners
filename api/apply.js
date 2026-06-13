// POST /api/apply — handles careers application form.
// Sends formatted email to LEAD_TO (defaults to aumanisaiah@gmail.com).

const { sendLeadEmail } = require("./_mailer");
const { check } = require("./_guard");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const guard = check(req, body);
    if (!guard.ok) {
      return res.status(200).json({ ok: true });
    }

    const name           = (body.name || "").toString().trim();
    const email          = (body.email || "").toString().trim();
    const phone          = (body.phone || "").toString().trim();
    const state          = (body.state || "").toString().trim().toUpperCase().slice(0, 2);
    const license_status = (body.license_status || "").toString().trim();
    const track          = (body.track || "").toString().trim();
    const experience     = (body.experience || "").toString().trim();
    const notes          = (body.notes || "").toString().trim();
    const source         = (body.source || "uep_website:careers").toString().slice(0, 60);

    if (!name || !email || !phone) {
      return res.status(400).json({ error: "name, email and phone are required" });
    }

    const subject = `[UEP — Recruit] ${name}${track ? " · " + track : ""}${state ? " · " + state : ""}`;

    const fields = [
      ["Name",          name],
      ["Email",         email],
      ["Phone",         phone],
      ["State",         state],
      ["License",       license_status],
      ["Track",         track],
      ["Experience",    experience],
      ["Anything else", notes],
    ];

    await sendLeadEmail({
      kind: "recruit",
      fields,
      replyTo: email,
      source,
      subjectLine: subject,
      ip: guard.ip,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[uep:apply] failed:", err);
    return res.status(500).json({ error: "send_failed" });
  }
};
