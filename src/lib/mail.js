import nodemailer from "nodemailer";

/**
 * @returns {import("nodemailer").Transporter | null}
 */
function getTransport() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

/**
 * @param {{ to: string; subject: string; text: string; html?: string }} opts
 * @returns {Promise<{ ok: boolean; skipped?: boolean; error?: string }>}
 */
export async function sendTransactionalMail(opts) {
  const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim();
  const transport = getTransport();
  if (!transport || !from) {
    console.warn("[mail] SMTP not configured; email not sent to", opts.to);
    return { ok: false, skipped: true };
  }
  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? opts.text.replace(/\n/g, "<br/>"),
    });
    return { ok: true };
  } catch (e) {
    console.error("[mail] send failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
