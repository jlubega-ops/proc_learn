/**
 * Wipe all project / organisation / academic-attempt data. Keep platform users.
 *
 * Kept:
 *   - user, user_role, user_settings (activeOrgProjectId cleared)
 *   - student_profile, student_academic_enrollment
 *   - auth_token, notification (user inbox)
 *   - programme, academic_year, course (catalogues)
 *
 * Deleted:
 *   - all Project rows and ProjectOrg* workspace data
 *   - global ProjectOrgRole + ProjectOrgProcessFlow catalogue (reseed with --reseed)
 *   - programme_year_process switches
 *   - audit_log
 *
 * Usage:
 *   npm run db:wipe:keep-users
 *   node --import ./scripts/register-path-alias.mjs scripts/wipe-non-user-data.mjs --reseed
 */
import { prisma } from "../src/lib/prisma.js";
import { ensureCoreProjectOrgRoles } from "../src/lib/project-org-role.js";
import { ensureBaselineProcessTemplates } from "../src/lib/projects/process-catalogue.js";

const RESEED = process.argv.includes("--reseed");

async function main() {
  console.log("=== Wipe non-user data (keep users) ===\n");

  const beforeUsers = await prisma.user.count();
  const beforeProjects = await prisma.project.count();
  const beforeFlows = await prisma.projectOrgProcessFlow.count();

  console.log(`Before: users=${beforeUsers}, projects=${beforeProjects}, processFlows=${beforeFlows}`);

  await prisma.userSettings.updateMany({
    data: { activeOrgProjectId: null },
  });

  // Restrict FKs inside org graphs block plain cascade deletes — disable briefly for wipe.
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
  try {
    const pyp = await prisma.programmeYearProcess.deleteMany({});
    console.log(`Deleted programme_year_process: ${pyp.count}`);

    const projects = await prisma.project.deleteMany({});
    console.log(`Deleted projects: ${projects.count}`);

    const adoptions = await prisma.projectOrgProcessFlowAdoption.deleteMany({});
    const flows = await prisma.projectOrgProcessFlow.deleteMany({});
    console.log(`Deleted process flows: ${flows.count} (adoptions cleared=${adoptions.count})`);

    const roles = await prisma.projectOrgRole.deleteMany({});
    console.log(`Deleted org roles: ${roles.count}`);

    const audits = await prisma.auditLog.deleteMany({});
    console.log(`Deleted audit_log: ${audits.count}`);
  } finally {
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  }

  if (RESEED) {
    console.log("\nReseeding org roles + process catalogue…");
    await ensureCoreProjectOrgRoles(prisma);
    await ensureBaselineProcessTemplates(prisma);
    const roles = await prisma.projectOrgRole.count();
    const flows = await prisma.projectOrgProcessFlow.count();
    console.log(`Reseeded: orgRoles=${roles}, processFlows=${flows}`);
  } else {
    console.log("\nSkipped reseed (pass --reseed to recreate roles + process templates).");
  }

  const afterUsers = await prisma.user.count();
  const afterProjects = await prisma.project.count();
  const afterFlows = await prisma.projectOrgProcessFlow.count();
  console.log(`\nAfter: users=${afterUsers}, projects=${afterProjects}, processFlows=${afterFlows}`);
  if (afterUsers !== beforeUsers) {
    throw new Error(`User count changed (${beforeUsers} → ${afterUsers}).`);
  }
  if (afterProjects !== 0) {
    throw new Error(`Projects remain: ${afterProjects}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
