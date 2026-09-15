/**
 * Presentation / first-deploy demo seed for Proc Learn.
 *
 * Safe to run on an empty production database after migrations / `db push`.
 * Idempotent: re-running updates known demo emails and refreshes labelled demo projects
 * (does not wipe unrelated live data).
 *
 * What you get:
 *   - System admin + catalogues (roles, process flows, GEN programme, current AY)
 *   - 2 examiners, 10 students with personal organisations
 *   - Practice + Assessment projects in varied states
 *   - Attempts: not started, in progress, submitted, graded (pass/fail), released results
 *
 * Usage:
 *   npm run db:seed:presentation
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-presentation.mjs
 *
 * Optional:
 *   --reset-demo-passwords   Re-hash all demo user passwords to the documented defaults
 *   DEPLOY_ADMIN_EMAIL / DEPLOY_ADMIN_PASSWORD   (same as deploy defaults)
 *
 * Demo passwords (mustChangePassword = false for smooth presentations):
 *   System admin:   see DEPLOY_ADMIN_* (default Admin123!)
 *   Examiners:      DemoExam123!
 *   Students:       DemoStud123!
 */
import bcrypt from "bcryptjs";
import {
  AcademicParticipationType,
  AssessmentGradingMode,
  OrgBudgetStatus,
  OrgProcurementMethod,
  OrgProcurementPlanStatus,
  OrgProcurementStatus,
  OrgRequisitionStatus,
  OrgUnitType,
  Prisma,
  ProjectAttemptStatus,
  ProjectEnrollmentStatus,
  ProjectPurpose,
  ProjectStatus,
  Role,
  Sex,
  UserAccountStatus,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import {
  CORE_ORG_ROLE_DEFINITIONS,
  ensureCoreProjectOrgRoles,
} from "../src/lib/project-org-role.js";
import {
  ensureBaselineProcessTemplates,
  PROCESS_FLOW_CODES,
} from "../src/lib/projects/process-catalogue.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { ensureActiveEnrollment } from "../src/lib/academic/student-enrollment.js";
import { ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { generateUniqueProjectCode } from "../src/lib/projects/project-identity.js";
import {
  startProjectAttempt,
  submitProjectAttempt,
} from "../src/lib/academic/project-attempts.js";
import {
  autoEvaluateProjectAttempt,
  getOrCreateProjectAssessment,
} from "../src/lib/academic/assessment-evaluate.js";
import { persistStudentActiveOrg } from "../src/lib/projects/student-active-org.js";

const RESET_DEMO_PASSWORDS = process.argv.includes("--reset-demo-passwords");

const ADMIN_EMAIL = String(
  process.env.DEPLOY_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "jlubega@mubs.ac.ug",
)
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = String(
  process.env.DEPLOY_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "Admin123!",
);

const EXAMINER_PASSWORD = "DemoExam123!";
const STUDENT_PASSWORD = "DemoStud123!";

const DEMO_TAG = "[DEMO]";

const EXAMINERS = [
  {
    email: "nnamutebi@mubs.ac.ug",
    firstName: "Nakato",
    lastName: "Namutebi",
    sex: Sex.FEMALE,
  },
  {
    email: "okello@mubs.ac.ug",
    firstName: "Peter",
    lastName: "Okello",
    sex: Sex.MALE,
  },
];

/** @type {{ email: string; firstName: string; lastName: string; middleName?: string | null; studentNumber: string; reg: string; yearOfStudy: number; sex: import("@prisma/client").Sex | null }[]} */
const STUDENTS = [
  {
    email: "256010000001@mubs.ac.ug",
    firstName: "Amina",
    lastName: "Nabukeera",
    studentNumber: "256010000001",
    reg: "2024/HD/001",
    yearOfStudy: 1,
    sex: Sex.FEMALE,
  },
  {
    email: "256010000002@mubs.ac.ug",
    firstName: "Brian",
    lastName: "Ssewanyana",
    studentNumber: "256010000002",
    reg: "2024/HD/002",
    yearOfStudy: 1,
    sex: Sex.MALE,
  },
  {
    email: "256010000003@mubs.ac.ug",
    firstName: "Christine",
    lastName: "Akello",
    studentNumber: "256010000003",
    reg: "2024/HD/003",
    yearOfStudy: 2,
    sex: Sex.FEMALE,
  },
  {
    email: "256010000004@mubs.ac.ug",
    firstName: "David",
    lastName: "Mugisha",
    studentNumber: "256010000004",
    reg: "2023/HD/014",
    yearOfStudy: 2,
    sex: Sex.MALE,
  },
  {
    email: "256010000005@mubs.ac.ug",
    firstName: "Esther",
    lastName: "Namuli",
    studentNumber: "256010000005",
    reg: "2023/HD/025",
    yearOfStudy: 2,
    sex: Sex.FEMALE,
  },
  {
    email: "256010000006@mubs.ac.ug",
    firstName: "Francis",
    lastName: "Ochieng",
    studentNumber: "256010000006",
    reg: "2022/HD/036",
    yearOfStudy: 3,
    sex: Sex.MALE,
  },
  {
    email: "256010000007@mubs.ac.ug",
    firstName: "Grace",
    lastName: "Nalwanga",
    studentNumber: "256010000007",
    reg: "2022/HD/047",
    yearOfStudy: 3,
    sex: Sex.FEMALE,
  },
  {
    email: "256010000008@mubs.ac.ug",
    firstName: "Hassan",
    lastName: "Kato",
    studentNumber: "256010000008",
    reg: "2024/HD/058",
    yearOfStudy: 1,
    sex: Sex.MALE,
  },
  {
    email: "256010000009@mubs.ac.ug",
    firstName: "Irene",
    lastName: "Tumusiime",
    studentNumber: "256010000009",
    reg: "2023/HD/069",
    yearOfStudy: 2,
    sex: Sex.FEMALE,
  },
  {
    email: "256010000010@mubs.ac.ug",
    firstName: "Joseph",
    lastName: "Wanyama",
    studentNumber: "256010000010",
    reg: "2022/HD/070",
    yearOfStudy: 3,
    sex: Sex.MALE,
  },
];

/**
 * @param {string} plain
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function ensureSystemAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { userRoles: true, settings: true },
  });
  if (existing) {
    if (!existing.userRoles.some((r) => r.role === Role.SYSTEM_ADMIN)) {
      await prisma.userRole.create({
        data: { userId: existing.id, role: Role.SYSTEM_ADMIN },
      });
    }
    if (!existing.settings) {
      await prisma.userSettings.create({
        data: { userId: existing.id, theme: "light", activeRole: Role.SYSTEM_ADMIN },
      });
    }
    if (RESET_DEMO_PASSWORDS) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashPassword(ADMIN_PASSWORD),
          accountStatus: UserAccountStatus.ACTIVE,
          activatedAt: existing.activatedAt || new Date(),
        },
      });
    }
    console.log(`Admin ready: ${ADMIN_EMAIL}`);
    return existing.id;
  }

  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      firstName: "System",
      lastName: "Admin",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: new Date(),
      mustChangePassword: true,
      userRoles: { create: [{ role: Role.SYSTEM_ADMIN }] },
      settings: { create: { theme: "light", activeRole: Role.SYSTEM_ADMIN } },
    },
  });
  console.log(`Admin created: ${ADMIN_EMAIL}`);
  return user.id;
}

async function ensureProgramme() {
  const shortName = "GEN";
  const existing = await prisma.programme.findFirst({ where: { shortName } });
  if (existing) {
    return prisma.programme.update({
      where: { id: existing.id },
      data: { name: "General", isActive: true, defaultYearOfStudy: 3 },
    });
  }
  return prisma.programme.create({
    data: { name: "General", shortName, isActive: true, defaultYearOfStudy: 3 },
  });
}

/**
 * @param {{ email: string; firstName: string; lastName: string; sex: import("@prisma/client").Sex | null }} spec
 */
async function upsertExaminer(spec) {
  const email = spec.email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { userRoles: true, settings: true },
  });
  if (existing) {
    if (!existing.userRoles.some((r) => r.role === Role.EXAMINER)) {
      await prisma.userRole.create({ data: { userId: existing.id, role: Role.EXAMINER } });
    }
    if (!existing.settings) {
      await prisma.userSettings.create({
        data: { userId: existing.id, theme: "light", activeRole: Role.EXAMINER },
      });
    }
    const data = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      sex: spec.sex,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: existing.activatedAt || new Date(),
      mustChangePassword: false,
    };
    if (RESET_DEMO_PASSWORDS || !existing.passwordHash) {
      Object.assign(data, { passwordHash: await hashPassword(EXAMINER_PASSWORD) });
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      sex: spec.sex,
      passwordHash: await hashPassword(EXAMINER_PASSWORD),
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: new Date(),
      mustChangePassword: false,
      userRoles: { create: [{ role: Role.EXAMINER }] },
      settings: { create: { theme: "light", activeRole: Role.EXAMINER } },
    },
  });
}

/**
 * @param {typeof STUDENTS[number]} spec
 * @param {string} programmeId
 * @param {string} academicYearLabel
 * @param {string} academicYearId
 */
async function upsertStudent(spec, programmeId, academicYearLabel, academicYearId) {
  const email = spec.email.toLowerCase();
  let user = await prisma.user.findUnique({
    where: { email },
    include: { userRoles: true, settings: true, studentProfile: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        firstName: spec.firstName,
        lastName: spec.lastName,
        middleName: spec.middleName || null,
        sex: spec.sex,
        passwordHash: await hashPassword(STUDENT_PASSWORD),
        accountStatus: UserAccountStatus.ACTIVE,
        activatedAt: new Date(),
        mustChangePassword: false,
        userRoles: { create: [{ role: Role.STUDENT }] },
        settings: { create: { theme: "light", activeRole: Role.STUDENT } },
        studentProfile: {
          create: {
            studentNumber: spec.studentNumber,
            registrationNumber: spec.reg,
            programmeId,
            yearOfStudy: spec.yearOfStudy,
            campus: spec.campus || "MAIN",
            academicYearLabel,
          },
        },
      },
      include: { userRoles: true, settings: true, studentProfile: true },
    });
  } else {
    if (!user.userRoles.some((r) => r.role === Role.STUDENT)) {
      await prisma.userRole.create({ data: { userId: user.id, role: Role.STUDENT } });
    }
    const data = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      sex: spec.sex,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: user.activatedAt || new Date(),
      mustChangePassword: false,
    };
    if (RESET_DEMO_PASSWORDS || !user.passwordHash) {
      Object.assign(data, { passwordHash: await hashPassword(STUDENT_PASSWORD) });
    }
    await prisma.user.update({ where: { id: user.id }, data });
    if (!user.studentProfile) {
      await prisma.studentProfile.create({
        data: {
          userId: user.id,
          studentNumber: spec.studentNumber,
          registrationNumber: spec.reg,
          programmeId,
          yearOfStudy: spec.yearOfStudy,
          campus: spec.campus || "MAIN",
          academicYearLabel,
        },
      });
    } else {
      await prisma.studentProfile.update({
        where: { userId: user.id },
        data: {
          registrationNumber: spec.reg,
          programmeId,
          yearOfStudy: spec.yearOfStudy,
          campus: spec.campus || "MAIN",
          academicYearLabel,
        },
      });
    }
  }

  await ensureActiveEnrollment(prisma, {
    userId: user.id,
    academicYearId,
    participationType: AcademicParticipationType.STUDENT,
    syncProfileLabel: true,
  });
  const org = await ensureStudentPersonalOrg(prisma, user.id);
  return { user, org };
}

/**
 * Find or create a labelled demo academic project.
 * @param {{
 *   ownerUserId: string;
 *   name: string;
 *   purpose: import("@prisma/client").ProjectPurpose;
 *   organizationName: string;
 *   description: string;
 *   instructions: string;
 *   questionText: string;
 *   durationSeconds: number | null;
 *   maxAttempts: number | null;
 *   isPublished: boolean;
 *   openAt: Date | null;
 *   closeAt: Date | null;
 *   academicYearId: string;
 *   programmeId: string;
 * }} p
 */
async function upsertDemoProject(p) {
  const existing = await prisma.project.findFirst({
    where: {
      ownerUserId: p.ownerUserId,
      name: p.name,
      creatorRole: Role.EXAMINER,
      isAttemptOrg: false,
      isPersonalOrg: false,
    },
  });
  const data = {
    organizationName: p.organizationName,
    description: p.description,
    instructions: p.instructions,
    questionText: p.questionText,
    purpose: p.purpose,
    visibility: "PUBLIC",
    status: ProjectStatus.IN_PROGRESS,
    isPublished: p.isPublished,
    requiresEnrollment: true,
    durationSeconds: p.durationSeconds,
    maxAttempts: p.maxAttempts,
    allowEditAfterSubmit: false,
    openAt: p.openAt,
    closeAt: p.closeAt,
    academicYearId: p.academicYearId,
    programmeId: p.programmeId,
  };
  if (existing) {
    return prisma.project.update({ where: { id: existing.id }, data });
  }
  const projectCode = await generateUniqueProjectCode(prisma);
  return prisma.project.create({
    data: {
      ownerUserId: p.ownerUserId,
      creatorRole: Role.EXAMINER,
      projectCode,
      name: p.name,
      ...data,
    },
  });
}

/**
 * @param {string} projectId
 * @param {string} studentUserId
 */
async function ensureEnrollment(projectId, studentUserId) {
  return prisma.projectEnrollment.upsert({
    where: {
      projectId_studentUserId: { projectId, studentUserId },
    },
    create: {
      projectId,
      studentUserId,
      status: ProjectEnrollmentStatus.ENROLLED,
      enrolledAt: new Date(),
    },
    update: {},
  });
}

/**
 * Reset demo attempts for a student on a project so scenarios stay predictable.
 * @param {string} projectId
 * @param {string} studentUserId
 */
async function clearStudentAttempts(projectId, studentUserId) {
  const enrollment = await prisma.projectEnrollment.findUnique({
    where: { projectId_studentUserId: { projectId, studentUserId } },
    include: { attempts: true },
  });
  if (!enrollment) return;
  const workspaceIds = enrollment.attempts
    .map((a) => a.workspaceProjectId)
    .filter(Boolean);
  await prisma.projectAttempt.deleteMany({ where: { enrollmentId: enrollment.id } });
  for (const workspaceId of workspaceIds) {
    await prisma.project.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  await prisma.projectEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: ProjectEnrollmentStatus.ENROLLED,
      startedAt: null,
      submittedAt: null,
    },
  });
}

const PROCUREMENT_DEPTH = {
  fy: 1,
  budget: 2,
  plan: 3,
  requisition: 4,
  micro: 5,
  closed: 6,
};

async function adoptDemoProcessFlows(projectId) {
  for (const code of Object.values(PROCESS_FLOW_CODES)) {
    const flow = await prisma.projectOrgProcessFlow.findFirst({ where: { code } });
    if (!flow) continue;
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
}

/**
 * Write real procurement domain records into an organisation so live scoring
 * (process A–Z) is non-zero. Depth controls how far the path goes.
 *
 * @param {{
 *   orgId: string;
 *   depth: keyof typeof PROCUREMENT_DEPTH;
 *   academicSlateId?: string | null;
 *   tag?: string;
 * }} opts
 */
async function seedOrgProcurementWork(opts) {
  const { orgId, depth, academicSlateId = null, tag = "DEMO" } = opts;
  const level = PROCUREMENT_DEPTH[depth] || 1;
  const now = new Date();
  const stamp = tag.replace(/[^A-Z0-9]/gi, "").slice(-6) || "DEMO";

  await adoptDemoProcessFlows(orgId);

  let ict = await prisma.projectOrgDepartment.findFirst({
    where: { projectId: orgId, code: "ICT" },
  });
  if (!ict) {
    ict = await prisma.projectOrgDepartment.create({
      data: {
        projectId: orgId,
        name: "ICT",
        code: "ICT",
        unitType: OrgUnitType.DEPARTMENT,
        isActive: true,
      },
    });
  }

  const requester = await prisma.projectOrgUser.findFirst({
    where: { projectId: orgId, isProjectAdmin: true },
  });
  if (!requester) {
    throw new Error(`No organisation administrator on ${orgId}`);
  }

  let fy = await prisma.projectOrgFinancialYear.findFirst({
    where: { projectId: orgId, label: "2026/2027" },
  });
  if (!fy) {
    fy = await prisma.projectOrgFinancialYear.create({
      data: {
        projectId: orgId,
        label: "2026/2027",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2027-06-30"),
        isActive: true,
        description: "Demo financial year",
      },
    });
  } else if (!fy.isActive) {
    fy = await prisma.projectOrgFinancialYear.update({
      where: { id: fy.id },
      data: { isActive: true },
    });
  }

  let period = await prisma.projectOrgPlanningPeriod.findFirst({
    where: { projectId: orgId, financialYearId: fy.id },
  });
  if (!period) {
    period = await prisma.projectOrgPlanningPeriod.create({
      data: {
        projectId: orgId,
        financialYearId: fy.id,
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-31"),
        status: "OPEN",
      },
    });
  }

  if (level < PROCUREMENT_DEPTH.budget) return { orgId, fyId: fy.id };

  const budgetApproved = level >= PROCUREMENT_DEPTH.budget;
  let budget = await prisma.projectOrgBudget.findFirst({
    where: { projectId: orgId, financialYearId: fy.id, title: "ICT Capital Budget 2026/2027" },
  });
  const budgetData = {
    departmentId: ict.id,
    status: budgetApproved ? OrgBudgetStatus.APPROVED : OrgBudgetStatus.DRAFT,
    createdByOrgUserId: requester.id,
    submittedAt: budgetApproved ? now : null,
    approvedAt: budgetApproved ? now : null,
    approvedByOrgUserId: budgetApproved ? requester.id : null,
    orgAcademicSlateId: academicSlateId,
  };
  if (!budget) {
    budget = await prisma.projectOrgBudget.create({
      data: {
        projectId: orgId,
        financialYearId: fy.id,
        title: "ICT Capital Budget 2026/2027",
        description: "Demo ICT capital budget",
        budgetReference: `ICT-BUD-${stamp}`,
        ...budgetData,
      },
    });
  } else {
    budget = await prisma.projectOrgBudget.update({
      where: { id: budget.id },
      data: budgetData,
    });
  }

  let line = await prisma.projectOrgBudgetLine.findFirst({
    where: { projectId: orgId, financialYearId: fy.id, code: "ICT-CAPEX-01" },
  });
  if (!line) {
    line = await prisma.projectOrgBudgetLine.create({
      data: {
        projectId: orgId,
        budgetId: budget.id,
        financialYearId: fy.id,
        departmentId: ict.id,
        code: "ICT-CAPEX-01",
        name: "Computer Equipment",
        category: "ICT Equipment",
        approvedAmount: new Prisma.Decimal("800000000.00"),
        committedAmount: new Prisma.Decimal("0.00"),
        isActive: true,
      },
    });
  }

  if (level < PROCUREMENT_DEPTH.plan) return { orgId, fyId: fy.id, budgetId: budget.id };

  const planApproved = level >= PROCUREMENT_DEPTH.plan;
  let plan = await prisma.projectOrgProcurementPlan.findFirst({
    where: { projectId: orgId, title: "ICT Equipment Plan 2026/27" },
    include: { items: true },
  });
  if (!plan) {
    plan = await prisma.projectOrgProcurementPlan.create({
      data: {
        projectId: orgId,
        financialYearId: fy.id,
        planningPeriodId: period.id,
        departmentId: ict.id,
        planReference: `ICT-PP-${stamp}`,
        title: "ICT Equipment Plan 2026/27",
        status: planApproved ? OrgProcurementPlanStatus.APPROVED : OrgProcurementPlanStatus.DRAFT,
        createdByOrgUserId: requester.id,
        submittedAt: planApproved ? now : null,
        approvedAt: planApproved ? now : null,
        approvedByOrgUserId: planApproved ? requester.id : null,
        orgAcademicSlateId: academicSlateId,
        items: {
          create: [
            {
              itemNumber: 1,
              title: "Laptop Computers",
              description: "Business laptops for staff",
              category: "ICT Equipment",
              quantity: new Prisma.Decimal("20"),
              unitOfMeasure: "Unit",
              estimatedUnitPrice: new Prisma.Decimal("3500000.00"),
              estimatedTotal: new Prisma.Decimal("70000000.00"),
              budgetLineId: line.id,
              priority: "Normal",
              justification: "Presentation demo plan item.",
            },
          ],
        },
      },
      include: { items: true },
    });
  } else {
    plan = await prisma.projectOrgProcurementPlan.update({
      where: { id: plan.id },
      data: {
        status: planApproved ? OrgProcurementPlanStatus.APPROVED : OrgProcurementPlanStatus.DRAFT,
        submittedAt: planApproved ? now : null,
        approvedAt: planApproved ? now : null,
        approvedByOrgUserId: planApproved ? requester.id : null,
      },
      include: { items: true },
    });
  }
  const planItem = plan.items?.[0] || null;

  if (level < PROCUREMENT_DEPTH.requisition) {
    return { orgId, fyId: fy.id, budgetId: budget.id, planId: plan.id };
  }

  /**
   * @param {string} ref
   * @param {string} title
   * @param {import("@prisma/client").OrgProcurementMethod} method
   */
  async function upsertApprovedRequisition(ref, title, method) {
    let req = await prisma.projectOrgRequisition.findFirst({
      where: { projectId: orgId, requisitionReference: ref },
    });
    const reqData = {
      financialYearId: fy.id,
      departmentId: ict.id,
      procurementPlanId: plan.id,
      procurementPlanItemId: planItem?.id || null,
      budgetLineId: line.id,
      requesterOrgUserId: requester.id,
      title,
      category: "ICT Equipment",
      justification: "Presentation seed requisition.",
      needDescription: title,
      estimatedTotalValue: new Prisma.Decimal("70000000.00"),
      status: OrgRequisitionStatus.APPROVED,
      procurementMethod: method,
      submittedAt: now,
      approvedAt: now,
      approvedByOrgUserId: requester.id,
      orgAcademicSlateId: academicSlateId,
    };
    if (!req) {
      req = await prisma.projectOrgRequisition.create({
        data: {
          projectId: orgId,
          requisitionReference: ref,
          ...reqData,
          items: {
            create: [
              {
                lineNumber: 1,
                itemName: "Laptop Computers",
                quantity: new Prisma.Decimal("20"),
                unitOfMeasure: "Unit",
                estimatedUnitPrice: new Prisma.Decimal("3500000.00"),
                estimatedTotal: new Prisma.Decimal("70000000.00"),
              },
            ],
          },
        },
      });
    } else {
      req = await prisma.projectOrgRequisition.update({
        where: { id: req.id },
        data: reqData,
      });
    }
    return req;
  }

  /**
   * @param {string} reqId
   * @param {string} number
   * @param {import("@prisma/client").OrgProcurementMethod} method
   * @param {import("@prisma/client").OrgProcurementStatus} status
   */
  async function upsertProcurement(reqId, number, method, status) {
    let proc = await prisma.projectOrgProcurement.findFirst({
      where: { projectId: orgId, procurementNumber: number },
    });
    const procData = {
      financialYearId: fy.id,
      departmentId: ict.id,
      requisitionId: reqId,
      procurementPlanItemId: planItem?.id || null,
      budgetLineId: line.id,
      title: "Laptop Computers",
      procurementMethod: method,
      status,
      officerOrgUserId: requester.id,
      methodSelectedAt: now,
      closedAt: status === OrgProcurementStatus.CLOSED ? now : null,
      closedByOrgUserId: status === OrgProcurementStatus.CLOSED ? requester.id : null,
      orgAcademicSlateId: academicSlateId,
    };
    if (!proc) {
      proc = await prisma.projectOrgProcurement.create({
        data: {
          projectId: orgId,
          procurementNumber: number,
          ...procData,
        },
      });
    } else {
      proc = await prisma.projectOrgProcurement.update({
        where: { id: proc.id },
        data: procData,
      });
    }
    return proc;
  }

  const microReq = await upsertApprovedRequisition(
    `ICT-REQ-${stamp}-M`,
    "Laptops — micro procurement",
    OrgProcurementMethod.MICRO,
  );

  if (level === PROCUREMENT_DEPTH.requisition) {
    return { orgId, requisitionId: microReq.id };
  }

  if (level === PROCUREMENT_DEPTH.micro) {
    await upsertProcurement(
      microReq.id,
      `PROC-${stamp}-M`,
      OrgProcurementMethod.MICRO,
      OrgProcurementStatus.IN_PROGRESS,
    );
    return { orgId, requisitionId: microReq.id };
  }

  // Full close-out: micro closed + quotation awarded/closed so most A–Z processes score.
  await upsertProcurement(
    microReq.id,
    `PROC-${stamp}-M`,
    OrgProcurementMethod.MICRO,
    OrgProcurementStatus.CLOSED,
  );

  const quoteReq = await upsertApprovedRequisition(
    `ICT-REQ-${stamp}-Q`,
    "Laptops — quotation",
    OrgProcurementMethod.QUOTATION,
  );
  await upsertProcurement(
    quoteReq.id,
    `PROC-${stamp}-Q`,
    OrgProcurementMethod.QUOTATION,
    OrgProcurementStatus.CLOSED,
  );

  return { orgId, requisitionId: microReq.id };
}

/**
 * Seed-only: drop other in-progress attempts so one-project-at-a-time does not block fixtures.
 * @param {string} studentUserId
 * @param {string} keepProjectId
 */
async function clearOtherInProgressAttempts(studentUserId, keepProjectId) {
  const others = await prisma.projectAttempt.findMany({
    where: {
      status: {
        in: [ProjectAttemptStatus.IN_PROGRESS, ProjectAttemptStatus.RETURNED],
      },
      enrollment: {
        studentUserId,
        projectId: { not: keepProjectId },
      },
    },
    include: { enrollment: true },
  });
  for (const attempt of others) {
    await clearStudentAttempts(attempt.enrollment.projectId, studentUserId);
  }
}

/**
 * @param {string} projectId
 * @param {string} studentUserId
 * @param {'start' | 'submit' | 'grade_pass' | 'grade_fail'} scenario
 * @param {string} actorUserId
 * @param {{ bypassClosedWindow?: boolean }} [opts]
 */
async function applyAttemptScenario(projectId, studentUserId, scenario, actorUserId, opts = {}) {
  await ensureEnrollment(projectId, studentUserId);
  await clearOtherInProgressAttempts(studentUserId, projectId);
  await clearStudentAttempts(projectId, studentUserId);

  let restoredCloseAt = null;
  if (opts.bypassClosedWindow) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.closeAt && new Date(project.closeAt).getTime() < Date.now()) {
      restoredCloseAt = project.closeAt;
      await prisma.project.update({
        where: { id: projectId },
        data: { closeAt: new Date(Date.now() + 2 * 3600_000) },
      });
    }
  }

  try {
    const started = await startProjectAttempt({
      projectId,
      studentUserId,
      actorUserId: studentUserId,
    });
    const workspaceId = started.workspaceProjectId || started.attempt?.workspaceProjectId;
    if (!workspaceId) {
      throw new Error(`Attempt workspace missing for ${studentUserId} on ${projectId}`);
    }

    const depth =
      scenario === "start"
        ? "fy"
        : scenario === "submit"
          ? "micro"
          : scenario === "grade_fail"
            ? "budget"
            : "closed";

    await seedOrgProcurementWork({
      orgId: workspaceId,
      depth,
      academicSlateId: started.attempt?.academicSlateId || null,
      tag: `${String(studentUserId).slice(-4)}${scenario}`.toUpperCase(),
    });

    if (scenario === "start") {
      return started.attempt;
    }

    await submitProjectAttempt({
      attemptId: started.attempt.id,
      studentUserId,
      actorUserId: studentUserId,
    });

    const scored = await autoEvaluateProjectAttempt({
      attemptId: started.attempt.id,
      actorUserId,
    });

    const feedback =
      scenario === "grade_pass"
        ? "Solid procurement path. Budget, plan, requisition, and award trail are complete."
        : scenario === "grade_fail"
          ? "Incomplete procurement trail. Only budgeting is in place — finish planning and requisition."
          : null;

    if (feedback && scored?.grade?.id) {
      await prisma.projectAttemptGrade.update({
        where: { id: scored.grade.id },
        data: { feedback },
      });
    }

    return started.attempt;
  } finally {
    if (restoredCloseAt) {
      await prisma.project.update({
        where: { id: projectId },
        data: { closeAt: restoredCloseAt },
      });
    }
  }
}

async function main() {
  console.log("=== Proc Learn presentation seed ===\n");

  await ensureCoreProjectOrgRoles(prisma);
  for (const def of CORE_ORG_ROLE_DEFINITIONS) {
    await prisma.projectOrgRole.upsert({
      where: { name: def.name },
      create: {
        name: def.name,
        description: def.description,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      update: {
        description: def.description,
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
  }
  await ensureBaselineProcessTemplates(prisma);
  console.log("Catalogues: org roles + process workflows ready.");

  await ensureSystemAdmin();
  const programme = await ensureProgramme();
  const academic = await ensureCurrentAcademicContext(prisma);
  if (!academic.academicYear?.id) {
    throw new Error("Could not ensure academic year.");
  }
  console.log(
    `Academic: ${academic.academicYear.label} · programme ${programme.shortName}`,
  );

  const examiners = [];
  for (const spec of EXAMINERS) {
    examiners.push(await upsertExaminer(spec));
  }
  console.log(`Examiners: ${examiners.map((e) => e.email).join(", ")}`);
  const examiner = examiners[0];
  const examiner2 = examiners[1];

  /** @type {{ user: any; org: any }[]} */
  const studentRows = [];
  for (const spec of STUDENTS) {
    studentRows.push(
      await upsertStudent(
        spec,
        programme.id,
        academic.academicYear.label,
        academic.academicYear.id,
      ),
    );
  }
  console.log(`Students + personal orgs: ${studentRows.length}`);
  console.log("Seeding default organisation procurement work…");
  const personalDepths = [
    "closed",
    "plan",
    "budget",
    "micro",
    "fy",
    "closed",
    "requisition",
    "fy",
    "plan",
    "budget",
  ];
  for (let i = 0; i < studentRows.length; i += 1) {
    const orgId = studentRows[i].org?.id;
    if (!orgId) continue;
    await seedOrgProcurementWork({
      orgId,
      depth: personalDepths[i] || "fy",
      tag: `PERS${String(i + 1).padStart(2, "0")}`,
    });
  }

  const now = new Date();
  const day = 24 * 3600_000;
  const openPast = new Date(now.getTime() - 2 * day);
  const closeFuture = new Date(now.getTime() + 21 * day);
  const closePast = new Date(now.getTime() - day);

  // --- Projects ---
  const practiceOpen = await upsertDemoProject({
    ownerUserId: examiner.id,
    name: `${DEMO_TAG} Practice Lab — Micro Procurement`,
    purpose: ProjectPurpose.PRACTICE,
    organizationName: "MUBS Practice Supplies Unit",
    description: "Open practice workspace for learning the micro-procurement path.",
    instructions:
      "<p>Use <strong>My Organisation</strong> after you start. Create a financial year, budget, and a micro procurement requisition.</p>",
    questionText:
      "<p>Demonstrate a complete <em>micro procurement</em> flow for stationery worth UGX 1,500,000.</p>",
    durationSeconds: null,
    maxAttempts: null,
    isPublished: true,
    openAt: openPast,
    closeAt: closeFuture,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  const practiceTimed = await upsertDemoProject({
    ownerUserId: examiner.id,
    name: `${DEMO_TAG} Timed Practice — Planning Sprint`,
    purpose: ProjectPurpose.PRACTICE,
    organizationName: "Campus Planning Demo Org",
    description: "Timed practice (2 hours) with up to 3 attempts.",
    instructions: "<p>Complete planning period setup and an approved procurement plan.</p>",
    questionText: "<p>Produce an approved plan covering at least two items.</p>",
    durationSeconds: 2 * 3600,
    maxAttempts: 3,
    isPublished: true,
    openAt: openPast,
    closeAt: closeFuture,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  const assessmentLive = await upsertDemoProject({
    ownerUserId: examiner.id,
    name: `${DEMO_TAG} Midterm Procurement Assessment`,
    purpose: ProjectPurpose.ASSESSMENT,
    organizationName: "MUBS Examination Procurement Bureau",
    description: "Live timed assessment for the current academic year (scoring on).",
    instructions:
      "<p>You are locked into this organisation until the window closes. Follow the question carefully.</p><ol><li>Set up FY and budget</li><li>Raise a requisition</li><li>Complete micro procurement</li></ol>",
    questionText:
      "<p><strong>Case:</strong> The faculty needs 20 laptops under micro procurement. Show the full process trail.</p>",
    durationSeconds: 3 * 3600,
    maxAttempts: 1,
    isPublished: true,
    openAt: openPast,
    closeAt: closeFuture,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  const assessmentReleased = await upsertDemoProject({
    ownerUserId: examiner.id,
    name: `${DEMO_TAG} Continuous Assessment (results released)`,
    purpose: ProjectPurpose.ASSESSMENT,
    organizationName: "School of Business Procurement Cell",
    description: "Closed assessment with published results for demos.",
    instructions: "<p>This window has closed. Results are released for student viewing.</p>",
    questionText: "<p>Complete a quotation-based procurement for conference catering.</p>",
    durationSeconds: 90 * 60,
    maxAttempts: 1,
    isPublished: true,
    openAt: new Date(now.getTime() - 14 * day),
    closeAt: closePast,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  const assessmentDraft = await upsertDemoProject({
    ownerUserId: examiner2.id,
    name: `${DEMO_TAG} Draft Assessment (unpublished)`,
    purpose: ProjectPurpose.ASSESSMENT,
    organizationName: "Draft Org — Not Visible Yet",
    description: "Unpublished assessment — students should not see this in catalog.",
    instructions: "<p>Draft only.</p>",
    questionText: "<p>Draft question.</p>",
    durationSeconds: 60 * 60,
    maxAttempts: 2,
    isPublished: false,
    openAt: openPast,
    closeAt: closeFuture,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  const practiceQuiet = await upsertDemoProject({
    ownerUserId: examiner2.id,
    name: `${DEMO_TAG} Optional Practice — Budgets Only`,
    purpose: ProjectPurpose.PRACTICE,
    organizationName: "Budget Skills Demo Org",
    description: "Published practice with no students started yet (empty participation).",
    instructions: "<p>Focus on budgets and financial years only.</p>",
    questionText: "<p>Create FY 2026/2027 and a balanced budget.</p>",
    durationSeconds: null,
    maxAttempts: 5,
    isPublished: true,
    openAt: openPast,
    closeAt: closeFuture,
    academicYearId: academic.academicYear.id,
    programmeId: programme.id,
  });

  console.log("Demo projects upserted.");

  // Assessment scoring configs
  for (const project of [assessmentLive, assessmentReleased, assessmentDraft]) {
    const assessment = await getOrCreateProjectAssessment(prisma, {
      projectId: project.id,
      createIfMissing: true,
      scoringEnabled: true,
    });
    await prisma.projectAssessment.update({
      where: { id: assessment.id },
      data: {
        scoringEnabled: true,
        gradingMode: AssessmentGradingMode.AUTOMATIC,
        manualMaxMarks: 0,
        passMarkPercent: 50,
        totalMarks: 100,
        resultsReleased: project.id === assessmentReleased.id,
      },
    });
  }
  // Practice timed: scoring optional/off
  await getOrCreateProjectAssessment(prisma, {
    projectId: practiceTimed.id,
    createIfMissing: true,
    scoringEnabled: false,
  });
  await prisma.projectAssessment.updateMany({
    where: { projectId: practiceTimed.id },
    data: { scoringEnabled: false, resultsReleased: false },
  });

  const s = studentRows.map((r) => r.user);

  const demoProjectIds = [
    practiceOpen.id,
    practiceTimed.id,
    assessmentLive.id,
    assessmentReleased.id,
    assessmentDraft.id,
    practiceQuiet.id,
  ];

  // Fresh scenario slate on every seed run (keeps re-runs predictable)
  console.log("Resetting prior demo attempts…");
  for (const projectId of demoProjectIds) {
    for (const row of studentRows) {
      await clearStudentAttempts(projectId, row.user.id);
    }
  }
  // Clear assessment org locks pointing at wiped workspaces
  for (const row of studentRows) {
    if (row.org?.id) {
      await persistStudentActiveOrg(prisma, row.user.id, row.org.id);
    }
  }

  // Enroll everyone on key published projects for catalog realism
  for (const row of studentRows) {
    await ensureEnrollment(practiceOpen.id, row.user.id);
    await ensureEnrollment(assessmentLive.id, row.user.id);
    await ensureEnrollment(assessmentReleased.id, row.user.id);
  }

  console.log("Applying practice / assessment scenarios…");

  // Order matters: open Assessment locks block starting other projects.
  // 1) Practice finished work
  await applyAttemptScenario(practiceOpen.id, s[2].id, "submit", examiner.id);
  await applyAttemptScenario(practiceOpen.id, s[3].id, "submit", examiner.id);
  await applyAttemptScenario(practiceTimed.id, s[6].id, "submit", examiner.id);

  // 2) Closed assessment with released results (window bypassed)
  await applyAttemptScenario(assessmentReleased.id, s[0].id, "grade_pass", examiner.id, {
    bypassClosedWindow: true,
  });
  await applyAttemptScenario(assessmentReleased.id, s[1].id, "grade_pass", examiner.id, {
    bypassClosedWindow: true,
  });
  await applyAttemptScenario(assessmentReleased.id, s[2].id, "grade_fail", examiner.id, {
    bypassClosedWindow: true,
  });
  await applyAttemptScenario(assessmentReleased.id, s[3].id, "grade_pass", examiner.id, {
    bypassClosedWindow: true,
  });
  await applyAttemptScenario(assessmentReleased.id, s[5].id, "grade_fail", examiner.id, {
    bypassClosedWindow: true,
  });
  await applyAttemptScenario(assessmentReleased.id, s[6].id, "grade_pass", examiner.id, {
    bypassClosedWindow: true,
  });

  // Quiet practice: enroll only
  await ensureEnrollment(practiceQuiet.id, s[7].id);
  await ensureEnrollment(practiceQuiet.id, s[8].id);

  // 3) In-progress practice (students who will not also hold open-assessment locks)
  await applyAttemptScenario(practiceOpen.id, s[9].id, "start", examiner.id);
  await applyAttemptScenario(practiceTimed.id, s[8].id, "start", examiner.id);

  // 4) Live open assessment last (locks those students into the assessment org)
  await applyAttemptScenario(assessmentLive.id, s[1].id, "submit", examiner.id);
  await applyAttemptScenario(assessmentLive.id, s[2].id, "grade_pass", examiner.id);
  await applyAttemptScenario(assessmentLive.id, s[3].id, "grade_fail", examiner.id);
  await applyAttemptScenario(assessmentLive.id, s[4].id, "start", examiner.id);
  await applyAttemptScenario(assessmentLive.id, s[0].id, "start", examiner.id);
  {
    const enrollment = await prisma.projectEnrollment.findUnique({
      where: {
        projectId_studentUserId: {
          projectId: assessmentLive.id,
          studentUserId: s[0].id,
        },
      },
      include: {
        attempts: {
          where: { status: ProjectAttemptStatus.IN_PROGRESS },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    const ws = enrollment?.attempts?.[0]?.workspaceProjectId;
    if (ws) await persistStudentActiveOrg(prisma, s[0].id, ws);
  }

  // Personal orgs stay for all students (default organisations)
  const personalCount = await prisma.project.count({
    where: {
      isPersonalOrg: true,
      ownerUserId: { in: s.map((u) => u.id) },
    },
  });

  console.log("\n=== Presentation seed complete ===\n");
  console.log("Accounts (password change not required for demo users):");
  console.log(`  System admin  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  console.log(`  Examiner      ${examiner.email}  /  ${EXAMINER_PASSWORD}`);
  console.log(`  Examiner      ${examiner2.email}  /  ${EXAMINER_PASSWORD}`);
  console.log(`  Students      ${STUDENTS[0].email} … ${STUDENTS[STUDENTS.length - 1].email}`);
  console.log(`                 password for all students: ${STUDENT_PASSWORD}`);
  console.log("\nScenarios:");
  console.log(`  • ${practiceOpen.name}`);
  console.log("      submitted + in-progress + enrolled-not-started");
  console.log(`  • ${practiceTimed.name}`);
  console.log("      timed practice, max 3 attempts");
  console.log(`  • ${assessmentLive.name}`);
  console.log(`      live assessment; ${s[0].email} is IN PROGRESS (org-locked on login)`);
  console.log(`  • ${assessmentReleased.name}`);
  console.log("      closed + results released (pass/fail mix)");
  console.log(`  • ${assessmentDraft.name}`);
  console.log("      unpublished draft (hidden from students)");
  console.log(`  • ${practiceQuiet.name}`);
  console.log("      empty participation");
  console.log(`\nPersonal organisations created/refreshed: ${personalCount}`);
  console.log("Tip: re-run with --reset-demo-passwords to restore demo passwords.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
