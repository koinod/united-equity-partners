// Shared mailer for UEP lead/apply endpoints.
// Uses Gmail SMTP via app password — no third-party service, no new accounts.

const nodemailer = require("nodemailer");

let cachedTransport = null;

function transport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  if (!user || !pass) {
    throw new Error("GMAIL_USER / GMAIL_PASS env vars not configured");
  }
  cachedTransport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });
  return cachedTransport;
}

function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label, value) {
  if (value === null || value === undefined || value === "") return "";
  const html = esc(value).replace(/\n/g, "<br>");
  return `<tr>
    <td style="padding:8px 14px 8px 0;font-size:13px;color:#7A7166;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 0;font-size:14px;color:#1C1A17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;">${html}</td>
  </tr>`;
}

function htmlBody(title, accent, fields, meta) {
  const rows = fields.map(([k, v]) => row(k, v)).join("");
  return `<!doctype html>
<html><body style="margin:0;background:#F6F2EC;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5DED2;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:22px 26px 14px;border-bottom:1px solid #EFE9DE;">
          <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${accent};font-weight:600;">KOINO Capital &nbsp;·&nbsp; United Equity Partners</div>
          <div style="font-size:20px;color:#1C1A17;margin-top:4px;font-weight:600;">${esc(title)}</div>
        </td></tr>
        <tr><td style="padding:18px 26px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
        <tr><td style="padding:14px 26px 22px;border-top:1px solid #EFE9DE;font-size:11px;color:#9C937F;line-height:1.6;">
          <div><strong style="color:#7A7166;">Source:</strong> ${esc(meta.source)}</div>
          <div><strong style="color:#7A7166;">Received:</strong> ${esc(meta.received)}</div>
          <div><strong style="color:#7A7166;">IP:</strong> ${esc(meta.ip)}</div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#9C937F;margin-top:14px;font-family:-apple-system,sans-serif;">
        Reply to this email to respond directly to the prospect.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

function textBody(title, fields, meta) {
  const lines = [
    `${title}`,
    "",
    ...fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    "—",
    `Source: ${meta.source}`,
    `Received: ${meta.received}`,
    `IP: ${meta.ip}`,
  ];
  return lines.join("\n");
}

async function sendLeadEmail({ kind, fields, replyTo, source, subjectLine, ip }) {
  const to = process.env.LEAD_TO || "aumanisaiah@gmail.com";
  const accent = kind === "recruit" ? "#7A2D2D" : "#1F3D5C";
  const meta = {
    source,
    received: new Date().toUTCString(),
    ip: ip || "—",
  };
  const title = kind === "recruit" ? "New career application" : "New callback request";

  const fromAddr = process.env.GMAIL_FROM || `"KOINO Capital" <noreply@koino.capital>`;
  const t = transport();
  const info = await t.sendMail({
    from: fromAddr,
    sender: process.env.GMAIL_USER,
    to,
    replyTo: replyTo || undefined,
    subject: subjectLine,
    text: textBody(title, fields, meta),
    html: htmlBody(title, accent, fields, meta),
  });
  return { messageId: info.messageId };
}

module.exports = { sendLeadEmail };
