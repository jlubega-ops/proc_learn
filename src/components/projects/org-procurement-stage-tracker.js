"use client";

import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import { format } from "date-fns";
import { adminMutedTextSx, adminOutlinedTableContainerSx } from "@/lib/admin-mui-surfaces";
import { isWorkflowOnlyOrgRole } from "@/lib/project-org-role";

const STEP_ICON = {
  done: <CheckCircleRounded fontSize="small" sx={{ color: "#16a34a" }} aria-label="Done" />,
  current: <HourglassTopRounded fontSize="small" color="primary" aria-label="In progress" />,
  upcoming: (
    <RadioButtonUncheckedRounded fontSize="small" sx={{ color: "text.disabled" }} aria-label="Not started" />
  ),
};

/**
 * Where the procurement workflow is and whom it is waiting on — visible to every viewer.
 * @param {{ progress: any; blockedTask?: { title: string; message: string } | null; hasOwnTask: boolean }} p
 */
export function OrgProcurementStageTracker({ progress, blockedTask, hasOwnTask }) {
  if (!progress) return null;
  const finished = progress.status === "COMPLETED";
  const current = progress.currentStep;
  const people = (progress.waitingOnPeople || []).join(", ");

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Workflow progress
        </Typography>
        <Chip
          size="small"
          color={finished ? "success" : "info"}
          label={
            finished
              ? "Completed"
              : `Step ${progress.currentStepNumber ?? "—"} of ${progress.totalSteps}`
          }
        />
      </div>
      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
        {progress.processName}
      </Typography>

      {!finished && current ? (
        <Alert severity={hasOwnTask ? "info" : "warning"} sx={{ mb: 1.5 }}>
          {hasOwnTask ? (
            <>
              <strong>Your turn:</strong> {current.label}. Use the review task below.
            </>
          ) : (
            <>
              <strong>Pending {progress.waitingOnRole || current.roleName}:</strong> {current.label}
              {people ? ` (${people})` : ""}. You can view this case but cannot act until it is your
              turn.
            </>
          )}
        </Alert>
      ) : null}

      {blockedTask ? (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <strong>Task waiting in another role:</strong> {blockedTask.title}. {blockedTask.message}
        </Alert>
      ) : null}

      {(progress.earlierPhases || []).map((phase) => (
        <details key={phase.phase} className="mb-2 rounded border border-black/10 px-2 py-1 dark:border-white/15">
          <summary className="cursor-pointer text-sm font-semibold">
            Earlier stage: {phase.phase} — {phase.processName}
            {phase.status === "COMPLETED" ? " (completed)" : ""}
          </summary>
          <StepList steps={phase.steps} label={`${phase.phase} workflow steps`} />
        </details>
      ))}

      <StepList steps={progress.steps} label="Workflow steps" />
    </Paper>
  );
}

/**
 * @param {{ steps: any[]; label: string }} p
 */
function StepList({ steps, label }) {
  return (
    <ol className="grid gap-1 sm:grid-cols-2" aria-label={label}>
      {(steps || []).map((s) => {
        const committee = isWorkflowOnlyOrgRole(s.roleName);
        return (
          <li
            key={s.stepNumber}
            className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
              s.state === "current" ? "bg-[var(--nav-active-bg)] font-semibold" : ""
            }`}
          >
            <span className="mt-0.5 shrink-0">{STEP_ICON[s.state] || STEP_ICON.upcoming}</span>
            <span className="min-w-0">
              {s.stepNumber}. {s.label}
              <span className="flex flex-wrap items-center gap-1 text-xs">
                <span className="opacity-70">{s.roleName}</span>
                {committee ? (
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    icon={<GroupsRounded />}
                    label="Committee"
                    sx={{ height: 18, "& .MuiChip-label": { px: 0.5, fontSize: 11 } }}
                  />
                ) : null}
              </span>
              {s.actedBy?.name ? (
                <span className="block text-xs opacity-70">
                  {decisionVerb(s.actedBy.decision)} by {s.actedBy.name}
                  {s.actedBy.asCommittee ? " (committee seat)" : s.actedBy.roleName ? ` (${s.actedBy.roleName})` : ""}
                  {s.actedBy.at ? ` · ${format(new Date(s.actedBy.at), "MMM d, yyyy")}` : ""}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * @param {string | null | undefined} decision
 */
function decisionVerb(decision) {
  const d = String(decision || "").toUpperCase();
  if (d === "RETURN") return "Returned";
  if (d === "REJECT") return "Rejected";
  if (d === "SUBMIT") return "Submitted";
  if (d === "APPROVE") return "Approved";
  if (d === "SELECT_METHOD") return "Method selected";
  return "Done";
}

/**
 * Hides a procurement section the viewer has no right to see, and makes it view-only
 * (native disabled fieldset) when they can see it but not act on it.
 * @param {{ access?: { view: boolean; act: boolean; reason: string } | null; children: import("react").ReactNode }} p
 */
export function ProcurementSectionGate({ access, children }) {
  if (!access) return <>{children}</>;
  if (!access.view) return null;
  if (access.act) return <>{children}</>;
  return (
    <fieldset
      disabled
      className="m-0 min-w-0 border-0 p-0 [&_[role=combobox]]:pointer-events-none [&_button]:opacity-60"
    >
      <legend className="sr-only">View only</legend>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
        <VisibilityRounded sx={{ fontSize: 16 }} aria-hidden />
        View only — {access.reason}
      </div>
      {children}
    </fieldset>
  );
}
