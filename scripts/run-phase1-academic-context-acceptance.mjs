/**
 * Phase 1 acceptance: AcademicYear / Semester exclusivity, Course / ClassCohort CRUD-level
 * helpers, current academic context resolver, audit events present.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase1-academic-context-acceptance.mjs
 */
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent, writeAuditLog } from "../src/lib/audit-log.js";
import {
  activateSemester,
  ensureCurrentAcademicContext,
  getCurrentAcademicContext,
  normalizeAcademicYearLabel,
  setCurrentAcademicYear,
  validateAcademicYearInput,
} from "../src/lib/academic/academic-context.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n=== Phase 1 academic context acceptance ===\n");

  const stamp = Date.now();
  const labelA = `2090/${2091}`;
  const labelB = `2091/${2092}`;

  // Cleanup any prior phase1 test years
  await prisma.classCohort.deleteMany({
    where: { academicYear: { label: { in: [labelA, labelB] } } },
  });
  await prisma.semester.deleteMany({
    where: { academicYear: { label: { in: [labelA, labelB] } } },
  });
  await prisma.academicYear.deleteMany({ where: { label: { in: [labelA, labelB] } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: `P1-${stamp}` } } });

  const seeded = await ensureCurrentAcademicContext();
  assert(Boolean(seeded.academicYear?.id), "ensureCurrentAcademicContext returns year");
  assert(Boolean(seeded.semester?.id), "ensureCurrentAcademicContext returns semester");

  const ctx1 = await getCurrentAcademicContext();
  assert(Boolean(ctx1.academicYear?.isCurrent), "getCurrentAcademicContext year is current");
  assert(Boolean(ctx1.semester?.isActive), "getCurrentAcademicContext semester is active");

  const yearA = await prisma.academicYear.create({
    data: {
      label: labelA,
      startDate: new Date("2090-08-01"),
      endDate: new Date("2091-07-31"),
      isCurrent: false,
    },
  });
  const yearB = await prisma.academicYear.create({
    data: {
      label: labelB,
      startDate: new Date("2091-08-01"),
      endDate: new Date("2092-07-31"),
      isCurrent: false,
    },
  });

  await setCurrentAcademicYear(prisma, yearA.id);
  let currentCount = await prisma.academicYear.count({ where: { isCurrent: true } });
  assert(currentCount === 1, "Exactly one academic year is current after setCurrent A");
  let cur = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  assert(cur?.id === yearA.id, "Year A is the current year");

  await setCurrentAcademicYear(prisma, yearB.id);
  currentCount = await prisma.academicYear.count({ where: { isCurrent: true } });
  assert(currentCount === 1, "Exactly one academic year is current after setCurrent B");
  cur = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  assert(cur?.id === yearB.id, "Year B is the current year");

  const sem1 = await prisma.semester.create({
    data: {
      academicYearId: yearA.id,
      name: "Semester 1",
      startDate: new Date("2090-08-01"),
      endDate: new Date("2090-12-31"),
      isActive: false,
    },
  });
  const sem2 = await prisma.semester.create({
    data: {
      academicYearId: yearB.id,
      name: "Semester 1",
      startDate: new Date("2091-08-01"),
      endDate: new Date("2091-12-31"),
      isActive: false,
    },
  });

  await activateSemester(prisma, sem1.id);
  let activeCount = await prisma.semester.count({ where: { isActive: true } });
  assert(activeCount === 1, "Exactly one semester active after activate sem1");
  let act = await prisma.semester.findFirst({ where: { isActive: true } });
  assert(act?.id === sem1.id, "Sem1 is active");

  await activateSemester(prisma, sem2.id);
  activeCount = await prisma.semester.count({ where: { isActive: true } });
  assert(activeCount === 1, "Exactly one semester active after activate sem2");
  act = await prisma.semester.findFirst({ where: { isActive: true } });
  assert(act?.id === sem2.id, "Sem2 is active");

  const course = await prisma.course.create({
    data: {
      code: `P1-${stamp}`,
      name: "Phase 1 Test Course",
      isActive: true,
    },
  });
  assert(Boolean(course.id), "Course created");

  const cohort = await prisma.classCohort.create({
    data: {
      courseId: course.id,
      academicYearId: yearB.id,
      semesterId: sem2.id,
      name: "Class A",
      isActive: true,
    },
  });
  assert(Boolean(cohort.id), "Class cohort created");

  assert(
    normalizeAcademicYearLabel("2025/2026") === "2025/2026",
    "normalizeAcademicYearLabel accepts valid label",
  );
  assert(
    normalizeAcademicYearLabel("2025/2027") === "",
    "normalizeAcademicYearLabel rejects non-consecutive years",
  );
  const invalid = validateAcademicYearInput({
    label: "bad",
    startDate: "2091-01-01",
    endDate: "2090-01-01",
  });
  assert(!invalid.ok, "validateAcademicYearInput rejects bad label/range");
  assert(Boolean(invalid.fieldErrors.label), "label field error present");

  const requiredEvents = [
    AuditEvent.ACADEMIC_YEAR_CREATED,
    AuditEvent.ACADEMIC_YEAR_UPDATED,
    AuditEvent.ACADEMIC_YEAR_SET_CURRENT,
    AuditEvent.SEMESTER_CREATED,
    AuditEvent.SEMESTER_UPDATED,
    AuditEvent.SEMESTER_ACTIVATED,
    AuditEvent.COURSE_CREATED,
    AuditEvent.COURSE_UPDATED,
    AuditEvent.CLASS_COHORT_CREATED,
    AuditEvent.CLASS_COHORT_UPDATED,
  ];
  for (const ev of requiredEvents) {
    assert(typeof ev === "string" && ev.length > 0, `AuditEvent ${ev} defined`);
  }

  const auditStamp = `phase1-${stamp}`;
  for (const ev of requiredEvents) {
    await writeAuditLog({
      eventType: ev,
      actorUserId: null,
      meta: { phase1Acceptance: auditStamp, eventType: ev },
    });
  }
  const recentAudits = await prisma.auditLog.findMany({
    where: {
      eventType: { in: requiredEvents },
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const matched = recentAudits.filter(
    (row) =>
      row.meta &&
      typeof row.meta === "object" &&
      !Array.isArray(row.meta) &&
      /** @type {Record<string, unknown>} */ (row.meta).phase1Acceptance === auditStamp,
  );
  assert(
    matched.length === requiredEvents.length,
    `All ${requiredEvents.length} Phase 1 audit events persist`,
    `count=${matched.length}`,
  );

  // Restore a sensible current year for the app (re-ensure)
  await ensureCurrentAcademicContext();
  // Clear test years exclusivity by setting seed year current if exists
  const real = await prisma.academicYear.findFirst({
    where: { label: { notIn: [labelA, labelB] } },
    orderBy: { label: "desc" },
  });
  if (real) await setCurrentAcademicYear(prisma, real.id);
  const realSem = await prisma.semester.findFirst({
    where: { academicYearId: real?.id, name: "Semester 1" },
  });
  if (realSem) await activateSemester(prisma, realSem.id);

  // Cleanup test artefacts
  await prisma.classCohort.deleteMany({ where: { id: cohort.id } });
  await prisma.course.deleteMany({ where: { id: course.id } });
  await prisma.semester.deleteMany({ where: { id: { in: [sem1.id, sem2.id] } } });
  await prisma.academicYear.deleteMany({ where: { id: { in: [yearA.id, yearB.id] } } });

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
