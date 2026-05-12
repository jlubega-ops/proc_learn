import HomeRounded from "@mui/icons-material/HomeRounded";
import WorkOutlineRounded from "@mui/icons-material/WorkOutlineRounded";
import CategoryRounded from "@mui/icons-material/CategoryRounded";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ApartmentRounded from "@mui/icons-material/ApartmentRounded";
import BadgeRounded from "@mui/icons-material/BadgeRounded";
import AdminPanelSettingsRounded from "@mui/icons-material/AdminPanelSettingsRounded";
import { ROLE } from "@/lib/roles";

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
 * @typedef {{ id: string; label: string; links: NavLinkItem[] }} NavSection
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
    id: "administration",
    label: "Administration",
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
      links: [
        {
          href: "",
          label: "Administration",
          title: "Project organization administration",
          Icon: AdminPanelSettingsRounded,
          anyOf: [ROLE.STUDENT],
          children: [
            {
              href: `${base}/org-admin/users`,
              label: "Users",
              title: "Manage organization users",
              Icon: GroupsRounded,
              anyOf: [ROLE.STUDENT],
            },
            {
              href: `${base}/org-admin/departments`,
              label: "Departments",
              title: "Manage organization departments",
              Icon: ApartmentRounded,
              anyOf: [ROLE.STUDENT],
            },
            {
              href: `${base}/org-admin/roles`,
              label: "Roles",
              title: "Manage organization roles",
              Icon: BadgeRounded,
              anyOf: [ROLE.STUDENT],
            },
            {
              href: `${base}/workflow`,
              label: "Process workflows",
              title: "Project workflow and actions",
              Icon: AccountTreeRounded,
              anyOf: [ROLE.STUDENT],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * Sections with only links visible for the active role (empty sections removed).
 * @param {string} activeRole
 * @returns {{ id: string; label: string; links: NavLinkItem[] }[]}
 */
export function sidebarNavForActiveRole(activeRole) {
  return SIDEBAR_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    links: section.links.filter((item) => {
      if (!item.anyOf) return true;
      return item.anyOf.includes(activeRole);
    }),
  })).filter((section) => section.links.length > 0);
}

/**
 * @param {string} activeRole
 * @param {string} pathname
 */
export function sidebarNavForContext(activeRole, pathname) {
  const projectId = projectIdFromPathname(pathname);
  if (activeRole === ROLE.STUDENT && projectId) {
    return projectWorkspaceSections(projectId);
  }
  return sidebarNavForActiveRole(activeRole);
}
