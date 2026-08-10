/**
 * Phase 2 Micro Procurement acceptance (assertions 5–10).
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-requisition-acceptance.mjs
 *   node --import ./scripts/register-path-alias.mjs scripts/run-micro-procurement-acceptance.mjs
 */
import { PrismaClient, OrgWorkflowDecision, OrgPurchaseInstructionStatus } from "@prisma/client";
import {
  createOrUpdateRequisitionDraft,
  submitRequisition,
  actOnRequisitionTask,
} from "../src/lib/projects/requisitions.js";
import { actOnProcurementTask } from "../src/lib/projects/procurement-tasks.js";
import { createOrGetSupplier } from "../src/lib/projects/suppliers.js";

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

async function driveToApproved(users, ctx, title) {
  const draft = await createOrUpdateRequisitionDraft(prisma, {
    projectId: ctx.projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title,
      justification: "Micro acceptance fixture.",
      needDescription: "Office supplies for micro procurement training.",
      financialYearId: ctx.fyId,
      procurementPlanId: ctx.planId,
      procurementPlanItemId: ctx.planItemId,
      budgetLineId: ctx.budgetLineId,
      requiredByDate: "2026-10-15",
      items: [
        {
          itemName: "Stationery pack",
          quantity: "1",
          unitOfMeasure: "Lot",
          estimatedUnitPrice: "500000",
        },
      ],
    },
  });
  if (!draft.ok) return { ok: false, error: draft.error };
  const submitted = await submitRequisition(prisma, {
    projectId: ctx.projectId,
    requisitionId: draft.requisition.id,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const steps = [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE, "HOD ok"],
    [users.Peter, "plan", OrgWorkflowDecision.VERIFY, "Plan verified"],
    [users.David, "funding", OrgWorkflowDecision.VERIFY, "Funding ok"],
    [users.Sarah, "Approve Requisition", OrgWorkflowDecision.APPROVE, "AO approved"],
  ];
  for (const [user, needle, decision, comment] of steps) {
    const task = await pendingTask(user.id, needle);
    if (!task) return { ok: false, error: `Missing task for ${user.firstName}: ${needle}` };
    const r = await actOnRequisitionTask(prisma, {
      taskId: task.id,
      actorOrgUserId: user.id,
      actorRoleName: user.projectOrgRole.name,
      actorDepartmentId: user.departmentId,
      decision,
      comment,
    });
    if (!r.ok) return { ok: false, error: r.error };
  }

  const methodTask = await pendingTask(users.Peter.id, "method");
  if (!methodTask) return { ok: false, error: "Missing method selection task" };
  const selected = await actOnRequisitionTask(prisma, {
    taskId: methodTask.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "MICRO",
    comment: "Micro suitable for low-value stationery.",
  });
  if (!selected.ok) return { ok: false, error: selected.error };
  return { ok: true, procurementId: selected.procurementId || selected.procurement?.id };
}

async function main() {
  console.log("\n=== Micro procurement acceptance ===");
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  const project = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  if (!project) {
    fail("fixtures", "Re-seed acceptance org");
    process.exit(1);
  }
  const projectId = project.id;
  const users = await loadUsers(projectId);
  const fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId, isActive: true },
  });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, status: "APPROVED", isConsolidated: false },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, budget: { status: "APPROVED" } },
  });
  const planItem = plan?.items?.[0];
  if (!fy || !plan || !budgetLine || !planItem) {
    fail("fixtures", "Missing FY/plan/budget");
    process.exit(1);
  }
  const ctx = {
    projectId,
    fyId: fy.id,
    planId: plan.id,
    planItemId: planItem.id,
    budgetLineId: budgetLine.id,
  };

  const driven = await driveToApproved(users, ctx, `Micro stationery ${Date.now()}`);
  assert(driven.ok, "Micro workflow starts", driven.error || "");
  if (!driven.ok) {
    printSummary();
    process.exit(1);
  }

  let procurementId = driven.procurementId;
  if (!procurementId) {
    const proc = await prisma.projectOrgProcurement.findFirst({
      where: { projectId, procurementMethod: "MICRO" },
      orderBy: { createdAt: "desc" },
    });
    procurementId = proc?.id;
  }
  assert(Boolean(procurementId), "procurement record exists");

  const raise = await pendingTask(users.John.id, "Raise Micro");
  assert(Boolean(raise), "Requirement raised task for John");
  let r = await actOnProcurementTask(prisma, {
    taskId: raise.id,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
    decision: OrgWorkflowDecision.SUBMIT,
    comment: "Raising micro request.",
  });
  assert(r.ok, "Requirement raised", r.error);

  const hod = await pendingTask(users.Mary.id, "Verify Requirement");
  assert(Boolean(hod), "HOD verifies task");
  r = await actOnProcurementTask(prisma, {
    taskId: hod.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    actorDepartmentId: users.Mary.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "Requirement verified.",
  });
  assert(r.ok, "HOD verifies", r.error);

  const budgetTask = await pendingTask(users.Peter.id, "Confirm Budget");
  assert(Boolean(budgetTask), "PO confirm budget task");
  r = await actOnProcurementTask(prisma, {
    taskId: budgetTask.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.VERIFY,
    comment: "Budget confirmed.",
  });
  assert(r.ok, "Budget confirmed", r.error);

  const ao = await pendingTask(users.Sarah.id, "Approve Micro");
  assert(Boolean(ao), "AO approve micro task");
  r = await actOnProcurementTask(prisma, {
    taskId: ao.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    actorDepartmentId: users.Sarah.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "AO approved micro.",
  });
  assert(r.ok, "AO approves", r.error);

  const supplier = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Micro Supplies Ltd ${Date.now().toString().slice(-4)}`, phone: "0700000001" },
  });
  assert(supplier.ok, "supplier created", supplier.error);

  const piTask = await pendingTask(users.Peter.id, "Purchase Instruction");
  assert(Boolean(piTask), "Issue Purchase Instruction task");
  r = await actOnProcurementTask(prisma, {
    taskId: piTask.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.COMPLETE,
    comment: "PI issued.",
    body: { supplierId: supplier.supplier.id },
  });
  assert(r.ok, "Purchase instruction issued", r.error);

  const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: { procurementId, status: OrgPurchaseInstructionStatus.ISSUED },
  });
  assert(Boolean(pi), "PI row linked", pi?.instructionNumber || "");
  assert(pi?.supplierId === supplier.supplier.id, "PI linked to supplier");

  printSummary();
  process.exit(results.some((x) => !x.ok) ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPassed: ${passed}  Failed: ${failed}  Total: ${results.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
