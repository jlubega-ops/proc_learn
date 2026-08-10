/**
 * Phase 3 Quotation acceptance through Open Quotations (assertions 11–18).
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-requisition-acceptance.mjs
 *   node --import ./scripts/register-path-alias.mjs scripts/run-quotation-open-acceptance.mjs
 */
import { PrismaClient, OrgWorkflowDecision, OrgOfferType } from "@prisma/client";
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
function pass(n, d = "") {
  results.push({ ok: true, n });
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ ok: false, n });
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
}
function assert(c, n, d = "") {
  if (c) pass(n, d);
  else fail(n, d || "assertion failed");
}
async function pendingTask(orgUserId, needle) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: { assigneeOrgUserId: orgUserId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return tasks.find((t) => String(t.title || "").toLowerCase().includes(needle.toLowerCase())) || null;
}
async function loadUsers(projectId) {
  const users = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true },
  });
  return Object.fromEntries(users.map((u) => [u.firstName, u]));
}
async function act(user, needle, decision, body = {}, comment = "ok") {
  const task = await pendingTask(user.id, needle);
  if (!task) return { ok: false, error: `Missing task: ${needle}` };
  return actOnProcurementTask(prisma, {
    taskId: task.id,
    actorOrgUserId: user.id,
    actorRoleName: user.projectOrgRole.name,
    actorDepartmentId: user.departmentId,
    decision,
    comment,
    body,
  });
}

async function driveQuotation(users, ctx) {
  const draft = await createOrUpdateRequisitionDraft(prisma, {
    projectId: ctx.projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title: `Quotation desks ${Date.now()}`,
      justification: "Quotation acceptance.",
      needDescription: "Desks for RFQ path.",
      financialYearId: ctx.fyId,
      procurementPlanId: ctx.planId,
      procurementPlanItemId: ctx.planItemId,
      budgetLineId: ctx.budgetLineId,
      requiredByDate: "2026-11-01",
      items: [{ itemName: "Desk", quantity: "2", unitOfMeasure: "Unit", estimatedUnitPrice: "800000" }],
    },
  });
  if (!draft.ok) return draft;
  let r = await submitRequisition(prisma, {
    projectId: ctx.projectId,
    requisitionId: draft.requisition.id,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  if (!r.ok) return r;
  for (const [u, needle, decision] of [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE],
    [users.Peter, "plan", OrgWorkflowDecision.VERIFY],
    [users.David, "funding", OrgWorkflowDecision.VERIFY],
    [users.Sarah, "Approve Requisition", OrgWorkflowDecision.APPROVE],
  ]) {
    const t = await pendingTask(u.id, needle);
    if (!t) return { ok: false, error: `Missing ${needle}` };
    r = await actOnRequisitionTask(prisma, {
      taskId: t.id,
      actorOrgUserId: u.id,
      actorRoleName: u.projectOrgRole.name,
      actorDepartmentId: u.departmentId,
      decision,
      comment: "ok",
    });
    if (!r.ok) return r;
  }
  const method = await pendingTask(users.Peter.id, "method");
  if (!method) return { ok: false, error: "No method task" };
  return actOnRequisitionTask(prisma, {
    taskId: method.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "QUOTATION",
    comment: "Quotation method.",
  });
}

async function main() {
  console.log("\n=== Quotation open acceptance ===");
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  const project = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  const projectId = project.id;
  const users = await loadUsers(projectId);
  const fy = await prisma.projectOrgFinancialYear.findFirst({ where: { projectId, isActive: true } });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, status: "APPROVED", isConsolidated: false },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, budget: { status: "APPROVED" } },
  });
  const ctx = {
    projectId,
    fyId: fy.id,
    planId: plan.id,
    planItemId: plan.items[0].id,
    budgetLineId: budgetLine.id,
  };

  const started = await driveQuotation(users, ctx);
  assert(started.ok, "RFQ prepared path starts (method)", started.error);
  const procurementId = started.procurementId || started.procurement?.id;

  let r = await act(users.Peter, "Prepare RFQ", OrgWorkflowDecision.SUBMIT);
  assert(r.ok, "RFQ prepared", r.error);

  r = await act(users.David, "Review RFQ", OrgWorkflowDecision.APPROVE);
  assert(r.ok, "RFQ reviewed", r.error);

  const grace =
    users.Grace ||
    (await prisma.projectOrgUser.findFirst({
      where: { projectId, projectOrgRole: { name: "Contracts Officer" } },
      include: { projectOrgRole: true },
    }));
  assert(Boolean(grace), "Contracts Officer present");
  if (grace && !users.Grace) users.Grace = grace;

  r = await act(users.Grace, "Approve RFQ", OrgWorkflowDecision.APPROVE);
  assert(r.ok, "RFQ approved", r.error);

  const s1 = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Quote Co A ${Date.now().toString().slice(-4)}` },
  });
  const s2 = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Quote Co B ${Date.now().toString().slice(-4)}` },
  });
  assert(s1.ok && s2.ok, "Suppliers recorded");

  const closing = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  r = await act(users.Peter, "Issue RFQs", OrgWorkflowDecision.COMPLETE, {
    inviteSupplierIds: [s1.supplier.id, s2.supplier.id],
    closingDate: closing,
  });
  assert(r.ok, "RFQs issued", r.error);

  r = await act(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, {
    offer: { supplierId: s1.supplier.id, amount: "1500000" },
  });
  assert(r.ok, "Quotations received", r.error);

  const sol = await prisma.projectOrgSolicitation.findFirst({
    where: { procurementId, solicitationType: "RFQ" },
  });
  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() - 3600 * 1000) },
  });
  const late = await act(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, {
    offer: { supplierId: s2.supplier.id, amount: "1600000" },
  });
  assert(!late.ok, "Closing rules enforced", late.error || "");

  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() + 86400000) },
  });
  await act(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, {
    offer: { supplierId: s2.supplier.id, amount: "1550000" },
  });
  r = await act(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, { finalize: true });
  assert(r.ok, "Receive step finalized", r.error);

  // Closing/locking requires the submission window to have ended
  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() - 1000) },
  });
  r = await act(users.Peter, "Close/Lock Quotation", OrgWorkflowDecision.COMPLETE);
  assert(r.ok, "Quotations locked", r.error);
  r = await act(users.Peter, "Open Quotations", OrgWorkflowDecision.COMPLETE);
  assert(r.ok, "Quotations opened", r.error);

  const opened = await prisma.projectOrgOffer.count({
    where: { procurementId, offerType: OrgOfferType.QUOTATION, status: "OPENED" },
  });
  assert(opened >= 1, "opened quotation rows", String(opened));

  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nPassed: ${passed}  Failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
