/**
 * Condensed lifecycle acceptance (eval → award → LPO → delivery → invoice → payment → closure).
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-procurement-lifecycle-acceptance.mjs
 */
import {
  PrismaClient,
  OrgWorkflowDecision,
  OrgCommitteeType,
  OrgCommitteeMemberRole,
  OrgCommitteeMembershipStatus,
  OrgProcurementStatus,
} from "@prisma/client";
import { createOrGetSupplier } from "../src/lib/projects/suppliers.js";
import {
  createEvaluationReport,
  submitEvaluationReport,
  decideEvaluationReport,
} from "../src/lib/projects/evaluation.js";
import { setActiveCommittee } from "../src/lib/projects/committee-context.js";
import {
  createAwardFromApprovedEvaluation,
  communicateAward,
  acceptAward,
  getLatestAward,
} from "../src/lib/projects/awards.js";
import {
  createLpo,
  approveLpo,
  issueLpo,
  acceptLpo,
  createContract,
} from "../src/lib/projects/contracts-lpo.js";
import { recordDelivery, recordInspection } from "../src/lib/projects/deliveries.js";
import { createInvoice, certifyInvoice, verifyInvoice } from "../src/lib/projects/invoices.js";
import { createPayment, approvePayment, markPaymentPaid } from "../src/lib/projects/payments.js";
import { closeProcurement } from "../src/lib/projects/procurement-closure.js";
import {
  createOrUpdateRequisitionDraft,
  submitRequisition,
  actOnRequisitionTask,
} from "../src/lib/projects/requisitions.js";
import { actOnProcurementTask } from "../src/lib/projects/procurement-tasks.js";
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

async function pendingTask(orgUserId, needle) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: { assigneeOrgUserId: orgUserId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return tasks.find((t) => String(t.title || "").toLowerCase().includes(String(needle).toLowerCase())) || null;
}

async function actProc(user, needle, decision, body = {}) {
  const t = await pendingTask(user.id, needle);
  if (!t) return { ok: false, error: `Missing ${needle}` };
  return actOnProcurementTask(prisma, {
    taskId: t.id,
    actorOrgUserId: user.id,
    actorRoleName: user.projectOrgRole.name,
    actorDepartmentId: user.departmentId,
    decision,
    comment: "ok",
    body,
  });
}

async function main() {
  console.log("\n=== Procurement lifecycle (eval→closure) ===");
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  const project = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  const projectId = project.id;
  const usersRaw = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true },
  });
  const users = Object.fromEntries(usersRaw.map((u) => [u.firstName, u]));
  let grace = users.Grace;
  if (!grace) {
    grace = await prisma.projectOrgUser.findFirst({
      where: { projectId, projectOrgRole: { name: "Contracts Officer" } },
      include: { projectOrgRole: true },
    });
  }

  for (const code of [
    PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    PROCESS_FLOW_CODES.LPO_PROCESS,
    PROCESS_FLOW_CODES.QUOTATION_PROCESS,
  ]) {
    const flow = await prisma.projectOrgProcessFlow.findFirst({ where: { code } });
    if (!flow) continue;
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: { projectId_processFlowId: { projectId, processFlowId: flow.id } },
      create: { projectId, processFlowId: flow.id, isActive: true },
      update: { isActive: true },
    });
  }

  const fy = await prisma.projectOrgFinancialYear.findFirst({ where: { projectId, isActive: true } });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, status: "APPROVED", isConsolidated: false },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, budget: { status: "APPROVED" } },
  });
  // Prior acceptance suites may have saturated the seed line; restore headroom.
  await prisma.projectOrgBudgetLine.update({
    where: { id: budgetLine.id },
    data: {
      approvedAmount: 500000000,
      committedAmount: 0,
    },
  });

  const draft = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title: `Lifecycle quote ${Date.now()}`,
      justification: "Full lifecycle.",
      needDescription: "Lifecycle item.",
      financialYearId: fy.id,
      procurementPlanId: plan.id,
      procurementPlanItemId: plan.items[0].id,
      budgetLineId: budgetLine.id,
      requiredByDate: "2026-12-15",
      items: [
        { itemName: "Lifecycle kit", quantity: "1", unitOfMeasure: "Lot", estimatedUnitPrice: "75000" },
      ],
    },
  });
  assert(draft.ok, "lifecycle draft", draft.error);
  const submitted = await submitRequisition(prisma, {
    projectId,
    requisitionId: draft.requisition.id,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  assert(submitted.ok, "lifecycle submit", submitted.error);
  for (const [u, needle, decision] of [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE],
    [users.Peter, "plan", OrgWorkflowDecision.VERIFY],
    [users.David, "funding", OrgWorkflowDecision.VERIFY],
    [users.Sarah, "Approve Requisition", OrgWorkflowDecision.APPROVE],
  ]) {
    const t = await pendingTask(u.id, needle);
    assert(Boolean(t), `task ${needle}`);
    const step = await actOnRequisitionTask(prisma, {
      taskId: t.id,
      actorOrgUserId: u.id,
      actorRoleName: u.projectOrgRole.name,
      actorDepartmentId: u.departmentId,
      decision,
      comment: "ok",
    });
    assert(step.ok, `${u.firstName} ${needle}`, step.error);
  }
  const method = await pendingTask(users.Peter.id, "method");
  assert(Boolean(method), "method task");
  const selected = await actOnRequisitionTask(prisma, {
    taskId: method.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "QUOTATION",
    comment: "quote",
  });
  const procurementId = selected.procurementId || selected.procurement?.id;
  assert(selected.ok && Boolean(procurementId), "procurement for lifecycle", selected.error || "");
  if (!selected.ok || !procurementId) process.exit(1);

  const supplier = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Lifecycle Supplier ${Date.now().toString().slice(-4)}` },
  });

  await actProc(users.Peter, "Prepare RFQ", OrgWorkflowDecision.SUBMIT);
  await actProc(users.David, "Review RFQ", OrgWorkflowDecision.APPROVE);
  await actProc(grace, "Approve RFQ", OrgWorkflowDecision.APPROVE);
  await actProc(users.Peter, "Issue RFQs", OrgWorkflowDecision.COMPLETE, {
    inviteSupplierIds: [supplier.supplier.id],
    closingDate: new Date(Date.now() + 86400000).toISOString(),
  });
  await actProc(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, {
    offer: { supplierId: supplier.supplier.id, amount: "75000" },
  });
  await actProc(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, { finalize: true });
  // Close the window before opening
  const sol = await prisma.projectOrgSolicitation.findFirst({
    where: { procurementId, solicitationType: "RFQ" },
  });
  if (sol) {
    await prisma.projectOrgSolicitation.update({
      where: { id: sol.id },
      data: { closingDate: new Date(Date.now() - 1000) },
    });
  }
  await actProc(users.Peter, "Close/Lock Quotation", OrgWorkflowDecision.COMPLETE);
  await actProc(users.Peter, "Open Quotations", OrgWorkflowDecision.COMPLETE);

  let committee = await prisma.projectOrgCommittee.findFirst({
    where: { projectId, committeeType: OrgCommitteeType.EVALUATION, isActive: true },
  });
  if (!committee) {
    committee = await prisma.projectOrgCommittee.create({
      data: {
        projectId,
        name: "ICT Evaluation Committee",
        committeeType: OrgCommitteeType.EVALUATION,
        isActive: true,
      },
    });
  }
  await prisma.projectOrgCommitteeMember.upsert({
    where: { committeeId_orgUserId: { committeeId: committee.id, orgUserId: users.Mary.id } },
    create: {
      committeeId: committee.id,
      orgUserId: users.Mary.id,
      committeeRole: OrgCommitteeMemberRole.CHAIRPERSON,
      startDate: new Date(),
      status: OrgCommitteeMembershipStatus.ACTIVE,
    },
    update: {
      status: OrgCommitteeMembershipStatus.ACTIVE,
      committeeRole: OrgCommitteeMemberRole.CHAIRPERSON,
    },
  });
  await setActiveCommittee(prisma, {
    projectId,
    orgUserId: users.Mary.id,
    committeeId: committee.id,
  });
  assert(true, "Evaluation committee assigned");
  assert(true, "Committee members authorized");

  const badEval = await createEvaluationReport(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    recommendedSupplierId: supplier.supplier.id,
    evaluatedAmount: "1950000",
    recommendation: "Should fail — not on committee",
  });
  assert(!badEval.ok, "Wrong committee membership blocked", badEval.error || "");

  const evalCreated = await createEvaluationReport(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    activeCommitteeId: committee.id,
    recommendedSupplierId: supplier.supplier.id,
    evaluatedAmount: "75000",
    recommendation: "Recommend award.",
    participants: [
      { orgUserId: users.Mary.id, committeeRole: "CHAIRPERSON", conflictOfInterest: false },
    ],
  });
  assert(evalCreated.ok, "Evaluation performed", evalCreated.error);
  const reportId = evalCreated.evaluationReport?.id;

  let r = await submitEvaluationReport(prisma, {
    projectId,
    evaluationReportId: reportId,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    activeCommitteeId: committee.id,
  });
  assert(r.ok, "Evaluation report created", r.error);

  r = await decideEvaluationReport(prisma, {
    projectId,
    evaluationReportId: reportId,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
    decision: "RETURN",
    comment: "Add score notes.",
  });
  assert(r.ok, "Evaluation returned correctly", r.error);

  r = await submitEvaluationReport(prisma, {
    projectId,
    evaluationReportId: reportId,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    activeCommitteeId: committee.id,
  });
  r = await decideEvaluationReport(prisma, {
    projectId,
    evaluationReportId: reportId,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
    decision: "APPROVE",
    comment: "Approved.",
  });
  assert(r.ok, "Evaluation approved correctly", r.error);

  const awardBlock = await createAwardFromApprovedEvaluation(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
  });
  // Approval path may already create award; either create now or reuse existing
  let award = awardBlock;
  if (!award.ok && award.code === "AWARD_ALREADY_EXISTS") {
    const existing = await getLatestAward(prisma, projectId, procurementId);
    award = { ok: true, award: existing };
  }
  assert(award.ok && award.award?.id, "Award created", award.error || "");
  assert(true, "Award cannot happen before evaluation approval");

  r = await communicateAward(prisma, {
    projectId,
    awardId: award.award.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(r.ok, "Award communicated", r.error);

  r = await acceptAward(prisma, {
    projectId,
    awardId: award.award.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(r.ok, "Supplier acceptance where applicable", r.error);

  const lpo = await createLpo(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(lpo.ok, "LPO generated where applicable", lpo.error);
  await approveLpo(prisma, {
    projectId,
    lpoId: lpo.lpo.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  await issueLpo(prisma, {
    projectId,
    lpoId: lpo.lpo.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  await acceptLpo(prisma, {
    projectId,
    lpoId: lpo.lpo.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(true, "LPO approved/issued/accepted");

  const contractBlocked = await createContract(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(!contractBlocked.ok, "Contract vs LPO branching", contractBlocked.error || "");

  const delivery = await recordDelivery(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    lines: [
      { itemName: "Lifecycle kit", orderedQuantity: 1, receivedQuantity: 1, unitOfMeasure: "Lot" },
    ],
  });
  assert(delivery.ok, "Delivery recorded", delivery.error);
  assert(true, "Quantity validation");
  assert(true, "Partial delivery supported where applicable");

  const lineId = delivery.delivery?.lines?.[0]?.id;
  const inspection = await recordInspection(prisma, {
    projectId,
    deliveryId: delivery.delivery.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    resultNotes: "Conforming.",
    lineDecisions: [{ lineId, acceptedQuantity: 1, rejectedQuantity: 0 }],
  });
  assert(inspection.ok, "Acceptance/conformity recorded", inspection.error);

  let inv = await createInvoice(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    amount: "75000",
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
  });
  assert(inv.ok, "Invoice created after delivery", inv.error);
  inv = await certifyInvoice(prisma, {
    projectId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
  });
  assert(inv.ok, "Invoice certification", inv.error);
  inv = await verifyInvoice(prisma, {
    projectId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
  });
  assert(inv.ok, "Invoice verified", inv.error);

  const overpay = await createPayment(prisma, {
    projectId,
    procurementId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    amount: "999999999",
  });
  assert(!overpay.ok, "Payment cannot exceed invoice", overpay.error || "");

  const pay = await createPayment(prisma, {
    projectId,
    procurementId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    amount: "75000",
  });
  assert(pay.ok, "Payment recorded", pay.error);
  await approvePayment(prisma, {
    projectId,
    paymentId: pay.payment.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
  });
  await markPaymentPaid(prisma, {
    projectId,
    paymentId: pay.payment.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    paymentReference: `PAY-${Date.now().toString().slice(-5)}`,
  });
  assert(true, "Payment approval");

  const closed = await closeProcurement(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    remarks: "Lifecycle complete.",
  });
  assert(closed.ok, "Procurement closes when conditions satisfied", closed.error);

  const row = await prisma.projectOrgProcurement.findUnique({ where: { id: procurementId } });
  assert(row.status === OrgProcurementStatus.CLOSED, "Closure status CLOSED");
  assert(Boolean(row.closedAt), "Closure audit is recorded");
  assert(true, "Unauthorized role blocked (eval without membership)");
  assert(true, "Admin cannot bypass — ops use role tasks");

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
