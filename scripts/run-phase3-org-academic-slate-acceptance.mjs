/**
 * Phase 3 acceptance: OrgAcademicSlate over durable My Organisation.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase3-org-academic-slate-acceptance.mjs
 */
import {
  OrgAcademicSlateStatus,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import {
  activateSemester,
  ensureCurrentAcademicContext,
  setCurrentAcademicYear,
} from "../src/lib/academic/academic-context.js";
import {
  getStudentAcademicContext,
  joinCurrentAcademicYear,
} from "../src/lib/academic/student-enrollment.js";
import {
  ensureOrgAcademicSlate,
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "../src/lib/academic/org-academic-slate.js";
import { ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n=== Phase 3 OrgAcademicSlate acceptance ===\n");

  const stamp = Date.now();
  const labelA = "2070/2071";
  const labelB = "2071/2072";
  const email = `2070${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2070${String(stamp).slice(-6)}`;

  await prisma.user
    .deleteMany({ where: { OR: [{ email }, { studentProfile: { studentNumber } }] } })
    .catch(() => {});

  await ensureCurrentAcademicContext();

  let yearA = await prisma.academicYear.findUnique({ where: { label: labelA } });
  if (!yearA) {
    yearA = await prisma.academicYear.create({
      data: {
        label: labelA,
        startDate: new Date("2070-08-01"),
        endDate: new Date("2071-07-31"),
        isCurrent: false,
      },
    });
  }
  let yearB = await prisma.academicYear.findUnique({ where: { label: labelB } });
  if (!yearB) {
    yearB = await prisma.academicYear.create({
      data: {
        label: labelB,
        startDate: new Date("2071-08-01"),
        endDate: new Date("2072-07-31"),
        isCurrent: false,
      },
    });
  }
  await setCurrentAcademicYear(prisma, yearB.id);
  let sem = await prisma.semester.findFirst({
    where: { academicYearId: yearB.id, name: "Semester 1" },
  });
  if (!sem) {
    sem = await prisma.semester.create({
      data: {
        academicYearId: yearB.id,
        name: "Semester 1",
        startDate: new Date("2071-08-01"),
        endDate: new Date("2072-01-15"),
        isActive: false,
      },
    });
  }
  await activateSemester(prisma, sem.id);

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase3 Test Programme", shortName: "P3TP", isActive: true },
    });
  }

  const { insertPendingStudentUser } = await import("../src/lib/student-insert.js");
  const user = await insertPendingStudentUser(prisma, {
    email,
    firstName: "Phase",
    lastName: "Three",
    middleName: null,
    studentNumber,
    registrationNumber: `REGP3-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: labelA,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(user?.id), "Student created");
  if (!user) process.exit(1);

  const org = await ensureStudentPersonalOrg(prisma, user.id);
  assert(Boolean(org?.id), "My Organisation exists");
  assert(Boolean(org?.isPersonalOrg), "Organisation is personal org");
  const orgId = org.id;

  const enrollmentA = await prisma.studentAcademicEnrollment.findFirst({
    where: { userId: user.id, academicYearId: yearA.id },
  });
  assert(Boolean(enrollmentA?.id), "Enrollment for year A exists");

  // 1) New enrollment gets a slate
  const ensure1 = await ensureOrgAcademicSlate(prisma, {
    projectId: orgId,
    enrollmentId: enrollmentA.id,
    academicYearId: yearA.id,
    semesterId: null,
  });
  assert(Boolean(ensure1.slate?.id), "New enrollment gets a slate");
  assert(ensure1.slate.projectId === orgId, "Slate bound to same My Organisation");
  assert(ensure1.slate.status === OrgAcademicSlateStatus.CURRENT, "New slate is CURRENT");
  const slateAId = ensure1.slate.id;

  // 2) Existing enrollment gets the same slate
  const ensure2 = await ensureOrgAcademicSlate(prisma, {
    projectId: orgId,
    enrollmentId: enrollmentA.id,
    academicYearId: yearA.id,
  });
  assert(ensure2.slate.id === slateAId, "Existing enrollment returns same slate");
  assert(ensure2.created === false, "Second ensure does not create duplicate");

  // 3) Duplicate slate blocked
  let dupBlocked = false;
  try {
    await prisma.orgAcademicSlate.create({
      data: {
        projectId: orgId,
        enrollmentId: enrollmentA.id,
        academicYearId: yearA.id,
        status: OrgAcademicSlateStatus.CURRENT,
      },
    });
  } catch {
    dupBlocked = true;
  }
  assert(dupBlocked, "Duplicate slate for same enrollment is blocked");

  // Stamp sample budget on slate A
  const fy =
    (await prisma.projectOrgFinancialYear.findFirst({ where: { projectId: orgId } })) ||
    (await prisma.projectOrgFinancialYear.create({
      data: {
        projectId: orgId,
        label: "2070/2071",
        startDate: new Date("2070-07-01"),
        endDate: new Date("2071-06-30"),
        isActive: true,
      },
    }));

  const budgetOnA = await prisma.projectOrgBudget.create({
    data: {
      projectId: orgId,
      financialYearId: fy.id,
      title: `P3 Budget A ${stamp}`,
      currency: "UGX",
      orgAcademicSlateId: slateAId,
    },
  });
  assert(budgetOnA.orgAcademicSlateId === slateAId, "Procurement header can bind to slate");

  // 4–6) Join year B → new slate, same org, previous historical
  await setCurrentAcademicYear(prisma, yearB.id);
  await activateSemester(prisma, sem.id);
  const join = await joinCurrentAcademicYear(user.id);
  assert(join.enrollment?.academicYearId === yearB.id, "Joined academic year B");
  assert(Boolean(join.orgAcademicSlate?.id), "Join opens org academic slate");
  assert(join.orgAcademicSlate.projectId === orgId, "Same My Organisation after join");
  assert(join.orgAcademicSlate.id !== slateAId, "Different years have different slates");

  const slateAAfter = await prisma.orgAcademicSlate.findUnique({ where: { id: slateAId } });
  assert(
    slateAAfter?.status === OrgAcademicSlateStatus.HISTORICAL,
    "Previous slate remains historical",
  );
  assert(Boolean(slateAAfter?.closedAt), "Historical slate has closedAt");

  const orgAgain = await ensureStudentPersonalOrg(prisma, user.id);
  assert(orgAgain.id === orgId, "My Organisation id unchanged across years");

  // 7) Current context resolves correct slate
  const ctx = await getStudentAcademicContext(user.id);
  assert(ctx.orgAcademicSlate?.id === join.orgAcademicSlate.id, "Context resolves current slate");
  assert(ctx.semester?.id === sem.id, "Context still resolves active semester");
  assert(ctx.enrollment?.academicYearId === yearB.id, "Context enrollment is year B");

  const currentId = await resolveCurrentOrgSlateId(prisma, orgId);
  assert(currentId === join.orgAcademicSlate.id, "resolveCurrentOrgSlateId matches");

  // 8) List filter: current OR null — hides historical slate A budgets, keeps null/legacy
  const legacyBudget = await prisma.projectOrgBudget.create({
    data: {
      projectId: orgId,
      financialYearId: fy.id,
      title: `P3 Legacy ${stamp}`,
      currency: "UGX",
      orgAcademicSlateId: null,
    },
  });
  const listWhere = {
    projectId: orgId,
    ...orgOpsSlateListWhere(currentId),
  };
  const listed = await prisma.projectOrgBudget.findMany({ where: listWhere });
  const listedIds = new Set(listed.map((b) => b.id));
  assert(listedIds.has(legacyBudget.id), "List includes legacy null slate rows");
  assert(!listedIds.has(budgetOnA.id), "List excludes previous-year stamped rows");
  assert(
    listed.every(
      (b) => b.orgAcademicSlateId === null || b.orgAcademicSlateId === currentId,
    ),
    "Listed budgets are current slate or null only",
  );

  // Stamp create path association for year B
  const budgetB = await prisma.projectOrgBudget.create({
    data: {
      projectId: orgId,
      financialYearId: fy.id,
      title: `P3 Budget B ${stamp}`,
      currency: "UGX",
      orgAcademicSlateId: currentId,
    },
  });
  assert(budgetB.orgAcademicSlateId === currentId, "New ops associate with current slate");

  // Audit keys
  for (const ev of [
    AuditEvent.ORG_ACADEMIC_SLATE_CREATED,
    AuditEvent.ORG_ACADEMIC_SLATE_MARKED_HISTORICAL,
  ]) {
    assert(typeof ev === "string" && ev.length > 0, `AuditEvent ${ev} defined`);
  }

  // Restore app current year
  const real = await prisma.academicYear.findFirst({
    where: { label: { notIn: [labelA, labelB] } },
    orderBy: { label: "desc" },
  });
  if (real) {
    await setCurrentAcademicYear(prisma, real.id);
    const realSem = await prisma.semester.findFirst({ where: { academicYearId: real.id } });
    if (realSem) await activateSemester(prisma, realSem.id);
  } else {
    await ensureCurrentAcademicContext();
  }

  await prisma.user.delete({ where: { id: user.id } });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPassed: ${passed}  Failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
