/** View / action permissions for organisation user accounts inside a project workspace. */
export const ORG_PERMISSION = {
  VIEW_OVERVIEW: "view_overview",
  VIEW_ORG_STRUCTURE: "view_org_structure",
  VIEW_DEPARTMENTS: "view_departments",
  VIEW_FINANCIAL_YEARS: "view_financial_years",
  VIEW_PLANNING_PERIODS: "view_planning_periods",
  VIEW_PROCESS_WORKFLOW: "view_process_workflow",
  VIEW_ROLES: "view_roles",
  VIEW_COMMITTEES: "view_committees",
  VIEW_REQUISITIONS: "view_requisitions",
  CREATE_REQUISITION: "create_requisition",
  VIEW_PROCUREMENT_PLANS: "view_procurement_plans",
  VIEW_TASKS: "view_tasks",
  VIEW_BUDGETS: "view_budgets",
  CREATE_BUDGET: "create_budget",
  CONSOLIDATE_PLANS: "consolidate_plans",
  VIEW_PROCUREMENTS: "view_procurements",
  VIEW_PROVIDERS: "view_providers",
  MANAGE_PROVIDERS: "manage_providers",
};

/**
 * Role → permission map. Keys match seeded ProjectOrgRole names.
 * @type {Record<string, string[]>}
 */
const ROLE_PERMISSIONS = {
  "Organization Administrator": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_ROLES,
    ORG_PERMISSION.VIEW_COMMITTEES,
    ORG_PERMISSION.VIEW_PROVIDERS,
  ],
  Admin: [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_ROLES,
    ORG_PERMISSION.VIEW_COMMITTEES,
    ORG_PERMISSION.VIEW_PROVIDERS,
  ],
  "Head PDU": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.CONSOLIDATE_PLANS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
    ORG_PERMISSION.VIEW_PROVIDERS,
    ORG_PERMISSION.MANAGE_PROVIDERS,
  ],
  "Accounting Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
  ],
  "Procurement Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_PROCESS_WORKFLOW,
    ORG_PERMISSION.VIEW_PLANNING_PERIODS,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
    ORG_PERMISSION.VIEW_PROVIDERS,
    ORG_PERMISSION.MANAGE_PROVIDERS,
  ],
  "Contracts Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_COMMITTEES,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
    ORG_PERMISSION.VIEW_PROVIDERS,
  ],
  "User Department Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.CREATE_REQUISITION,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.CREATE_BUDGET,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
  ],
  "User Department": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.CREATE_REQUISITION,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.CREATE_BUDGET,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
  ],
  "Head User Department": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_ROLES,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
  ],
  "Head of User Department": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_ORG_STRUCTURE,
    ORG_PERMISSION.VIEW_DEPARTMENTS,
    ORG_PERMISSION.VIEW_ROLES,
    ORG_PERMISSION.VIEW_REQUISITIONS,
    ORG_PERMISSION.VIEW_PROCUREMENT_PLANS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
  ],
  "Finance/Budget Officer": [
    ORG_PERMISSION.VIEW_OVERVIEW,
    ORG_PERMISSION.VIEW_FINANCIAL_YEARS,
    ORG_PERMISSION.VIEW_BUDGETS,
    ORG_PERMISSION.VIEW_TASKS,
    ORG_PERMISSION.VIEW_PROCUREMENTS,
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
 * Maps org-admin / workspace route suffixes to required view permission.
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
  if (/\/org-admin\/budgets(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_BUDGETS;
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
  if (/\/org-admin\/committees(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_COMMITTEES;
  }
  if (/\/org-admin\/users(?:\/|$)/.test(p)) {
    return null;
  }
  if (/\/(requisitions|my-requisitions)(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_REQUISITIONS;
  }
  if (/\/procurements(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PROCUREMENTS;
  }
  if (/\/org-admin\/providers(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PROVIDERS;
  }
  if (/\/(providers|suppliers)(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PROVIDERS;
  }
  if (/\/tasks(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_TASKS;
  }
  if (/\/procurement-plans(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_PROCUREMENT_PLANS;
  }
  if (/\/procurement-processes(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_REQUISITIONS;
  }
  if (/\/(budget-lines|budgets)(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_BUDGETS;
  }
  if (/\/my-account(?:\/|$)/.test(p)) {
    return ORG_PERMISSION.VIEW_OVERVIEW;
  }
  if (/^\/organisation\/?$/.test(p) || /^\/projects\/[^/]+\/?$/.test(p)) {
    return ORG_PERMISSION.VIEW_OVERVIEW;
  }
  return null;
}
