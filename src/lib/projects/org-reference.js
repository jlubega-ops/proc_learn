/**
 * Organisation document references: DEPT-TYPE-YYYY-SEQ (e.g. ICT-PP-2026-001).
 * Auto-generated, user-editable.
 */

export const ORG_REF_DOC = {
  BUDGET: "BUD",
  PROCUREMENT_PLAN: "PP",
  REQUISITION: "REQ",
};

/**
 * @param {string | null | undefined} code
 * @param {string | null | undefined} name
 */
export function departmentRefPrefix(code, name) {
  const fromCode = String(code || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  if (fromCode) return fromCode;
  const fromName = String(name || "ORG")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  if (fromName) return fromName;
  const scrubbed = String(name || "ORG")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  return scrubbed || "ORG";
}

/**
 * Prefer end year of YYYY/YYYY+1 labels (e.g. 2025/2026 → 2026).
 * @param {string | null | undefined} fyLabel
 */
export function financialYearRefToken(fyLabel) {
  const m = String(fyLabel || "").match(/(\d{4})\s*\/\s*(\d{4})/);
  if (m) return m[2];
  const y = String(fyLabel || "").match(/(\d{4})/);
  return y ? y[1] : String(new Date().getFullYear());
}

/**
 * @param {{
 *   deptCode?: string | null;
 *   deptName?: string | null;
 *   docType: string;
 *   fyLabel?: string | null;
 *   sequence: number;
 * }} p
 */
export function buildOrgDocumentReference(p) {
  const prefix = departmentRefPrefix(p.deptCode, p.deptName);
  const year = financialYearRefToken(p.fyLabel);
  const type = String(p.docType || "DOC")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const seq = Math.max(1, Number(p.sequence) || 1);
  return `${prefix}-${type}-${year}-${String(seq).padStart(3, "0")}`;
}

/**
 * Extract trailing sequence from a reference that matches DEPT-TYPE-YYYY-NNN.
 * @param {string | null | undefined} reference
 * @param {{ docType: string; yearToken: string; deptPrefix: string }} match
 */
export function parseReferenceSequence(reference, match) {
  const ref = String(reference || "").trim().toUpperCase();
  if (!ref) return 0;
  const re = new RegExp(
    `^${escapeReg(match.deptPrefix)}-${escapeReg(match.docType)}-${escapeReg(match.yearToken)}-(\\d+)$`,
    "i",
  );
  const m = ref.match(re);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

/**
 * @param {string} s
 */
function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Next sequence given existing references for the same dept/type/year stem.
 * @param {string[]} existingRefs
 * @param {{
 *   deptCode?: string | null;
 *   deptName?: string | null;
 *   docType: string;
 *   fyLabel?: string | null;
 * }} stem
 */
export function nextOrgDocumentReference(existingRefs, stem) {
  const deptPrefix = departmentRefPrefix(stem.deptCode, stem.deptName);
  const yearToken = financialYearRefToken(stem.fyLabel);
  let max = 0;
  for (const r of existingRefs || []) {
    const seq = parseReferenceSequence(r, {
      deptPrefix,
      docType: stem.docType,
      yearToken,
    });
    if (seq > max) max = seq;
  }
  return buildOrgDocumentReference({
    ...stem,
    sequence: max + 1,
  });
}
