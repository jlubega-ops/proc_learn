import { sendTransactionalMail } from "@/lib/mail";
import { buildActivationUrl } from "@/lib/auth-links";
import { APP_NAME } from "@/lib/appConfig";
import { buildBrandedTransactionalEmail } from "@/lib/mail/branded-email-html";

/**
 * @param {string} to
 * @param {string} subject
 * @param {Parameters<typeof buildBrandedTransactionalEmail>[0]} payload
 */
export async function sendBrandedTransactional(to, subject, payload) {
  const { html, text } = buildBrandedTransactionalEmail(payload);
  return sendTransactionalMail({ to, subject, text, html });
}

/**
 * @param {{ email: string; rawToken: string; displayName: string }} p
 */
export async function sendAccountActivationEmail(p) {
  const url = buildActivationUrl(p.rawToken);
  const name = p.displayName?.trim() || "there";
  return sendBrandedTransactional(p.email, `Activate your ${APP_NAME} account`, {
    preheader: `Set your password to start using ${APP_NAME}.`,
    headline: "Activate your account",
    bodyLines: [
      `Hello ${name},`,
      `Welcome to ${APP_NAME}. An account has been created for your MUBS email address.`,
      "Use the secure button below within 7 days to choose your password and complete activation.",
    ],
    ctaLabel: "Activate my account",
    ctaUrl: url,
    finePrintLines: [
      "If you did not expect this invitation, you can ignore this email. The account will stay inactive until activated.",
    ],
  });
}

/**
 * @param {{ email: string; resetUrl: string }} p
 */
export async function sendPasswordResetEmail(p) {
  return sendBrandedTransactional(p.email, `Reset your ${APP_NAME} password`, {
    preheader: "Password reset link — valid for 1 hour.",
    headline: "Reset your password",
    bodyLines: [
      "We received a request to reset the password for your account.",
      "This link expires in one hour for your security.",
    ],
    ctaLabel: "Choose a new password",
    ctaUrl: p.resetUrl,
    finePrintLines: [
      "If you did not request a reset, you can ignore this email. Your password will not change.",
    ],
  });
}

/**
 * Generic security / system notice (no action button). Use for optional future digests.
 * @param {{ to: string; subject: string; headline: string; bodyLines: string[] }} p
 */
export async function sendBrandedSecurityNoticeEmail(p) {
  return sendBrandedTransactional(p.to, p.subject, {
    preheader: p.headline,
    headline: p.headline,
    bodyLines: p.bodyLines,
    finePrintLines: [
      `This message was sent by ${APP_NAME} on behalf of Makerere University Business School.`,
    ],
  });
}
