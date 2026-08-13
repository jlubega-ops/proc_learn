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
  AttemptGradeStatus,
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
import { ensureBaselineProcessTemplates } from "../src/lib/projects/process-catalogue.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { ensureActiveEnrollment } from "../src/lib/academic/student-enrollment.js";
import { ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { generateUniqueProjectCode } from "../src/lib/projects/project-identity.js";
import {
  startProjectAttempt,
  submitProjectAttempt,
} from "../src/lib/academic/project-attempts.js";
import {
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
 *   semesterId: string;
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
    semesterId: p.semesterId,
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

/**
 * @param {string} attemptId
 * @param {string} assessmentId
 * @param {string} actorUserId
 * @param {boolean} pass
 * @param {string} feedback
 */
async function forceDemoGrade(attemptId, assessmentId, actorUserId, pass, feedback) {
  const score = pass ? 78 : 38;
  await prisma.projectAttemptGrade.upsert({
    where: { attemptId },
    create: {
      attemptId,
      assessmentId,
      autoScore: score,
      manualScore: null,
      finalScore: score,
      finalPercent: score,
      passFail: pass ? "PASS" : "FAIL",
      status: AttemptGradeStatus.GRADED,
      feedback,
      gradedByUserId: actorUserId,
      gradedAt: new Date(),
      autoEvaluatedAt: new Date(),
    },
    update: {
      autoScore: score,
      finalScore: score,
      finalPercent: score,
      passFail: pass ? "PASS" : "FAIL",
      status: AttemptGradeStatus.GRADED,
      feedback,
      gradedByUserId: actorUserId,
      gradedAt: new Date(),
      autoEvaluatedAt: new Date(),
    },
  });
  await prisma.projectAttempt.update({
    where: { id: attemptId },
    data: { status: ProjectAttemptStatus.COMPLETED },
  });
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
    if (scenario === "start") {
      return started.attempt;
    }

    await submitProjectAttempt({
      attemptId: started.attempt.id,
      studentUserId,
      actorUserId: studentUserId,
    });

    if (scenario === "submit") {
      return started.attempt;
    }

    const assessment = await getOrCreateProjectAssessment(prisma, {
      projectId,
      createIfMissing: true,
      scoringEnabled: true,
    });
    if (!assessment?.id) {
      throw new Error(`No assessment config for project ${projectId}`);
    }

    await forceDemoGrade(
      started.attempt.id,
      assessment.id,
      actorUserId,
      scenario === "grade_pass",
      scenario === "grade_pass"
        ? "Solid procurement path. Keep documenting approvals clearly."
        : "Incomplete procurement trail. Revisit requisition and approval steps.",
    );

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
  if (!academic.academicYear?.id || !academic.semester?.id) {
    throw new Error("Could not ensure academic year / semester.");
  }
  console.log(
    `Academic: ${academic.academicYear.label} · ${academic.semester.name} · programme ${programme.shortName}`,
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
    semesterId: academic.semester.id,
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
    semesterId: academic.semester.id,
    programmeId: programme.id,
  });

  const assessmentLive = await upsertDemoProject({
    ownerUserId: examiner.id,
    name: `${DEMO_TAG} Midterm Procurement Assessment`,
    purpose: ProjectPurpose.ASSESSMENT,
    organizationName: "MUBS Examination Procurement Bureau",
    description: "Live timed assessment for the current semester (scoring on).",
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
    semesterId: academic.semester.id,
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
    semesterId: academic.semester.id,
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
    semesterId: academic.semester.id,
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
    semesterId: academic.semester.id,
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
        gradingMode: AssessmentGradingMode.COMBINED,
        manualMaxMarks: 20,
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
