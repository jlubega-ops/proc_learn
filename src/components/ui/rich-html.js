import { sanitizeRichHtml, looksLikeHtml } from "@/lib/sanitize-rich-html";
import { BRAND_PAGE_LEAD_CLASS } from "@/lib/brand-ui";

/**
 * Renders TinyMCE / rich-text HTML safely for student-facing surfaces.
 * Plain text falls back to wrapped paragraphs (no raw tags shown).
 *
 * @param {{
 *   html?: string | null;
 *   empty?: string;
 *   className?: string;
 * }} props
 */
export function RichHtml({ html = null, empty = "—", className = "" }) {
  const raw = html == null ? "" : String(html).trim();
  if (!raw) {
    return <p className={BRAND_PAGE_LEAD_CLASS}>{empty}</p>;
  }

  if (!looksLikeHtml(raw)) {
    return (
      <p className={`whitespace-pre-wrap ${BRAND_PAGE_LEAD_CLASS} ${className}`.trim()}>{raw}</p>
    );
  }

  const safe = sanitizeRichHtml(raw);
  return (
    <div
      className={`rich-html mt-2 max-w-none ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
