/**
 * Light sanitizer for examiner-authored TinyMCE HTML (instructions / question).
 * Strips scripts, iframes, and inline event handlers — not a full HTML firewall.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeRichHtml(html) {
  if (html == null) return "";
  const raw = String(html);
  if (!raw.trim()) return "";
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?\s*iframe\b[^>]*>/gi, "")
    .replace(/<\/?\s*object\b[^>]*>/gi, "")
    .replace(/<\/?\s*embed\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/vbscript:/gi, "");
}

/**
 * True when the string looks like HTML markup (vs plain text).
 * @param {unknown} value
 */
export function looksLikeHtml(value) {
  return typeof value === "string" && /<\/?[a-z][\s\S]*>/i.test(value);
}
