/**
 * Organisation document references: {ORGCODE}-{TYPE}-{YEAR}-{RANDOM}
 * e.g. NSI-PP-2026-7K2M9Q4A — collision-resistant across budgets, plans, requisitions.
 */

export const ORG_REF_DOC = {
  BUDGET: "BUD",
  PROCUREMENT_PLAN: "PP",
  EMERGENCY_PROCUREMENT_PLAN: "EP",
  REQUISITION: "REQ",
  PROCUREMENT: "PROC",
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
 * Normalise organisation / project code for references.
 * @param {string | null | undefined} orgCode
 */
export function sanitizeOrgCode(orgCode) {
  const t = String(orgCode || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
  return t || "";
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
 * @param {number} [length]
 */
export function randomRefToken(length = 8) {
  const len = Math.max(6, Math.min(12, Number(length) || 8));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < len; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Resolve the org prefix used in references (project code preferred).
 * @param {{
 *   orgCode?: string | null;
 *   deptCode?: string | null;
 *   deptName?: string | null;
 * }} p
 */
export function resolveOrgRefPrefix(p) {
  return (
    sanitizeOrgCode(p.orgCode) ||
    departmentRefPrefix(p.deptCode, p.deptName) ||
    "ORG"
  );
}

/**
 * @param {{
 *   orgCode?: string | null;
 *   deptCode?: string | null;
 *   deptName?: string | null;
 *   docType: string;
 *   fyLabel?: string | null;
 *   year?: string | null;
 *   token?: string | null;
 * }} p
 */
export function buildOrgDocumentReference(p) {
  const prefix = resolveOrgRefPrefix(p);
  const type = String(p.docType || "DOC")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const year = financialYearRefToken(p.year || p.fyLabel);
  const token = String(p.token || randomRefToken(8))
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
  return `${prefix}-${type}-${year}-${token}`;
}

/**
 * Next unique reference for a document type within an organisation.
 * Ignores legacy sequence-based refs for generation; still avoids collisions with any existing string.
 *
 * @param {string[]} existingRefs
 * @param {{
 *   orgCode?: string | null;
 *   deptCode?: string | null;
 *   deptName?: string | null;
 *   docType: string;
 *   fyLabel?: string | null;
 * }} stem
 */
export function nextOrgDocumentReference(existingRefs, stem) {
  const taken = new Set(
    (existingRefs || []).map((r) => String(r || "").trim().toUpperCase()).filter(Boolean),
  );
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = buildOrgDocumentReference({
      orgCode: stem.orgCode,
      deptCode: stem.deptCode,
      deptName: stem.deptName,
      docType: stem.docType,
      fyLabel: stem.fyLabel,
      token: randomRefToken(8),
    });
    if (!taken.has(candidate.toUpperCase())) return candidate;
  }
  return buildOrgDocumentReference({
    orgCode: stem.orgCode,
    deptCode: stem.deptCode,
    deptName: stem.deptName,
    docType: stem.docType,
    fyLabel: stem.fyLabel,
    token: `${randomRefToken(6)}${Date.now().toString(36).toUpperCase().slice(-4)}`,
  });
}

/**
 * Load project organisation code for references.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} projectId
 */
export async function loadProjectOrgCode(db, projectId) {
  const row = await db.project.findUnique({
    where: { id: projectId },
    select: { projectCode: true },
  });
  return sanitizeOrgCode(row?.projectCode) || "ORG";
}
