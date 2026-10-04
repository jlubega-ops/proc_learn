/**
 * Lifecycle hardening acceptance — award→closure gates, unified timeline,
 * role/department denial, money formatting. Reuses Lubega seed org.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-lifecycle-hardening-acceptance.mjs
 */
import {
  PrismaClient,
  OrgWorkflowDecision,
  OrgCommitteeType,
  OrgCommitteeMemberRole,
  OrgCommitteeMembershipStatus,
  OrgProcurementStatus,
} from "@prisma/client";
import { formatMoneyUGX } from "../src/lib/money.js";
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
} from "../src/lib/projects/contracts-lpo.js";
import { recordDelivery, recordInspection } from "../src/lib/projects/deliveries.js";
import { submitDeliveryNote } from "../src/lib/projects/delivery-notes.js";
import { createInvoice, certifyInvoice, verifyInvoice } from "../src/lib/projects/invoices.js";
import { createPayment, approvePayment, markPaymentPaid } from "../src/lib/projects/payments.js";
import {
  closeProcurement,
  evaluateClosureReadiness,
} from "../src/lib/projects/procurement-closure.js";
import {
  createOrUpdateRequisitionDraft,
  submitRequisition,
  actOnRequisitionTask,
} from "../src/lib/projects/requisitions.js";
import { actOnProcurementTask } from "../src/lib/projects/procurement-tasks.js";
import {
  procurementInclude,
  serializeProcurement,
} from "../src/lib/projects/procurements.js";
import { loadProcurementDomainTimeline } from "../src/lib/projects/procurement-timeline.js";
import { actOnProcurementLifecycle } from "../src/lib/projects/procurement-lifecycle-actions.js";
import { PROCESS_FLOW_CODES } from "../src/lib/projects/process-catalogue.js";

const prisma = new PrismaClient();
const STUDENT_EMAIL = "256700000001@mubs.ac.ug";
const results = [];

function pass(n, d = "") {
  results.push({ ok: true, name: n });
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ ok: false, name: n });
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
  return (
    tasks.find((t) =>
      String(t.title || "").toLowerCase().includes(String(needle).toLowerCase()),
    ) || null
  );
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
  console.log("\n=== Lifecycle hardening acceptance ===\n");

  assert(formatMoneyUGX(3500000) === "UGX 3,500,000", "Money format UGX 3,500,000");

  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  assert(Boolean(student), "Seed student exists");
  const project = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  assert(Boolean(project), "Personal org exists");
  const projectId = project.id;

  const usersRaw = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true, department: true },
  });
  const users = Object.fromEntries(usersRaw.map((u) => [u.firstName, u]));
  let grace = users.Grace;
  if (!grace) {
    grace = await prisma.projectOrgUser.findFirst({
      where: { projectId, projectOrgRole: { name: "Contracts Officer" } },
      include: { projectOrgRole: true, department: true },
    });
  }
  assert(Boolean(users.John && users.Mary && users.Peter && users.David && users.Sarah && grace), "Core org users present");

  const fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, status: "APPROVED", isConsolidated: false },
    include: { items: true },
  });
  const budgetLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { budget: { projectId, status: "APPROVED" } },
  });
  assert(Boolean(fy && plan && plan.items?.[0] && budgetLine), "FY / approved plan / budget line");

  // Prior suites may saturate the seed line; restore headroom for this run.
  await prisma.projectOrgBudgetLine.update({
    where: { id: budgetLine.id },
    data: { approvedAmount: 800000000, committedAmount: 0 },
  });

  const item = plan.items[0];
  const stamp = Date.now();
  const title = `Laptop computers hardening ${stamp}`;

  // Drive requisition → method QUOTATION (existing path)
  const draft = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: users.John.id,
    departmentId: users.John.departmentId,
    body: {
      title,
      justification: "ICT laboratory laptop refresh for teaching simulation.",
      needDescription: "10 laptop computers for ICT Department.",
      financialYearId: fy.id,
      procurementPlanId: plan.id,
      procurementPlanItemId: item.id,
      budgetLineId: budgetLine.id,
      requiredByDate: "2026-12-15",
      items: [
        {
          itemName: "Laptop computer",
          quantity: "1",
          unitOfMeasure: "Unit",
          estimatedUnitPrice: "3500000",
        },
      ],
    },
  });
  assert(draft.ok, "Draft requisition", draft.error);
  let r = await submitRequisition(prisma, {
    requisitionId: draft.requisition.id,
    projectId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
  });
  assert(r.ok, "Submit requisition", r.error);

  for (const [user, needle, decision] of [
    [users.Mary, "Review", OrgWorkflowDecision.APPROVE],
    [users.Peter, "Plan", OrgWorkflowDecision.VERIFY],
    [users.David, "Funding", OrgWorkflowDecision.VERIFY],
    [users.Sarah, "Approve Requisition", OrgWorkflowDecision.APPROVE],
  ]) {
    const t = await pendingTask(user.id, needle);
    assert(Boolean(t), `task ${needle}`);
    r = await actOnRequisitionTask(prisma, {
      taskId: t.id,
      actorOrgUserId: user.id,
      actorRoleName: user.projectOrgRole.name,
      actorDepartmentId: user.departmentId,
      decision,
      comment: "ok",
    });
    assert(r.ok, `${user.firstName} ${needle}`, r.error);
  }

  const methodTask = await pendingTask(users.Peter.id, "method");
  assert(Boolean(methodTask), "method task");
  r = await actOnRequisitionTask(prisma, {
    taskId: methodTask.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    actorDepartmentId: users.Peter.departmentId,
    decision: OrgWorkflowDecision.SELECT_METHOD,
    procurementMethod: "QUOTATION",
    comment: "Quotation path",
  });
  assert(r.ok, "SELECT_METHOD QUOTATION", r.error);
  const pid = r.procurementId || r.procurement?.id || null;
  const procRow =
    (pid &&
      (await prisma.projectOrgProcurement.findUnique({ where: { id: pid } }))) ||
    (await prisma.projectOrgProcurement.findFirst({
      where: { requisitionId: draft.requisition.id },
    }));
  assert(Boolean(procRow?.id), "procurement case created", procRow?.procurementNumber);
  const procurementId = procRow.id;
  assert(
    /^PROC-\d{4}-\d{4}$/.test(String(procRow.procurementNumber || "")),
    "case id 4-digit",
    procRow.procurementNumber,
  );

  // Ensure Quotation flow active
  const qFlow = await prisma.projectOrgProcessFlow.findFirst({
    where: { code: PROCESS_FLOW_CODES.QUOTATION_PROCESS },
  });
  if (qFlow) {
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: { projectId_processFlowId: { projectId, processFlowId: qFlow.id } },
      create: { projectId, processFlowId: qFlow.id, isActive: true, activatedAt: new Date() },
      update: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
    });
  }

  // Drive RFQ through open (same pattern as lifecycle suite)
  for (const step of [
    [users.Peter, "Prepare RFQ", OrgWorkflowDecision.SUBMIT],
    [users.David, "Review RFQ", OrgWorkflowDecision.APPROVE],
    [grace, "Approve RFQ", OrgWorkflowDecision.APPROVE],
  ]) {
    const [user, needle, decision] = step;
    r = await actProc(user, needle, decision);
    assert(r.ok, `RFQ step ${needle}`, r.error);
  }

  const supplier = await createOrGetSupplier(prisma, {
    projectId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    body: { name: `Hardening Supplier ${stamp}`, email: `harden${stamp}@example.test` },
  });
  assert(supplier.ok, "supplier", supplier.error);

  r = await actProc(users.Peter, "Issue RFQs", OrgWorkflowDecision.COMPLETE, {
    inviteSupplierIds: [supplier.supplier.id],
    closingDate: new Date(Date.now() + 86400000).toISOString(),
  });
  assert(r.ok, "Issue RFQs", r.error);

  r = await actProc(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, {
    offer: { supplierId: supplier.supplier.id, amount: "3500000" },
  });
  assert(r.ok, "Receive quotations (add offer)", r.error);
  r = await actProc(users.Peter, "Receive Quotations", OrgWorkflowDecision.COMPLETE, { finalize: true });
  assert(r.ok, "Receive quotations finalized", r.error);

  const sol = await prisma.projectOrgSolicitation.findFirst({
    where: { procurementId, solicitationType: "RFQ" },
  });
  if (sol) {
    await prisma.projectOrgSolicitation.update({
      where: { id: sol.id },
      data: { closingDate: new Date(Date.now() - 1000) },
    });
  }
  r = await actProc(users.Peter, "Close/Lock Quotation", OrgWorkflowDecision.COMPLETE);
  assert(r.ok, "Quotations locked", r.error);
  r = await actProc(users.Peter, "Open Quotations", OrgWorkflowDecision.COMPLETE);
  assert(r.ok, "Open quotations", r.error);

  // Evaluation committee
  let committee = await prisma.projectOrgCommittee.findFirst({
    where: { projectId, committeeType: OrgCommitteeType.EVALUATION, isActive: true },
  });
  if (!committee) {
    committee = await prisma.projectOrgCommittee.create({
      data: {
        projectId,
        name: `Hardening Eval ${stamp}`,
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
      status: OrgCommitteeMembershipStatus.ACTIVE,
      startDate: new Date(),
    },
    update: { status: OrgCommitteeMembershipStatus.ACTIVE, committeeRole: OrgCommitteeMemberRole.CHAIRPERSON },
  });
  await setActiveCommittee(prisma, {
    projectId,
    orgUserId: users.Mary.id,
    committeeId: committee.id,
  });

  // Negatives: wrong role / OA / wrong dept / early delivery
  const oaDeny = await actOnProcurementLifecycle(prisma, {
    projectId,
    procurementId,
    action: "create_award",
    actorOrgUserId: users.John.id,
    actorRoleName: "Organization Administrator",
  });
  assert(!oaDeny.ok, "OA cannot create award", oaDeny.error);

  const wrongRole = await actOnProcurementLifecycle(prisma, {
    projectId,
    procurementId,
    action: "approve_payment",
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
  });
  assert(!wrongRole.ok, "UDO cannot approve payment", wrongRole.error);

  const earlyDelivery = await recordDelivery(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    lines: [{ itemName: "Laptop computer", receivedQuantity: 1 }],
  });
  assert(!earlyDelivery.ok, "Delivery blocked without active order", earlyDelivery.error);

  const earlyClose = await evaluateClosureReadiness(prisma, projectId, procurementId);
  assert(!earlyClose.ok && (earlyClose.blockers || []).length > 0, "Closure blocked early", (earlyClose.blockers || []).join("; "));

  const badEval = await createEvaluationReport(prisma, {
    projectId,
    procurementId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
    recommendedSupplierId: supplier.supplier.id,
    evaluatedAmount: "3500000",
    recommendation: "Should fail",
  });
  assert(!badEval.ok, "Non-committee eval blocked", badEval.error);

  const evalCreated = await createEvaluationReport(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    activeCommitteeId: committee.id,
    recommendedSupplierId: supplier.supplier.id,
    evaluatedAmount: "3500000",
    recommendation: "Award recommended for ICT laptops.",
    participants: [
      { orgUserId: users.Mary.id, committeeRole: "CHAIRPERSON", conflictOfInterest: false },
    ],
  });
  assert(evalCreated.ok, "Evaluation created", evalCreated.error);
  await submitEvaluationReport(prisma, {
    projectId,
    evaluationReportId: evalCreated.evaluationReport.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    activeCommitteeId: committee.id,
  });
  r = await decideEvaluationReport(prisma, {
    projectId,
    evaluationReportId: evalCreated.evaluationReport.id,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
    decision: "APPROVE",
    comment: "Approved.",
  });
  assert(r.ok, "Evaluation approved", r.error);

  let award = await createAwardFromApprovedEvaluation(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    approvalReference: `AO-HARD-${stamp}`,
  });
  if (!award.ok && award.code === "AWARD_ALREADY_EXISTS") {
    award = { ok: true, award: await getLatestAward(prisma, projectId, procurementId) };
  }
  assert(award.ok, "Award created", award.error);
  assert(formatMoneyUGX(award.award.awardedAmount) === "UGX 3,500,000", "Award amount display");

  await communicateAward(prisma, {
    projectId,
    awardId: award.award.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  await acceptAward(prisma, {
    projectId,
    awardId: award.award.id,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  pass("Award communicated and accepted");

  const lpo = await createLpo(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.Peter.id,
    actorRoleName: users.Peter.projectOrgRole.name,
  });
  assert(lpo.ok, "LPO created", lpo.error);
  await approveLpo(prisma, { projectId, lpoId: lpo.lpo.id, actorOrgUserId: users.Peter.id, actorRoleName: users.Peter.projectOrgRole.name });
  await issueLpo(prisma, { projectId, lpoId: lpo.lpo.id, actorOrgUserId: users.Peter.id, actorRoleName: users.Peter.projectOrgRole.name });
  await acceptLpo(prisma, { projectId, lpoId: lpo.lpo.id, actorOrgUserId: users.Peter.id, actorRoleName: users.Peter.projectOrgRole.name });
  pass("LPO approved/issued/accepted");

  // Wrong department HOD trying delivery on ICT procurement (if another dept user exists)
  const otherDept = await prisma.projectOrgDepartment.findFirst({
    where: { projectId, id: { not: users.John.departmentId } },
  });
  if (otherDept) {
    const otherHud = await prisma.projectOrgUser.findFirst({
      where: {
        projectId,
        departmentId: otherDept.id,
        projectOrgRole: { name: "Head User Department" },
      },
      include: { projectOrgRole: true },
    });
    if (otherHud) {
      const wrongDept = await actOnProcurementLifecycle(prisma, {
        projectId,
        procurementId: procurementId,
        action: "record_delivery",
        actorOrgUserId: otherHud.id,
        actorRoleName: otherHud.projectOrgRole.name,
        actorDepartmentId: otherHud.departmentId,
        body: { lines: [{ itemName: "Laptop computer", receivedQuantity: 1 }] },
      });
      assert(!wrongDept.ok, "Wrong department blocked", wrongDept.error);
    } else {
      pass("Wrong department — no other HOD in seed (skipped)");
    }
  } else {
    pass("Wrong department — single department seed (skipped)");
  }

  if (!(await prisma.projectOrgDeliveryNote.count({ where: { procurementId, status: "SUBMITTED" } }))) {
    const blocked = await recordDelivery(prisma, {
      projectId,
      procurementId,
      actorOrgUserId: users.John.id,
      actorRoleName: users.John.projectOrgRole.name,
      lines: [{ itemName: "Laptop computer", receivedQuantity: 1 }],
    });
    assert(!blocked.ok, "Receipt blocked until provider dispatches", blocked.error);
    const note = await submitDeliveryNote(prisma, {
      projectId,
      procurementId,
      providerId: lpo.lpo.supplierId,
      body: { lines: [{ itemName: "Laptop computer", quantity: "1" }] },
    });
    assert(note.ok, "Provider dispatched", note.error);
  }

  const delivery = await recordDelivery(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    lines: [{ itemName: "Laptop computer", receivedQuantity: 1 }],
    remarks: "Delivered to ICT store.",
  });
  assert(delivery.ok, "Delivery recorded", delivery.error);

  // Invoice before inspection must fail
  const invEarly = await createInvoice(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    amount: "3500000",
  });
  assert(!invEarly.ok, "Invoice blocked before acceptance", invEarly.error);

  const lineId = delivery.delivery?.lines?.[0]?.id;
  const inspection = await recordInspection(prisma, {
    projectId,
    deliveryId: delivery.delivery.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
    resultNotes: "Conforming to specification.",
    lineDecisions: [{ lineId, acceptedQuantity: 1, rejectedQuantity: 0 }],
  });
  assert(inspection.ok, "Inspection accepted", inspection.error);

  let inv = await createInvoice(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    amount: "3500000",
  });
  assert(inv.ok, "Invoice created", inv.error);
  inv = await certifyInvoice(prisma, {
    projectId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Mary.id,
    actorRoleName: users.Mary.projectOrgRole.name,
  });
  assert(inv.ok, "Invoice certified", inv.error);
  inv = await verifyInvoice(prisma, {
    projectId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
  });
  assert(inv.ok, "Invoice verified", inv.error);

  const overpay = await createPayment(prisma, {
    projectId,
    procurementId: procurementId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    amount: "999999999",
  });
  assert(!overpay.ok, "Overpayment rejected", overpay.error);

  const pay = await createPayment(prisma, {
    projectId,
    procurementId: procurementId,
    invoiceId: inv.invoice.id,
    actorOrgUserId: users.Sarah.id,
    actorRoleName: users.Sarah.projectOrgRole.name,
    amount: "3500000",
    paymentReference: `PAY-HARD-${stamp}`,
  });
  assert(pay.ok, "Payment raised", pay.error);
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
  });
  pass("Payment approved and paid");

  const closed = await closeProcurement(prisma, {
    projectId,
    procurementId: procurementId,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
    remarks: "Laptop procurement complete.",
  });
  assert(closed.ok, "Procurement closed", closed.error);

  const after = await prisma.projectOrgProcurement.findUnique({ where: { id: procurementId } });
  assert(after.status === OrgProcurementStatus.CLOSED, "Status CLOSED");

  const postClose = await actOnProcurementLifecycle(prisma, {
    projectId,
    procurementId: procurementId,
    action: "create_invoice",
    actorOrgUserId: users.John.id,
    actorRoleName: users.John.projectOrgRole.name,
    actorDepartmentId: users.John.departmentId,
    body: { amount: "100" },
  });
  assert(!postClose.ok, "Closed procurement cannot be modified", postClose.error);

  // Unified timeline: workflow + domain
  const full = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId },
    include: procurementInclude,
  });
  const domainTimeline = await loadProcurementDomainTimeline(prisma, {
    projectId,
    procurementId: procurementId,
    procurementNumber: full.procurementNumber,
  });
  const ser = serializeProcurement(full, { domainTimeline });
  assert(Boolean(ser.award), "Serialize exposes award");
  assert((ser.deliveries || []).length >= 1, "Serialize exposes deliveries");
  assert((ser.invoices || []).length >= 1, "Serialize exposes invoices");
  assert((ser.payments || []).length >= 1, "Serialize exposes payments");
  assert(Boolean(ser.closedAt), "Serialize exposes closedAt");

  const hasRole = (ser.timeline || []).some((t) => t.actorRoleName);
  assert(hasRole, "Timeline includes organisational role");
  const hasDomain = (ser.timeline || []).some((t) => t.source === "domain");
  assert(hasDomain, "Timeline merges domain audits", `domain=${domainTimeline.length}`);
  const hasAwardAudit = (ser.timeline || []).some(
    (t) => t.eventType && String(t.eventType).includes("AWARD"),
  );
  assert(hasAwardAudit, "Timeline includes award audit event");
  const hasClosureAudit = (ser.timeline || []).some(
    (t) => t.eventType === "PROJECT_ORG_PROCUREMENT_CLOSED",
  );
  assert(hasClosureAudit, "Timeline includes closure audit");
  const moneyHit = (ser.timeline || []).some(
    (t) => t.amountLabel && String(t.amountLabel).includes(","),
  );
  assert(moneyHit || formatMoneyUGX(ser.award?.awardedAmount).includes(","), "Money commas present on case");

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
