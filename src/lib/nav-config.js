import HomeRounded from "@mui/icons-material/HomeRounded";
import WorkOutlineRounded from "@mui/icons-material/WorkOutlineRounded";
import CategoryRounded from "@mui/icons-material/CategoryRounded";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ApartmentRounded from "@mui/icons-material/ApartmentRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import BusinessRounded from "@mui/icons-material/BusinessRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import DateRangeRounded from "@mui/icons-material/DateRangeRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import AssessmentRounded from "@mui/icons-material/AssessmentRounded";
import Groups2Rounded from "@mui/icons-material/Groups2Rounded";
import ShoppingCartRounded from "@mui/icons-material/ShoppingCartRounded";
import StorefrontRounded from "@mui/icons-material/StorefrontRounded";
import EventNoteRounded from "@mui/icons-material/EventNoteRounded";
import { ROLE } from "@/lib/roles";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";

/**
 * @typedef {{
 *   href: string;
 *   label: string;
 *   title: string;
 *   Icon: import("@mui/material").SvgIconComponent;
 *   anyOf: string[] | null;
 *   children?: NavLinkItem[];
 * }} NavLinkItem
 */

/**
 * Sidebar section. `label` empty = no heading (typically the first block).
 * @typedef {{ id: string; label: string; collapsible?: boolean; links: NavLinkItem[] }} NavSection
 */

/** @type {NavSection[]} */
export const SIDEBAR_SECTIONS = [
  {
    id: "main",
    label: "",
    links: [
      {
        href: "/",
        label: "Home",
        title: "Dashboard home",
        Icon: HomeRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/projects",
        label: "Projects",
        title: "Review and manage projects",
        Icon: WorkOutlineRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/academic/results",
        label: "Results",
        title: "Assessment results, grades, and official export",
        Icon: AssessmentRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
    ],
  },
  {
    id: "users",
    label: "Users",
    collapsible: true,
    links: [
      {
        href: "/students/manage",
        label: "Students",
        title: "Search and manage student accounts",
        Icon: SchoolRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/admin/staff",
        label: "Staff",
        title: "Manage administrators and examiners",
        Icon: GroupsRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
    ],
  },
  {
    id: "project-settings",
    label: "Project settings",
    collapsible: true,
    links: [
      {
        href: "/project-settings",
        label: "Overview",
        title: "Project configuration overview",
        Icon: SettingsRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/project-settings/roles",
        label: "Project roles",
        title: "Organisation roles for student project workspaces",
        Icon: BadgeRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/project-settings/process-flow",
        label: "Process flow",
        title: "Organisation process flows for student project workspaces",
        Icon: AccountTreeRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    collapsible: true,
    links: [
      {
        href: "/admin/activity",
        label: "Activity logs",
        title: "Search and filter audit events",
        Icon: HistoryRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
      {
        href: "/admin/academic-setup",
        label: "Academic setup",
        title: "Academic years, semesters, courses and classes",
        Icon: EventNoteRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
      {
        href: "/admin/programmes",
        label: "Programmes",
        title: "Create and edit study programmes",
        Icon: CategoryRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
    ],
  },
];

/**
 * Organisation Administration links (shared by Student My Organisation + project workspace).
 * @param {string} base e.g. `/organisation` or `/projects/{id}`
 * @param {string[] | null} [anyOf]
 * @returns {NavLinkItem[]}
 */
export function organisationAdministrationLinks(base, anyOf = [ROLE.STUDENT]) {
  return [
    {
      href: `${base}/org-admin/organisation-structure`,
      label: "Organisation Structure",
      title: "Define organisation structure",
      Icon: BusinessRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/departments`,
      label: "Departments/Units",
      title: "Manage departments and units",
      Icon: ApartmentRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/users`,
      label: "Users",
      title: "Manage organisation user accounts",
      Icon: GroupsRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/roles`,
      label: "Roles & Permissions",
      title: "Manage roles and permissions",
      Icon: BadgeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/financial-years`,
      label: "Financial Years",
      title: "Manage financial years",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/budgets`,
      label: "Budgets (read-only)",
      title: "View organisation budgets — operational preparation is done by department users",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/planning-period`,
      label: "Planning Periods",
      title: "Manage planning periods",
      Icon: DateRangeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/process-workflow`,
      label: "Process Workflows",
      title: "Add organisation process workflows",
      Icon: AccountTreeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/committees`,
      label: "Committees",
      title: "Manage organisation committees and memberships",
      Icon: Groups2Rounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/audit-logs`,
      label: "Activity logs",
      title: "View organisation activity and audit history",
      Icon: HistoryRounded,
      anyOf,
    },
  ];
}

/**
 * Student platform nav — Dashboard, My Organisation, My Academic Work.
 * Deliberately separates org simulation work from examiner-assigned academic work.
 * @returns {NavSection[]}
 */
function studentPlatformSections() {
  const orgBase = "/organisation";
  return [
    {
      id: "student-main",
      label: "",
      links: [
        {
          href: "/",
          label: "Dashboard",
          title: "Your student home — what to do next",
          Icon: HomeRounded,
          anyOf: [ROLE.STUDENT],
        },
      ],
    },
    {
      id: "my-organisation",
      label: "My Organisation",
      collapsible: true,
      links: [
        {
          href: orgBase,
          label: "Overview",
          title: "Open your organisation overview",
          Icon: BusinessRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${orgBase}/org-admin`,
          label: "System Administration",
          title: "Configure structure, users, and organisation settings",
          Icon: SettingsRounded,
          anyOf: [ROLE.STUDENT],
          children: organisationAdministrationLinks(orgBase, [ROLE.STUDENT]),
        },
      ],
    },
    {
      id: "my-academic-work",
      label: "My Academic Work",
      collapsible: true,
      links: [
        {
          href: "/academic/practice",
          label: "Practice",
          title: "Practice projects assigned by your examiner",
          Icon: WorkOutlineRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: "/academic/assessments",
          label: "Assessments",
          title: "Assessment projects assigned by your examiner",
          Icon: AssignmentRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: "/academic/results",
          label: "Results",
          title: "Your scores and feedback when released",
          Icon: AssessmentRounded,
          anyOf: [ROLE.STUDENT],
        },
      ],
    },
  ];
}

/**
 * Flat org-admin section for examiner project workspaces (System Administration accordion).
 * @returns {NavSection[]}
 */
function studentOrganisationAdminSection() {
  return [
    {
      id: "project-admin",
      label: "System Administration",
      collapsible: true,
      links: organisationAdministrationLinks("/organisation", [ROLE.STUDENT]),
    },
  ];
}

/**
 * Sections with only links visible for the active role (empty sections removed).
 * @param {string} activeRole
 * @returns {{ id: string; label: string; collapsible?: boolean; links: NavLinkItem[] }[]}
 */
export function sidebarNavForActiveRole(activeRole) {
  return SIDEBAR_SECTIONS.map((section) => ({
    id: section.id,
    label:
      section.id === "main" &&
      [ROLE.EXAMINER, ROLE.SYSTEM_ADMIN].includes(activeRole)
        ? "General"
        : section.label,
    collapsible:
      section.id === "main" &&
      [ROLE.EXAMINER, ROLE.SYSTEM_ADMIN].includes(activeRole)
        ? true
        : Boolean(section.collapsible),
    links: section.links.filter((item) => {
      if (!item.anyOf) return true;
      return item.anyOf.includes(activeRole);
    }),
  })).filter((section) => section.links.length > 0);
}

/**
 * Staff / non-student project workspace nav (kept for examiner project pages).
 * @param {string} projectId
 * @param {{ canManageOrgAdmin?: boolean }} [options]
 * @returns {NavSection[]}
 */
export function sidebarNavForProjectWorkspace(projectId, options = {}) {
  const base = `/projects/${projectId}`;
  /** @type {NavSection[]} */
  const sections = [
    {
      id: "project-main",
      label: "",
      links: [
        {
          href: base,
          label: "Project overview",
          title: "Open project overview",
          Icon: WorkOutlineRounded,
          anyOf: null,
        },
      ],
    },
  ];
  if (options.canManageOrgAdmin === true) {
    const admin = studentOrganisationAdminSection().find((s) => s.id === "project-admin");
    if (admin) {
      sections.push({
        ...admin,
        links: organisationAdministrationLinks(base, null),
      });
    }
  }
  return sections;
}

/**
 * @param {string} projectId
 * @param {string[]} [permissions]
 * @returns {NavSection[]}
 */
/**
 * Role-aware sidebar for simulated organisation users (permission-gated; no disabled stubs).
 * @param {string} projectId
 * @param {string[]} [permissions]
 * @param {{ roleName?: string | null }} [options]
 */
export function sidebarNavForOrgMember(projectId, permissions = [], options = {}) {
  const base = `/projects/${projectId}`;
  const permSet = new Set(permissions);
  const roleName = String(options.roleName || "").trim();

  const isUdo =
    roleName === "User Department Officer" || roleName === "User Department";
  const isHod =
    roleName === "Head User Department" || roleName === "Head of User Department";
  const isPo = roleName === "Procurement Officer";
  const isHeadPdu = roleName === "Head PDU";
  const isAo = roleName === "Accounting Officer";

  /** @type {NavLinkItem[]} */
  const accessChildren = [];
  if (permSet.has(ORG_PERMISSION.VIEW_ORG_STRUCTURE)) {
    accessChildren.push({
      href: `${base}/org-admin/organisation-structure`,
      label: "Organisation Structure",
      title: "View organisation structure",
      Icon: BusinessRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_DEPARTMENTS)) {
    accessChildren.push({
      href: `${base}/org-admin/departments`,
      label: "Departments/Units",
      title: "View departments and units",
      Icon: ApartmentRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_ROLES)) {
    accessChildren.push({
      href: `${base}/org-admin/roles`,
      label: "Roles & Permissions",
      title: "View roles and permissions",
      Icon: BadgeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_FINANCIAL_YEARS)) {
    accessChildren.push({
      href: `${base}/org-admin/financial-years`,
      label: "Financial Years",
      title: "View financial years",
      Icon: CalendarMonthRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PLANNING_PERIODS)) {
    accessChildren.push({
      href: `${base}/org-admin/planning-period`,
      label: "Planning Periods",
      title: "View planning periods",
      Icon: DateRangeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCESS_WORKFLOW)) {
    accessChildren.push({
      href: `${base}/org-admin/process-workflow`,
      label: "Process Workflows",
      title: "View organisation process workflows",
      Icon: AccountTreeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_COMMITTEES)) {
    accessChildren.push({
      href: `${base}/org-admin/committees`,
      label: "Committees",
      title: "View organisation committees",
      Icon: Groups2Rounded,
      anyOf: null,
    });
  }

  /** Operational links stay top-level (not nested under a Procurement parent). */
  /** @type {NavLinkItem[]} */
  const opsLinks = [];
  if (permSet.has(ORG_PERMISSION.VIEW_TASKS)) {
    opsLinks.push({
      href: `${base}/tasks`,
      label: isHeadPdu ? "Pending Tasks" : isAo ? "Approvals" : "My Tasks",
      title: "Open your pending organisation tasks",
      Icon: TaskAltRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_BUDGETS)) {
    opsLinks.push({
      href: `${base}/budgets`,
      label: isUdo ? "Department Budgets" : "Budgets",
      title: "Department budgets and budget lines",
      Icon: CalendarMonthRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCUREMENT_PLANS)) {
    opsLinks.push({
      href: `${base}/procurement-plans`,
      label: isHeadPdu ? "Plans" : "Procurement Plans",
      title: "View procurement plans",
      Icon: AccountTreeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_REQUISITIONS)) {
    opsLinks.push({
      href: `${base}/requisitions`,
      label: isUdo
        ? "My Requisitions"
        : isAo
          ? "Procurement Overview"
          : "Requisitions",
      title: "View procurement requisitions",
      Icon: AssignmentRounded,
      anyOf: null,
    });
  } else if (permSet.has(ORG_PERMISSION.CREATE_REQUISITION)) {
    opsLinks.push({
      href: `${base}/requisitions`,
      label: "New Requisition",
      title: "Create a procurement requisition",
      Icon: AssignmentRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCUREMENTS)) {
    opsLinks.push({
      href: `${base}/procurements`,
      label: "Procurements",
      title: "View procurements after method selection",
      Icon: ShoppingCartRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_SUPPLIERS)) {
    opsLinks.push({
      href: `${base}/suppliers`,
      label: "Suppliers",
      title: "View and manage organisation suppliers/providers",
      Icon: StorefrontRounded,
      anyOf: null,
    });
  }
  if (isPo) {
    opsLinks.push({
      href: `${base}/procurement-processes`,
      label: "Procurement Processes",
      title: "Open selected procurement method processes",
      Icon: AccountTreeRounded,
      anyOf: null,
    });
  }
  if (isAo && permSet.has(ORG_PERMISSION.VIEW_TASKS)) {
    opsLinks.push({
      href: `${base}/tasks?view=history`,
      label: "Approval History",
      title: "Review previous approval actions",
      Icon: TaskAltRounded,
      anyOf: null,
    });
  }

  /** @type {NavSection[]} */
  const sections = [
    {
      id: "project-main",
      label: "",
      links: [
        {
          href: base,
          label: "Dashboard",
          title: "Organisation dashboard",
          Icon: HomeRounded,
          anyOf: null,
        },
        {
          href: `${base}/my-account`,
          label: "My account",
          title: "Your organisation account details",
          Icon: BadgeRounded,
          anyOf: null,
        },
        ...opsLinks,
      ],
    },
  ];

  if (accessChildren.length > 0) {
    sections.push({
      id: "project-access",
      label: "Your workspace",
      collapsible: true,
      links: accessChildren,
    });
  }

  void isHod;

  return sections;
}

/**
 * @param {string} activeRole
 * @param {string} pathname
 * @param {{
 *   canManageOrgAdmin?: boolean;
 *   sessionType?: string;
 *   projectId?: string;
 *   permissions?: string[];
 *   roleName?: string | null;
 *   personalOrgProjectId?: string | null;
 * }} [options]
 */
export function sidebarNavForContext(activeRole, pathname, options = {}) {
  if (options.sessionType === "org" && options.projectId) {
    return sidebarNavForOrgMember(options.projectId, options.permissions, {
      roleName: options.roleName || null,
    });
  }

  if (activeRole === ROLE.STUDENT) {
    return studentPlatformSections();
  }

  return sidebarNavForActiveRole(activeRole);
}

/**
 * Flatten section labels including nested children (for tests / audits).
 * @param {NavSection[]} sections
 * @returns {string[]}
 */
export function flattenNavLabels(sections) {
  return (sections || []).flatMap((section) =>
    (section.links || []).flatMap((link) => [
      link.label,
      ...((link.children || []).map((child) => child.label)),
    ]),
  );
}

/**
 * Flatten hrefs including nested children.
 * @param {NavSection[]} sections
 * @returns {string[]}
 */
export function flattenNavHrefs(sections) {
  return (sections || []).flatMap((section) =>
    (section.links || []).flatMap((link) => [
      link.href,
      ...((link.children || []).map((child) => child.href)),
    ]),
  );
}
