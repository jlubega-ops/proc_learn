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
 * @param {any} row
 * @param {number} passMark
 * @param {number | string} totalMarksDefault
 */
function gradeCells(row, passMark, totalMarksDefault) {
  const marks = row.marks;
  const percent = marks?.finalPercent ?? null;
  const score = marks?.finalScore ?? null;
  const total = marks?.totalMarks ?? totalMarksDefault;
  return {
    score,
    total,
    percent,
    gradeLabel: score != null && total != null && total !== "" ? `${score}/${total}` : "",
    result:
      percent == null
        ? ""
        : humanPassFail(percent >= passMark ? PassFailResult.PASS : PassFailResult.FAIL).label,
  };
}

/**
 * @param {{
 *   projectId: string;
 *   actorUserId: string;
 *   view?: "SUMMARY" | "DETAILS";
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

  const view = opts.view === "SUMMARY" ? "SUMMARY" : "DETAILS";
  const project = listed.project;
  const passMark = listed.scoring?.passMarkPercent ?? 50;
  const totalMarksDefault = listed.scoring?.totalMarks ?? "";
  const releasedLabel = listed.scoring?.resultsReleased
    ? `Yes (${listed.scoring.resultsView === "DETAILS" ? "Full details" : "Overview"})`
    : "No";

  if (view === "SUMMARY") {
    const headers = [
      "Student number",
      "Student name",
      "Email",
      "Programme",
      "Campus",
      "Academic year",
      "Attempt #",
      "Score",
      "Total marks",
      "Grade (score/total)",
      "Final %",
      "Result",
    ];
    const rows = listed.participants.map((row) => {
      const g = gradeCells(row, passMark, totalMarksDefault);
      return [
        row.studentNumber || "",
        row.displayName || "",
        row.email || "",
        row.programme || "",
        row.campusLabel || row.campus || "",
        row.academicYearLabel || "",
        row.latestAttempt?.attemptNumber ?? "",
        numOrBlank(g.score),
        numOrBlank(g.total === "" ? null : g.total),
        g.gradeLabel,
        numOrBlank(g.percent),
        g.result,
      ];
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Proc Learn — results overview"],
      ["Project", project.name || ""],
      ["Purpose", project.purpose || ""],
      ["Total marks", listed.scoring?.totalMarks ?? ""],
      ["Pass mark %", passMark],
      ["Released to students", releasedLabel],
      ["Exported at", formatDateTime(new Date())],
      ["Students", listed.participants.length],
      [],
      headers,
      ...rows,
    ]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(28, h.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, "Results");

    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_EXPORTED,
      actorUserId: opts.actorUserId,
      meta: {
        projectId: opts.projectId,
        population: "PROJECT_ENROLLED",
        view,
        rowCount: listed.participants.length,
      },
    });

    return {
      buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
      filename: `proc-learn-results-overview-${slugForFilename(project.name)}.xlsx`,
      rowCount: listed.participants.length,
    };
  }

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
    "Items completed",
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
    const { score, total, percent, gradeLabel, result } = gradeCells(row, passMark, totalMarksDefault);
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
    ["Proc Learn — full results"],
    ["Project", project.name || ""],
    ["Purpose", project.purpose || ""],
    ["Total marks", listed.scoring?.totalMarks ?? ""],
    ["Pass mark %", passMark],
    ["Released to students", releasedLabel],
    ["Exported at", formatDateTime(new Date())],
    ["Students", listed.participants.length],
    [],
    headers,
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(summaryRows);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(28, h.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, ws, "Grades");

  /** @type {Map<string, { label: string; marks: number }>} */
  const sectionCols = new Map();
  /** @type {Map<string, { label: string; marks: number }>} */
  const itemCols = new Map();
  for (const row of listed.participants) {
    for (const sec of row.processScores || []) {
      if (!sectionCols.has(sec.processCode)) {
        sectionCols.set(sec.processCode, { label: sec.label || sec.processCode, marks: Number(sec.marks) || 0 });
      }
      for (const item of sec.items || []) {
        const key = `${sec.processCode}:${item.key}`;
        if (!itemCols.has(key)) {
          itemCols.set(key, { label: `${sec.label} — ${item.label}`, marks: Number(item.marks) || 0 });
        }
      }
    }
  }

  const identity = (row) => [
    row.studentNumber || "",
    row.displayName || "",
    row.email || "",
    row.campusLabel || row.campus || "",
  ];
  const totals = (row) => [
    numOrBlank(row.marks?.finalScore),
    numOrBlank(row.marks?.totalMarks),
    numOrBlank(row.marks?.finalPercent),
  ];

  if (sectionCols.size) {
    const headers = [
      "Student number",
      "Student name",
      "Email",
      "Campus",
      ...[...sectionCols.values()].map((c) => `${c.label} (/${c.marks})`),
      "Score",
      "Total marks",
      "Final %",
    ];
    const rows = listed.participants.map((row) => {
      const byCode = new Map((row.processScores || []).map((p) => [p.processCode, p]));
      return [
        ...identity(row),
        ...[...sectionCols.keys()].map((code) => numOrBlank(byCode.get(code)?.awarded)),
        ...totals(row),
      ];
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(32, String(h).length + 2)) }));
    XLSX.utils.book_append_sheet(wb, sheet, "Section scores");
  }

  if (itemCols.size) {
    const headers = [
      "Student number",
      "Student name",
      "Email",
      "Campus",
      ...[...itemCols.values()].map((c) => `${c.label} (/${c.marks})`),
    ];
    const rows = listed.participants.map((row) => {
      /** @type {Map<string, any>} */
      const byKey = new Map();
      for (const sec of row.processScores || []) {
        for (const item of sec.items || []) byKey.set(`${sec.processCode}:${item.key}`, item);
      }
      return [...identity(row), ...[...itemCols.keys()].map((key) => numOrBlank(byKey.get(key)?.awarded))];
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(36, String(h).length + 2)) }));
    XLSX.utils.book_append_sheet(wb, sheet, "Item scores");
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ASSESSMENT_RESULTS_EXPORTED,
    actorUserId: opts.actorUserId,
    meta: {
      projectId: opts.projectId,
      population: "PROJECT_ENROLLED",
      view,
      rowCount: listed.participants.length,
    },
  });

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    buffer,
    filename: `proc-learn-results-full-${slugForFilename(project.name)}.xlsx`,
    rowCount: listed.participants.length,
  };
}
