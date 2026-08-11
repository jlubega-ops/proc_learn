/**
 * Phase 8 acceptance: Academic Projects + ProjectAttempt + server timer.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase8-academic-projects-acceptance.mjs
 */
import {
  ProjectAttemptStatus,
  ProjectPurpose,
  Role,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import {
  computeAttemptTimer,
  ensureProjectEnrollment,
  humanAcademicProjectStatus,
  listStudentAcademicProjects,
  listAcademicProjectParticipants,
  startProjectAttempt,
  submitProjectAttempt,
} from "../src/lib/academic/project-attempts.js";
import { findStudentPersonalOrg, ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { ensureActiveEnrollment } from "../src/lib/academic/student-enrollment.js";
import { AcademicParticipationType } from "@prisma/client";
import { validateProjectCreateInput } from "../src/lib/validation/project.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function purgeUserByEmail(email) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: u.id }, { targetUserId: u.id }] },
  });
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  console.log("\n=== Phase 8 Academic Projects + Attempts acceptance ===\n");

  assert(AuditEvent.PROJECT_ATTEMPT_STARTED === "PROJECT_ATTEMPT_STARTED", "Attempt start audit key");
  assert(AuditEvent.PROJECT_ATTEMPT_SUBMITTED === "PROJECT_ATTEMPT_SUBMITTED", "Attempt submit audit key");
  assert(
    Object.values(ProjectAttemptStatus).includes("IN_PROGRESS"),
    "ProjectAttemptStatus.IN_PROGRESS exists",
  );

  const practiceVal = validateProjectCreateInput({
    body: {
      name: "Practice lab",
      purpose: "PRACTICE",
      visibility: "PUBLIC",
      isPublished: true,
      duration: "30",
    },
    activeRole: Role.EXAMINER,
  });
  assert(practiceVal.ok, "Examiner can create PRACTICE");
  assert(practiceVal.data.maxAttempts === null, "Practice default maxAttempts null (unlimited)");

  const assessVal = validateProjectCreateInput({
    body: {
      name: "Assessment lab",
      purpose: "ASSESSMENT",
      visibility: "PUBLIC",
      isPublished: true,
      duration: "45",
    },
    activeRole: Role.EXAMINER,
  });
  assert(assessVal.ok, "Examiner can create ASSESSMENT with duration");
  assert(assessVal.data.maxAttempts === 1, "Assessment default maxAttempts 1");

  const stamp = Date.now();
  const studentEmail = `2085${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2085${String(stamp).slice(-6)}`;
  const examinerEmail = `phase8.examiner.${stamp}@mubs.ac.ug`;

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);

  const uni = await ensureCurrentAcademicContext();

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase8 Programme", shortName: "P8TP", isActive: true },
    });
  }

  const student = await insertPendingStudentUser(prisma, {
    email: studentEmail,
    firstName: "Phase8",
    lastName: "Student",
    middleName: null,
    studentNumber,
    registrationNumber: `REG8-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: uni.academicYear.label,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(student?.id), "Student created");

  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examinerEmail,
    firstName: "Phase8",
    lastName: "Examiner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `Phase8!${stamp}`,
  });
  assert(Boolean(examiner?.id), "Examiner created");

  if (!student?.id || !examiner?.id) {
    process.exit(1);
  }

  await ensureActiveEnrollment(prisma, {
    userId: student.id,
    academicYearId: uni.academicYear.id,
    participationType: AcademicParticipationType.STUDENT,
  });
  await ensureStudentPersonalOrg(prisma, student.id);
  const orgBefore = await findStudentPersonalOrg(prisma, student.id);
  assert(Boolean(orgBefore?.id), "My Organisation exists before attempt");

  const practice = await prisma.project.create({
    data: {
      ownerUserId: examiner.id,
      creatorRole: Role.EXAMINER,
      name: `P8 Practice ${stamp}`,
      purpose: ProjectPurpose.PRACTICE,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 120,
      maxAttempts: null,
      allowEditAfterSubmit: false,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  assert(practice.purpose === ProjectPurpose.PRACTICE, "Practice project created");

  const assessment = await prisma.project.create({
    data: {
      ownerUserId: examiner.id,
      creatorRole: Role.EXAMINER,
      name: `P8 Assessment ${stamp}`,
      purpose: ProjectPurpose.ASSESSMENT,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 90,
      maxAttempts: 2,
      allowEditAfterSubmit: false,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  assert(assessment.purpose === ProjectPurpose.ASSESSMENT, "Assessment project created");

  // Catalog
  const practiceList = await listStudentAcademicProjects({
    studentUserId: student.id,
    purpose: ProjectPurpose.PRACTICE,
  });
  assert(
    practiceList.some((p) => p.id === practice.id),
    "Practice appears in student catalog",
  );

  // Enroll + start attempt 1
  await ensureProjectEnrollment(prisma, {
    projectId: practice.id,
    studentUserId: student.id,
  });
  const started = await startProjectAttempt({
    projectId: practice.id,
    studentUserId: student.id,
  });
  assert(started.attempt?.status === ProjectAttemptStatus.IN_PROGRESS, "Attempt starts IN_PROGRESS");
  assert(started.attempt?.attemptNumber === 1, "First attempt number is 1");
  assert(Boolean(started.attempt?.academicSlateId), "Attempt bound to academic slate");
  assert(Boolean(started.attempt?.studentAcademicEnrollmentId), "Attempt bound to academic enrollment");

  const orgAfter = await findStudentPersonalOrg(prisma, student.id);
  assert(orgAfter?.id === orgBefore.id, "Same My Organisation after start");
  assert(started.personalOrgProjectId === orgBefore.id, "Attempt uses personal org id");

  // Timer server-authoritative
  const t1 = computeAttemptTimer({
    attempt: started.attempt,
    project: practice,
    now: new Date(new Date(started.attempt.startedAt).getTime() + 30_000),
  });
  assert(t1.elapsedSeconds === 30, "Timer elapsed from server startedAt", `elapsed=${t1.elapsedSeconds}`);
  assert(t1.remainingSeconds === 90, "Timer remaining independent of client", `rem=${t1.remainingSeconds}`);

  // Refresh / resume same attempt
  const resumed = await startProjectAttempt({
    projectId: practice.id,
    studentUserId: student.id,
  });
  assert(resumed.resumed === true, "Refresh resumes same in-progress attempt");
  assert(resumed.attempt?.id === started.attempt.id, "Attempt isolation — same attempt id");

  // Submit
  const submitted = await submitProjectAttempt({
    attemptId: started.attempt.id,
    studentUserId: student.id,
  });
  assert(submitted.attempt?.status === ProjectAttemptStatus.SUBMITTED, "Attempt submitted");

  // Multiple attempts on assessment (max 2)
  const a1 = await startProjectAttempt({
    projectId: assessment.id,
    studentUserId: student.id,
  });
  await submitProjectAttempt({
    attemptId: a1.attempt.id,
    studentUserId: student.id,
  });
  const a2 = await startProjectAttempt({
    projectId: assessment.id,
    studentUserId: student.id,
  });
  assert(a2.attempt?.attemptNumber === 2, "Second attempt created");
  assert(a2.attempt?.id !== a1.attempt.id, "Attempts are independent rows");
  await submitProjectAttempt({
    attemptId: a2.attempt.id,
    studentUserId: student.id,
  });

  let blocked = false;
  try {
    await startProjectAttempt({
      projectId: assessment.id,
      studentUserId: student.id,
    });
  } catch (e) {
    blocked = e && typeof e === "object" && e.code === "MAX_ATTEMPTS";
  }
  assert(blocked, "Max attempts enforced");

  // Close window
  await prisma.project.update({
    where: { id: practice.id },
    data: { closeAt: new Date(Date.now() - 1000) },
  });
  let closedBlock = false;
  try {
    await startProjectAttempt({
      projectId: practice.id,
      studentUserId: student.id,
    });
  } catch (e) {
    closedBlock = e && typeof e === "object" && e.code === "WINDOW_CLOSED";
  }
  assert(closedBlock, "Close date blocks new attempts");

  // Examiner participants view
  const parts = await listAcademicProjectParticipants({ projectId: assessment.id });
  assert(Boolean(parts), "Participants payload");
  assert(parts.counts.enrolled >= 1, "Participant enrolled count");
  assert(
    parts.participants.some((p) => p.studentUserId === student.id && p.attemptCount === 2),
    "Examiner sees attempt count",
  );

  // Human status
  const human = humanAcademicProjectStatus({
    project: assessment,
    enrollment: { id: "x" },
    latestAttempt: { status: ProjectAttemptStatus.SUBMITTED },
  });
  assert(human.key === "submitted", "Human submitted status", human.label);

  // Expired timer auto-submit path
  const timed = await prisma.project.create({
    data: {
      ownerUserId: examiner.id,
      creatorRole: Role.EXAMINER,
      name: `P8 Timed ${stamp}`,
      purpose: ProjectPurpose.PRACTICE,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 5,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  const ts = await startProjectAttempt({
    projectId: timed.id,
    studentUserId: student.id,
  });
  // Simulate elapsed by backdating startedAt
  await prisma.projectAttempt.update({
    where: { id: ts.attempt.id },
    data: { startedAt: new Date(Date.now() - 10_000) },
  });
  const expiredStart = await startProjectAttempt({
    projectId: timed.id,
    studentUserId: student.id,
  });
  assert(
    expiredStart.attempt?.status === ProjectAttemptStatus.SUBMITTED ||
      expiredStart.autoExpired === true ||
      expiredStart.attempt?.status === ProjectAttemptStatus.SUBMITTED,
    "Expired timer auto-submits on next server check",
  );

  await prisma.project.deleteMany({
    where: { id: { in: [practice.id, assessment.id, timed.id] } },
  });
  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT  ${passed}/${results.length} passed`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
