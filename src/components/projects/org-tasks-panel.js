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
  return { type: task.entityType || "Record", title: "—" };
}

/**
 * @param {{ projectId: string }} p
 */
export function OrgTasksPanel({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState(/** @type {any[]} */ ([]));

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
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-3">
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
        <Typography sx={adminMutedTextSx}>No pending tasks.</Typography>
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
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => {
                const entity = entityLabel(task);
                const detailHref = task.detailHref || "";
                return (
                  <TableRow
                    key={task.id}
                    {...clickableTableRowProps({
                      href: detailHref,
                      router,
                      disabled: !detailHref,
                    })}
                  >
                    <TableCell>
                      <span className="font-medium">{task.title}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={task.requiredRoleName} color="primary" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Chip size="small" label={entity.type} color="info" variant="outlined" />
                        <span className="text-sm">{entity.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.actionKey ? (
                        <Chip size="small" label={task.actionKey} color="info" variant="outlined" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label="Pending your action" color="warning" />
                    </TableCell>
                    <TableCell>{formatWhen(task.createdAt)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: "nowrap" }}
                      onClick={stopRowClick}
                      onKeyDown={stopRowClick}
                    >
                      {detailHref ? (
                        <Tooltip title="Open record to review or approve">
                          <IconButton
                            component={Link}
                            href={detailHref}
                            size="small"
                            color="primary"
                            aria-label={`Open ${entity.title}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography component="span" sx={adminMutedTextSx}>
                          —
                        </Typography>
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
