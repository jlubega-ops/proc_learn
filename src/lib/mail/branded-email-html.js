import { APP_NAME, ORG_NAME, ORG_SHORT, getAppBaseUrl } from "@/lib/appConfig";

/** MUBS / Proc Learn brand — align with app shell and sign-in card */
export const BRAND_PRIMARY = "#008bd0";
export const BRAND_ACCENT = "#ed1c24";
export const BRAND_HIGHLIGHT = "#fff200";
export const BRAND_TEXT = "#18181b";
export const BRAND_MUTED = "#52525b";

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Absolute URL for /public assets (email clients cannot resolve relative paths).
 * @param {string} path e.g. `/assets/mubs.png`
 */
export function publicAssetUrl(path) {
  const base = getAppBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * @param {{
 *   preheader?: string;
 *   headline: string;
 *   bodyLines: string[];
 *   bulletLines?: string[];
 *   credentialLabel?: string;
 *   credentialValue?: string;
 *   ctaLabel?: string;
 *   ctaUrl?: string;
 *   finePrintLines?: string[];
 * }} p
 */
export function buildBrandedTransactionalEmail(p) {
  const preheader = p.preheader ? escapeHtml(p.preheader) : "";
  const headline = escapeHtml(p.headline);
  const logoUrl = publicAssetUrl("/assets/mubs.png");
  const org = escapeHtml(ORG_NAME);
  const short = escapeHtml(ORG_SHORT);
  const app = escapeHtml(APP_NAME);

  const bodyParagraphs = p.bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:${BRAND_TEXT};">${escapeHtml(line)}</p>`,
    )
    .join("");

  const bulletBlock =
    p.bulletLines && p.bulletLines.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;">
  <tr>
    <td style="padding:14px 16px;background:#f8fafc;border-radius:8px;border-left:4px solid ${BRAND_PRIMARY};">
      <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:${BRAND_TEXT};">How to sign in</p>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.55;color:${BRAND_MUTED};">
        ${p.bulletLines.map((line) => `<li style="margin:0 0 6px 0;">${escapeHtml(line)}</li>`).join("")}
      </ul>
    </td>
  </tr>
</table>`
      : "";

  const credentialBlock =
    p.credentialLabel && p.credentialValue
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;">
  <tr>
    <td style="padding:16px 18px;background:#fffef5;border-radius:10px;border:1px solid #e4e4e7;border-top:3px solid ${BRAND_HIGHLIGHT};">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_MUTED};">
        ${escapeHtml(p.credentialLabel)}
      </p>
      <p style="margin:0;font-family:Consolas,Monaco,'Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:0.06em;color:${BRAND_TEXT};">
        ${escapeHtml(p.credentialValue)}
      </p>
    </td>
  </tr>
</table>`
      : "";

  const ctaBlock =
    p.ctaLabel && p.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;">
  <tr>
    <td style="border-radius:8px;background:${BRAND_PRIMARY};">
      <a href="${escapeHtml(p.ctaUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${escapeHtml(p.ctaLabel)}
      </a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px 0;font-size:12px;line-height:1.5;color:${BRAND_MUTED};word-break:break-all;">
  If the button does not work, copy and paste this link into your browser:<br/>
  <a href="${escapeHtml(p.ctaUrl)}" style="color:${BRAND_PRIMARY};">${escapeHtml(p.ctaUrl)}</a>
</p>`
      : "";

  const finePrint =
    (p.finePrintLines && p.finePrintLines.length > 0
      ? p.finePrintLines
          .map(
            (line) =>
              `<p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:${BRAND_MUTED};">${escapeHtml(line)}</p>`,
          )
          .join("")
      : "") +
    `<p style="margin:16px 0 0 0;font-size:11px;line-height:1.45;color:#a1a1aa;">
  ${app} · ${short} · ${org}
</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="height:4px;background:${BRAND_ACCENT};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:24px 28px 20px 28px;background:linear-gradient(180deg,#f0f9ff 0%,#ffffff 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="56" valign="top" style="padding-right:12px;">
                    <img src="${logoUrl}" width="48" height="48" alt="${short}" style="display:block;border:0;" />
                  </td>
                  <td valign="top" style="padding-top:2px;">
                    <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_MUTED};">
                      ${short}
                    </p>
                    <p style="margin:4px 0 0 0;font-size:22px;font-weight:800;line-height:1.2;color:${BRAND_PRIMARY};">
                      ${app}
                    </p>
                    <h1 style="margin:10px 0 0 0;font-size:18px;font-weight:700;line-height:1.3;color:${BRAND_TEXT};">
                      ${headline}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 28px 32px 28px;">
              ${bodyParagraphs}
              ${credentialBlock}
              ${bulletBlock}
              ${ctaBlock}
              ${finePrint}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `${APP_NAME} — ${ORG_NAME}`,
    "",
    p.headline,
    "",
    ...p.bodyLines,
    "",
    ...(p.credentialLabel && p.credentialValue
      ? [`${p.credentialLabel}:`, p.credentialValue, ""]
      : []),
    ...(p.bulletLines && p.bulletLines.length > 0 ? ["How to sign in:", ...p.bulletLines.map((b) => `• ${b}`), ""] : []),
    ...(p.ctaLabel && p.ctaUrl ? [`${p.ctaLabel}:`, p.ctaUrl, ""] : []),
    ...(p.finePrintLines || []),
  ];

  const text = textLines.filter(Boolean).join("\n");

  return { html, text };
}
