import { APP_NAME } from "@/lib/appConfig";
import { isOrganisationProjectCode } from "@/lib/projects/project-identity";

/** Reserved top-level domain (RFC 2606) for simulated provider mailboxes. */
export const PROVIDER_EMAIL_TLD = "test";
export const PROVIDER_EMAIL_LOCAL = "sales";

/**
 * Lowercase a-z0-9 slug (no separators) used in login emails.
 * @param {unknown} value
 * @param {number} [max]
 */
export function emailSlug(value, max = 32) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

/** Domain label from the current app name (read at call time, so renames apply to new accounts). */
export function appEmailLabel() {
  return emailSlug(APP_NAME, 40) || "proclearn";
}

/** @param {unknown} projectCode */
function codeLabel(projectCode) {
  return String(projectCode || "").trim().toLowerCase();
}

/**
 * `firstname.lastname` — also the duplicate-name key inside one organisation.
 * @param {{ firstName?: string | null; lastName?: string | null }} p
 */
export function orgUserNameKey(p) {
  const first = emailSlug(p?.firstName);
  const last = emailSlug(p?.lastName);
  if (!first || !last) return "";
  return `${first}.${last}`;
}

/**
 * `firstname.lastname@<orgcode>.<appname>`
 * @param {{ firstName: string; lastName: string; projectCode: string }} p
 */
export function buildOrgUserLoginEmail(p) {
  const local = orgUserNameKey(p) || "user";
  return `${local}@${codeLabel(p.projectCode)}.${appEmailLabel()}`;
}

/**
 * Provider name label: legal suffixes dropped so "Mukwano Group Ltd" and "Mukwano Group" are one provider.
 * @param {unknown} name
 */
export function providerNameKey(name) {
  const cleaned = String(name || "")
    .toLowerCase()
    .replace(/\(u\)/g, " ")
    .replace(/\b(ltd|limited|co|company|plc|inc)\b\.?/g, " ")
    .replace(/&/g, " ");
  return emailSlug(cleaned, 40);
}

/**
 * `sales@<providername>.<orgcode>.<appname>.test`
 * @param {{ name: string; projectCode: string }} p
 */
export function buildProviderPortalEmail(p) {
  const label = providerNameKey(p.name) || "provider";
  return `${PROVIDER_EMAIL_LOCAL}@${label}.${codeLabel(p.projectCode)}.${appEmailLabel()}.${PROVIDER_EMAIL_TLD}`;
}

/**
 * Detects simulated organisation logins from the domain:
 * - org user: `local@<orgcode>.<app>`
 * - provider: `local@<provider>.<orgcode>.<app>.test`
 * @param {unknown} raw
 * @returns {{ kind: "org" | "provider"; email: string; projectCode: string } | null}
 */
export function parseOrgLoginIdentifier(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return null;
  const labels = email.slice(at + 1).split(".");
  if (labels.some((l) => !l)) return null;

  if (
    labels.length >= 4 &&
    labels[labels.length - 1] === PROVIDER_EMAIL_TLD &&
    isOrganisationProjectCode(labels[1])
  ) {
    return { kind: "provider", email, projectCode: labels[1].toUpperCase() };
  }
  if (labels.length >= 2 && isOrganisationProjectCode(labels[0])) {
    return { kind: "org", email, projectCode: labels[0].toUpperCase() };
  }
  return null;
}

/** @param {unknown} raw */
export function isOrgLoginIdentifier(raw) {
  return parseOrgLoginIdentifier(raw)?.kind === "org";
}

/** @param {unknown} raw */
export function isProviderPortalIdentifier(raw) {
  return parseOrgLoginIdentifier(raw)?.kind === "provider";
}
