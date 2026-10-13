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
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Groups2Rounded from "@mui/icons-material/Groups2Rounded";
import ShoppingCartRounded from "@mui/icons-material/ShoppingCartRounded";
import StorefrontRounded from "@mui/icons-material/StorefrontRounded";
import EventNoteRounded from "@mui/icons-material/EventNoteRounded";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import ListAltRounded from "@mui/icons-material/ListAltRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import RequestQuoteRounded from "@mui/icons-material/RequestQuoteRounded";
import GradingRounded from "@mui/icons-material/GradingRounded";
import AssignmentTurnedInRounded from "@mui/icons-material/AssignmentTurnedInRounded";
import { ROLE } from "@/lib/roles";
import { NAV_LABELS } from "@/lib/nav-labels";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { procurementSectionAccess } from "@/lib/projects/procurement-section-access";
import {
  PROCUREMENT_STAGE_PAGES,
  canViewProcurementStage,
} from "@/lib/projects/procurement-stage-pages";

const PROCUREMENT_STAGE_ICONS = {
  solicitations: RequestQuoteRounded,
  evaluations: GradingRounded,
  awards: EmojiEventsRounded,
  "purchase-instructions": AssignmentTurnedInRounded,
  contracts: DescriptionRounded,
  deliveries: LocalShippingRounded,
  invoices: ReceiptLongRounded,
  payments: PaymentsRounded,
  closures: LockRounded,
};

/**
 * Procurements dropdown: the full list plus one page per stage the viewer may see.
 * @param {string} base
 * @param {{ roleName?: string | null; committeeType?: string | null }} viewer
 * @returns {NavLinkItem}
 */
function procurementsNavItem(base, viewer) {
  const sections = procurementSectionAccess(viewer);
  /** @type {NavLinkItem[]} */
  const children = [
    {
      href: `${base}/procurements`,
      label: NAV_LABELS.allProcurements,
      title: "Every procurement after method selection",
      Icon: ListAltRounded,
      anyOf: null,
    },
  ];
  for (const [stage, page] of Object.entries(PROCUREMENT_STAGE_PAGES)) {
    if (!canViewProcurementStage(stage, sections)) continue;
    children.push({
      href: `${base}/procurements/${stage}`,
      label: page.label,
      title: page.title,
      Icon: PROCUREMENT_STAGE_ICONS[stage] || ShoppingCartRounded,
      anyOf: null,
    });
  }
  return {
    href: `${base}/procurements`,
    label: NAV_LABELS.procurements,
    title: "Procurements and their stages",
    Icon: ShoppingCartRounded,
    anyOf: null,
    children,
  };
}

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
 * @typedef {{
 *   id: string;
 *   label: string;
 *   collapsible?: boolean;
 *   defaultOpen?: boolean;
 *   links: NavLinkItem[];
 * }} NavSection
 */

/** Staff (system admin / examiner) sidebar: flat, always-visible sections. */
/** @type {NavSection[]} */
export const SIDEBAR_SECTIONS = [
  {
    id: "main",
    label: "",
    links: [
      {
        href: "/",
        label: NAV_LABELS.dashboard,
        title: "Your dashboard",
        Icon: HomeRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
    ],
  },
  {
    id: "monitoring",
    label: "Teaching & monitoring",
    links: [
      {
        href: "/academic/participation",
        label: "Participation",
        title: "Student organisations and their procurement progress",
        Icon: VisibilityRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
      {
        href: "/projects",
        label: "Projects",
        title: "Practice and assessment projects",
        Icon: WorkOutlineRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
    ],
  },
  {
    id: "users",
    label: "Users",
    links: [
      {
        href: "/students/manage",
        label: "Students",
        title: "Search and manage student accounts",
        Icon: SchoolRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
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
    label: "Project setup",
    links: [
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
      {
        href: "/project-settings/programme-processes",
        label: "Programme processes",
        title: "Processes each programme may use per academic year",
        Icon: TuneRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER],
      },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    links: [
      {
        href: "/admin/academic-setup",
        label: "Academic setup",
        title: "Academic years and courses",
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
  {
    id: "system",
    label: "System",
    links: [
      {
        href: "/admin/activity",
        label: "Activity logs",
        title: "Search and filter audit events",
        Icon: HistoryRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
      {
        href: "/admin/site-settings",
        label: "Site settings",
        title: "Maintenance mode and other platform switches",
        Icon: TuneRounded,
        anyOf: [ROLE.SYSTEM_ADMIN],
      },
    ],
  },
];

/**
 * @param {string} base
 * @param {string[] | null} anyOf
 * @returns {NavLinkItem}
 */
function orgSettingsLink(base, anyOf) {
  return {
    href: `${base}/org-admin/settings`,
    label: NAV_LABELS.settings,
    title: "Organisation name and vote number",
    Icon: TuneRounded,
    anyOf,
  };
}

/**
 * Organisation Administration links (shared by Student My Organisation + project workspace).
 * @param {string} base e.g. `/organisation` or `/projects/{id}`
 * @param {string[] | null} [anyOf]
 * @returns {NavLinkItem[]}
 */
export function organisationAdministrationLinks(base, anyOf = [ROLE.STUDENT]) {
  return [
    orgSettingsLink(base, anyOf),
    {
      href: `${base}/org-admin/organisation-structure`,
      label: NAV_LABELS.organisationStructure,
      title: "Define organisation structure",
      Icon: BusinessRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/departments`,
      label: NAV_LABELS.departments,
      title: "Manage departments and units",
      Icon: ApartmentRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/users`,
      label: NAV_LABELS.users,
      title: "Manage organisation user accounts",
      Icon: GroupsRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/roles`,
      label: NAV_LABELS.roles,
      title: "Manage roles and permissions",
      Icon: BadgeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/financial-years`,
      label: NAV_LABELS.financialYears,
      title: "Manage financial years",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/budgets`,
      label: NAV_LABELS.budgets,
      title: "View organisation budgets (read-only)",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/planning-period`,
      label: NAV_LABELS.planningPeriods,
      title: "Manage planning periods",
      Icon: DateRangeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/process-workflow`,
      label: NAV_LABELS.processWorkflows,
      title: "Add organisation process workflows",
      Icon: AccountTreeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/committees`,
      label: NAV_LABELS.committees,
      title: "Manage organisation committees and memberships",
      Icon: Groups2Rounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/providers`,
      label: NAV_LABELS.providers,
      title: "View the provider register and provider portal logins (read-only)",
      Icon: StorefrontRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/audit-logs`,
      label: NAV_LABELS.activityLogs,
      title: "View organisation activity and audit history",
      Icon: HistoryRounded,
      anyOf,
    },
  ];
}

/**
 * Student platform System Administration — users, roles, structure units, audit.
 * @param {string} base
 * @param {string[] | null} [anyOf]
 * @returns {NavLinkItem[]}
 */
function studentSystemAdministrationLinks(base, anyOf = [ROLE.STUDENT]) {
  return [
    {
      href: `${base}/org-admin/departments`,
      label: NAV_LABELS.departments,
      title: "Manage departments and units",
      Icon: ApartmentRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/users`,
      label: NAV_LABELS.users,
      title: "Manage organisation user accounts",
      Icon: GroupsRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/roles`,
      label: NAV_LABELS.roles,
      title: "Manage roles and permissions",
      Icon: BadgeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/audit-logs`,
      label: NAV_LABELS.activityLogs,
      title: "View organisation activity and audit history",
      Icon: HistoryRounded,
      anyOf,
    },
  ];
}

/**
 * Student platform Manage Organisation — structure and procurement setup.
 * @param {string} base
 * @param {string[] | null} [anyOf]
 * @returns {NavLinkItem[]}
 */
function studentManageOrganisationLinks(base, anyOf = [ROLE.STUDENT]) {
  return [
    orgSettingsLink(base, anyOf),
    {
      href: `${base}/org-admin/organisation-structure`,
      label: NAV_LABELS.organisationStructure,
      title: "Define organisation structure",
      Icon: BusinessRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/financial-years`,
      label: NAV_LABELS.financialYears,
      title: "Manage financial years",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/budgets`,
      label: NAV_LABELS.budgets,
      title: "View organisation budgets (read-only)",
      Icon: CalendarMonthRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/planning-period`,
      label: NAV_LABELS.planningPeriods,
      title: "Manage planning periods",
      Icon: DateRangeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/process-workflow`,
      label: NAV_LABELS.processWorkflows,
      title: "Add organisation process workflows",
      Icon: AccountTreeRounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/committees`,
      label: NAV_LABELS.committees,
      title: "Manage organisation committees and memberships",
      Icon: Groups2Rounded,
      anyOf,
    },
    {
      href: `${base}/org-admin/providers`,
      label: NAV_LABELS.providers,
      title: "View the provider register and provider portal logins (read-only)",
      Icon: StorefrontRounded,
      anyOf,
    },
  ];
}

/**
 * Student platform nav — Dashboard, System Administration,
 * Manage Organisation, My Academic Work (personal org only).
 * Inside Practice/Assessment: adds Project overview; no My Academic Work.
 * @param {{ orgContext?: 'PERSONAL' | 'PRACTICE' | 'ASSESSMENT' }} [options]
 * @returns {NavSection[]}
 */
function studentPlatformSections(options = {}) {
  const orgBase = "/organisation";
  const inProjectOrg = options.orgContext === "PRACTICE" || options.orgContext === "ASSESSMENT";
  /** @type {NavSection[]} */
  const sections = [
    {
      id: "student-main",
      label: "",
      links: [
        {
          href: inProjectOrg ? orgBase : "/",
          label: NAV_LABELS.dashboard,
          title: inProjectOrg
            ? "This project's organisation dashboard"
            : "Your student home — what to do next",
          Icon: HomeRounded,
          anyOf: [ROLE.STUDENT],
        },
        ...(inProjectOrg
          ? [
              {
                href: `${orgBase}/overview`,
                label: "Project overview",
                title: "Instructions, question, and project details",
                Icon: BusinessRounded,
                anyOf: [ROLE.STUDENT],
              },
            ]
          : []),
      ],
    },
    {
      id: "system-administration",
      label: "System Administration",
      collapsible: true,
      links: studentSystemAdministrationLinks(orgBase, [ROLE.STUDENT]),
    },
    {
      id: "manage-organisation",
      label: "Manage Organisation",
      collapsible: true,
      defaultOpen: inProjectOrg,
      links: studentManageOrganisationLinks(orgBase, [ROLE.STUDENT]),
    },
  ];

  if (!inProjectOrg) {
    sections.push({
      id: "my-academic-work",
      label: "My Academic Work",
      collapsible: true,
      defaultOpen: true,
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
      ],
    });
  }

  return sections;
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
    label: section.label,
    collapsible: Boolean(section.collapsible),
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
 * @param {{ roleName?: string | null; activeCommittee?: { id?: string; name?: string; committeeType?: string } | null }} [options]
 */
export function sidebarNavForOrgMember(projectId, permissions = [], options = {}) {
  const base = `/projects/${projectId}`;
  const permSet = new Set(permissions);
  const roleName = String(options.roleName || "").trim();
  const activeCommittee = options.activeCommittee || null;

  // Exclusive committee mode: only show work that committee can act on.
  if (activeCommittee?.id) {
    const type = String(activeCommittee.committeeType || "").toUpperCase();
    /** @type {NavLinkItem[]} */
    const links = [
      {
        href: base,
        label: NAV_LABELS.dashboard,
        title: "Organisation dashboard",
        Icon: HomeRounded,
        anyOf: null,
      },
      {
        href: `${base}/tasks`,
        label: NAV_LABELS.myTasks,
        title: `Tasks for ${activeCommittee.name || "this committee"}`,
        Icon: TaskAltRounded,
        anyOf: null,
      },
    ];
    if (type === "CONTRACTS" && permSet.has(ORG_PERMISSION.VIEW_REQUISITIONS)) {
      links.push({
        href: `${base}/requisitions`,
        label: NAV_LABELS.requisitions,
        title: "Open requisitions for method approval",
        Icon: AssignmentRounded,
        anyOf: null,
      });
    }
    if (
      (type === "EVALUATION" ||
        type === "INSPECTION_ACCEPTANCE" ||
        type === "NEGOTIATION" ||
        type === "CONTRACTS") &&
      permSet.has(ORG_PERMISSION.VIEW_PROCUREMENTS)
    ) {
      links.push(procurementsNavItem(base, { roleName, committeeType: type }));
    }
    return [
      {
        id: "committee-mode",
        label: activeCommittee.name || "Committee",
        links,
      },
    ];
  }

  const isPo = roleName === "Procurement Officer";

  /** @type {NavLinkItem[]} */
  const accessChildren = [];
  if (permSet.has(ORG_PERMISSION.VIEW_ORG_STRUCTURE)) {
    accessChildren.push({
      href: `${base}/org-admin/organisation-structure`,
      label: NAV_LABELS.organisationStructure,
      title: "View organisation structure",
      Icon: BusinessRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_DEPARTMENTS)) {
    accessChildren.push({
      href: `${base}/org-admin/departments`,
      label: NAV_LABELS.departments,
      title: "View departments and units",
      Icon: ApartmentRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_ROLES)) {
    accessChildren.push({
      href: `${base}/org-admin/roles`,
      label: NAV_LABELS.roles,
      title: "View roles and permissions",
      Icon: BadgeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_FINANCIAL_YEARS)) {
    accessChildren.push({
      href: `${base}/org-admin/financial-years`,
      label: NAV_LABELS.financialYears,
      title: "View financial years",
      Icon: CalendarMonthRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PLANNING_PERIODS)) {
    accessChildren.push({
      href: `${base}/org-admin/planning-period`,
      label: NAV_LABELS.planningPeriods,
      title: "View planning periods",
      Icon: DateRangeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCESS_WORKFLOW)) {
    accessChildren.push({
      href: `${base}/org-admin/process-workflow`,
      label: NAV_LABELS.processWorkflows,
      title: "View organisation process workflows",
      Icon: AccountTreeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_COMMITTEES)) {
    accessChildren.push({
      href: `${base}/org-admin/committees`,
      label: NAV_LABELS.committees,
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
      label: NAV_LABELS.myTasks,
      title: "Open your pending organisation tasks",
      Icon: TaskAltRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_BUDGETS)) {
    opsLinks.push({
      href: `${base}/budgets`,
      label: NAV_LABELS.budgets,
      title: "Department budgets and budget lines",
      Icon: CalendarMonthRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCUREMENT_PLANS)) {
    opsLinks.push({
      href: `${base}/procurement-plans`,
      label: NAV_LABELS.procurementPlans,
      title: "View procurement plans",
      Icon: AccountTreeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_REQUISITIONS)) {
    opsLinks.push({
      href: `${base}/requisitions`,
      label: NAV_LABELS.requisitions,
      title: "View procurement requisitions",
      Icon: AssignmentRounded,
      anyOf: null,
    });
  } else if (permSet.has(ORG_PERMISSION.CREATE_REQUISITION)) {
    opsLinks.push({
      href: `${base}/requisitions`,
      label: NAV_LABELS.requisitions,
      title: "Create a procurement requisition",
      Icon: AssignmentRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCUREMENTS)) {
    opsLinks.push(procurementsNavItem(base, { roleName, committeeType: null }));
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROVIDERS)) {
    const canManageProviders = permSet.has(ORG_PERMISSION.MANAGE_PROVIDERS);
    opsLinks.push({
      href: `${base}/providers`,
      label: NAV_LABELS.providers,
      title: canManageProviders
        ? "Manage the organisation's provider register"
        : "View the organisation's provider register",
      Icon: StorefrontRounded,
      anyOf: null,
    });
  }
  if (isPo) {
    opsLinks.push({
      href: `${base}/procurement-processes`,
      label: NAV_LABELS.procurementProcesses,
      title: "Open selected procurement method processes",
      Icon: AccountTreeRounded,
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
          label: NAV_LABELS.dashboard,
          title: "Organisation dashboard",
          Icon: HomeRounded,
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
 *   activeCommittee?: { id?: string; name?: string; committeeType?: string } | null;
 *   personalOrgProjectId?: string | null;
 *   orgContext?: 'PERSONAL' | 'PRACTICE' | 'ASSESSMENT' | null;
 * }} [options]
 */
export function sidebarNavForContext(activeRole, pathname, options = {}) {
  if (options.sessionType === "org" && options.projectId) {
    return sidebarNavForOrgMember(options.projectId, options.permissions, {
      roleName: options.roleName || null,
      activeCommittee: options.activeCommittee || null,
    });
  }

  if (activeRole === ROLE.STUDENT) {
    return studentPlatformSections({
      orgContext: options.orgContext || "PERSONAL",
    });
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
