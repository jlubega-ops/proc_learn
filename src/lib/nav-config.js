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
        anyOf: null,
      },
      {
        href: "/projects",
        label: "My Projects",
        title: "Projects assigned to you",
        Icon: WorkOutlineRounded,
        anyOf: [ROLE.STUDENT],
      },
      {
        href: "/projects",
        label: "Projects",
        title: "Review and manage projects",
        Icon: WorkOutlineRounded,
        anyOf: [ROLE.SYSTEM_ADMIN, ROLE.EXAMINER, ROLE.LECTURER],
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
        title: "Manage administrators, lecturers, and examiners",
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
 * @param {string} pathname
 * @returns {string | null}
 */
function projectIdFromPathname(pathname) {
  const m = String(pathname || "").match(/^\/projects\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} projectId
 * @returns {NavSection[]}
 */
function projectWorkspaceSections(projectId) {
  const base = `/projects/${projectId}`;
  return [
    {
      id: "project-main",
      label: "",
      links: [
        {
          href: base,
          label: "Project overview",
          title: "Open project overview",
          Icon: WorkOutlineRounded,
          anyOf: [ROLE.STUDENT],
        },
      ],
    },
    {
      id: "project-admin",
      label: "System Administration",
      collapsible: true,
      links: [
        {
          href: `${base}/org-admin/organisation-structure`,
          label: "Organisation structure",
          title: "Define organisation structure",
          Icon: BusinessRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/departments`,
          label: "Departments / units",
          title: "Manage departments and units",
          Icon: ApartmentRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/users`,
          label: "User accounts",
          title: "Manage organisation user accounts",
          Icon: GroupsRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/roles`,
          label: "Roles & Permissions",
          title: "Manage roles and permissions",
          Icon: BadgeRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/financial-years`,
          label: "Financial years",
          title: "Manage financial years",
          Icon: CalendarMonthRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/planning-period`,
          label: "Planning period",
          title: "Manage planning periods",
          Icon: DateRangeRounded,
          anyOf: [ROLE.STUDENT],
        },
        {
          href: `${base}/org-admin/process-workflow`,
          label: "Process workflow",
          title: "Add organisation process workflows",
          Icon: AccountTreeRounded,
          anyOf: [ROLE.STUDENT],
        },
      ],
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
      [ROLE.LECTURER, ROLE.EXAMINER, ROLE.SYSTEM_ADMIN].includes(activeRole)
        ? "General"
        : section.label,
    collapsible:
      section.id === "main" &&
      [ROLE.LECTURER, ROLE.EXAMINER, ROLE.SYSTEM_ADMIN].includes(activeRole)
        ? true
        : Boolean(section.collapsible),
    links: section.links.filter((item) => {
      if (!item.anyOf) return true;
      return item.anyOf.includes(activeRole);
    }),
  })).filter((section) => section.links.length > 0);
}

/**
 * @param {string} projectId
 * @param {{ canManageOrgAdmin?: boolean }} [options]
 * @returns {NavSection[]}
 */
export function sidebarNavForProjectWorkspace(projectId, options = {}) {
  const canManageOrgAdmin = options.canManageOrgAdmin !== false;
  const sections = projectWorkspaceSections(projectId);
  if (canManageOrgAdmin) return sections;
  return sections.filter((section) => section.id !== "project-admin");
}

/**
 * @param {string} projectId
 * @param {string[]} [permissions]
 * @returns {NavSection[]}
 */
export function sidebarNavForOrgMember(projectId, permissions = []) {
  const base = `/projects/${projectId}`;
  const permSet = new Set(permissions);

  /** @type {NavLinkItem[]} */
  const accessChildren = [];
  if (permSet.has(ORG_PERMISSION.VIEW_ORG_STRUCTURE)) {
    accessChildren.push({
      href: `${base}/org-admin/organisation-structure`,
      label: "Organisation structure",
      title: "View organisation structure",
      Icon: BusinessRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_DEPARTMENTS)) {
    accessChildren.push({
      href: `${base}/org-admin/departments`,
      label: "Departments / units",
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
      label: "Financial years",
      title: "View financial years",
      Icon: CalendarMonthRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PLANNING_PERIODS)) {
    accessChildren.push({
      href: `${base}/org-admin/planning-period`,
      label: "Planning period",
      title: "View planning periods",
      Icon: DateRangeRounded,
      anyOf: null,
    });
  }
  if (permSet.has(ORG_PERMISSION.VIEW_PROCESS_WORKFLOW)) {
    accessChildren.push({
      href: `${base}/org-admin/process-workflow`,
      label: "Process workflow",
      title: "View organisation process workflows",
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
          label: "Project overview",
          title: "Open project overview",
          Icon: WorkOutlineRounded,
          anyOf: null,
        },
        {
          href: `${base}/my-account`,
          label: "My account",
          title: "Your organisation account details",
          Icon: BadgeRounded,
          anyOf: null,
        },
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
 * @param {{ canManageOrgAdmin?: boolean; sessionType?: string; projectId?: string; permissions?: string[] }} [options]
 */
export function sidebarNavForContext(activeRole, pathname, options = {}) {
  if (options.sessionType === "org" && options.projectId) {
    return sidebarNavForOrgMember(options.projectId, options.permissions);
  }
  const projectId = projectIdFromPathname(pathname);
  if (activeRole === ROLE.STUDENT && projectId) {
    return sidebarNavForProjectWorkspace(projectId, options);
  }
  return sidebarNavForActiveRole(activeRole);
}
