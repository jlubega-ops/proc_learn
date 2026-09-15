/**
 * Official Results — STUDENT participation only for stats / rankings / Excel.
 * Demo participants remain visible in Examiner attempt lists with badges.
 */
import {
  AcademicParticipationType,
  AttemptGradeStatus,
  ProjectAttemptStatus,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { formatUserDisplayName } from "@/lib/user-display";
import { isOfficialStudentParticipation, observationDemoBadge } from "@/lib/academic/examiner-observation-access";
import {
  humanGradeStatus,
  humanPassFail,
  humanGradingMode,
} from "@/lib/academic/assessment-scoring";
import { getOrCreateProjectAssessment, serializeAssessmentConfig } from "@/lib/academic/assessment-config";
import { ensureCurrentAcademicContext } from "@/lib/academic/academic-context";
import { campusLabel, parseCampus } from "@/lib/campuses";

/**
 * @param {any} grade
 * @param {{ includeFeedback?: boolean }} [opts]
 */
export function serializeGrade(grade, opts = {}) {
  if (!grade) return null;
  return {
    id: grade.id,
    attemptId: grade.attemptId,
    autoScore: grade.autoScore,
    manualScore: grade.manualScore,
    finalScore: grade.finalScore,
    finalPercent: grade.finalPercent,
    passFail: grade.passFail,
    passFailLabel: humanPassFail(grade.passFail).label,
    status: grade.status,
    statusLabel: humanGradeStatus(grade.status).label,
    feedback: opts.includeFeedback === false ? undefined : grade.feedback,
    checkpointResults: grade.checkpointResults || [],
    gradedAt: grade.gradedAt,
    autoEvaluatedAt: grade.autoEvaluatedAt,
    gradedByUserId: grade.gradedByUserId,
  };
}

/**
 * @param {{
 *   projectId?: string | null;
 *   academicYearId?: string | null;
 *   campus?: string | null;
 *   participation?: 'all' | 'students' | 'demo';
 *   officialOnly?: boolean;
 *   purpose?: string | null;
 *   ownerUserId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function listAssessmentResultRows(opts = {}) {
  const db = opts.db || prisma;
  const uni = await ensureCurrentAcademicContext(db);
  const academicYearId = opts.academicYearId || uni.academicYear.id;
  const campus = parseCampus(opts.campus);

  /** @type {any} */
  const attemptWhere = {
    enrollment: {
      project: {
        isPersonalOrg: false,
        isAttemptOrg: false,
        ...(opts.projectId ? { id: opts.projectId } : {}),
        ...(opts.purpose ? { purpose: opts.purpose } : {}),
        ...(opts.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}),
        assessment: { isNot: null },
      },
    },
    OR: [
      { studentAcademicEnrollment: { academicYearId } },
      {
        studentAcademicEnrollmentId: null,
        academicSlate: { academicYearId },
      },
    ],
  };

  const attempts = await db.projectAttempt.findMany({
    where: attemptWhere,
    include: {
      grade: { include: { gradedBy: true } },
      enrollment: {
        include: {
          project: { include: { assessment: true } },
          student: {
            include: {
              studentProfile: { include: { programme: true } },
            },
          },
        },
      },
      studentAcademicEnrollment: {
        include: { academicYear: true },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const rows = attempts.map((attempt) => {
    // Unlinked attempts (null enrollment) are NEVER official.
    const participationType = attempt.studentAcademicEnrollment?.participationType || null;
    const isOfficial = isOfficialStudentParticipation(participationType);
    const demo = observationDemoBadge(participationType);
    const student = attempt.enrollment.student;
    const project = attempt.enrollment.project;
    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      attemptStatus: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      progressPercent: attempt.progressPercent,
      projectId: project.id,
      projectName: project.name,
      purpose: project.purpose,
      projectOwnerUserId: project.ownerUserId,
      studentUserId: student.id,
      studentName: formatUserDisplayName(student),
      studentEmail: student.email,
      studentNumber: student.studentProfile?.studentNumber || null,
      programme: student.studentProfile?.programme?.shortName || null,
      campus: student.studentProfile?.campus || null,
      campusLabel: campusLabel(student.studentProfile?.campus) || null,
      academicYearId: attempt.studentAcademicEnrollment?.academicYearId || null,
      academicYearLabel: attempt.studentAcademicEnrollment?.academicYear?.label || null,
      participationType,
      isOfficial,
      demoBadge: demo,
      grade: serializeGrade(attempt.grade, { includeFeedback: true }),
      resultsReleased: Boolean(project.assessment?.resultsReleased),
    };
  });

  let filtered = rows;
  if (campus) {
    filtered = filtered.filter((r) => r.campus === campus);
  }
  if (opts.officialOnly || opts.participation === "students") {
    filtered = filtered.filter((r) => r.isOfficial);
  } else if (opts.participation === "demo") {
    filtered = filtered.filter((r) => !r.isOfficial);
  }

  return {
    academicYearId,
    academicYearLabel: uni.academicYear.label,
    rows: filtered,
  };
}

/**
 * Official statistics — HARD RULE: STUDENT only.
 * @param {{ rows: any[] }} p
 */
export function computeOfficialResultStats(p) {
  const official = (p.rows || []).filter((r) => r.isOfficial);
  const graded = official.filter(
    (r) => r.grade && r.grade.status === AttemptGradeStatus.GRADED && r.grade.finalPercent != null,
  );

  const percents = graded.map((r) => Number(r.grade.finalPercent));
  const average =
    percents.length > 0
      ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10
      : null;

  const passCount = graded.filter((r) => r.grade.passFail === "PASS").length;
  const failCount = graded.filter((r) => r.grade.passFail === "FAIL").length;
  const passRate =
    graded.length > 0 ? Math.round((passCount / graded.length) * 1000) / 10 : null;

  const rankings = [...graded]
    .sort((a, b) => Number(b.grade.finalPercent) - Number(a.grade.finalPercent))
    .map((r, index) => ({
      rank: index + 1,
      studentUserId: r.studentUserId,
      studentName: r.studentName,
      studentNumber: r.studentNumber,
      finalPercent: r.grade.finalPercent,
      finalScore: r.grade.finalScore,
      passFail: r.grade.passFail,
      projectName: r.projectName,
      attemptNumber: r.attemptNumber,
    }));

  const submitted = official.filter((r) =>
    [
      ProjectAttemptStatus.SUBMITTED,
      ProjectAttemptStatus.UNDER_REVIEW,
      ProjectAttemptStatus.COMPLETED,
    ].includes(r.attemptStatus),
  ).length;
  const inProgress = official.filter(
    (r) => r.attemptStatus === ProjectAttemptStatus.IN_PROGRESS,
  ).length;
  const completed = official.filter(
    (r) => r.attemptStatus === ProjectAttemptStatus.COMPLETED,
  ).length;

  return {
    population: "STUDENT_ONLY",
    officialCount: official.length,
    demoExcludedCount: Math.max(0, (p.rows || []).filter((r) => !r.isOfficial).length),
    submittedCount: submitted,
    inProgressCount: inProgress,
    completedCount: completed,
    gradedCount: graded.length,
    averagePercent: average,
    passCount,
    failCount,
    passRatePercent: passRate,
    gradeDistribution: {
      PASS: passCount,
      FAIL: failCount,
      NOT_GRADED: Math.max(0, official.length - graded.length),
    },
    rankings,
  };
}

/**
 * Examiner results bundle for a project or cross-project AY view.
 * Examiners must pass ownerUserId (their id) when listing across projects.
 * @param {{
 *   projectId?: string | null;
 *   academicYearId?: string | null;
 *   campus?: string | null;
 *   participation?: 'all' | 'students' | 'demo';
 *   ownerUserId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function getExaminerAssessmentResults(opts = {}) {
  const db = opts.db || prisma;
  const allListed = await listAssessmentResultRows({
    ...opts,
    participation: "all",
    officialOnly: false,
    ownerUserId: opts.ownerUserId || null,
    db,
  });

  let rows = allListed.rows;
  if (opts.participation === "students") {
    rows = rows.filter((r) => r.isOfficial);
  } else if (opts.participation === "demo") {
    rows = rows.filter((r) => !r.isOfficial);
  }

  // Official stats ALWAYS exclude demos server-side (ignore UI participation filter).
  const officialStats = computeOfficialResultStats({ rows: allListed.rows });

  /** @type {any} */
  let assessment = null;
  /** @type {any} */
  let project = null;
  if (opts.projectId) {
    project = await db.project.findUnique({ where: { id: opts.projectId } });
    const cfg = await getOrCreateProjectAssessment(db, {
      projectId: opts.projectId,
      createIfMissing: false,
    });
    assessment = serializeAssessmentConfig(cfg);
  }

  return {
    project: project
      ? {
          id: project.id,
          name: project.name,
          purpose: project.purpose,
        }
      : null,
    assessment,
    filter: {
      academicYearId: allListed.academicYearId,
      academicYearLabel: allListed.academicYearLabel,
      campus: parseCampus(opts.campus) || null,
      participation: opts.participation || "all",
      ownerScoped: Boolean(opts.ownerUserId),
    },
    rows,
    officialStats,
  };
}

/**
 * Student-visible own results (released only).
 * @param {{ studentUserId: string; db?: import("@prisma/client").PrismaClient }} opts
 */
export async function listStudentOwnResults(opts) {
  const db = opts.db || prisma;
  const attempts = await db.projectAttempt.findMany({
    where: {
      enrollment: {
        studentUserId: opts.studentUserId,
        project: { isPersonalOrg: false, isAttemptOrg: false, assessment: { isNot: null } },
      },
    },
    include: {
      grade: true,
      enrollment: {
        include: {
          project: { include: { assessment: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return attempts.map((attempt) => {
    const project = attempt.enrollment.project;
    const released = Boolean(project.assessment?.resultsReleased);
    const graded = attempt.grade?.status === AttemptGradeStatus.GRADED;
    return {
      projectId: project.id,
      projectName: project.name,
      purpose: project.purpose,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      attemptStatus: attempt.status,
      submittedAt: attempt.submittedAt,
      resultsReleased: released,
      gradingModeLabel: humanGradingMode(project.assessment?.gradingMode),
      grade:
        released && graded
          ? serializeGrade(attempt.grade, { includeFeedback: true })
          : null,
      scoreVisible: released && graded,
      pendingRelease: Boolean(attempt.grade) && !released,
    };
  });
}

/**
 * Official Excel — STUDENT only (server-side).
 * @param {{
 *   projectId?: string | null;
 *   academicYearId?: string | null;
 *   actorUserId: string;
 *   ownerUserId?: string | null;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function buildOfficialResultsWorkbook(opts) {
  const listed = await listAssessmentResultRows({
    projectId: opts.projectId,
    academicYearId: opts.academicYearId,
    campus: opts.campus || null,
    officialOnly: true,
    participation: "students",
    ownerUserId: opts.ownerUserId || null,
    db: opts.db,
  });

  // Hard filter again (defence in depth)
  const official = listed.rows.filter(
    (r) =>
      r.isOfficial &&
      r.participationType === AcademicParticipationType.STUDENT,
  );

  const headers = [
    "Student number",
    "Student name",
    "Email",
    "Programme",
    "Campus",
    "Project",
    "Purpose",
    "Academic year",
    "Attempt #",
    "Attempt status",
    "Auto score",
    "Manual score",
    "Final score",
    "Final %",
    "Result",
    "Grade status",
    "Submitted at",
    "Graded at",
  ];

  const dataRows = official.map((r) => [
    r.studentNumber || "",
    r.studentName || "",
    r.studentEmail || "",
    r.programme || "",
    r.campusLabel || r.campus || "",
    r.projectName || "",
    r.purpose || "",
    r.academicYearLabel || listed.academicYearLabel || "",
    r.attemptNumber,
    r.attemptStatus,
    r.grade?.autoScore ?? "",
    r.grade?.manualScore ?? "",
    r.grade?.finalScore ?? "",
    r.grade?.finalPercent ?? "",
    r.grade?.passFail || "",
    r.grade?.status || "",
    r.submittedAt ? new Date(r.submittedAt).toISOString() : "",
    r.grade?.gradedAt ? new Date(r.grade.gradedAt).toISOString() : "",
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Official results");

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_EXPORTED,
    actorUserId: opts.actorUserId,
    meta: {
      projectId: opts.projectId || null,
      academicYearId: listed.academicYearId,
      officialRowCount: official.length,
      population: "STUDENT_ONLY",
    },
  });

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    buffer,
    filename: `proc-learn-official-results-${listed.academicYearLabel?.replace("/", "-") || "export"}.xlsx`,
    officialCount: official.length,
  };
}
