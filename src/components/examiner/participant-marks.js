"use client";

import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import { BRAND_CARD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import { formatMarks } from "@/lib/academic/assessment-sections";
import { ScoreSectionsList } from "@/components/academic/score-sections-list";
import { EXPLORER_SECTION_GROUPS } from "@/lib/academic/examiner-org-explorer-sections";
import { formatDurationClock, formatDurationHuman } from "@/lib/academic/attempt-timer-format";
import { formatPrintDate, formatPrintDateTime } from "@/components/print/print-document";

/** @param {any} data */
function scoreOf(data) {
  const m = data?.marks;
  if (!m || m.finalScore == null || !m.totalMarks) return null;
  return { score: Number(m.finalScore) || 0, total: Number(m.totalMarks) || 0, percent: m.finalPercent ?? 0 };
}

/** @param {string | null | undefined} passFail */
function resultChip(passFail) {
  if (passFail === "PASS") return { color: /** @type {const} */ ("success"), label: "Pass" };
  if (passFail === "FAIL") return { color: /** @type {const} */ ("error"), label: "Fail" };
  return null;
}

/**
 * Status, score and timer chips for the participant hero.
 * @param {{ data: any }} props
 */
export function ParticipantHeroChips({ data }) {
  const score = scoreOf(data);
  const result = resultChip(data?.marks?.passFail);
  const timer = data?.timer;
  return (
    <>
      {data?.status?.label ? <Chip size="small" color="primary" label={data.status.label} /> : null}
      {score ? (
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={`${formatMarks(score.score)}/${formatMarks(score.total)} · ${score.percent}%`}
        />
      ) : null}
      {result ? <Chip size="small" color={result.color} label={result.label} /> : null}
      {timer?.mode && timer.mode !== "NONE" && !timer.submittedAt ? (
        <Chip
          size="small"
          color={timer.expired ? "error" : "warning"}
          label={
            timer.expired
              ? "Time up"
              : timer.remainingSeconds != null
                ? `${formatDurationClock(timer.remainingSeconds)} left`
                : timer.label
          }
        />
      ) : null}
    </>
  );
}

/**
 * Section-by-section marks with each item the student completed.
 * @param {{ data: any }} props
 */
export function ParticipantMarksView({ data }) {
  const sections = Array.isArray(data?.processScores) ? data.processScores : [];
  const score = scoreOf(data);
  const attempt = data?.attempt;
  const timer = data?.timer;

  const details = [
    ["Attempt", attempt?.attemptNumber ? `#${attempt.attemptNumber}` : null],
    ["Started", attempt?.startedAt ? formatPrintDateTime(attempt.startedAt) : null],
    ["Submitted", attempt?.submittedAt ? formatPrintDateTime(attempt.submittedAt) : "Not yet"],
    ["Time used", timer?.elapsedSeconds != null ? formatDurationHuman(timer.elapsedSeconds) : null],
    ["Deadline", timer?.deadlineAt ? formatPrintDateTime(timer.deadlineAt) : null],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-4">
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={BRAND_SECTION_TITLE_CLASS}>Marks</h2>
          {data?.marks?.live ? <Chip size="small" color="info" label="Live" /> : null}
        </div>
        {score ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {formatMarks(score.score)}
                <span className="text-base font-medium text-zinc-500"> / {formatMarks(score.total)}</span>
              </span>
              <span className="tabular-nums text-primary">{score.percent}%</span>
            </div>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.max(0, Number(score.percent) || 0))}
              sx={{ mt: 1, height: 8, borderRadius: 4 }}
              aria-label="Score"
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No marks yet.</p>
        )}
        {details.length ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="break-words font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <ScoreSectionsList sections={sections} />
    </div>
  );
}

/**
 * Printable participant report (student, attempt, marks per item, organisation records).
 * @param {any} data
 * @returns {import("@/components/print/print-document").PrintSection[]}
 */
export function participantPrintSections(data) {
  const s = data?.student || {};
  const attempt = data?.attempt;
  const timer = data?.timer;
  const score = scoreOf(data);
  const sections = Array.isArray(data?.processScores) ? data.processScores : [];
  const counts = data?.counts || {};

  return [
    {
      type: "fields",
      title: "Section A: Student and attempt",
      fields: [
        { label: "Student", value: s.displayName },
        { label: "Email", value: s.email },
        { label: "Student no.", value: s.studentNumber },
        { label: "Reg. no.", value: s.registrationNumber },
        { label: "Programme", value: s.programmeShortName || s.programmeName },
        { label: "Campus", value: s.campusLabel },
        { label: "Project", value: data?.academicProject?.name },
        { label: "Attempt", value: attempt?.attemptNumber ? `#${attempt.attemptNumber}` : null },
        { label: "Started", value: attempt?.startedAt ? formatPrintDateTime(attempt.startedAt) : null },
        { label: "Submitted", value: attempt?.submittedAt ? formatPrintDateTime(attempt.submittedAt) : "Not yet" },
        { label: "Time used", value: timer?.elapsedSeconds != null ? formatDurationHuman(timer.elapsedSeconds) : null },
        { label: "Status", value: data?.status?.label },
        {
          label: "Score",
          value: score ? `${formatMarks(score.score)} / ${formatMarks(score.total)} (${score.percent}%)` : null,
        },
        { label: "Result", value: resultChip(data?.marks?.passFail)?.label || null },
      ],
    },
    {
      type: "table",
      title: "Section B: Marks by section",
      columns: [
        { id: "no", label: "No.", width: "5%" },
        { id: "section", label: "Section" },
        { id: "items", label: "Items done", align: "center" },
        { id: "marks", label: "Marks", align: "right" },
        { id: "awarded", label: "Awarded", align: "right" },
      ],
      rows: sections.map((sec, i) => ({
        key: sec.sectionKey,
        cells: {
          no: `${i + 1}.`,
          section: sec.label,
          items: `${sec.completedItems}/${sec.totalItems}`,
          marks: formatMarks(sec.marks),
          awarded: formatMarks(sec.awarded),
        },
      })),
      empty: "No scored sections.",
      footer: score ? { label: "Total", value: `${formatMarks(score.score)} / ${formatMarks(score.total)}` } : undefined,
    },
    {
      type: "table",
      title: "Section C: Marks by item",
      columns: [
        { id: "section", label: "Section", width: "22%" },
        { id: "item", label: "Item" },
        { id: "status", label: "Status", width: "12%" },
        { id: "marks", label: "Marks", align: "right", width: "10%" },
        { id: "awarded", label: "Awarded", align: "right", width: "10%" },
      ],
      rows: sections.flatMap((sec) =>
        (sec.items || []).map((item, i) => ({
          key: `${sec.sectionKey}:${item.key}`,
          cells: {
            section: i === 0 ? sec.label : "",
            item: item.label,
            status: item.satisfied ? "Done" : "Not done",
            marks: formatMarks(item.marks),
            awarded: formatMarks(item.awarded),
          },
        })),
      ),
      empty: "No scored items.",
    },
    {
      type: "table",
      title: "Section D: Organisation records",
      columns: [
        { id: "record", label: "Record" },
        { id: "count", label: "Count", align: "right", width: "15%" },
      ],
      rows: EXPLORER_SECTION_GROUPS.flatMap((g) => g.items)
        .filter((it) => it.key !== "overview" && it.key !== "structure")
        .map((it) => ({ key: it.key, cells: { record: it.label, count: String(counts[it.key] ?? 0) } })),
    },
  ];
}

/** @param {any} data */
export function participantPrintMeta(data) {
  const org = data?.organisation || {};
  return {
    organisation: { name: org.displayName || org.name || "—", code: org.projectCode || null },
    reference: data?.student?.studentNumber || null,
    status: data?.status?.label || null,
    signatures: [
      {
        label: "Examined by",
        name: data?.printedBy?.name || null,
        role: data?.printedBy?.role || null,
        date: new Date(),
      },
    ],
    fileName: `Participant ${data?.student?.studentNumber || data?.student?.displayName || ""} ${formatPrintDate(new Date())}`.trim(),
  };
}
