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
import { syncBaselineProcessTemplates } from "../src/lib/projects/process-catalogue.js";

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
  // IMPORTANT: with FOREIGN_KEY_CHECKS=0, ON DELETE CASCADE does not run. Delete every
  // project_org_* child table explicitly, or ghost users/tasks/items remain and Prisma
  // throws "projectOrgRole is required … got null".
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
  try {
    const pyp = await prisma.programmeYearProcess.deleteMany({});
    console.log(`Deleted programme_year_process: ${pyp.count}`);

    /** @type {string[]} */
    const projectScopedTables = [
      "project_org_workflow_action",
      "project_org_workflow_task",
      "project_org_workflow_instance",
      "project_org_form_draft",
      "project_org_notification",
      "project_org_provider_notification",
      "project_org_payment",
      "project_org_invoice",
      "project_org_inspection",
      "project_org_delivery_line",
      "project_org_delivery_note",
      "project_org_delivery",
      "project_org_lpo",
      "project_org_contract",
      "project_org_award",
      "project_org_post_qualification_report",
      "project_org_evaluation_participation",
      "project_org_evaluation_report",
      "project_org_offer_clarification",
      "project_org_offer",
      "project_org_solicitation_invite",
      "project_org_solicitation",
      "project_org_procurement_recommendation",
      "project_org_purchase_instruction",
      "project_org_requisition_item",
      "project_org_requisition",
      "project_org_procurement_plan_item",
      "project_org_procurement_plan",
      "project_org_procurement",
      "project_org_budget_line",
      "project_org_budget",
      "project_org_supplier",
      "project_org_committee_member",
      "project_org_committee",
      "project_org_process_flow_adoption",
      "project_org_planning_period",
      "project_org_financial_year",
      "project_org_user",
      "project_org_department",
    ];
    for (const table of projectScopedTables) {
      const n = await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      console.log(`Deleted ${table}: ${n}`);
    }

    const projects = await prisma.project.deleteMany({});
    console.log(`Deleted projects: ${projects.count}`);

    const flowItems = await prisma.projectOrgProcessFlowItem.deleteMany({});
    const flows = await prisma.projectOrgProcessFlow.deleteMany({});
    console.log(`Deleted process catalogue: flows=${flows.count}, items=${flowItems.count}`);

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
    // Unthrottled sync so wipe/reseed always rebuilds steps (not skipped by 10‑min throttle).
    await syncBaselineProcessTemplates(prisma);
    const roles = await prisma.projectOrgRole.count();
    const flows = await prisma.projectOrgProcessFlow.count();
    const items = await prisma.projectOrgProcessFlowItem.count();
    console.log(`Reseeded: orgRoles=${roles}, processFlows=${flows}, flowItems=${items}`);
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
