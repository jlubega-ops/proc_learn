/**
 * Phase 4 Tender acceptance through Forward to Evaluation (assertions 22–29).
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-tender-forward-acceptance.mjs
 */
import { PrismaClient, OrgWorkflowDecision, OrgOfferType } from "@prisma/client";
import {
  createOrUpdateRequisitionDraft,
  submitRequisition,
  actOnRequisitionTask,
} from "../src/lib/projects/requisitions.js";
import { actOnProcurementTask } from "../src/lib/projects/procurement-tasks.js";
import { createOrGetSupplier } from "../src/lib/projects/suppliers.js";
import { PROCESS_FLOW_CODES } from "../src/lib/projects/process-catalogue.js";

const prisma = new PrismaClient();
const STUDENT_EMAIL = "256700000001@mubs.ac.ug";
const results = [];
function pass(n, d = "") {
  results.push({ ok: true });
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ ok: false });
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
}
function assert(c, n, d = "") {
  if (c) pass(n, d);
  else fail(n, d || "failed");
}
async function pendingTask(orgUserId, needle, procurementId = null) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: { assigneeOrgUserId: orgUserId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { instance: { select: { procurementId: true } } },
  });
  const matched = tasks.filter((t) =>
    String(t.title || "").toLowerCase().includes(needle.toLowerCase()),
  );
  if (procurementId) {
    return matched.find((t) => t.instance?.procurementId === procurementId) || null;
  }
  return matched[0] || null;
}
async function loadUsers(projectId) {
  const users = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true },
  });
  return Object.fromEntries(users.map((u) => [u.firstName, u]));
}
async function act(user, needle, decision, body = {}, procurementId = null) {
  const task = await pendingTask(user.id, needle, procurementId);
  if (!task) return { ok: false, error: `Missing ${needle}` };
  return actOnProcurementTask(prisma, {
    taskId: task.id,
    actorOrgUserId: user.id,
    actorRoleName: user.projectOrgRole.name,
    actorDepartmentId: user.departmentId,
    decision,
    comment: "ok",
    body,
  });
}

async function main() {
  console.log("\n=== Tender forward acceptance ===");
  // Ensure tender process active
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  const project = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  const projectId = project.id;
  const flow = await prisma.projectOrgProcessFlow.findFirst({
    where: { code: PROCESS_FLOW_CODES.TENDER_PROCESS },
  });
  if (flow) {
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: { projectId_processFlowId: { projectId, processFlowId: flow.id } },
      create: { projectId, processFlowId: flow.id, isActive: true },
      update: { isActive: true },
    });
  }

  const users = await loadUsers(projectId);
  const fy = await prisma.projectOrgFinancialYear.findFirst({ where: { projectId, isActive: true } });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, status: "APPROVED", isConsolidated: false },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, budget: { status: "APPROVED" } },
  });
  if (budgetLine?.id) {
    await prisma.projectOrgBudgetLine.update({
      where: { id: budgetLine.id },
      data: { approvedAmount: 800000000, committedAmount: 0 },
    });
  }

  const draft = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title: `Tender switches ${Date.now()}`,
      justification: "Tender path.",
      needDescription: "Network switches tender.",
      financialYearId: fy.id,
      procurementPlanId: plan.id,
      procurementPlanItemId: plan.items[Math.min(2, plan.items.length - 1)].id,
      budgetLineId: budgetLine.id,
      requiredByDate: "2026-12-01",
      items: [{ itemName: "Switch", quantity: "1", unitOfMeasure: "Unit", estimatedUnitPrice: "1500000" }],
    },
  });
  assert(draft.ok, "Tender documents prepare path setup", draft.error);
  await submitRequisition(prisma, {
    projectId,
    requisitionId: draft.requisition.id,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  for (const [u, needle, decision] of [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE],
    [users.Peter, "plan", OrgWorkflowDecision.VERIFY],
    [users.Sarah, "Funding Availability and Approve", OrgWorkflowDecision.APPROVE],
  ]) {
    const t = await pendingTask(u.id, needle);
    await actOnRequisitionTask(prisma, {
      taskId: t.id,
      actorOrgUserId: u.id,
      actorRoleName: u.projectOrgRole.name,
      actorDepartmentId: u.departmentId,
      decision,
      comment: "ok",
    });
  }
  const method = await pendingTask(users.Peter.id, "method");
  const selected = await actOnRequisitionTask(prisma, {
    taskId: method.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "TENDER",
    comment: "Tender method.",
  });
  assert(selected.ok, "Tender documents prepared (workflow started)", selected.error);
  const procurementId =
    selected.procurementId ||
    selected.procurement?.id ||
    (
      await prisma.projectOrgProcurement.findFirst({
        where: { requisitionId: draft.requisition.id },
        select: { id: true },
      })
    )?.id;
  assert(Boolean(procurementId), "Tender procurement id resolved");

  let r = await act(users.Peter, "Prepare Tender", OrgWorkflowDecision.SUBMIT, {}, procurementId);
  assert(r.ok, "Reviewed prep", r.error);
  r = await act(users.David, "Review Tender", OrgWorkflowDecision.APPROVE, {}, procurementId);
  assert(r.ok, "Reviewed", r.error);

  let grace = users.Grace;
  if (!grace) {
    grace = await prisma.projectOrgUser.findFirst({
      where: { projectId, projectOrgRole: { name: "Contracts Officer" } },
      include: { projectOrgRole: true },
    });
  }
  r = await act(grace, "Approve Tender", OrgWorkflowDecision.APPROVE, {}, procurementId);
  assert(r.ok, "Approved", r.error);

  const supplier = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Tender Bid Ltd ${Date.now().toString().slice(-4)}` },
  });
  const closing = new Date(Date.now() + 3 * 86400000).toISOString();
  r = await act(
    users.Peter,
    "Advertise",
    OrgWorkflowDecision.COMPLETE,
    {
      inviteSupplierIds: [supplier.supplier.id],
      closingDate: closing,
    },
    procurementId,
  );
  assert(r.ok, "Advertised", r.error);

  r = await act(
    users.Peter,
    "Receive Bids",
    OrgWorkflowDecision.COMPLETE,
    {
      offer: { supplierId: supplier.supplier.id, amount: "1400000" },
    },
    procurementId,
  );
  assert(r.ok, "Bids received", r.error);

  const sol = await prisma.projectOrgSolicitation.findFirst({
    where: { procurementId, solicitationType: "TENDER" },
  });
  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() - 1000) },
  });
  const late = await act(
    users.Peter,
    "Receive Bids",
    OrgWorkflowDecision.COMPLETE,
    {
      offer: { supplierId: supplier.supplier.id, amount: "1300000" },
    },
    procurementId,
  );
  assert(!late.ok, "Closing enforced", late.error || "");

  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() + 86400000) },
  });
  r = await act(users.Peter, "Receive Bids", OrgWorkflowDecision.COMPLETE, { finalize: true }, procurementId);
  assert(r.ok, "Receive finalized", r.error);

  await prisma.projectOrgSolicitation.update({
    where: { id: sol.id },
    data: { closingDate: new Date(Date.now() - 1000) },
  });
  r = await act(users.Peter, "Close Tender", OrgWorkflowDecision.COMPLETE, {}, procurementId);
  assert(r.ok, "Bids closed", r.error);

  r = await act(users.Peter, "Open Bids", OrgWorkflowDecision.COMPLETE, {}, procurementId);
  assert(r.ok, "Bids opened", r.error);

  r = await act(users.David, "Forward Bids", OrgWorkflowDecision.COMPLETE, {}, procurementId);
  assert(r.ok, "Forwarded to evaluation", r.error);

  const bids = await prisma.projectOrgOffer.count({
    where: { procurementId, offerType: OrgOfferType.BID },
  });
  assert(bids >= 1, "bid rows persist", String(bids));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nPassed: ${results.length - failed}  Failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
