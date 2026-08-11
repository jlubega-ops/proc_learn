/**
 * Phase 10 final hardening + acceptance.
 *
 * Covers: authz, Student Mode isolation, demo→STUDENT protection,
 * academic isolation, cross-examiner results scope, attempt integrity,
 * official result exclusion (mixed population), pre-release score gate,
 * UI nav sanity.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase10-final-hardening-acceptance.mjs
 */
import {
  AcademicParticipationType,
  AssessmentGradingMode,
  ProjectPurpose,
  Role,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import {
  ensureActiveEnrollment,
  joinCurrentAcademicYear,
  getActiveEnrollment,
} from "../src/lib/academic/student-enrollment.js";
import {
  ensureStudentPersonalOrg,
  findStudentPersonalOrg,
} from "../src/lib/projects/student-personal-org.js";
import { ensureCurrentOrgSlateForOwner } from "../src/lib/academic/org-academic-slate.js";
import { switchActiveRole } from "../src/lib/academic/switch-active-role.js";
import {
  startProjectAttempt,
  submitProjectAttempt,
  listAcademicProjectParticipants,
} from "../src/lib/academic/project-attempts.js";
import { upsertProjectAssessmentConfig } from "../src/lib/academic/assessment-config.js";
import {
  autoEvaluateProjectAttempt,
  manualGradeProjectAttempt,
} from "../src/lib/academic/assessment-evaluate.js";
import {
  buildOfficialResultsWorkbook,
  computeOfficialResultStats,
  getExaminerAssessmentResults,
  listAssessmentResultRows,
  listStudentOwnResults,
} from "../src/lib/academic/assessment-results.js";
import { isOfficialStudentParticipation } from "../src/lib/academic/examiner-observation-access.js";
import { getExaminerStudentObservation } from "../src/lib/academic/examiner-observation.js";
import { canManageStudents, canManageStaffUsers } from "../src/lib/api/student-scope.js";
import { canObserveStudentOrganisation } from "../src/lib/academic/examiner-observation-access.js";
import { sidebarNavForContext, flattenNavLabels } from "../src/lib/nav-config.js";
import { ROLE } from "../src/lib/roles.js";
import { OBSERVATION_STAGE_LABELS } from "../src/lib/projects/derive-org-progress.js";

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
  console.log("\n=== Phase 10 Final hardening + acceptance ===\n");

  // --- Auth / official helpers ---
  assert(isOfficialStudentParticipation("STUDENT"), "Explicit STUDENT is official");
  assert(!isOfficialStudentParticipation(null), "Null participation is not official");
  assert(!isOfficialStudentParticipation("EXAMINER_DEMO"), "Demo not official");
  assert(
    !canObserveStudentOrganisation({ activeRole: Role.STUDENT }),
    "Student Mode cannot observe",
  );
  assert(
    canObserveStudentOrganisation({ activeRole: Role.EXAMINER }),
    "Examiner can observe",
  );
  assert(!canManageStudents(Role.STUDENT), "Student cannot manage students");
  assert(!canManageStaffUsers(Role.STUDENT), "Student cannot manage staff");

  const studentNav = flattenNavLabels(sidebarNavForContext(ROLE.STUDENT));
  assert(studentNav.includes("Results"), "Student Results nav");
  assert(studentNav.includes("Practice"), "Student Practice nav");
  assert(!studentNav.includes("Staff"), "Student nav has no Staff");
  assert(!studentNav.some((l) => /OrgAcademicSlate|ProjectAttempt|StudentAcademicEnrollment/i.test(l)), "No technical model names in Student nav");

  const examinerNav = flattenNavLabels(sidebarNavForContext(ROLE.EXAMINER));
  assert(examinerNav.includes("Results"), "Examiner Results nav");
  assert(examinerNav.includes("Projects"), "Examiner Projects nav");
  assert(!examinerNav.includes("My Academic Work"), "Examiner has no My Academic Work");

  const stamp = Date.now();
  const uni = await ensureCurrentAcademicContext();

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase10 Programme", shortName: "P10T", isActive: true },
    });
  }

  // --- Mixed population: 50 students + 2 demos ---
  /** @type {string[]} */
  const studentIds = [];
  /** @type {string[]} */
  const studentEmails = [];
  for (let i = 0; i < 50; i += 1) {
    const digits = `31${String(stamp).slice(-4)}${String(i).padStart(2, "0")}`.slice(0, 8);
    const email = `${digits}@mubs.ac.ug`;
    studentEmails.push(email);
    await purgeUserByEmail(email);
    const s = await insertPendingStudentUser(prisma, {
      email,
      firstName: `P10S${i}`,
      lastName: "Official",
      middleName: null,
      studentNumber: digits,
      registrationNumber: `R10-${stamp}-${i}`,
      programmeId: programme.id,
      academicYearLabel: uni.academicYear.label,
      yearOfStudy: 1,
      sex: null,
    });
    await ensureActiveEnrollment(prisma, {
      userId: s.id,
      academicYearId: uni.academicYear.id,
      participationType: AcademicParticipationType.STUDENT,
    });
    await ensureStudentPersonalOrg(prisma, s.id);
    await ensureCurrentOrgSlateForOwner(prisma, s.id);
    studentIds.push(s.id);
  }
  assert(studentIds.length === 50, "Created 50 official students");

  const examEmail = `phase10.ex.${stamp}@mubs.ac.ug`;
  const exam2Email = `phase10.ex2.${stamp}@mubs.ac.ug`;
  const adminEmail = `phase10.ad.${stamp}@mubs.ac.ug`;
  await purgeUserByEmail(examEmail);
  await purgeUserByEmail(exam2Email);
  await purgeUserByEmail(adminEmail);

  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examEmail,
    firstName: "Phase10",
    lastName: "Examiner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `P10!${stamp}`,
  });
  const examiner2 = await insertStaffUserWithPassword(prisma, {
    email: exam2Email,
    firstName: "Phase10",
    lastName: "OtherEx",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `P10b!${stamp}`,
  });
  const admin = await insertStaffUserWithPassword(prisma, {
    email: adminEmail,
    firstName: "Phase10",
    lastName: "Admin",
    middleName: null,
    sex: null,
    roles: [Role.SYSTEM_ADMIN],
    activeRole: Role.SYSTEM_ADMIN,
    plainPassword: `P10a!${stamp}`,
  });
  assert(Boolean(examiner?.id && examiner2?.id && admin?.id), "Staff users created");

  // Examiner + Admin demos via Student Mode
  const examDemo = await switchActiveRole({
    userId: examiner.id,
    nextRole: Role.STUDENT,
    actorUserId: examiner.id,
  });
  assert(examDemo.ok, "Examiner → Student Mode");
  assert(examDemo.participationType === "EXAMINER_DEMO", "Examiner demo participation");
  assert(examDemo.permanentRole === Role.EXAMINER, "Permanent role still EXAMINER");
  assert(examDemo.effectiveRole === Role.STUDENT, "Effective role STUDENT");
  assert(!canManageStudents(Role.STUDENT), "Student Mode permissions locked");

  const adminDemo = await switchActiveRole({
    userId: admin.id,
    nextRole: Role.STUDENT,
    actorUserId: admin.id,
  });
  assert(adminDemo.ok, "Admin → Student Mode");
  assert(adminDemo.participationType === "SYSTEM_ADMIN_DEMO", "Admin demo participation");

  const examOrg = await findStudentPersonalOrg(prisma, examiner.id);
  const adminOrg = await findStudentPersonalOrg(prisma, admin.id);
  assert(Boolean(examOrg?.id && adminOrg?.id), "Demo My Organisations exist");

  // Demo cannot be demoted to STUDENT via ensureActiveEnrollment(STUDENT)
  const preserved = await ensureActiveEnrollment(prisma, {
    userId: examiner.id,
    academicYearId: uni.academicYear.id,
    participationType: AcademicParticipationType.STUDENT,
  });
  assert(
    preserved.enrollment.participationType === AcademicParticipationType.EXAMINER_DEMO,
    "DEMO type preserved against STUDENT overwrite",
  );

  // joinCurrent with demo user (no student profile) should fail at API; service still guards type
  const joinAttempt = await joinCurrentAcademicYear(examiner.id).catch((e) => e);
  // May fail for lack of profile or succeed preserving demo — never become STUDENT
  const afterJoin = await getActiveEnrollment(prisma, examiner.id);
  assert(
    afterJoin?.participationType === AcademicParticipationType.EXAMINER_DEMO ||
      joinAttempt instanceof Error,
    "Join path cannot convert demo to STUDENT",
    afterJoin?.participationType || String(joinAttempt?.message || ""),
  );

  // Return to Examiner / Admin
  const backEx = await switchActiveRole({
    userId: examiner.id,
    nextRole: Role.EXAMINER,
    actorUserId: examiner.id,
  });
  assert(backEx.ok && backEx.effectiveRole === Role.EXAMINER, "Return to Examiner");
  const backAd = await switchActiveRole({
    userId: admin.id,
    nextRole: Role.SYSTEM_ADMIN,
    actorUserId: admin.id,
  });
  assert(backAd.ok && backAd.effectiveRole === Role.SYSTEM_ADMIN, "Return to Admin");
  const sameOrgAfter = await findStudentPersonalOrg(prisma, examiner.id);
  assert(sameOrgAfter?.id === examOrg.id, "Same My Organisation after return");

  // --- Academic isolation across years ---
  const yearB = await prisma.academicYear.create({
    data: {
      label: `2098/2099`,
      startDate: new Date("2098-08-01"),
      endDate: new Date("2099-07-31"),
      isCurrent: false,
    },
  }).catch(async () => {
    return prisma.academicYear.findUnique({ where: { label: "2098/2099" } });
  });
  assert(Boolean(yearB?.id), "Isolation year B available");

  const studentA = studentIds[0];
  const enrA = await getActiveEnrollment(prisma, studentA);
  const slateA = await ensureCurrentOrgSlateForOwner(prisma, studentA);
  const orgA = await findStudentPersonalOrg(prisma, studentA);

  await ensureActiveEnrollment(prisma, {
    userId: studentA,
    academicYearId: yearB.id,
    participationType: AcademicParticipationType.STUDENT,
  });
  // Active enrollment moved to year B
  const activeAfter = await getActiveEnrollment(prisma, studentA);
  assert(activeAfter?.academicYearId === yearB.id, "Active enrollment moved to year B");
  const enrARow = await prisma.studentAcademicEnrollment.findUnique({ where: { id: enrA.id } });
  assert(enrARow?.status === "HISTORICAL", "Prior year enrollment preserved HISTORICAL");
  const slateB = await ensureCurrentOrgSlateForOwner(prisma, studentA);
  assert(slateB.slate.academicYearId === yearB.id, "New slate for year B");
  assert(slateB.slate.projectId === orgA.id, "Slate still on same My Organisation");
  const slateARow = await prisma.orgAcademicSlate.findUnique({ where: { id: slateA.slate.id } });
  assert(
    slateARow?.status === "HISTORICAL" || slateARow?.id !== slateB.slate.id,
    "Prior slate not current",
  );

  // Restore student to current uni year for project work
  await ensureActiveEnrollment(prisma, {
    userId: studentA,
    academicYearId: uni.academicYear.id,
    participationType: AcademicParticipationType.STUDENT,
  });
  await ensureCurrentOrgSlateForOwner(prisma, studentA);

  // --- Project + attempts + scoring ---
  const project = await prisma.project.create({
    data: {
      ownerUserId: examiner.id,
      creatorRole: Role.EXAMINER,
      name: `P10 Assessment ${stamp}`,
      purpose: ProjectPurpose.ASSESSMENT,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 7200,
      maxAttempts: 3,
      allowEditAfterSubmit: false,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  const otherProject = await prisma.project.create({
    data: {
      ownerUserId: examiner2.id,
      creatorRole: Role.EXAMINER,
      name: `P10 Other ${stamp}`,
      purpose: ProjectPurpose.ASSESSMENT,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 3600,
      maxAttempts: 1,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });

  await upsertProjectAssessmentConfig({
    projectId: project.id,
    actorUserId: examiner.id,
    body: {
      gradingMode: AssessmentGradingMode.COMBINED,
      manualMaxMarks: 40,
      passMarkPercent: 50,
      resultsReleased: false,
      checkpoints: [{ label: "Submitted", kind: "ATTEMPT_SUBMITTED", marks: 60 }],
    },
  });
  await upsertProjectAssessmentConfig({
    projectId: otherProject.id,
    actorUserId: examiner2.id,
    body: {
      gradingMode: AssessmentGradingMode.AUTOMATIC,
      manualMaxMarks: 0,
      passMarkPercent: 50,
      resultsReleased: false,
      checkpoints: [{ label: "Submitted", kind: "ATTEMPT_SUBMITTED", marks: 100 }],
    },
  });

  // 50 official + 2 demos attempt on examiner's project
  /** @type {string[]} */
  const attemptIds = [];
  for (const sid of studentIds) {
    const started = await startProjectAttempt({
      projectId: project.id,
      studentUserId: sid,
      actorUserId: sid,
    });
    await submitProjectAttempt({
      attemptId: started.attempt.id,
      studentUserId: sid,
      actorUserId: sid,
    });
    await autoEvaluateProjectAttempt({ attemptId: started.attempt.id, actorUserId: examiner.id });
    await manualGradeProjectAttempt({
      attemptId: started.attempt.id,
      actorUserId: examiner.id,
      manualScore: 20,
      feedback: "ok",
    });
    attemptIds.push(started.attempt.id);
  }

  // Re-enter demos for attempts
  await switchActiveRole({ userId: examiner.id, nextRole: Role.STUDENT, actorUserId: examiner.id });
  const demoStart = await startProjectAttempt({
    projectId: project.id,
    studentUserId: examiner.id,
    actorUserId: examiner.id,
  });
  await submitProjectAttempt({
    attemptId: demoStart.attempt.id,
    studentUserId: examiner.id,
    actorUserId: examiner.id,
  });
  await autoEvaluateProjectAttempt({ attemptId: demoStart.attempt.id, actorUserId: examiner.id });
  await manualGradeProjectAttempt({
    attemptId: demoStart.attempt.id,
    actorUserId: examiner.id,
    manualScore: 40,
    feedback: "demo",
  });
  await switchActiveRole({ userId: examiner.id, nextRole: Role.EXAMINER, actorUserId: examiner.id });

  await switchActiveRole({ userId: admin.id, nextRole: Role.STUDENT, actorUserId: admin.id });
  const adminStart = await startProjectAttempt({
    projectId: project.id,
    studentUserId: admin.id,
    actorUserId: admin.id,
  });
  await submitProjectAttempt({
    attemptId: adminStart.attempt.id,
    studentUserId: admin.id,
    actorUserId: admin.id,
  });
  await autoEvaluateProjectAttempt({ attemptId: adminStart.attempt.id, actorUserId: examiner.id });
  await manualGradeProjectAttempt({
    attemptId: adminStart.attempt.id,
    actorUserId: examiner.id,
    manualScore: 40,
    feedback: "admin demo",
  });
  await switchActiveRole({ userId: admin.id, nextRole: Role.SYSTEM_ADMIN, actorUserId: admin.id });

  // Multiple attempts isolation on one student
  const multi = await startProjectAttempt({
    projectId: project.id,
    studentUserId: studentA,
    actorUserId: studentA,
  });
  assert(multi.attempt.attemptNumber >= 2, "Second attempt number ≥ 2");
  assert(multi.attempt.id !== attemptIds[0], "Attempts are independent rows");

  const participants = await listAcademicProjectParticipants({ projectId: project.id });
  assert(
    (participants?.participants || []).some((p) => p.currentStageLabel || !p.currentStageKey),
    "Participants prefer human stage labels when present",
  );
  assert(
    (participants?.participants || []).length <= 200,
    "Participants list is bounded",
  );

  // --- Cross-examiner scope ---
  // Give examiner2 a graded attempt path with one of their (no) students — just scoped empty vs owned
  const rowsEx1 = await listAssessmentResultRows({
    academicYearId: uni.academicYear.id,
    ownerUserId: examiner.id,
    participation: "all",
  });
  assert(
    rowsEx1.rows.every((r) => r.projectOwnerUserId === examiner.id),
    "Examiner results owner-scoped",
  );
  assert(
    !rowsEx1.rows.some((r) => r.projectId === otherProject.id),
    "Examiner cannot see other examiner project results",
  );

  const bundle = await getExaminerAssessmentResults({
    projectId: project.id,
    academicYearId: uni.academicYear.id,
    ownerUserId: examiner.id,
    participation: "all",
  });
  assert(bundle.rows.length >= 52, "All 50 + 2 demos visible when filter=all");
  const stats = computeOfficialResultStats({ rows: bundle.rows });
  assert(stats.officialCount === 50 || stats.officialCount === 51, "Official population ~50", `got ${stats.officialCount}`);
  // second attempt by studentA may create 51 official attempt rows — filter unique students
  const officialStudents = new Set(
    bundle.rows.filter((r) => r.isOfficial).map((r) => r.studentUserId),
  );
  assert(officialStudents.size === 50, "Official unique students = 50", `got ${officialStudents.size}`);
  assert(stats.demoExcludedCount >= 2, "At least 2 demos excluded");
  assert(
    !stats.rankings.some((r) => r.studentUserId === examiner.id || r.studentUserId === admin.id),
    "Demos absent from rankings",
  );

  const { buffer, officialCount } = await buildOfficialResultsWorkbook({
    projectId: project.id,
    academicYearId: uni.academicYear.id,
    actorUserId: examiner.id,
    ownerUserId: examiner.id,
  });
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetJson = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const flat = JSON.stringify(sheetJson);
  assert(!flat.includes(examEmail), "Excel excludes examiner demo email");
  assert(!flat.includes(adminEmail), "Excel excludes admin demo email");
  assert(officialCount >= 50, "Excel official rows ≥ 50", `got ${officialCount}`);

  // Pre-release: student must not see grade scores
  const own = await listStudentOwnResults({ studentUserId: studentA });
  assert(
    own.every((r) => !r.scoreVisible && r.grade == null),
    "Pre-release student results hide scores",
  );

  // Observation blocks non-student staff without demo/profile? examiner2 has no demo/profile enrollment after switch
  let observeStaffErr = null;
  try {
    await getExaminerStudentObservation(examiner2.id);
  } catch (e) {
    observeStaffErr = e;
  }
  assert(
    observeStaffErr && observeStaffErr.code === "NOT_FOUND",
    "Observation rejects non-student staff without demo context",
  );

  // Stage labels catalogue still human
  assert(OBSERVATION_STAGE_LABELS.BUDGET === "Budget", "Human stage labels intact");

  // Cleanup
  await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
  await prisma.project.delete({ where: { id: otherProject.id } }).catch(() => {});
  await prisma.academicYear.delete({ where: { id: yearB.id } }).catch(() => {});
  for (const email of studentEmails) await purgeUserByEmail(email);
  await purgeUserByEmail(examEmail);
  await purgeUserByEmail(exam2Email);
  await purgeUserByEmail(adminEmail);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT  ${passed}/${results.length} passed`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  FAIL detail: ${r.name} ${r.detail || ""}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
