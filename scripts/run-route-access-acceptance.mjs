/**
 * Route-access acceptance: page URL policy by ACTIVE role / session kind, API prefix gate,
 * and a static scan that every API handler and dashboard page is guarded.
 * Usage: node --import ./scripts/register-path-alias.mjs scripts/run-route-access-acceptance.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiPrefixAllowed,
  matchPageRule,
  orgUserPageAllowed,
  platformPageAccess,
  providerPageAllowed,
} from "@/lib/auth/route-policy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SA = "SYSTEM_ADMIN";
const EX = "EXAMINER";
const ST = "STUDENT";
const PID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let failures = 0;
let passes = 0;
function check(ok, label) {
  if (ok) passes += 1;
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

// ── Page URLs by ACTIVE role (granted roles never matter, only the active one) ──
/** @type {[string, string[]][]} path → roles that may open it */
const PAGE_MATRIX = [
  ["/", [SA, EX, ST]],
  ["/admin", [SA]],
  ["/admin/users", [SA]],
  ["/admin/staff/new", [SA]],
  ["/admin/activity", [SA]],
  ["/students/manage", [SA]],
  ["/students/new", [SA]],
  ["/students/abc/observe", [SA, EX]],
  ["/academic/participation", [SA, EX]],
  ["/academic/results", [SA, EX]],
  [`/projects/${PID}`, [SA, EX]],
  [`/projects/${PID}/participants`, [SA, EX]],
  [`/projects/${PID}/assessment`, [SA, EX]],
  [`/projects/${PID}/processes`, [SA, EX]],
  ["/project-settings/programme-processes", [SA, EX]],
  ["/project-settings/process-flow", [SA, EX]],
  ["/academic/practice", [ST]],
  ["/academic/assessments", [ST]],
  [`/academic/assessments/${PID}`, [ST]],
  ["/organisation", [ST]],
  ["/organisation/org-admin/users", [ST]],
  ["/organisation/org-admin/budgets/x", [ST]],
  ["/notifications", [SA, EX, ST]],
  ["/profile", [SA, EX, ST]],
];
for (const [p, allowed] of PAGE_MATRIX) {
  for (const role of [SA, EX, ST]) {
    const want = allowed.includes(role);
    check(platformPageAccess(p, role).allowed === want, `page ${p} as ${role} → ${want ? "allow" : "deny"}`);
  }
  check(!platformPageAccess(p, null).allowed, `page ${p} with no active role → deny`);
}

// Org-user sessions: own workspace only.
check(orgUserPageAllowed(`/projects/${PID}`, PID), "org user opens own workspace");
check(orgUserPageAllowed(`/projects/${PID}/requisitions`, PID), "org user opens own sub-page");
check(!orgUserPageAllowed(`/projects/${OTHER}`, PID), "org user blocked from other workspace");
check(!orgUserPageAllowed(`/projects/${PID}x`, PID), "org user blocked from prefix-collision id");
check(!orgUserPageAllowed("/admin", PID), "org user blocked from /admin");
check(!orgUserPageAllowed("/academic/results", PID), "org user blocked from results");
check(!orgUserPageAllowed(`/projects/${PID}`, null), "org user without project blocked");

// Provider sessions: portal only.
check(providerPageAllowed("/provider-portal"), "provider opens portal");
check(providerPageAllowed("/provider-portal/orders"), "provider opens portal sub-page");
check(!providerPageAllowed("/"), "provider blocked from dashboard");
check(!providerPageAllowed(`/projects/${PID}`), "provider blocked from workspace");
check(!providerPageAllowed("/provider-portalx"), "provider blocked from prefix collision");

// ── API prefix gate by session kind ──
const user = { kind: "user" };
const org = { kind: "org", projectId: PID };
const provider = { kind: "provider" };
/** @type {[string, object, boolean][]} */
const API_MATRIX = [
  ["/api/auth/login", provider, true],
  ["/api/health", provider, true],
  ["/api/provider-portal/orders", provider, true],
  [`/api/projects/${PID}`, provider, false],
  ["/api/users", provider, false],
  ["/api/attempt-context", provider, false],
  [`/api/projects/${PID}/requisitions`, org, true],
  [`/api/projects/${OTHER}/requisitions`, org, false],
  ["/api/projects", org, false],
  ["/api/users", org, false],
  ["/api/admin/staff", org, false],
  ["/api/academic/results", org, false],
  ["/api/programme-processes", org, false],
  ["/api/programme-processes", provider, false],
  ["/api/projects/org-notifications", org, true],
  ["/api/attempt-context", org, true],
  ["/api/provider-portal/orders", org, false],
  ["/api/provider-portal/orders", user, false],
  ["/api/provider-portal/login", user, true],
  ["/api/provider-portal/logout", user, true],
];
for (const [p, who, want] of API_MATRIX) {
  check(apiPrefixAllowed(p, who) === want, `api ${p} as ${who.kind} → ${want ? "allow" : "deny"}`);
}

// ── Static scan: every API handler authenticates (or is intentionally public) ──
const PUBLIC_API = new Set([
  "auth/activate",
  "auth/forgot-password",
  "auth/google/start",
  "auth/reset-password",
  "health",
  "site/status",
  "site/branding/[kind]/[fileId]",
]);
const AUTH_HELPER_RE =
  /getSessionUser|getSessionOrgUser|getAppSession|getReadableAppSession|mutateActiveAppSession|authorizeProject\w+|authorizeParticipantView|authorizeProvider\w+|requireProviderPortalSession|fetchAuthorizedProjectWorkspace|requireSystemAdmin|requireStaff/;

function walk(dir, name, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, name, out);
    else if (entry === name) out.push(full);
  }
  return out;
}

const apiDir = path.join(root, "src", "app", "api");
for (const file of walk(apiDir, "route.js")) {
  const rel = path.relative(apiDir, path.dirname(file)).split(path.sep).join("/");
  if (PUBLIC_API.has(rel)) continue;
  check(AUTH_HELPER_RE.test(readFileSync(file, "utf8")), `api/${rel} calls an auth helper`);
}

// ── Static scan: every dashboard page URL is covered by a page rule ──
const dashDir = path.join(root, "src", "app", "(dashboard)");
for (const file of walk(dashDir, "page.js")) {
  const rel = path.relative(dashDir, path.dirname(file)).split(path.sep).join("/");
  const url = `/${rel}`
    .replace(/\/\([^)]+\)/g, "")
    .replace(/\[\.\.\.[^\]]+\]/g, "x/y")
    .replace(/\[[^\]]+\]/g, "x")
    .replace(/\/$/, "") || "/";
  check(Boolean(matchPageRule(url)), `page ${url} has an access rule`);
}

console.log(`\nRoute access: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
