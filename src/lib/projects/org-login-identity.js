import { CODE_CHARS } from "@/lib/projects/project-identity";

const PROJECT_CODE_PATTERN = new RegExp(
  `^([${CODE_CHARS}]{5})$`,
);

/**
 * Parses an organisation login username: local_PROJECTCODE@domain
 * @param {unknown} raw
 * @returns {{ baseEmail: string; projectCode: string } | null}
 */
export function parseOrgLoginIdentifier(raw) {
  const trimmed = String(raw || "").trim().toLowerCase();
  if (!trimmed) return null;

  const at = trimmed.indexOf("@");
  const local = at === -1 ? trimmed : trimmed.slice(0, at);
  const domain = at === -1 ? "" : trimmed.slice(at + 1);

  const underscore = local.lastIndexOf("_");
  if (underscore <= 0) return null;

  const emailLocal = local.slice(0, underscore);
  const projectCode = local.slice(underscore + 1).toUpperCase();
  if (!emailLocal || !PROJECT_CODE_PATTERN.test(projectCode)) return null;

  const baseEmail = domain ? `${emailLocal}@${domain}` : emailLocal;
  return { baseEmail, projectCode };
}

/**
 * @param {unknown} raw
 */
export function isOrgLoginIdentifier(raw) {
  return Boolean(parseOrgLoginIdentifier(raw));
}
