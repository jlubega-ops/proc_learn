"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import { format } from "date-fns";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

/** @param {unknown} value */
export function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(/** @type {any} */ (value));
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
}

/** @param {unknown} value */
export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(/** @type {any} */ (value));
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy HH:mm");
}

/** @type {Record<string, string>} */
const DOT_CLASS = {
  success: "bg-green-600",
  error: "bg-brand-red",
  warning: "bg-brand-yellow ring-1 ring-zinc-400/60",
  info: "bg-primary",
};

/**
 * Status chip using the semantic tones (blue info, yellow pending, red error, green success).
 * @param {{ status?: { label: string; tone?: string } | null; size?: "small" | "medium" }} props
 */
export function ToneChip({ status }) {
  if (!status?.label) return null;
  const tone = status.tone || "info";
  return (
    <Chip
      size="small"
      color={/** @type {any} */ (tone)}
      variant={tone === "warning" ? "outlined" : "filled"}
      label={status.label}
      sx={tone === "warning" ? { borderColor: "var(--brand-yellow)", bgcolor: "color-mix(in oklab, var(--brand-yellow) 22%, transparent)", color: "var(--foreground)" } : undefined}
    />
  );
}

/**
 * One-line "who · role · when" for an action.
 * @param {{ entry: any }} props
 */
function EntryActor({ entry }) {
  if (!entry.actor && !entry.role) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {entry.actor ? <span className="font-medium text-foreground">{entry.actor}</span> : null}
      {entry.role ? (
        <span className="rounded-full bg-[color:var(--nav-active-bg)] px-2 py-0.5 text-[11px] font-medium text-primary">
          {entry.role}
        </span>
      ) : null}
      {entry.committeeRole ? (
        <span className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5 text-[11px]">
          {entry.committeeRole}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Inline, chronological history: what was done, by whom, in which role, and when.
 * @param {{ entries: any[]; emptyText?: string; dense?: boolean }} props
 */
export function HistoryTimeline({ entries, emptyText = "No recorded actions yet.", dense = false }) {
  if (!entries?.length) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }
  return (
    <ol className="relative space-y-0">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
          <span className="relative flex w-3 shrink-0 justify-center" aria-hidden>
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${DOT_CLASS[e.tone] || DOT_CLASS.info}`} />
            {i < entries.length - 1 ? (
              <span className="absolute top-4 bottom-[-0.25rem] w-px bg-[color:var(--border-subtle)]" />
            ) : null}
          </span>
          <div className={`min-w-0 flex-1 ${dense ? "text-xs" : "text-sm"}`}>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <p className="font-semibold text-foreground">
                {e.action}
                {e.recordLabel ? (
                  <span className="ml-2 align-middle text-[11px] font-medium text-zinc-500">{e.recordLabel}</span>
                ) : null}
              </p>
              <Tooltip title={fmtDateTime(e.at)}>
                <time className="shrink-0 text-xs text-zinc-500 tabular-nums" dateTime={String(e.at)}>
                  {fmtDateTime(e.at)}
                </time>
              </Tooltip>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-600 dark:text-zinc-400">
              <EntryActor entry={e} />
              {e.detail ? <span className="text-xs">{e.detail}</span> : null}
            </div>
            {e.comment ? (
              <p className="mt-1 rounded-md border-l-2 border-primary bg-[color:var(--nav-active-bg)] px-2 py-1 text-xs text-foreground">
                {e.comment}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * @param {{ facts: Array<{ label: string; value: any; kind?: string; wide?: boolean }> }} props
 */
export function FactGrid({ facts }) {
  if (!facts?.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className={f.wide ? "sm:col-span-2 lg:col-span-3" : ""}>
          <dt className="text-xs text-zinc-500">{f.label}</dt>
          <dd className="break-words font-medium text-foreground">
            {f.kind === "date" ? fmtDate(f.value) : f.kind === "datetime" ? fmtDateTime(f.value) : String(f.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** @param {any} cell */
function cellText(cell) {
  if (cell && typeof cell === "object" && "date" in cell) return fmtDate(cell.date);
  return cell == null || cell === "" ? "—" : String(cell);
}

/**
 * Small read-only table that scrolls inside its card on narrow screens.
 * @param {{ table: { columns: string[]; rows: any[][] } | null }} props
 */
export function MiniTable({ table }) {
  if (!table?.rows?.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--border-subtle)]">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="bg-[color:var(--nav-active-bg)] text-xs text-zinc-600 dark:text-zinc-300">
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-[color:var(--border-subtle)]">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 align-top text-foreground">
                  {cellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pending workflow steps on an item.
 * @param {{ pending?: any[] }} props
 */
export function PendingLine({ pending }) {
  if (!pending?.length) return null;
  return (
    <ul className="space-y-1">
      {pending.map((p, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
          <HourglassTopRounded sx={{ fontSize: 14, color: "var(--brand-yellow-dark, #a16207)" }} aria-hidden />
          <span className="font-medium text-foreground">Waiting: {p.title}</span>
          <span className="text-zinc-500">
            {[p.role, p.assignee].filter(Boolean).join(" · ")}
            {p.since ? ` · since ${fmtDate(p.since)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One record (budget, award, LPO …) with its key facts and inline history.
 * @param {{ item: any; onOpenProcurement?: (id: string) => void; defaultOpen?: boolean }} props
 */
export function ExplorerItemCard({ item, onOpenProcurement, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const history = item.history || [];
  const last = history.length ? history[history.length - 1] : null;
  const panelId = `item-${item.id}-details`;

  return (
    <article className={`${BRAND_CARD_CLASS} overflow-hidden`}>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {item.kind}
              {item.reference ? <span className="ml-2 normal-case tracking-normal text-primary">{item.reference}</span> : null}
            </p>
            <h3 className="break-words text-base font-semibold text-foreground">{item.title}</h3>
            {item.procurementNumber && item.kind !== "Procurement" && item.kind !== "Closure" ? (
              <p className="text-xs text-zinc-500">
                {item.procurementNumber}
                {item.procurementTitle ? ` · ${item.procurementTitle}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(item.tags || []).map((t) => (
              <Chip key={t} size="small" variant="outlined" color="primary" label={t} />
            ))}
            <ToneChip status={item.status} />
          </div>
        </div>

        <div className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {item.createdBy?.name || item.createdAt ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              <PersonRounded sx={{ fontSize: 14 }} aria-hidden />
              Created
              {item.createdBy?.name ? (
                <>
                  {" by "}
                  <span className="font-medium text-foreground">{item.createdBy.name}</span>
                  {item.createdBy.role ? ` (${item.createdBy.role})` : ""}
                </>
              ) : null}
              {item.createdAt ? ` · ${fmtDateTime(item.createdAt)}` : ""}
            </span>
          ) : null}
          {item.approvedBy?.name ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              <TaskAltRounded sx={{ fontSize: 14, color: "#16a34a" }} aria-hidden />
              Approved by <span className="font-medium text-foreground">{item.approvedBy.name}</span>
              {item.approvedBy.role ? ` (${item.approvedBy.role})` : ""}
              {item.approvedBy.at ? ` · ${fmtDateTime(item.approvedBy.at)}` : ""}
            </span>
          ) : null}
          {last ? (
            <Tooltip
              title={[last.actor, last.role, last.detail, last.comment].filter(Boolean).join(" · ") || last.action}
            >
              <span className="inline-flex flex-wrap items-center gap-1">
                <HistoryRounded sx={{ fontSize: 14, color: "var(--brand-blue)" }} aria-hidden />
                Last: <span className="font-medium text-foreground">{last.action}</span>
                {last.actor ? ` — ${last.actor}` : ""}
                {last.role ? ` (${last.role})` : ""} · {fmtDateTime(last.at)}
              </span>
            </Tooltip>
          ) : null}
          <PendingLine pending={item.pending} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="small"
            variant={open ? "contained" : "outlined"}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            startIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            className="cursor-pointer"
          >
            {open ? "Hide details" : `Details & history (${history.length})`}
          </Button>
          {item.procurementId && onOpenProcurement ? (
            <Tooltip title="Every stage of this procurement, A to Z">
              <Button
                type="button"
                size="small"
                variant="text"
                endIcon={<OpenInNewRounded />}
                onClick={() => onOpenProcurement(item.procurementId)}
                className="cursor-pointer"
              >
                Open procurement
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <Collapse in={open} unmountOnExit>
        <div id={panelId} className="space-y-4 border-t border-[color:var(--border-subtle)] p-4">
          <FactGrid facts={item.facts} />
          <MiniTable table={item.table} />
          <section aria-label="History">
            <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold text-primary">
              <HistoryRounded sx={{ fontSize: 18 }} aria-hidden />
              {item.historyIsRecent ? "Recent history" : "History"}
            </h4>
            <HistoryTimeline entries={history} />
          </section>
        </div>
      </Collapse>
    </article>
  );
}
