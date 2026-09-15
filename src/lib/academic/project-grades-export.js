/**
 * Examiner Excel export for one academic project (all enrolled students).
 */
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { formatDurationHuman } from "@/lib/academic/attempt-timer-format";
import { PassFailResult } from "@prisma/client";
import { humanGradeStatus, humanPassFail } from "@/lib/academic/assessment-scoring";
import { listAcademicProjectParticipants } from "@/lib/academic/project-attempts";

/**
 * @param {string | Date | null | undefined} value
 */
function formatDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

/**
 * @param {string} name
 */
function slugForFilename(name) {
  const slug = String(name || "project")
    .trim()
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "project";
}

/**
 * @param {number | null | undefined} n
 */
function numOrBlank(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return Number(n);
}

/**
 * @param {{
 *   projectId: string;
 *   actorUserId: string;
 *   db?: import("@prisma/client").PrismaClient;
 * }} opts
 */
export async function buildProjectGradesWorkbook(opts) {
  const listed = await listAcademicProjectParticipants({
    projectId: opts.projectId,
    db: opts.db,
    take: 2000,
  });
  if (!listed) return null;

  const project = listed.project;
  const passMark = listed.scoring?.passMarkPercent ?? 50;
  const totalMarksDefault = listed.scoring?.totalMarks ?? "";

  const headers = [
    "Student number",
    "Student name",
    "Email",
    "Programme",
    "Campus",
    "Academic year",
    "Status",
    "Attempt #",
    "Attempt status",
    "Enrolled at",
    "Started at",
    "Submitted at",
    "Time used",
    "Time remaining",
    "Time limit",
    "Timer mode",
    "Current stage",
    "Path progress %",
    "Processes completed",
    "Score",
    "Total marks",
    "Grade (score/total)",
    "Final %",
    "Result",
    "Grade status",
    "Score source",
  ];

  const dataRows = listed.participants.map((row) => {
    const attempt = row.latestAttempt;
    const timer = row.timer;
    const marks = row.marks;
    const percent = marks?.finalPercent ?? null;
    const score = marks?.finalScore ?? null;
    const total = marks?.totalMarks ?? totalMarksDefault;
    const gradeLabel =
      score != null && total != null && total !== ""
        ? `${score}/${total}`
        : "";
    const result =
      percent == null
        ? ""
        : humanPassFail(percent >= passMark ? PassFailResult.PASS : PassFailResult.FAIL).label;
    const processCount =
      marks?.completedCount != null && marks?.allowedCount != null
        ? `${marks.completedCount}/${marks.allowedCount}`
        : "";

    return [
      row.studentNumber || "",
      row.displayName || "",
      row.email || "",
      row.programme || "",
      row.campusLabel || row.campus || "",
      row.academicYearLabel || "",
      row.status?.label || "",
      attempt?.attemptNumber ?? "",
      attempt?.status || "",
      formatDateTime(row.enrolledAt),
      formatDateTime(timer?.startedAt || attempt?.startedAt),
      formatDateTime(timer?.submittedAt || attempt?.submittedAt),
      timer?.elapsedSeconds != null ? formatDurationHuman(timer.elapsedSeconds) : "",
      timer?.remainingSeconds != null ? formatDurationHuman(timer.remainingSeconds) : "",
      timer?.limitSeconds != null ? formatDurationHuman(timer.limitSeconds) : "",
      timer?.label || "",
      row.currentStageLabel || row.currentStageKey || "",
      numOrBlank(row.progressPercent),
      processCount,
      numOrBlank(score),
      numOrBlank(total === "" ? null : total),
      gradeLabel,
      numOrBlank(percent),
      result,
      marks?.status ? humanGradeStatus(marks.status).label : "",
      marks?.live ? "Live" : marks ? "Stored" : "",
    ];
  });

  const wb = XLSX.utils.book_new();
  const summaryRows = [
    ["Proc Learn — student grades"],
    ["Project", project.name || ""],
    ["Purpose", project.purpose || ""],
    ["Total marks", listed.scoring?.totalMarks ?? ""],
    ["Pass mark %", passMark],
    ["Exported at", formatDateTime(new Date())],
    ["Students", listed.participants.length],
    [],
    headers,
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(summaryRows);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(28, h.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, ws, "Grades");

  const processCodes = [];
  const processLabels = new Map();
  for (const row of listed.participants) {
    for (const proc of row.processScores || []) {
      if (!processCodes.includes(proc.processCode)) {
        processCodes.push(proc.processCode);
      }
      if (proc.label) processLabels.set(proc.processCode, proc.label);
    }
  }

  if (processCodes.length) {
    const procHeaders = [
      "Student number",
      "Student name",
      "Email",
      "Campus",
      ...processCodes.map((code) => processLabels.get(code) || code),
      "Score",
      "Total marks",
      "Final %",
    ];
    const procRows = listed.participants.map((row) => {
      const byCode = new Map((row.processScores || []).map((p) => [p.processCode, p]));
      return [
        row.studentNumber || "",
        row.displayName || "",
        row.email || "",
        row.campusLabel || row.campus || "",
        ...processCodes.map((code) => {
          const proc = byCode.get(code);
          if (!proc) return "";
          return proc.satisfied ? proc.awarded : 0;
        }),
        numOrBlank(row.marks?.finalScore),
        numOrBlank(row.marks?.totalMarks),
        numOrBlank(row.marks?.finalPercent),
      ];
    });
    const procSheet = XLSX.utils.aoa_to_sheet([procHeaders, ...procRows]);
    procSheet["!cols"] = procHeaders.map((h) => ({
      wch: Math.max(12, Math.min(32, String(h).length + 2)),
    }));
    XLSX.utils.book_append_sheet(wb, procSheet, "Process scores");
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_EXPORTED,
    actorUserId: opts.actorUserId,
    meta: {
      projectId: opts.projectId,
      population: "PROJECT_ENROLLED",
      rowCount: listed.participants.length,
    },
  });

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    buffer,
    filename: `proc-learn-grades-${slugForFilename(project.name)}.xlsx`,
    rowCount: listed.participants.length,
  };
}
