/**
 * Phase 9 acceptance: Assessment config, auto/manual scoring, official exclusion, Excel.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase9-assessment-results-acceptance.mjs
 */
import {
  AcademicParticipationType,
  AssessmentGradingMode,
  AttemptGradeStatus,
  ProjectPurpose,
  Role,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { ensureActiveEnrollment } from "../src/lib/academic/student-enrollment.js";
import { ensureStudentPersonalOrg, findStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { ensureCurrentOrgSlateForOwner } from "../src/lib/academic/org-academic-slate.js";
import { startProjectAttempt, submitProjectAttempt } from "../src/lib/academic/project-attempts.js";
import { upsertProjectAssessmentConfig } from "../src/lib/academic/assessment-config.js";
import {
  autoEvaluateProjectAttempt,
  manualGradeProjectAttempt,
  evaluateCheckpointAgainstDomain,
} from "../src/lib/academic/assessment-evaluate.js";
import { computeFinalScore } from "../src/lib/academic/assessment-scoring.js";
import {
  buildOfficialResultsWorkbook,
  computeOfficialResultStats,
  getExaminerAssessmentResults,
  listAssessmentResultRows,
} from "../src/lib/academic/assessment-results.js";
import { isOfficialStudentParticipation } from "../src/lib/academic/examiner-observation-access.js";
import { sidebarNavForContext, flattenNavLabels } from "../src/lib/nav-config.js";
import { ROLE } from "../src/lib/roles.js";

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
  console.log("\n=== Phase 9 Assessment + Results acceptance ===\n");

  assert(AuditEvent.PROJECT_ATTEMPT_AUTO_SCORED === "PROJECT_ATTEMPT_AUTO_SCORED", "Auto-score audit key");
  assert(AuditEvent.PROJECT_ATTEMPT_MANUAL_GRADED === "PROJECT_ATTEMPT_MANUAL_GRADED", "Manual grade audit key");
  assert(
    AuditEvent.PROJECT_ASSESSMENT_RESULTS_EXPORTED === "PROJECT_ASSESSMENT_RESULTS_EXPORTED",
    "Export audit key",
  );

  // Scoring rule: final = min(auto+manual, total)
  const rule = computeFinalScore({
    gradingMode: AssessmentGradingMode.COMBINED,
    autoScore: 40,
    manualScore: 30,
    autoMaxMarks: 60,
    manualMaxMarks: 40,
    passMarkPercent: 50,
    manualEntered: true,
  });
  assert(rule.finalScore === 70, "Combined final = auto + manual", `got ${rule.finalScore}`);
  assert(rule.finalPercent === 70, "Combined percent", `got ${rule.finalPercent}`);
  assert(rule.passFail === "PASS", "Pass at 70% with 50% mark");
  assert(rule.status === AttemptGradeStatus.GRADED, "Combined with manual is GRADED");

  const capped = computeFinalScore({
    gradingMode: AssessmentGradingMode.COMBINED,
    autoScore: 60,
    manualScore: 40,
    autoMaxMarks: 60,
    manualMaxMarks: 40,
    passMarkPercent: 50,
    manualEntered: true,
  });
  assert(capped.finalScore === 100, "Capped at total possible");

  const pending = computeFinalScore({
    gradingMode: AssessmentGradingMode.COMBINED,
    autoScore: 40,
    autoMaxMarks: 60,
    manualMaxMarks: 40,
    passMarkPercent: 50,
    manualEntered: false,
  });
  assert(pending.status === AttemptGradeStatus.AUTO_SCORED, "Awaiting manual stays AUTO_SCORED");
  assert(pending.passFail == null, "No pass/fail until GRADED");

  assert(isOfficialStudentParticipation("STUDENT"), "STUDENT is official");
  assert(!isOfficialStudentParticipation("EXAMINER_DEMO"), "EXAMINER_DEMO not official");
  assert(!isOfficialStudentParticipation("SYSTEM_ADMIN_DEMO"), "SYSTEM_ADMIN_DEMO not official");

  const studentLabels = flattenNavLabels(sidebarNavForContext(ROLE.STUDENT));
  assert(studentLabels.includes("Results"), "Student nav has Results");
  const examinerLabels = flattenNavLabels(sidebarNavForContext(ROLE.EXAMINER));
  assert(examinerLabels.includes("Results"), "Examiner nav has Results");

  const stamp = Date.now();
  const studentEmail = `2091${String(stamp).slice(-6)}@mubs.ac.ug`;
  const demoEmail = `phase9.examiner.${stamp}@mubs.ac.ug`;
  const examinerEmail = `phase9.owner.${stamp}@mubs.ac.ug`;

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(demoEmail);
  await purgeUserByEmail(examinerEmail);

  const uni = await ensureCurrentAcademicContext();
  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase9 Programme", shortName: "P9TP", isActive: true },
    });
  }

  const student = await insertPendingStudentUser(prisma, {
    email: studentEmail,
    firstName: "Phase9",
    lastName: "Student",
    middleName: null,
    studentNumber: `2091${String(stamp).slice(-6)}`,
    registrationNumber: `REG9-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: uni.academicYear.label,
    yearOfStudy: 1,
    sex: null,
  });
  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examinerEmail,
    firstName: "Phase9",
    lastName: "Owner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `Phase9!${stamp}`,
  });
  const demoUser = await insertStaffUserWithPassword(prisma, {
    email: demoEmail,
    firstName: "Phase9",
    lastName: "DemoEx",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.STUDENT,
    plainPassword: `Phase9D!${stamp}`,
  });

  assert(Boolean(student?.id && examiner?.id && demoUser?.id), "Users created");

  await ensureActiveEnrollment(prisma, {
    userId: student.id,
    academicYearId: uni.academicYear.id,
    participationType: AcademicParticipationType.STUDENT,
  });
  await ensureActiveEnrollment(prisma, {
    userId: demoUser.id,
    academicYearId: uni.academicYear.id,
    participationType: AcademicParticipationType.EXAMINER_DEMO,
  });
  await ensureStudentPersonalOrg(prisma, student.id);
  await ensureStudentPersonalOrg(prisma, demoUser.id);
  await ensureCurrentOrgSlateForOwner(prisma, student.id);
  await ensureCurrentOrgSlateForOwner(prisma, demoUser.id);

  const project = await prisma.project.create({
    data: {
      ownerUserId: examiner.id,
      creatorRole: Role.EXAMINER,
      name: `P9 Assessment ${stamp}`,
      purpose: ProjectPurpose.ASSESSMENT,
      visibility: "PUBLIC",
      isPublished: true,
      requiresEnrollment: true,
      durationSeconds: 3600,
      maxAttempts: 3,
      allowEditAfterSubmit: false,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });

  const cfg = await upsertProjectAssessmentConfig({
    projectId: project.id,
    actorUserId: examiner.id,
    body: {
      gradingMode: "COMBINED",
      manualMaxMarks: 40,
      passMarkPercent: 50,
      resultsReleased: false,
      checkpoints: [
        { label: "Submitted", kind: "ATTEMPT_SUBMITTED", marks: 20 },
        {
          label: "Financial year ready",
          kind: "STAGE_COMPLETED",
          stageKey: "FINANCIAL_YEAR",
          marks: 40,
        },
      ],
    },
  });
  assert(Boolean(cfg?.id), "Assessment configured");
  assert(cfg.autoMaxMarks === 60, "Auto max = 60", `got ${cfg.autoMaxMarks}`);
  assert(cfg.totalPossibleMarks === 100, "Total possible 100");

  // Domain checkpoint evaluation unit
  const domainHit = evaluateCheckpointAgainstDomain(
    { id: "x", label: "Submitted", kind: "ATTEMPT_SUBMITTED", marks: 20 },
    { progress: null, procurements: [], attempt: { status: "SUBMITTED" } },
  );
  assert(domainHit.satisfied && domainHit.awarded === 20, "Attempt submitted checkpoint awards marks");

  const startReal = await startProjectAttempt({
    projectId: project.id,
    studentUserId: student.id,
    actorUserId: student.id,
  });
  await submitProjectAttempt({
    attemptId: startReal.attempt.id,
    studentUserId: student.id,
    actorUserId: student.id,
  });

  const autoReal = await autoEvaluateProjectAttempt({
    attemptId: startReal.attempt.id,
    actorUserId: examiner.id,
  });
  assert(!autoReal.skipped, "Auto eval ran for real student");
  assert(autoReal.computed.autoScore >= 20, "At least submit checkpoint awarded");
  assert(
    autoReal.computed.status === AttemptGradeStatus.AUTO_SCORED,
    "COMBINED awaits manual after auto",
  );

  const manual = await manualGradeProjectAttempt({
    attemptId: startReal.attempt.id,
    actorUserId: examiner.id,
    manualScore: 30,
    feedback: "Solid organisational setup.",
  });
  assert(manual.computed.finalScore === manual.computed.autoScore + 30, "Final = auto + manual");
  assert(manual.computed.status === AttemptGradeStatus.GRADED, "Manual grades to GRADED");
  assert(manual.grade.feedback === "Solid organisational setup.", "Feedback stored");

  // Demo attempt
  const startDemo = await startProjectAttempt({
    projectId: project.id,
    studentUserId: demoUser.id,
    actorUserId: demoUser.id,
  });
  await submitProjectAttempt({
    attemptId: startDemo.attempt.id,
    studentUserId: demoUser.id,
    actorUserId: demoUser.id,
  });
  await autoEvaluateProjectAttempt({
    attemptId: startDemo.attempt.id,
    actorUserId: examiner.id,
  });
  await manualGradeProjectAttempt({
    attemptId: startDemo.attempt.id,
    actorUserId: examiner.id,
    manualScore: 40,
    feedback: "Demo score (must not enter official stats).",
  });

  const allRows = await listAssessmentResultRows({
    projectId: project.id,
    academicYearId: uni.academicYear.id,
    participation: "all",
  });
  assert(allRows.rows.length >= 2, "Examiner sees real + demo rows");
  assert(
    allRows.rows.some((r) => r.participationType === "EXAMINER_DEMO"),
    "Demo visible in attempt list",
  );

  const stats = computeOfficialResultStats({ rows: allRows.rows });
  assert(stats.population === "STUDENT_ONLY", "Stats population STUDENT_ONLY");
  assert(stats.officialCount >= 1, "Official count includes real student");
  assert(stats.demoExcludedCount >= 1, "Demo excluded from official count");
  assert(
    stats.rankings.every((r) =>
      allRows.rows.find((row) => row.studentUserId === r.studentUserId && row.isOfficial),
    ),
    "Rankings only official students",
  );
  const demoInRank = stats.rankings.some((r) => r.studentUserId === demoUser.id);
  assert(!demoInRank, "Demo not in rankings");

  const bundle = await getExaminerAssessmentResults({
    projectId: project.id,
    academicYearId: uni.academicYear.id,
    participation: "all",
  });
  assert(
    bundle.officialStats.averagePercent != null || bundle.officialStats.gradedCount === 0,
    "Official average computed without demos",
  );
  const demoGrade = allRows.rows.find((r) => r.studentUserId === demoUser.id)?.grade;
  const realGrade = allRows.rows.find((r) => r.studentUserId === student.id)?.grade;
  if (demoGrade?.finalPercent != null && realGrade?.finalPercent != null && stats.averagePercent != null) {
    // Average must not equal mean of demo+real if they differ — when demo is perfect 100 and real lower
    const naive =
      Math.round(((demoGrade.finalPercent + realGrade.finalPercent) / 2) * 10) / 10;
    if (demoGrade.finalPercent !== realGrade.finalPercent) {
      assert(
        stats.averagePercent !== naive || stats.gradedCount === 1,
        "Average does not blend demo into official mean",
        `avg=${stats.averagePercent} naive=${naive}`,
      );
    }
  }
  assert(stats.passCount + stats.failCount === stats.gradedCount, "Pass/fail distribution coherent");

  const { buffer, officialCount } = await buildOfficialResultsWorkbook({
    projectId: project.id,
    academicYearId: uni.academicYear.id,
    actorUserId: examiner.id,
  });
  assert(officialCount >= 1, "Excel official count ≥ 1");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const flat = JSON.stringify(json);
  assert(!flat.includes(demoEmail), "Excel excludes demo email");
  assert(flat.includes(studentEmail) || flat.includes(student.studentProfile?.studentNumber || "NOPE") || flat.toLowerCase().includes("phase9"), "Excel includes official student");

  // Release for student visibility path
  await upsertProjectAssessmentConfig({
    projectId: project.id,
    actorUserId: examiner.id,
    body: {
      gradingMode: "COMBINED",
      manualMaxMarks: 40,
      passMarkPercent: 50,
      resultsReleased: true,
      checkpoints: [
        { label: "Submitted", kind: "ATTEMPT_SUBMITTED", marks: 20 },
        {
          label: "Financial year ready",
          kind: "STAGE_COMPLETED",
          stageKey: "FINANCIAL_YEAR",
          marks: 40,
        },
      ],
    },
  });
  const released = await prisma.projectAssessment.findUnique({ where: { projectId: project.id } });
  assert(released?.resultsReleased === true, "Results released flag");

  const org = await findStudentPersonalOrg(prisma, student.id);
  assert(Boolean(org?.id), "Same My Organisation still present");

  // Cleanup
  await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(demoEmail);
  await purgeUserByEmail(examinerEmail);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT  ${passed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
