import { AuditEvent } from "@/lib/audit-events";

/** @type {Set<string>} */
export const LOGIN_AUDIT_EVENTS = new Set([
  AuditEvent.LOGIN_SUCCESS,
  AuditEvent.LOGIN_FAILURE,
  AuditEvent.PROJECT_ORG_USER_LOGIN_SUCCESS,
  AuditEvent.PROJECT_ORG_USER_LOGIN_FAILURE,
]);

/** Human labels for meta.method on login events. */
const LOGIN_METHOD_LABELS = {
  password: "Password",
  google_oauth: "Google",
  org_password: "Organisation password",
};

/**
 * @param {string} eventType
 * @param {unknown} meta
 */
export function auditLoginMethodLabel(eventType, meta) {
  if (!LOGIN_AUDIT_EVENTS.has(eventType)) return null;
  const method =
    meta && typeof meta === "object" && meta !== null && "method" in meta
      ? String(/** @type {{ method?: unknown }} */ (meta).method || "")
      : "";
  if (method && LOGIN_METHOD_LABELS[method]) return LOGIN_METHOD_LABELS[method];
  if (eventType.startsWith("PROJECT_ORG_USER_LOGIN")) return "Organisation password";
  if (LOGIN_AUDIT_EVENTS.has(eventType)) return "Password";
  return null;
}

/**
 * @param {string} key
 */
function humanizeMetaKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * @param {unknown} value
 */
function formatMetaValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * @param {unknown} meta
 * @param {string} [eventType]
 * @returns {{ label: string; value: string }[]}
 */
export function formatAuditMetaEntries(meta, eventType = "") {
  if (meta === null || meta === undefined) return [];
  if (typeof meta !== "object" || Array.isArray(meta)) {
    return [{ label: "Details", value: formatMetaValue(meta) }];
  }

  /** @type {{ label: string; value: string }[]} */
  const entries = [];
  const obj = /** @type {Record<string, unknown>} */ (meta);

  const preferredOrder = [
    "method",
    "email",
    "identifier",
    "reason",
    "code",
    "idleMinutes",
    "lastActivityAt",
    "orgUserId",
    "roleName",
    "projectId",
    "planningPeriodId",
    "financialYearId",
    "projectOrgUserId",
    "activatedAccount",
    "firstSetup",
  ];

  const seen = new Set();
  for (const key of preferredOrder) {
    if (!(key in obj)) continue;
    seen.add(key);
    const label = key === "method" ? "Sign-in method" : humanizeMetaKey(key);
    const value =
      key === "method"
        ? auditLoginMethodLabel(eventType || AuditEvent.LOGIN_SUCCESS, obj) ||
          formatMetaValue(obj[key])
        : formatMetaValue(obj[key]);
    entries.push({ label, value });
  }

  for (const key of Object.keys(obj).sort()) {
    if (seen.has(key)) continue;
    entries.push({ label: humanizeMetaKey(key), value: formatMetaValue(obj[key]) });
  }

  return entries;
}

/**
 * @param {string} eventType
 */
export function auditEventTypeLabel(eventType) {
  return String(eventType || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
