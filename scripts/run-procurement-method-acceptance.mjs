/**
 * Phase 1 procurement method-selection acceptance.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-requisition-acceptance.mjs
 *   node --import ./scripts/register-path-alias.mjs scripts/run-procurement-method-acceptance.mjs
 */
import {
  PrismaClient,
  OrgWorkflowDecision,
  OrgRequisitionStatus,
  OrgProcurementStatus,
} from "@prisma/client";
import {
  createOrUpdateRequisitionDraft,
  submitRequisition,
  actOnRequisitionTask,
} from "../src/lib/projects/requisitions.js";
import { createProcurementFromApprovedRequisition } from "../src/lib/projects/procurements.js";
import { PROCESS_FLOW_CODES } from "../src/lib/projects/process-catalogue.js";

const prisma = new PrismaClient();
const STUDENT_EMAIL = "256700000001@mubs.ac.ug";
const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, name, detail = "") {
  if (cond) pass(name, detail);
  else fail(name, detail || "assertion failed");
  return Boolean(cond);
}

async function pendingTask(orgUserId, titleIncludes = null) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: { assigneeOrgUserId: orgUserId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { instance: true },
  });
  if (!titleIncludes) return tasks[0] || null;
  return (
    tasks.find((t) => String(t.title || "").toLowerCase().includes(titleIncludes.toLowerCase())) ||
    null
  );
}

async function loadUsers(projectId) {
  const users = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true, department: true },
  });
  return Object.fromEntries(users.map((u) => [u.firstName, u]));
}

async function driveToApproved(prismaClient, users, ctx, title) {
  const draft = await createOrUpdateRequisitionDraft(prismaClient, {
    projectId: ctx.projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title,
      justification: "Acceptance method selection fixture.",
      needDescription: "Computers for ICT lab simulation method tests.",
      financialYearId: ctx.fyId,
      procurementPlanId: ctx.planId,
      procurementPlanItemId: ctx.desktopItemId,
      budgetLineId: ctx.budgetLineId,
      requiredByDate: "2026-09-30",
      items: [
        {
          itemName: "Computer unit",
          quantity: "1",
          unitOfMeasure: "Unit",
          estimatedUnitPrice: "3500000",
        },
      ],
    },
  });
  if (!draft.ok) return { ok: false, error: draft.error };
  const submitted = await submitRequisition(prismaClient, {
    requisitionId: draft.requisition.id,
    projectId: ctx.projectId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const reqId = draft.requisition.id;
  for (const [user, needle, decision] of [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE],
    [users.Peter, "Plan", OrgWorkflowDecision.VERIFY],
    [users.Sarah, "Funding Availability and Approve", OrgWorkflowDecision.APPROVE],
  ]) {
    const task = await pendingTask(user.id, needle);
    if (!task) return { ok: false, error: `Missing task for ${user.firstName}: ${needle}` };
    const r = await actOnRequisitionTask(prismaClient, {
      taskId: task.id,
      actorOrgUserId: user.id,
      actorRoleName: user.projectOrgRole.name,
      actorDepartmentId: user.departmentId,
      decision,
      comment: `${decision} by ${user.firstName}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
  }
  const row = await prismaClient.projectOrgRequisition.findUnique({ where: { id: reqId } });
  return { ok: true, requisitionId: reqId, status: row?.status };
}

async function main() {
  console.log("\n=== Procurement method acceptance ===");
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!student) {
    console.error("Run seed first.");
    process.exit(1);
  }
  const org = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  if (!org) {
    console.error("Organisation missing.");
    process.exit(1);
  }
  const projectId = org.id;
  const users = await loadUsers(projectId);
  const fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId, label: "2026/2027" },
  });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, title: "ICT Equipment Plan 2026/27" },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, code: "ICT-CAPEX-01" },
  });
  const laptopItem = plan?.items?.[0];
  if (!fy || !plan || !budgetLine || !laptopItem) {
    fail("fixtures", "Missing FY/plan/budget/plan item — re-seed");
    process.exit(1);
  }
  const ctx = {
    projectId,
    fyId: fy.id,
    planId: plan.id,
    desktopItemId: laptopItem.id,
    budgetLineId: budgetLine.id,
  };

  // 1) Unapproved cannot select via domain helper
  const draftOnly = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title: "Unapproved method attempt",
      justification: "Should fail method selection.",
      needDescription: "Should fail.",
      financialYearId: ctx.fyId,
      procurementPlanId: ctx.planId,
      procurementPlanItemId: ctx.desktopItemId,
      budgetLineId: ctx.budgetLineId,
      requiredByDate: "2026-10-01",
      items: [
        {
          itemName: "Desktop",
          quantity: "1",
          unitOfMeasure: "Unit",
          estimatedUnitPrice: "2500000",
        },
      ],
    },
  });
  assert(draftOnly.ok, "draft for unapproved case");
  const blocked = await createProcurementFromApprovedRequisition(prisma, {
    projectId,
    requisitionId: draftOnly.requisition.id,
    procurementMethod: "QUOTATION",
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
  });
  assert(!blocked.ok, "unapproved requisition blocked");
  assert(
    /not yet been approved/i.test(blocked.error || ""),
    "clear unapproved message",
    blocked.error,
  );

  // 2) Approved can select QUOTATION
  const q = await driveToApproved(prisma, users, ctx, "Desktops for Quotation method");
  assert(q.ok && q.status === OrgRequisitionStatus.APPROVED, "drive desktops to APPROVED", q.error);
  const methodTaskQ = await pendingTask(users.Peter.id, "Method");
  assert(Boolean(methodTaskQ), "Peter has method task for quotation case");
  let r = await actOnRequisitionTask(prisma, {
    taskId: methodTaskQ.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "QUOTATION",
  });
  assert(r.ok, "SELECT_METHOD QUOTATION", r.error);
  assert(r.nextProcessStarted === true, "quotation process started");
  assert(r.nextProcessQueued === "QUOTATION_PROCESS", "quotation queued code");
  assert(Boolean(r.procurement?.id), "quotation procurement created");

  // 3) Duplicate conversion blocked
  const dup = await createProcurementFromApprovedRequisition(prisma, {
    projectId,
    requisitionId: q.requisitionId,
    procurementMethod: "OPEN_DOMESTIC",
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(!dup.ok, "duplicate conversion blocked");
  assert(
    /already/i.test(dup.error || ""),
    "clear duplicate message",
    dup.error,
  );

  // 4) Inactive process blocks (deactivate open domestic bidding, try that method)
  const tenderFlow = await prisma.projectOrgProcessFlow.findFirst({
    where: { code: PROCESS_FLOW_CODES.OPEN_DOMESTIC_BIDDING },
  });
  const adoption = await prisma.projectOrgProcessFlowAdoption.findFirst({
    where: { projectId, processFlowId: tenderFlow.id },
  });
  await prisma.projectOrgProcessFlowAdoption.update({
    where: { id: adoption.id },
    data: { isActive: false, deactivatedAt: new Date() },
  });

  const t = await driveToApproved(prisma, users, ctx, "Desktops for bidding inactive test");
  assert(t.ok, "drive bidding case to APPROVED", t.error);
  const methodTaskT = await pendingTask(users.Peter.id, "Method");
  assert(Boolean(methodTaskT), "method task for bidding inactive case");
  r = await actOnRequisitionTask(prisma, {
    taskId: methodTaskT.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "OPEN_DOMESTIC",
  });
  assert(!r.ok, "inactive bidding process blocks selection");
  assert(/inactive/i.test(r.error || ""), "clear inactive message", r.error);

  // Reactivate bidding process for cleanliness
  await prisma.projectOrgProcessFlowAdoption.update({
    where: { id: adoption.id },
    data: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
  });

  // 5) Distinct procurement for MICRO after reactivation path (laptop may already exist from suite)
  const microProcCount = await prisma.projectOrgProcurement.count({
    where: { projectId, procurementMethod: "QUOTATION", status: OrgProcurementStatus.IN_PROGRESS },
  });
  assert(microProcCount >= 1, "at least one in-progress quotation procurement");

  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nPassed: ${passed}  Failed: ${failed}  Total: ${results.length}`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
