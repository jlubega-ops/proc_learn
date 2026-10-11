"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import { BRAND_CARD_CLASS, BRAND_HERO_CARD_CLASS } from "@/lib/brand-ui";
import { adminCenteredLoadingBoxSx, adminLoadingSpinnerSx } from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import {
  FactGrid,
  HistoryTimeline,
  MiniTable,
  PendingLine,
  ToneChip,
  fmtDate,
  fmtDateTime,
} from "@/components/examiner/examiner-explorer-parts";

/** @type {Record<string, string>} */
const RAIL_CLASS = {
  success: "border-green-600 text-green-700 dark:text-green-400",
  error: "border-brand-red text-brand-red",
  warning: "border-brand-yellow text-foreground",
  info: "border-primary text-primary",
  none: "border-[color:var(--border-subtle)] text-zinc-500",
};

/**
 * A record inside a stage (solicitation, award, LPO …), facts collapsed by default.
 * @param {{ record: any }} props
 */
function StageRecord({ record }) {
  const [open, setOpen] = useState(false);
  const hasMore = Boolean(record.facts?.length || record.table?.rows?.length);
  return (
    <div className="rounded-xl border border-[color:var(--border-subtle)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {record.kind}
            {record.reference && record.kind !== "Method" ? (
              <span className="ml-2 normal-case tracking-normal text-primary">{record.reference}</span>
            ) : null}
          </p>
          <p className="break-words font-semibold text-foreground">{record.title}</p>
          {record.createdBy?.name ? (
            <p className="text-xs text-zinc-500">
              By {record.createdBy.name}
              {record.createdBy.role ? ` (${record.createdBy.role})` : ""}
            </p>
          ) : null}
          {record.approvedBy?.name ? (
            <p className="text-xs text-zinc-500">
              Approved by {record.approvedBy.name}
              {record.approvedBy.role ? ` (${record.approvedBy.role})` : ""}
              {record.approvedBy.at ? ` · ${fmtDateTime(record.approvedBy.at)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <ToneChip status={record.status} />
          {hasMore ? (
            <Button
              type="button"
              size="small"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              startIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
              className="cursor-pointer"
            >
              {open ? "Less" : "Details"}
            </Button>
          ) : null}
        </div>
      </div>
      <Collapse in={open} unmountOnExit>
        <div className="mt-3 space-y-3">
          <FactGrid facts={record.facts} />
          <MiniTable table={record.table} />
        </div>
      </Collapse>
    </div>
  );
}

/**
 * Read-only A–Z of one procurement: every stage, its records, and who did what in which role.
 * @param {{ apiBase: string; procurementId: string; onBack: () => void }} props
 */
export function ExaminerExplorerProcurement({ apiBase, procurementId, onBack }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/org/procurement/${encodeURIComponent(procurementId)}`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not load this procurement.",
          severity: "error",
        });
        setData(null);
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [apiBase, procurementId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
        <Typography sx={{ mt: 2 }}>Loading procurement…</Typography>
      </Box>
    );
  }

  if (!data) {
    return (
      <div className={`${BRAND_CARD_CLASS} p-4`}>
        <Button type="button" startIcon={<ArrowBackRounded />} onClick={onBack} className="cursor-pointer">
          All procurements
        </Button>
        <p className="mt-2 text-sm text-zinc-500">This procurement could not be loaded.</p>
      </div>
    );
  }

  const p = data.procurement;
  const stages = data.stages || [];

  return (
    <div className="space-y-4">
      <section className={BRAND_HERO_CARD_CLASS} aria-label="Procurement">
        <Button
          type="button"
          size="small"
          startIcon={<ArrowBackRounded />}
          onClick={onBack}
          className="mb-2 cursor-pointer"
        >
          All procurements
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{p.procurementNumber}</p>
        <h2 className="break-words text-lg font-bold text-foreground sm:text-xl">{p.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip size="small" color="primary" label={p.method} />
          <ToneChip status={p.status} />
          {p.isEmergency ? <Chip size="small" color="error" variant="outlined" label="Emergency" /> : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Department", p.department],
            ["Financial year", p.financialYear],
            ["Officer", p.officer],
            ["Estimated value", p.estimatedValue],
            ["Started", fmtDate(p.createdAt)],
            ["Closed", p.closedAt ? fmtDate(p.closedAt) : "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="break-words font-medium text-foreground">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        {data.pending?.length ? (
          <div className="mt-3">
            <PendingLine pending={data.pending} />
          </div>
        ) : null}
      </section>

      <nav aria-label="Stages" className={`${BRAND_CARD_CLASS} p-3`}>
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {stages.map((s, i) => (
            <li key={s.key} className="shrink-0">
              <a
                href={`#stage-${s.key}`}
                title={s.status?.label || s.label}
                className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold transition hover:bg-[color:var(--nav-active-bg)] ${
                  RAIL_CLASS[s.status?.tone || (s.events.length ? "info" : "none")]
                }`}
              >
                <span className="tabular-nums">{i + 1}</span>
                <span className="text-foreground">{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="space-y-4">
        {stages.map((s, i) => {
          const reached = s.events.length > 0 || s.records.length > 0;
          return (
            <li key={s.key} id={`stage-${s.key}`} className={`${BRAND_CARD_CLASS} scroll-mt-24 p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                      RAIL_CLASS[s.status?.tone || (reached ? "info" : "none")]
                    }`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">{s.label}</h3>
                    {s.startedAt ? (
                      <p className="text-xs text-zinc-500">
                        {fmtDateTime(s.startedAt)}
                        {s.endedAt && s.endedAt !== s.startedAt ? ` → ${fmtDateTime(s.endedAt)}` : ""}
                        {` · ${s.events.length} action${s.events.length === 1 ? "" : "s"}`}
                      </p>
                    ) : null}
                    {s.summary?.length ? <p className="text-xs text-zinc-500">{s.summary.join(" · ")}</p> : null}
                  </div>
                </div>
                <ToneChip status={s.status} />
              </div>

              {!reached ? (
                <p className="mt-3 text-sm text-zinc-500">Not reached yet.</p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                  <div className="space-y-2">
                    {s.records.length ? (
                      s.records.map((r) => <StageRecord key={r.id} record={r} />)
                    ) : (
                      <p className="text-sm text-zinc-500">No records in this stage.</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-[color:var(--background)] p-3 ring-1 ring-[color:var(--border-subtle)]">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Who did what</h4>
                    <HistoryTimeline entries={s.events} emptyText="No actions recorded in this stage." />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
