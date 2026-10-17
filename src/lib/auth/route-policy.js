/**
 * Page URL access policy — single source of truth for which session kind / ACTIVE role may open
 * a dashboard URL. Pure (no Prisma / Next imports) so `src/proxy.js` and test scripts share it.
 *
 * Rules are checked in order; the first matching rule decides. Pages still re-check on the server
 * and every API handler authorizes on its own — this is the URL gate, not the only gate.
 */

const SA = "SYSTEM_ADMIN";
const EX = "EXAMINER";
const ST = "STUDENT";
const ANY = [SA, EX, ST];

/**
 * @typedef {{ pattern: RegExp; roles: string[]; label: string }} PageRule
 */

/** @type {PageRule[]} */
export const PAGE_RULES = [
  { pattern: /^\/$/, roles: ANY, label: "Dashboard" },

  // System admin only
  { pattern: /^\/admin(\/.*)?$/, roles: [SA], label: "System administration" },
  { pattern: /^\/students\/(manage|new)(\/.*)?$/, roles: [SA], label: "Student accounts" },

  // Teaching & monitoring: examiner acts, system admin views read-only
  { pattern: /^\/students\/[^/]+\/observe(\/.*)?$/, roles: [SA, EX], label: "Observe student" },
  { pattern: /^\/academic\/(participation|results)(\/.*)?$/, roles: [SA, EX], label: "Monitoring" },
  { pattern: /^\/projects(\/.*)?$/, roles: [SA, EX], label: "Projects" },
  { pattern: /^\/project-settings(\/.*)?$/, roles: [SA, EX], label: "System setup" },
  { pattern: /^\/cases(\/.*)?$/, roles: [SA, EX], label: "Projects (legacy)" },
  { pattern: /^\/courses(\/.*)?$/, roles: [SA, EX], label: "Courses (legacy)" },

  // Student (including staff in Student Mode)
  { pattern: /^\/academic\/(practice|assessments)(\/.*)?$/, roles: [ST], label: "My academic work" },
  { pattern: /^\/organisation(\/.*)?$/, roles: [ST], label: "My organisation" },

  // Any signed-in platform user
  { pattern: /^\/(notifications|profile|settings|setup-password)(\/.*)?$/, roles: ANY, label: "Account" },
];

/**
 * @param {string} pathname
 * @returns {PageRule | null}
 */
export function matchPageRule(pathname) {
  return PAGE_RULES.find((r) => r.pattern.test(pathname)) || null;
}

/**
 * Decide what a platform user (by ACTIVE role) may do with a page URL.
 * Unknown paths are allowed through so Next.js can render its 404.
 * @param {string} pathname
 * @param {string | null | undefined} activeRole
 * @returns {{ allowed: boolean; rule: PageRule | null }}
 */
export function platformPageAccess(pathname, activeRole) {
  const rule = matchPageRule(pathname);
  if (!rule) return { allowed: true, rule: null };
  return { allowed: rule.roles.includes(String(activeRole || "")), rule };
}

/**
 * Organisation-user sessions may only open their own project workspace.
 * @param {string} pathname
 * @param {string | null | undefined} projectId
 */
export function orgUserPageAllowed(pathname, projectId) {
  if (!projectId) return false;
  const base = `/projects/${projectId}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Provider-portal sessions may only open the portal. */
export function providerPageAllowed(pathname) {
  return pathname === "/provider-portal" || pathname.startsWith("/provider-portal/");
}

/**
 * API prefixes by session kind (coarse gate; handlers authorize roles/permissions).
 * - provider: only `/api/provider-portal/*`, `/api/auth/*`, `/api/site/*`, `/api/health`.
 * - org user: only `/api/projects/{own}/*`, plus shared auth/session/notification endpoints.
 * @param {string} pathname
 * @param {{ kind: 'user' | 'org' | 'provider' | 'none'; projectId?: string | null }} who
 */
export function apiPrefixAllowed(pathname, who) {
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/site/") ||
    pathname === "/api/health"
  ) {
    return true;
  }
  if (who.kind === "provider") return pathname.startsWith("/api/provider-portal/");
  if (pathname.startsWith("/api/provider-portal/")) {
    // Portal login/logout must work before a provider session exists.
    return /^\/api\/provider-portal\/(login|logout)(\/|$)/.test(pathname);
  }
  if (who.kind === "org") {
    if (who.projectId && pathname.startsWith(`/api/projects/${who.projectId}`)) return true;
    return (
      pathname === "/api/projects/org-notifications" ||
      pathname === "/api/attempt-context" ||
      pathname === "/api/user/settings/theme"
    );
  }
  return true;
}
