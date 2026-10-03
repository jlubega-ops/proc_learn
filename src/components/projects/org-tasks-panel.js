"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { OPEN_COMMITTEE_CONTEXT_EVENT } from "@/components/layout/active-committee-context-banner";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";
import { workflowStepActionLabel } from "@/lib/projects/workflow-decision-options";

/**
 * @param {string | Date | null | undefined} value
 */
function formatWhen(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (!isValid(d)) return "—";
  return format(d, "MMM d, yyyy");
}

/**
 * @param {any} task
 */
function entityLabel(task) {
  if (task.budget?.title) return { type: "Budget", title: task.budget.title };
  if (task.procurementPlan?.title) return { type: "Plan", title: task.procurementPlan.title };
  if (task.requisition?.title) return { type: "Requisition", title: task.requisition.title };
  if (task.procurement?.title || task.procurement?.procurementNumber) {
    return {
      type: "Procurement",
      title: task.procurement.title || task.procurement.procurementNumber,
    };
  }
  return { type: task.entityType || "Record", title: "—" };
}

/**
 * @param {{ projectId: string }} p
 */
export function OrgTasksPanel({ projectId }) {
  const { showToast } = useToast();
  const { session } = useAuthSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState(/** @type {any[]} */ ([]));
  const [mode, setMode] = useState(/** @type {"org" | "committee"} */ ("org"));
  const [hiddenCount, setHiddenCount] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load tasks.",
          severity: "error",
        });
        return;
      }
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setMode(data.mode === "committee" ? "committee" : "org");
      setHiddenCount(typeof data.hiddenCount === "number" ? data.hiddenCount : 0);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load, session?.activeCommitteeId]);

  function openCommitteeSwitch() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_COMMITTEE_CONTEXT_EVENT));
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-3">
      {mode !== "committee" && hiddenCount > 0 ? (
        <Paper variant="outlined" className="p-3">
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Committee work waiting
          </Typography>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 0.5 }}>
            You have {hiddenCount} committee task{hiddenCount === 1 ? "" : "s"} hidden here. Switch
            to the committee seat in the account menu to see and action them.
          </Typography>
          <div className="mt-2">
            <Button size="small" variant="contained" onClick={openCommitteeSwitch}>
              Switch to committee
            </Button>
          </div>
        </Paper>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          startIcon={<RefreshRounded />}
          variant="outlined"
          onClick={() => load()}
          className="w-full sm:w-auto"
          title="Refresh tasks"
        >
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Typography sx={adminMutedTextSx}>
          {mode === "committee"
            ? "No pending tasks for this committee. Open Requisitions or Procurements if you need to continue committee work, or switch back to your organisation role from the banner."
            : "No pending organisation-role tasks."}
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Task</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Record</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>When</TableCell>
                <TableCell align="right">Open</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => {
                const entity = entityLabel(task);
                const href = task.detailHref;
                return (
                  <TableRow
                    key={task.id}
                    {...clickableTableRowProps({ href, router })}
                    aria-label={href ? `Open ${task.title}` : undefined}
                  >
                    <TableCell>{task.title}</TableCell>
                    <TableCell>{task.requiredRoleName || "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{entity.type}</span>
                      <span className="text-zinc-500"> · {entity.title}</span>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={workflowStepActionLabel(task.title) || task.actionKey || "—"}
                        color="info"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color="warning" label={task.status || "PENDING"} />
                    </TableCell>
                    <TableCell>{formatWhen(task.createdAt)}</TableCell>
                    <TableCell align="right" onClick={stopRowClick}>
                      {href ? (
                        <Tooltip title="Open record">
                          <IconButton
                            component={Link}
                            href={href}
                            size="small"
                            color="primary"
                            aria-label={`Open ${task.title}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
