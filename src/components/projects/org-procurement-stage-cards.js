"use client";

import Link from "next/link";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { adminMutedTextSx, adminOutlinedTableContainerSx } from "@/lib/admin-mui-surfaces";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import {
  procurementStageHref,
  procurementStageLabel,
  procurementStagesForMethod,
} from "@/lib/projects/procurement-task-stage";

/**
 * Read-only lifecycle overview: one card per stage with its status. Actions live on stage pages.
 * @param {{
 *   projectId: string;
 *   row: any;
 *   sections: Record<string, { view: boolean }> | null;
 *   taskStage: string | null;
 *   summaries?: Record<string, { status: any; summary: string[] }> | null;
 * }} p
 */
export function ProcurementStageCards({ projectId, row, sections, taskStage, summaries = null }) {
  const stages = procurementStagesForMethod(row.procurementMethod);
  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }} component="section" aria-label="Stages">
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Stages
      </Typography>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((key, idx) => {
          const { status, summary } = summaries?.[key] || describeProcurementStage(key, row);
          const canView = !sections || Boolean(sections[key]?.view);
          const yourTurn = taskStage === key;
          return (
            <li
              key={key}
              className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${
                yourTurn ? "border-primary bg-[color:var(--nav-active-bg)]" : "border-[color:var(--border-subtle)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold wrap-break-word">
                  <span className="mr-1 text-xs opacity-60">{idx + 1}.</span>
                  {procurementStageLabel(key, row.procurementMethod)}
                </p>
                <Chip
                  size="small"
                  color={status.color}
                  variant={status.outlined ? "outlined" : "filled"}
                  label={status.label}
                />
              </div>
              {summary.length ? (
                <Typography variant="body2" sx={{ ...adminMutedTextSx, wordBreak: "break-word" }}>
                  {summary.join(" · ")}
                </Typography>
              ) : null}
              {canView ? (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  {yourTurn ? <Chip size="small" color="primary" label="Your turn" /> : <span />}
                  <Button
                    component={Link}
                    href={procurementStageHref(projectId, row.id, key, row.procurementMethod)}
                    size="small"
                    endIcon={<ChevronRightRounded />}
                    aria-label={`Open ${procurementStageLabel(key, row.procurementMethod)}`}
                  >
                    {yourTurn ? "Open task" : "Open"}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Paper>
  );
}
