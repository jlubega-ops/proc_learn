/**
 * One-time rewrite of simulated logins to the current format:
 *   org users  → firstname.lastname@<orgcode>.<appname>
 *   providers  → sales@<providername>.<orgcode>.<appname>.test
 *
 * Legacy rows that share a name inside one organisation get a numeric suffix and are listed,
 * so they can be renamed in the app. Run with --dry-run first.
 *
 *   npm run db:migrate:logins -- --dry-run
 *   npm run db:migrate:logins
 */
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional when variables are already in the environment
}

const { appEmailLabel, buildOrgUserLoginEmail, buildProviderPortalEmail } = await import(
  "../src/lib/projects/org-login-identity.js"
);
const { ensureProjectCode } = await import("../src/lib/projects/project-identity.js");

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

/** @param {string} email @param {number} n */
function withSuffix(email, n) {
  const at = email.indexOf("@");
  return `${email.slice(0, at)}${n}${email.slice(at)}`;
}

/** @param {string} email @param {number} n */
function providerWithSuffix(email, n) {
  const at = email.indexOf("@");
  const [label, ...rest] = email.slice(at + 1).split(".");
  return `${email.slice(0, at + 1)}${label}${n}.${rest.join(".")}`;
}

async function main() {
  console.log(`App label: ${appEmailLabel()}${dryRun ? "  (dry run)" : ""}`);
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  let orgUpdated = 0;
  let providerUpdated = 0;
  const clashes = [];

  for (const project of projects) {
    const projectCode = await ensureProjectCode(prisma, project.id);
    if (!projectCode) continue;

    const users = await prisma.projectOrgUser.findMany({
      where: { projectId: project.id, isProjectAdmin: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const usedUsers = new Set();
    const userPlan = [];
    for (const u of users) {
      const base = buildOrgUserLoginEmail({ ...u, projectCode });
      let email = base;
      for (let n = 2; usedUsers.has(email); n += 1) email = withSuffix(base, n);
      if (email !== base) clashes.push(`${project.name}: org user "${u.firstName} ${u.lastName}" → ${email}`);
      usedUsers.add(email);
      if (email !== u.email) userPlan.push({ id: u.id, from: u.email, to: email });
    }

    const providers = await prisma.projectOrgProvider.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, portalEmail: true },
    });
    const usedProviders = new Set();
    const providerPlan = [];
    for (const p of providers) {
      const base = buildProviderPortalEmail({ name: p.name, projectCode });
      let email = base;
      for (let n = 2; usedProviders.has(email); n += 1) email = providerWithSuffix(base, n);
      if (email !== base) clashes.push(`${project.name}: provider "${p.name}" → ${email}`);
      usedProviders.add(email);
      if (email !== p.portalEmail) providerPlan.push({ id: p.id, from: p.portalEmail, to: email });
    }

    for (const row of [...userPlan, ...providerPlan]) console.log(`  ${row.from || "(none)"} → ${row.to}`);
    orgUpdated += userPlan.length;
    providerUpdated += providerPlan.length;
    if (dryRun || (userPlan.length === 0 && providerPlan.length === 0)) continue;

    // Two passes avoid unique-index collisions when two rows swap addresses.
    await prisma.$transaction([
      ...userPlan.map((r) =>
        prisma.projectOrgUser.update({ where: { id: r.id }, data: { email: `tmp-${r.id}@migrating.invalid` } }),
      ),
      ...providerPlan.map((r) =>
        prisma.projectOrgProvider.update({ where: { id: r.id }, data: { portalEmail: `tmp-${r.id}@migrating.invalid` } }),
      ),
      ...userPlan.map((r) => prisma.projectOrgUser.update({ where: { id: r.id }, data: { email: r.to } })),
      ...providerPlan.map((r) => prisma.projectOrgProvider.update({ where: { id: r.id }, data: { portalEmail: r.to } })),
    ]);
  }

  console.log(`\nOrg users ${dryRun ? "to update" : "updated"}: ${orgUpdated}`);
  console.log(`Providers ${dryRun ? "to update" : "updated"}: ${providerUpdated}`);
  if (clashes.length) {
    console.log("\nDuplicate names found (suffix added — rename these in the app):");
    for (const c of clashes) console.log(`  - ${c}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
