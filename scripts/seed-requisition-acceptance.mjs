/**
 * Seeds a complete acceptance organisation for the requisition vertical slice.
 *
 * Usage (from repo root):
 *   node scripts/seed-requisition-acceptance.mjs
 *
 * Creates / updates:
 * - Student platform user (if missing) Lubega Juma
 * - Personal organisation "Lubega Juma Organization"
 * - FY 2026/2027, planning period, departments, users, budget, approved plan
 * - Activates Planning + Requisition workflows
 *
 * Org-user password: password123
 * Login as: local_ORGCODE@example.test (printed at end)
 */
import { PrismaClient, ProjectPurpose, ProjectStatus, ProjectVisibility, Role, OrgUnitType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureCoreProjectOrgRoles, PROJECT_ORG_ENTRY_ROLE_NAME } from "../src/lib/project-org-role.js";
import { ensureBaselineProcessTemplates, PROCESS_FLOW_CODES } from "../src/lib/projects/process-catalogue.js";
import { ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { PROJECT_ORG_LEARN_PASSWORD, formatOrgUsername } from "../src/lib/projects/org-user-identity.js";
import { hashOrgUserPassword } from "../src/lib/projects/org-user-password.js";

const prisma = new PrismaClient();

const STUDENT_EMAIL = "256700000001@mubs.ac.ug";

async function upsertDept(projectId, name, code) {
  const existing = await prisma.projectOrgDepartment.findFirst({
    where: { projectId, parentId: null, name },
  });
  if (existing) {
    return prisma.projectOrgDepartment.update({
      where: { id: existing.id },
      data: { code, unitType: OrgUnitType.DEPARTMENT, isActive: true },
    });
  }
  return prisma.projectOrgDepartment.create({
    data: {
      projectId,
      name,
      code,
      unitType: OrgUnitType.DEPARTMENT,
      isActive: true,
    },
  });
}

async function upsertOrgUser({
  projectId,
  email,
  firstName,
  lastName,
  roleName,
  departmentId,
  unitIdentifier,
}) {
  const role = await prisma.projectOrgRole.findUnique({ where: { name: roleName } });
  if (!role) throw new Error(`Missing role ${roleName}`);
  const passwordHash = await hashOrgUserPassword(PROJECT_ORG_LEARN_PASSWORD);

  const existing = await prisma.projectOrgUser.findFirst({
    where: { projectId, email, isProjectAdmin: false },
  });
  if (existing) {
    return prisma.projectOrgUser.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        projectOrgRoleId: role.id,
        departmentId,
        subunitId: null,
        passwordHash,
        unitIdentifier: existing.unitIdentifier || unitIdentifier,
      },
      include: { projectOrgRole: true },
    });
  }
  return prisma.projectOrgUser.create({
    data: {
      projectId,
      email,
      firstName,
      lastName,
      projectOrgRoleId: role.id,
      departmentId,
      passwordHash,
      unitIdentifier,
      isProjectAdmin: false,
    },
    include: { projectOrgRole: true },
  });
}

async function main() {
  await ensureCoreProjectOrgRoles(prisma);
  await ensureBaselineProcessTemplates(prisma);

  let student = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL },
    include: { userRoles: true, studentProfile: true },
  });

  if (!student) {
    let programme = await prisma.programme.findFirst({ where: { isActive: true } });
    if (!programme) {
      programme = await prisma.programme.create({
        data: { name: "General (acceptance)", shortName: "GENA", isActive: true },
      });
    }
    const passwordHash = await bcrypt.hash("256700000001", 12);
    student = await prisma.user.create({
      data: {
        email: STUDENT_EMAIL,
        firstName: "Lubega",
        lastName: "Juma",
        passwordHash,
        accountStatus: "ACTIVE",
        activatedAt: new Date(),
        mustChangePassword: false,
        userRoles: { create: [{ role: Role.STUDENT }] },
        studentProfile: {
          create: {
            studentNumber: "256700000001",
            registrationNumber: "2026/HD/001",
            yearOfStudy: 1,
            campus: "MAIN",
            academicYearLabel: "2025/2026",
            programmeId: programme.id,
          },
        },
        settings: {
          create: { theme: "light", activeRole: Role.STUDENT },
        },
      },
      include: { userRoles: true, studentProfile: true },
    });
    console.log("Created student:", student.email);
  } else {
    await prisma.user.update({
      where: { id: student.id },
      data: { firstName: "Lubega", lastName: "Juma" },
    });
    console.log("Using existing student:", student.email);
  }

  const org = await ensureStudentPersonalOrg(prisma, student.id);
  if (!org?.id) throw new Error("Could not ensure personal organisation");
  console.log("Organisation:", org.organizationName || org.name, org.projectCode);

  const projectId = org.id;

  const ict = await upsertDept(projectId, "ICT", "ICT");
  const finance = await upsertDept(projectId, "Finance", "FIN");
  const procurement = await upsertDept(projectId, "Procurement", "PDU");

  const john = await upsertOrgUser({
    projectId,
    email: "john.udo@example.test",
    firstName: "John",
    lastName: "Okello",
    roleName: "User Department Officer",
    departmentId: ict.id,
    unitIdentifier: "JOHN1",
  });
  const mary = await upsertOrgUser({
    projectId,
    email: "mary.hod@example.test",
    firstName: "Mary",
    lastName: "Nakato",
    roleName: "Head User Department",
    departmentId: ict.id,
    unitIdentifier: "MARY1",
  });
  const peter = await upsertOrgUser({
    projectId,
    email: "peter.po@example.test",
    firstName: "Peter",
    lastName: "Ssempijja",
    roleName: "Procurement Officer",
    departmentId: procurement.id,
    unitIdentifier: "PETE1",
  });
  const david = await upsertOrgUser({
    projectId,
    email: "david.pdu@example.test",
    firstName: "David",
    lastName: "Mugisha",
    roleName: "Head PDU",
    departmentId: procurement.id,
    unitIdentifier: "DAVE1",
  });
  const sarah = await upsertOrgUser({
    projectId,
    email: "sarah.ao@example.test",
    firstName: "Sarah",
    lastName: "Achieng",
    roleName: "Accounting Officer",
    departmentId: finance.id,
    unitIdentifier: "SARA1",
  });

  let fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId, label: "2026/2027" },
  });
  if (!fy) {
    fy = await prisma.projectOrgFinancialYear.create({
      data: {
        projectId,
        label: "2026/2027",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2027-06-30"),
        isActive: true,
        description: "Acceptance financial year",
      },
    });
  } else {
    await prisma.projectOrgFinancialYear.updateMany({
      where: { projectId, id: { not: fy.id } },
      data: { isActive: false },
    });
    fy = await prisma.projectOrgFinancialYear.update({
      where: { id: fy.id },
      data: { isActive: true },
    });
  }

  const existingPeriod = await prisma.projectOrgPlanningPeriod.findFirst({
    where: { projectId, financialYearId: fy.id },
  });
  if (!existingPeriod) {
    await prisma.projectOrgPlanningPeriod.create({
      data: {
        projectId,
        financialYearId: fy.id,
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-31"),
        status: "OPEN",
      },
    });
  }

  // Activate Budgeting + Planning + Requisition + method processes
  for (const code of [
    PROCESS_FLOW_CODES.BUDGETING,
    PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    PROCESS_FLOW_CODES.TENDER_PROCESS,
  ]) {
    const flow = await prisma.projectOrgProcessFlow.findFirst({ where: { code } });
    if (!flow) throw new Error(`Missing process template ${code}`);
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: {
        projectId_processFlowId: { projectId, processFlowId: flow.id },
      },
      create: {
        projectId,
        processFlowId: flow.id,
        isActive: true,
        activatedAt: new Date(),
      },
      update: {
        isActive: true,
        activatedAt: new Date(),
        deactivatedAt: null,
      },
    });
  }

  // Budget header + lines used by acceptance fixtures.
  // Operational budgets are created via the Budgeting workflow in day-to-day use;
  // seed writes an already-APPROVED record so requisition suite can focus on its vertical slice.
  let budget = await prisma.projectOrgBudget.findFirst({
    where: { projectId, financialYearId: fy.id, title: "ICT Capital Budget 2026/2027" },
    include: { lines: true },
  });
  if (!budget) {
    budget = await prisma.projectOrgBudget.create({
      data: {
        projectId,
        financialYearId: fy.id,
        departmentId: ict.id,
        title: "ICT Capital Budget 2026/2027",
        description: "ICT department capital equipment budget",
        status: "APPROVED",
        approvedAt: new Date(),
        lines: {
          create: [
            {
              projectId,
              financialYearId: fy.id,
              departmentId: ict.id,
              code: "ICT-CAPEX-01",
              name: "Computer Equipment",
              description: "Purchase of computers and related ICT equipment.",
              category: "ICT Equipment",
              approvedAmount: new Prisma.Decimal("800000000.00"),
              committedAmount: new Prisma.Decimal("0.00"),
              isActive: true,
            },
          ],
        },
      },
      include: { lines: true },
    });
  } else if (budget.status !== "APPROVED") {
    budget = await prisma.projectOrgBudget.update({
      where: { id: budget.id },
      data: { status: "APPROVED", approvedAt: new Date() },
      include: { lines: true },
    });
  }

  let capexLine = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId, financialYearId: fy.id, code: "ICT-CAPEX-01" },
  });
  if (!capexLine) {
    capexLine = await prisma.projectOrgBudgetLine.create({
      data: {
        projectId,
        budgetId: budget.id,
        financialYearId: fy.id,
        departmentId: ict.id,
        code: "ICT-CAPEX-01",
        name: "Computer Equipment",
        description: "Purchase of computers and related ICT equipment.",
        category: "ICT Equipment",
        approvedAmount: new Prisma.Decimal("800000000.00"),
        committedAmount: new Prisma.Decimal("0.00"),
        isActive: true,
      },
    });
  } else if (!capexLine.budgetId || capexLine.budgetId !== budget.id) {
    capexLine = await prisma.projectOrgBudgetLine.update({
      where: { id: capexLine.id },
      data: {
        budgetId: budget.id,
        isActive: true,
        approvedAmount: new Prisma.Decimal("800000000.00"),
        committedAmount: new Prisma.Decimal("0.00"),
      },
    });
  }

  // Fixture approved departmental plan for requisition acceptance (separate from live Planning demos).
  let plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId, title: "ICT Equipment Plan 2026/27" },
    include: { items: true },
  });
  if (!plan) {
    plan = await prisma.projectOrgProcurementPlan.create({
      data: {
        projectId,
        financialYearId: fy.id,
        planningPeriodId: (await prisma.projectOrgPlanningPeriod.findFirst({
          where: { projectId, financialYearId: fy.id },
        }))?.id,
        departmentId: ict.id,
        planReference: "ICT-PP-SEED-001",
        title: "ICT Equipment Plan 2026/27",
        status: "APPROVED",
        submittedAt: new Date(),
        approvedAt: new Date(),
        items: {
          create: [
            {
              itemNumber: 1,
              title: "Laptop Computers",
              description: "Business laptops for ICT staff",
              category: "ICT Equipment",
              quantity: new Prisma.Decimal("200"),
              unitOfMeasure: "Unit",
              estimatedUnitPrice: new Prisma.Decimal("3500000.00"),
              estimatedTotal: new Prisma.Decimal("700000000.00"),
              budgetLineId: capexLine.id,
              priority: "Normal",
              justification: "Seeded for requisition acceptance.",
            },
          ],
        },
      },
      include: { items: true },
    });
  } else if (plan.status !== "APPROVED") {
    plan = await prisma.projectOrgProcurementPlan.update({
      where: { id: plan.id },
      data: { status: "APPROVED", approvedAt: new Date() },
      include: { items: true },
    });
  }

  const code = org.projectCode;
  console.log("\n=== Acceptance seed complete ===");
  console.log("Platform student login:", STUDENT_EMAIL, "(password = student number if new)");
  console.log("Organisation:", org.organizationName || org.name, `(${code})`);
  console.log("FY:", fy.label, "Budget:", budget.title, budget.status);
  console.log("Budget line:", capexLine.code, capexLine.name);
  console.log("Plan:", plan.title, plan.status);
  console.log("\nOrg user logins (password:", PROJECT_ORG_LEARN_PASSWORD + ")");
  for (const u of [john, mary, peter, david, sarah]) {
    console.log(
      "-",
      u.firstName,
      u.projectOrgRole.name,
      "→",
      formatOrgUsername(u.email, code),
    );
  }
  console.log("\nWorkspace URL: /projects/" + projectId);
  console.log(
    "Note: Seed writes APPROVED budget/plan fixtures for requisition tests; live create/approve uses Budgeting + Planning workflows.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
