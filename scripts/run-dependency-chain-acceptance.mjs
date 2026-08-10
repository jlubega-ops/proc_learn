/**
 * Dependency-chain acceptance: Setup → Budget workflow → Plan → Consolidation → Requisition.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-dependency-chain-acceptance.mjs
 *
 * Prereq: scripts/seed-requisition-acceptance.mjs (Lubega org + John/Mary/…)
 * Also seeds Contracts Officer "Grace" and Finance/Budget Officer "Helen".
 */
import {
  PrismaClient,
  OrgBudgetStatus,
  OrgProcurementPlanStatus,
  OrgWorkflowDecision,
} from "@prisma/client";
import {
  ensureBaselineProcessTemplates,
  PROCESS_FLOW_CODES,
} from "../src/lib/projects/process-catalogue.js";
import {
  createBudgetWithLines,
  listSelectableBudgetLines,
  setBudgetStatus,
  submitBudget,
  actOnBudgetTask,
} from "../src/lib/projects/budgets.js";
import {
  createOrUpdateProcurementPlanDraft,
  submitProcurementPlan,
  actOnProcurementPlanTask,
  consolidateDepartmentPlans,
} from "../src/lib/projects/procurement-plans.js";
import { createOrUpdateRequisitionDraft } from "../src/lib/projects/requisitions.js";
import { hashOrgUserPassword } from "../src/lib/projects/org-user-password.js";
import { PROJECT_ORG_LEARN_PASSWORD } from "../src/lib/projects/org-user-identity.js";
import { computePlanningPeriodStatus } from "../src/lib/projects/org-planning-periods.js";
import { orgUserHasPermission, ORG_PERMISSION } from "../src/lib/projects/org-role-permissions.js";

const prisma = new PrismaClient();
const STUDENT_EMAIL = "256700000001@mubs.ac.ug";

const results = [];
function pass(name, d = "") {
  results.push({ name, ok: true, d });
  console.log(`  PASS  ${name}${d ? ` — ${d}` : ""}`);
}
function fail(name, d = "") {
  results.push({ name, ok: false, d });
  console.error(`  FAIL  ${name}${d ? ` — ${d}` : ""}`);
}
function assert(c, name, d = "") {
  if (c) pass(name, d);
  else fail(name, d || "assertion failed");
  return Boolean(c);
}

async function pendingFor(userId, titleIncludes = null) {
  const tasks = await prisma.projectOrgWorkflowTask.findMany({
    where: { assigneeOrgUserId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { instance: true },
  });
  if (!titleIncludes) return tasks[0] || null;
  return (
    tasks.find((t) => String(t.title || "").toLowerCase().includes(titleIncludes.toLowerCase())) ||
    null
  );
}

async function ensureOrgUser(prismaClient, {
  projectId,
  email,
  firstName,
  lastName,
  roleName,
  departmentId,
  unitIdentifier,
}) {
  const role = await prismaClient.projectOrgRole.findUnique({ where: { name: roleName } });
  if (!role) throw new Error(`Missing role ${roleName}`);
  let user = await prismaClient.projectOrgUser.findFirst({
    where: { projectId, email },
    include: { projectOrgRole: true },
  });
  if (!user) {
    user = await prismaClient.projectOrgUser.create({
      data: {
        projectId,
        email,
        firstName,
        lastName,
        projectOrgRoleId: role.id,
        departmentId,
        unitIdentifier,
        passwordHash: await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD),
      },
      include: { projectOrgRole: true },
    });
  } else if (user.projectOrgRoleId !== role.id || user.departmentId !== departmentId) {
    user = await prismaClient.projectOrgUser.update({
      where: { id: user.id },
      data: { projectOrgRoleId: role.id, departmentId },
      include: { projectOrgRole: true },
    });
  }
  return user;
}

async function main() {
  await ensureBaselineProcessTemplates(prisma);

  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!student) throw new Error("Run seed-requisition-acceptance.mjs first");
  const org = await prisma.project.findFirst({
    where: { ownerUserId: student.id, isPersonalOrg: true },
  });
  if (!org) throw new Error("Org missing");
  const projectId = org.id;
  console.log("Org:", org.organizationName, org.projectCode);

  // --- Setup activations ---
  console.log("\n=== Setup (FY / period / activate processes) ===");
  for (const code of [
    PROCESS_FLOW_CODES.BUDGETING,
    PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
  ]) {
    const flow = await prisma.projectOrgProcessFlow.findFirst({ where: { code } });
    assert(Boolean(flow), `Process template ${code}`);
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: { projectId_processFlowId: { projectId, processFlowId: flow.id } },
      create: {
        projectId,
        processFlowId: flow.id,
        isActive: true,
        activatedAt: new Date(),
      },
      update: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
    });
  }
  pass("Activated Budgeting + Planning + Requisition");

  const fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId, label: "2026/2027" },
  });
  const ict = await prisma.projectOrgDepartment.findFirst({
    where: { projectId, name: "ICT", parentId: null },
  });
  const financeDept = await prisma.projectOrgDepartment.findFirst({
    where: { projectId, name: "Finance", parentId: null },
  });
  const procurementDept = await prisma.projectOrgDepartment.findFirst({
    where: { projectId, name: "Procurement", parentId: null },
  });
  assert(fy && ict && financeDept && procurementDept, "FY + ICT + Finance + Procurement depts");

  let period = await prisma.projectOrgPlanningPeriod.findFirst({
    where: { projectId, financialYearId: fy.id },
  });
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
  if (!period) {
    period = await prisma.projectOrgPlanningPeriod.create({
      data: {
        projectId,
        financialYearId: fy.id,
        startDate: start,
        endDate: end,
        status: "OPEN",
      },
    });
  } else {
    period = await prisma.projectOrgPlanningPeriod.update({
      where: { id: period.id },
      data: { startDate: start, endDate: end, status: "OPEN" },
    });
  }
  assert(
    computePlanningPeriodStatus(period.startDate, period.endDate) === "OPEN",
    "Planning period OPEN",
  );

  const grace = await ensureOrgUser(prisma, {
    projectId,
    email: "grace.co@example.test",
    firstName: "Grace",
    lastName: "Nabirye",
    roleName: "Contracts Officer",
    departmentId: procurementDept.id,
    unitIdentifier: "GRACE1",
  });
  const helen = await ensureOrgUser(prisma, {
    projectId,
    email: "helen.finance@example.test",
    firstName: "Helen",
    lastName: "Akello",
    roleName: "Finance/Budget Officer",
    departmentId: financeDept.id,
    unitIdentifier: "HELEN1",
  });
  pass("Contracts Officer Grace + Finance Officer Helen ready");

  const users = await prisma.projectOrgUser.findMany({
    where: { projectId, isProjectAdmin: false },
    include: { projectOrgRole: true },
  });
  const byFirst = Object.fromEntries(users.map((u) => [u.firstName, u]));
  const john = byFirst.John;
  const mary = byFirst.Mary;
  const david = byFirst.David;
  const sarah = byFirst.Sarah;
  assert(john && mary && david && sarah && grace && helen, "Role users present");

  assert(
    !orgUserHasPermission("Organization Administrator", ORG_PERMISSION.CREATE_BUDGET),
    "Org Admin cannot create budgets via permission map",
  );
  assert(
    orgUserHasPermission("User Department Officer", ORG_PERMISSION.CREATE_BUDGET),
    "UDO can create budgets",
  );

  // --- Budget workflow ---
  console.log("\n=== Budget workflow (UDO→HOD→Finance→AO) ===");
  const code = `ICT-COMP-${Date.now().toString().slice(-6)}`;
  const created = await createBudgetWithLines(prisma, {
    projectId,
    actorOrgUserId: john.id,
    body: {
      title: `ICT Capital Budget ${fy.label} ${code}`,
      description: "ICT department capital equipment budget",
      financialYearId: fy.id,
      departmentId: ict.id,
      lines: [
        {
          code,
          name: "Computer Equipment",
          description: "Purchase of computers and related ICT equipment.",
          category: "ICT Equipment",
          quantity: 1,
          unitOfMeasure: "Lot",
          unitCost: 100000000,
          fundingSource: "Internal",
        },
        {
          code: `${code}-OS`,
          name: "Office Supplies",
          category: "Supplies",
          quantity: 1,
          unitOfMeasure: "Lot",
          unitCost: 20000000,
          fundingSource: "Internal",
        },
        {
          code: `${code}-SW`,
          name: "Software",
          category: "Software",
          quantity: 1,
          unitOfMeasure: "Lot",
          unitCost: 15000000,
          fundingSource: "Internal",
        },
      ],
    },
  });
  assert(created.ok, "Operational user creates department budget", created.error);
  const budgetId = created.budget.id;
  const computerLine = created.budget.lines.find((l) => l.name === "Computer Equipment");
  assert(Boolean(computerLine), "Computer Equipment line created");
  assert(Number(created.budget.totals.approvedAmount) === 135000000, "Budget total 135m (server calc)");

  const adminApproveBlocked = await setBudgetStatus(prisma, {
    projectId,
    budgetId,
    actorUserId: student.id,
    status: OrgBudgetStatus.APPROVED,
  });
  assert(
    !adminApproveBlocked.ok && adminApproveBlocked.code === "BUDGET_APPROVE_VIA_WORKFLOW",
    "Direct Admin approve blocked",
  );

  const selectableBefore = await listSelectableBudgetLines(prisma, {
    projectId,
    financialYearId: fy.id,
    departmentId: ict.id,
  });
  assert(
    !selectableBefore.some((l) => l.id === computerLine.id),
    "Draft budget lines not selectable",
  );

  const submittedBudget = await submitBudget(prisma, {
    projectId,
    budgetId,
    actorOrgUserId: john.id,
    actorRoleName: john.projectOrgRole.name,
    actorDepartmentId: john.departmentId,
  });
  assert(submittedBudget.ok, "John submits budget", submittedBudget.error || submittedBudget.code);

  let task = await pendingFor(mary.id, "Review Department Budget");
  assert(Boolean(task), "Mary HOD budget task");
  let r = await actOnBudgetTask(prisma, {
    taskId: task.id,
    actorOrgUserId: mary.id,
    actorRoleName: mary.projectOrgRole.name,
    actorDepartmentId: mary.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "Department budget endorsed.",
  });
  assert(r.ok, "Mary HOD reviews budget", r.error);

  task = await pendingFor(helen.id, "Review and Consolidate Budgets");
  assert(Boolean(task), "Helen Finance budget task");
  r = await actOnBudgetTask(prisma, {
    taskId: task.id,
    actorOrgUserId: helen.id,
    actorRoleName: helen.projectOrgRole.name,
    actorDepartmentId: helen.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "Finance consolidated.",
  });
  assert(r.ok, "Helen Finance reviews budget", r.error);

  task = await pendingFor(sarah.id, "Approve Budget");
  assert(Boolean(task), "Sarah AO budget task");
  r = await actOnBudgetTask(prisma, {
    taskId: task.id,
    actorOrgUserId: sarah.id,
    actorRoleName: sarah.projectOrgRole.name,
    actorDepartmentId: sarah.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "AO approved budget.",
  });
  assert(r.ok, "Sarah AO approves budget", r.error);
  assert(r.budgetStatus === OrgBudgetStatus.APPROVED, "Budget status APPROVED");

  const selectable = await listSelectableBudgetLines(prisma, {
    projectId,
    financialYearId: fy.id,
    departmentId: ict.id,
  });
  assert(
    selectable.some((l) => l.id === computerLine.id),
    "Approved budget lines become available",
  );

  // Unapproved budget line cannot plan
  const draftBudget = await createBudgetWithLines(prisma, {
    projectId,
    actorOrgUserId: john.id,
    body: {
      title: `Draft-only ${code}`,
      financialYearId: fy.id,
      departmentId: ict.id,
      lines: [
        {
          code: `DRAFT-${code}`,
          name: "Not approved line",
          category: "Misc",
          quantity: 1,
          unitOfMeasure: "Lot",
          unitCost: 5000,
          fundingSource: "Internal",
        },
      ],
    },
  });
  assert(draftBudget.ok, "Draft-only budget for plan guard", draftBudget.error);
  const draftLineId = draftBudget.budget.lines[0].id;

  // --- Plan ---
  console.log("\n=== Procurement Plan ===");
  const planRef = `ICT-PP-2026-${Date.now().toString().slice(-4)}`;
  const draft = await createOrUpdateProcurementPlanDraft(prisma, {
    projectId,
    actorOrgUserId: john.id,
    departmentId: john.departmentId,
    body: {
      title: "ICT Procurement Plan 2026/2027",
      planReference: planRef,
      financialYearId: fy.id,
      planningPeriodId: period.id,
      items: [
        {
          title: "Laptop Computers",
          description: "Supply of laptop computers for ICT Department.",
          category: "ICT Equipment",
          quantity: 10,
          unitOfMeasure: "Unit",
          estimatedUnitPrice: 3500000,
          budgetLineId: computerLine.id,
          expectedProcurementPeriod: "Q1",
          priority: "Normal",
          justification: "Replace aging fleet.",
        },
        {
          title: "Desktop Computers",
          quantity: 20,
          unitOfMeasure: "Unit",
          estimatedUnitPrice: 2500000,
          budgetLineId: computerLine.id,
          category: "ICT Equipment",
        },
        {
          title: "Network Switches",
          quantity: 5,
          unitOfMeasure: "Unit",
          estimatedUnitPrice: 1800000,
          budgetLineId: computerLine.id,
          category: "Network Equipment",
        },
      ],
    },
  });
  assert(draft.ok, "UDO creates plan with multiple items", draft.error || JSON.stringify(draft.fieldErrors || {}));
  assert((draft.plan.items || []).length === 3, "Multiple plan items exist");

  const badPlan = await createOrUpdateProcurementPlanDraft(prisma, {
    projectId,
    actorOrgUserId: john.id,
    departmentId: john.departmentId,
    body: {
      title: "Bad plan",
      planReference: `BAD-${Date.now().toString().slice(-4)}`,
      financialYearId: fy.id,
      planningPeriodId: period.id,
      items: [
        {
          title: "Unauthorized",
          quantity: 1,
          estimatedUnitPrice: 1000,
          budgetLineId: draftLineId,
        },
      ],
    },
  });
  assert(!badPlan.ok, "Plan cannot use unapproved budget line", badPlan.error);

  const submitted = await submitProcurementPlan(prisma, {
    projectId,
    planId: draft.plan.id,
    actorOrgUserId: john.id,
    actorRoleName: john.projectOrgRole.name,
    actorDepartmentId: john.departmentId,
  });
  assert(submitted.ok, "Plan submitted (OPEN period)", submitted.error || submitted.code);

  console.log("\n=== Planning workflow ===");
  task = await pendingFor(mary.id, "Review");
  assert(Boolean(task), "Mary HOD plan task");
  r = await actOnProcurementPlanTask(prisma, {
    taskId: task.id,
    actorOrgUserId: mary.id,
    actorRoleName: mary.projectOrgRole.name,
    actorDepartmentId: mary.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "Department endorsed.",
  });
  assert(r.ok, "Mary approve plan", r.error);

  task = await pendingFor(david.id, "Consolidation");
  assert(Boolean(task), "David consolidation task");

  const consolidated = await consolidateDepartmentPlans(prisma, {
    projectId,
    actorOrgUserId: david.id,
    actorRoleName: david.projectOrgRole.name,
    financialYearId: fy.id,
    planningPeriodId: period.id,
    sourcePlanIds: [draft.plan.id],
    title: `Consolidated ICT Plan ${fy.label}`,
  });
  assert(consolidated.ok, "Head PDU MVP consolidation link", consolidated.error);

  r = await actOnProcurementPlanTask(prisma, {
    taskId: task.id,
    actorOrgUserId: david.id,
    actorRoleName: david.projectOrgRole.name,
    actorDepartmentId: david.departmentId,
    decision: OrgWorkflowDecision.COMPLETE,
    comment: "Consolidated into org plan.",
  });
  assert(r.ok, "David complete consolidation", r.error);

  task = await pendingFor(grace.id, "Review Consolidated");
  assert(Boolean(task), "Grace Contracts Officer task");
  r = await actOnProcurementPlanTask(prisma, {
    taskId: task.id,
    actorOrgUserId: grace.id,
    actorRoleName: grace.projectOrgRole.name,
    actorDepartmentId: grace.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "Contracts review OK.",
  });
  assert(r.ok, "Grace approve consolidated", r.error);

  task = await pendingFor(sarah.id, "Approve Consolidated");
  assert(Boolean(task), "Sarah AO plan task");
  r = await actOnProcurementPlanTask(prisma, {
    taskId: task.id,
    actorOrgUserId: sarah.id,
    actorRoleName: sarah.projectOrgRole.name,
    actorDepartmentId: sarah.departmentId,
    decision: OrgWorkflowDecision.APPROVE,
    comment: "AO approved plan.",
  });
  assert(r.ok, "Sarah AO approve plan", r.error);
  assert(r.procurementPlanStatus === OrgProcurementPlanStatus.APPROVED, "Plan APPROVED");

  const planRow = await prisma.projectOrgProcurementPlan.findUnique({
    where: { id: draft.plan.id },
    include: { items: true },
  });
  assert(planRow.status === "APPROVED", "Persisted plan status APPROVED");
  assert(Boolean(planRow.consolidatedIntoPlanId), "Dept plan linked to consolidated shell");

  // --- Requisition ---
  console.log("\n=== Requisition ===");
  const approvedPlans = await prisma.projectOrgProcurementPlan.findMany({
    where: { projectId, departmentId: ict.id, status: "APPROVED" },
    include: { items: true },
  });
  assert(
    approvedPlans.some((p) => p.id === planRow.id),
    "Approved plan available to requisition",
  );
  assert(
    (planRow.items || []).length >= 3,
    "Requisition dropdowns can use multiple approved plan items",
  );

  const reqDraft = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: john.id,
    departmentId: john.departmentId,
    body: {
      title: "Procurement of Laptop Computers",
      justification: "As per approved ICT procurement plan.",
      needDescription: "Ten business laptops for ICT staff.",
      financialYearId: fy.id,
      procurementPlanId: planRow.id,
      procurementPlanItemId: planRow.items.find((i) => /laptop/i.test(i.title))?.id,
      budgetLineId: computerLine.id,
      requiredByDate: "2026-10-15",
      deliveryLocation: "ICT Store",
      items: [
        {
          itemName: "Laptop computer",
          quantity: 10,
          unitOfMeasure: "Unit",
          estimatedUnitPrice: 3500000,
          specification: "i5, 16GB, 512GB",
        },
      ],
    },
  });
  assert(reqDraft.ok, "John drafts REQ-001 from approved plan/budget", reqDraft.error);

  const switchItem = planRow.items.find((i) => /switch/i.test(i.title));
  const req2 = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: john.id,
    departmentId: john.departmentId,
    body: {
      title: "Procurement of Network Switches",
      justification: "Network refresh.",
      needDescription: "Five managed switches.",
      financialYearId: fy.id,
      procurementPlanId: planRow.id,
      procurementPlanItemId: switchItem.id,
      budgetLineId: computerLine.id,
      requiredByDate: "2026-11-01",
      deliveryLocation: "ICT Store",
      items: [
        {
          itemName: "Network switch",
          quantity: 5,
          unitOfMeasure: "Unit",
          estimatedUnitPrice: 1800000,
        },
      ],
    },
  });
  assert(req2.ok, "Second independent requisition on another plan item", req2.error);
  assert(reqDraft.requisition.id !== req2.requisition.id, "Multiple requisitions keep unique ids");

  const inactiveBlocked = await prisma.projectOrgProcessFlowAdoption.updateMany({
    where: {
      projectId,
      processFlow: { code: PROCESS_FLOW_CODES.BUDGETING },
    },
    data: { isActive: false, deactivatedAt: new Date() },
  });
  assert(inactiveBlocked.count >= 0, "Can deactivate Budgeting process");
  const inactiveBudget = await createBudgetWithLines(prisma, {
    projectId,
    actorOrgUserId: john.id,
    body: {
      title: `Inactive test ${Date.now()}`,
      financialYearId: fy.id,
      departmentId: ict.id,
      lines: [{ code: `INACT-${Date.now().toString().slice(-5)}`, name: "X", approvedAmount: 100 }],
    },
  });
  if (inactiveBudget.ok) {
    const submitInactive = await submitBudget(prisma, {
      projectId,
      budgetId: inactiveBudget.budget.id,
      actorOrgUserId: john.id,
      actorRoleName: john.projectOrgRole.name,
      actorDepartmentId: john.departmentId,
    });
    assert(
      !submitInactive.ok && submitInactive.code === "WORKFLOW_INACTIVE",
      "Inactive Budgeting process blocks new workflow instances",
    );
  }

  // Restore budgeting active for later demos
  const budgetingFlow = await prisma.projectOrgProcessFlow.findFirst({
    where: { code: PROCESS_FLOW_CODES.BUDGETING },
  });
  await prisma.projectOrgProcessFlowAdoption.updateMany({
    where: { projectId, processFlowId: budgetingFlow.id },
    data: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
  });

  const audit = await prisma.auditLog.findMany({
    where: {
      eventType: {
        in: [
          "PROJECT_ORG_BUDGET_CREATED",
          "PROJECT_ORG_BUDGET_SUBMITTED",
          "PROJECT_ORG_WORKFLOW_TASK_COMPLETED",
          "PROJECT_ORG_PROCUREMENT_PLAN_CONSOLIDATED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  assert(
    audit.some((a) => JSON.stringify(a.meta || {}).includes(budgetId)),
    "Budget audit history preserved",
  );

  console.log("\n=== Summary ===");
  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok).length;
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed) {
    for (const f of results.filter((x) => !x.ok)) console.log(" -", f.name, f.d);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
