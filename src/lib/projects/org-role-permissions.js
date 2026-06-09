/** View permissions for organisation user accounts inside a project workspace. */
export const ORG_PERMISSION = {
  VIEW_OVERVIEW: "view_overview",
  VIEW_ORG_STRUCTURE: "view_org_structure",
  VIEW_DEPARTMENTS: "view_departments",
  VIEW_FINANCIAL_YEARS: "view_financial_years",
  VIEW_PLANNING_PERIODS: "view_planning_periods",
  VIEW_PROCESS_WORKFLOW: "view_process_workflow",
  VIEW_ROLES: "view_roles",
};

/** @type {Record<string, string[]>} */
const ROLE_PERMISSIONS = {
  "User Department": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
  ],
  "Head of User Department": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_ROLES,
  ],
  "Head PDU": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
  ],
  "Accounting Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
  ],
  "Procurement Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
  ],
};

/**
 * @param {unknown} roleName
 * @param {string} permission
 */
export function orgUserHasPermission(roleName, permission) {
  const name = String(roleName || "").trim();
  const perms = ROLE_PERMISSIONS[name];
  if (!perms) return permission === ORG_PERMISSION.VIEW_OVERVIEW;
  return perms.includes(permission);
}

/**
 * @param {unknown} roleName
 * @returns {string[]}
 */
export function orgUserPermissions(roleName) {
  const name = String(roleName || "").trim();
  return ROLE_PERMISSIONS[name] || [ORG_PERMISSION.VIEW_OVERVIEW];
}

/**
 * Maps org-admin route suffixes to required view permission.
 * @param {string} pathname
 * @returns {string | null}
 */
export function orgPermissionForPathname(pathname) {
  const p = String(pathname || "");
  if (/\/org-admin\/organisation-structure(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_ORG_STRUCTURE;
  }
  if (/\/org-admin\/departments(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_DEPARTMENTS;
  }
  if (/\/org-admin\/financial-years(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_FINANCIAL_YEARS;
  }
  if (/\/org-admin\/planning-period(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PLANNING_PERIODS;
  }
  if (/\/org-admin\/process-workflow(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PROCESS_WORKFLOW;
  }
  if (/\/org-admin\/roles(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_ROLES;
  }
  if (/\/org-admin\/users(?:\/|$)/.test(p)) {
    return null;
  }
  if (/\/my-account(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_OVERVIEW;
  }
  if (/^\/projects\/[^/]+\/?$/.test(p)) {
    return ORG_PERMISSION.VIEW_OVERVIEW;
  }
  return null;
}
