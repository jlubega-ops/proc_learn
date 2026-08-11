/**
 * Phase 2 acceptance: StudentAcademicEnrollment, join current AY, history preservation,
 * exclusivity / duplicate prevention, concurrent join safety, student context.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase2-academic-enrollment-acceptance.mjs
 */
import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import {
  ensureCurrentAcademicContext,
  setCurrentAcademicYear,
  activateSemester,
} from "../src/lib/academic/academic-context.js";
import {
  ensureEnrollmentFromProfileLabel,
  getStudentAcademicContext,
  joinCurrentAcademicYear,
  listEnrollmentsForUser,
} from "../src/lib/academic/student-enrollment.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n=== Phase 2 academic enrollment acceptance ===\n");

  const stamp = Date.now();
  const labelPrev = "2080/2081";
  const labelCurr = "2081/2082";
  const email = `2081${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2081${String(stamp).slice(-6)}`;

  // Cleanup prior leftovers for this stamp only (best-effort)
  await prisma.user
    .deleteMany({
      where: {
        OR: [
          { email },
          { studentProfile: { studentNumber } },
        ],
      },
    })
    .catch(() => {});

  const seeded = await ensureCurrentAcademicContext();
  assert(Boolean(seeded.academicYear?.id), "University current year exists");
  assert(Boolean(seeded.semester?.id), "University active semester exists");

  // Dedicated previous + current years for isolation
  let yearPrev = await prisma.academicYear.findUnique({ where: { label: labelPrev } });
  if (!yearPrev) {
    yearPrev = await prisma.academicYear.create({
      data: {
        label: labelPrev,
        startDate: new Date("2080-08-01"),
        endDate: new Date("2081-07-31"),
        isCurrent: false,
      },
    });
  }
  let yearCurr = await prisma.academicYear.findUnique({ where: { label: labelCurr } });
  if (!yearCurr) {
    yearCurr = await prisma.academicYear.create({
      data: {
        label: labelCurr,
        startDate: new Date("2081-08-01"),
        endDate: new Date("2082-07-31"),
        isCurrent: false,
      },
    });
  }
  await setCurrentAcademicYear(prisma, yearCurr.id);
  let sem = await prisma.semester.findFirst({
    where: { academicYearId: yearCurr.id, name: "Semester 1" },
  });
  if (!sem) {
    sem = await prisma.semester.create({
      data: {
        academicYearId: yearCurr.id,
        name: "Semester 1",
        startDate: new Date("2081-08-01"),
        endDate: new Date("2082-01-15"),
        isActive: false,
      },
    });
  }
  await activateSemester(prisma, sem.id);

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase2 Test Programme", shortName: "P2TP", isActive: true },
    });
  }

  // 1) New student with enrollment from label (previous year)
  const { insertPendingStudentUser } = await import("../src/lib/student-insert.js");
  const user = await insertPendingStudentUser(prisma, {
    email,
    firstName: "Phase",
    lastName: "Two",
    middleName: null,
    studentNumber,
    registrationNumber: `REG-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: labelPrev,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(user?.id), "New student created with enrollment path");
  if (!user) {
    process.exit(1);
  }

  let enrollments = await listEnrollmentsForUser(prisma, user.id);
  assert(enrollments.length === 1, "New student has exactly one enrollment", `n=${enrollments.length}`);
  assert(enrollments[0]?.status === AcademicEnrollmentStatus.ACTIVE, "Enrollment is ACTIVE");
  assert(enrollments[0]?.academicYearId === yearPrev.id, "Enrollment is previous year");
  assert(
    enrollments[0]?.participationType === AcademicParticipationType.STUDENT,
    "Participation type is STUDENT",
  );

  // 2–4) Belongs to previous; not current → join prompt
  let ctx = await getStudentAcademicContext(user.id);
  assert(ctx.academicYear?.id === yearCurr.id, "Context university year is current");
  assert(ctx.semester?.id === sem.id, "Context semester is active semester");
  assert(ctx.enrolledInCurrentYear === false, "Student not enrolled in current year");
  assert(Boolean(ctx.joinPrompt), "Join prompt present for previous-year student");
  assert(ctx.joinPrompt?.previousLabel === labelPrev, "Join prompt shows previous label");
  assert(ctx.joinPrompt?.currentLabel === labelCurr, "Join prompt shows current label");

  // 5–7) Join current — previous preserved, context updates
  const join1 = await joinCurrentAcademicYear(user.id);
  assert(join1.enrollment?.academicYearId === yearCurr.id, "Joined current academic year");
  assert(join1.alreadyActive === false, "First join is not alreadyActive");

  enrollments = await listEnrollmentsForUser(prisma, user.id);
  assert(enrollments.length === 2, "Both previous and current enrollments exist", `n=${enrollments.length}`);
  const hist = enrollments.find((e) => e.academicYearId === yearPrev.id);
  const curr = enrollments.find((e) => e.academicYearId === yearCurr.id);
  assert(hist?.status === AcademicEnrollmentStatus.HISTORICAL, "Previous enrollment preserved as HISTORICAL");
  assert(Boolean(hist?.endedAt), "Historical enrollment has endedAt");
  assert(curr?.status === AcademicEnrollmentStatus.ACTIVE, "Current enrollment is ACTIVE");

  ctx = await getStudentAcademicContext(user.id);
  assert(ctx.enrolledInCurrentYear === true, "Student enrolled in current year after join");
  assert(ctx.joinPrompt === null, "No join prompt when enrolled in current year");
  assert(ctx.enrollment?.academicYearId === yearCurr.id, "Active enrollment matches current year");
  assert(ctx.semester?.id === sem.id, "Semester resolution still correct");

  const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id } });
  assert(profile?.academicYearLabel === labelCurr, "Profile label synced to current year");

  // 3 / 8) Already enrolled — idempotent join
  const join2 = await joinCurrentAcademicYear(user.id);
  assert(join2.alreadyActive === true, "Second join reports alreadyActive");
  enrollments = await listEnrollmentsForUser(prisma, user.id);
  assert(enrollments.length === 2, "Idempotent join does not duplicate enrollments", `n=${enrollments.length}`);
  const activeCount = await prisma.studentAcademicEnrollment.count({
    where: { userId: user.id, status: AcademicEnrollmentStatus.ACTIVE },
  });
  assert(activeCount === 1, "Exactly one ACTIVE enrollment after idempotent join");

  // 8) Duplicate prevention via unique constraint path
  let duplicateBlocked = false;
  try {
    await prisma.studentAcademicEnrollment.create({
      data: {
        userId: user.id,
        academicYearId: yearCurr.id,
        status: AcademicEnrollmentStatus.ACTIVE,
        participationType: AcademicParticipationType.STUDENT,
      },
    });
  } catch {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, "DB unique constraint blocks duplicate (userId, academicYearId)");

  // 9) Concurrent join attempts — another student
  const email2 = `2082${String(stamp).slice(-6)}@mubs.ac.ug`;
  const sn2 = `2082${String(stamp).slice(-6)}`;
  const user2 = await insertPendingStudentUser(prisma, {
    email: email2,
    firstName: "Concurrent",
    lastName: "Join",
    middleName: null,
    studentNumber: sn2,
    registrationNumber: `REG2-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: labelPrev,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(user2?.id), "Concurrent test student created");
  if (user2) {
    const outcomes = await Promise.all([
      joinCurrentAcademicYear(user2.id),
      joinCurrentAcademicYear(user2.id),
      joinCurrentAcademicYear(user2.id),
    ]);
    assert(
      outcomes.every((o) => o.enrollment?.academicYearId === yearCurr.id),
      "Concurrent joins all resolve to current year",
    );
    const n = await prisma.studentAcademicEnrollment.count({
      where: { userId: user2.id, academicYearId: yearCurr.id },
    });
    assert(n === 1, "Concurrent joins leave a single enrollment row for current year", `n=${n}`);
    const act = await prisma.studentAcademicEnrollment.count({
      where: { userId: user2.id, status: AcademicEnrollmentStatus.ACTIVE },
    });
    assert(act === 1, "Concurrent joins leave exactly one ACTIVE enrollment", `n=${act}`);
  }

  // 10) Historical accessible
  const historical = await prisma.studentAcademicEnrollment.findMany({
    where: { userId: user.id, status: AcademicEnrollmentStatus.HISTORICAL },
  });
  assert(historical.length >= 1, "Historical enrollments remain queryable");

  // 1b) Student with no enrollment at all (legacy path) → backfill / join
  const email3 = `2083${String(stamp).slice(-6)}@mubs.ac.ug`;
  const sn3 = `2083${String(stamp).slice(-6)}`;
  const legacy = await prisma.user.create({
    data: {
      email: email3,
      firstName: "Legacy",
      lastName: "Student",
      passwordHash: "x",
      userRoles: { create: [{ role: "STUDENT" }] },
      settings: { create: { theme: "light", activeRole: "STUDENT" } },
      studentProfile: {
        create: {
          studentNumber: sn3,
          registrationNumber: `REGL-${stamp}`,
          programmeId: programme.id,
          yearOfStudy: 2,
          academicYearLabel: labelPrev,
        },
      },
    },
  });
  assert(
    (await prisma.studentAcademicEnrollment.count({ where: { userId: legacy.id } })) === 0,
    "Legacy student starts with no enrollment rows",
  );
  const legacyCtx = await getStudentAcademicContext(legacy.id);
  assert(
    Boolean(legacyCtx.enrollment) || Boolean(legacyCtx.joinPrompt),
    "Legacy student gets backfill and/or join prompt",
  );
  assert(
    (await prisma.studentAcademicEnrollment.count({ where: { userId: legacy.id } })) >= 1,
    "Legacy student backfilled enrollment from profile label",
  );

  // Audit event keys present
  for (const ev of [
    AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_CREATED,
    AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_JOINED_YEAR,
    AuditEvent.STUDENT_ACADEMIC_ENROLLMENT_MARKED_HISTORICAL,
  ]) {
    assert(typeof ev === "string" && ev.length > 0, `AuditEvent ${ev} defined`);
  }

  // Restore a sensible current context for the app
  const real = await prisma.academicYear.findFirst({
    where: { label: { notIn: [labelPrev, labelCurr] } },
    orderBy: { label: "desc" },
  });
  if (real) {
    await setCurrentAcademicYear(prisma, real.id);
    const realSem = await prisma.semester.findFirst({
      where: { academicYearId: real.id },
      orderBy: { startDate: "asc" },
    });
    if (realSem) await activateSemester(prisma, realSem.id);
  } else {
    await ensureCurrentAcademicContext();
  }

  // Cleanup test users (cascade enrollments)
  await prisma.user.deleteMany({
    where: { id: { in: [user.id, user2?.id, legacy.id].filter(Boolean) } },
  });

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
