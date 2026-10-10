"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
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
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { decisionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount } from "@/lib/money";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";

/**
 * Department budget list (create on /budgets/new). `readOnly` (Organization Administrator) hides
 * create/edit/submit; `detailHrefBase` points rows at that viewer's detail route.
 * @param {{ projectId: string; readOnly?: boolean; detailHrefBase?: string }} p
 */
export function OrgDepartmentBudgetsPanel({ projectId, readOnly = false, detailHrefBase }) {
  const detailBase = detailHrefBase || `/projects/${projectId}/budgets`;
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [budgets, setBudgets] = useState(/** @type {any[]} */ ([]));
  const [canCreate, setCanCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(/** @type {any} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const processes = useProcessActivation(projectId);
  const budgetingOff = !processes.isActive(PROCESS_FLOW_CODES.BUDGETING);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bRes = await fetch(`/api/projects/${projectId}/budgets`, { credentials: "include" });
      const bData = await bRes.json().catch(() => ({}));
      if (!bRes.ok) {
        showToast({
          message: typeof bData.error === "string" ? bData.error : "Could not load budgets.",
          severity: "error",
        });
        return;
      }
      setBudgets(Array.isArray(bData.budgets) ? bData.budgets : []);
      setCanCreate(!readOnly && Boolean(bData.canCreate));
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast, readOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitBudget(budgetId) {
    if (!(await confirm(decisionConfirmOptions("SUBMIT", "this budget for review")))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", budgetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Budget submitted for review.", severity: "success" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budgets/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete budget.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Draft budget deleted.", severity: "success" });
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleteBusy(false);
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          startIcon={<RefreshRounded />}
          variant="outlined"
          onClick={() => load()}
          className="w-full sm:w-auto"
          title="Refresh budgets"
        >
          Refresh
        </Button>
        {canCreate ? (
          <ProcessGateTooltip
            inactive={budgetingOff}
            title={processes.inactiveTitle(PROCESS_FLOW_CODES.BUDGETING)}
            className="w-full sm:w-auto"
          >
            <Button
              component={Link}
              href={`/projects/${projectId}/budgets/new`}
              variant="contained"
              startIcon={<AddRounded />}
              className="w-full sm:w-auto"
              title={budgetingOff ? undefined : "Create a new department budget"}
              disabled={budgetingOff}
            >
              Create new
            </Button>
          </ProcessGateTooltip>
        ) : null}
      </div>

      {budgets.length === 0 ? (
        <Typography sx={adminMutedTextSx}>No budgets yet.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Financial year</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Total (UGX)</TableCell>
                <TableCell>Created by</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {budgets.map((b) => {
                const canEdit = canCreate && (b.status === "DRAFT" || b.status === "RETURNED");
                const canDelete = canCreate && b.status === "DRAFT";
                const detailHref = `${detailBase}/${b.id}`;
                return (
                  <TableRow
                    key={b.id}
                    {...clickableTableRowProps({ href: detailHref, router })}
                  >
                    <TableCell>
                      <span className="font-medium">{b.title}</span>
                      <div className="text-xs opacity-70">
                        {b.totals?.lineCount || 0} line
                        {(b.totals?.lineCount || 0) === 1 ? "" : "s"}
                      </div>
                    </TableCell>
                    <TableCell>{b.budgetReference || "—"}</TableCell>
                    <TableCell>{b.financialYear?.label || "—"}</TableCell>
                    <TableCell>{b.department?.name || "Organisation"}</TableCell>
                    <TableCell>{formatMoneyAmount(b.totals?.approvedAmount) || "—"}</TableCell>
                    <TableCell>
                      {b.createdBy?.displayName || "—"}
                      {b.approvedBy?.displayName ? (
                        <div className="text-xs opacity-70">
                          Approved by {b.approvedBy.displayName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={b.statusColor || "info"}
                        label={b.statusLabel || b.status}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: "nowrap" }}
                      onClick={stopRowClick}
                      onKeyDown={stopRowClick}
                    >
                      <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                        <Tooltip title="Open budget details">
                          <IconButton
                            component={Link}
                            href={detailHref}
                            size="small"
                            color="primary"
                            aria-label={`Open budget ${b.title}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canEdit ? (
                          <Tooltip title="Edit draft">
                            <IconButton
                              component={Link}
                              href={`/projects/${projectId}/budgets/${b.id}/edit`}
                              size="small"
                              color="primary"
                              aria-label={`Edit budget ${b.title}`}
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canDelete ? (
                          <Tooltip title="Delete draft">
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`Delete budget ${b.title}`}
                              disabled={busy || deleteBusy}
                              onClick={() => setDeleteTarget(b)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canCreate && (b.status === "DRAFT" || b.status === "RETURNED") ? (
                          <Tooltip
                            title={
                              budgetingOff
                                ? processes.inactiveTitle(PROCESS_FLOW_CODES.BUDGETING)
                                : "Submit for review"
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="info"
                                aria-label={`Submit budget ${b.title}`}
                                disabled={busy || (budgetingOff)}
                                onClick={() => submitBudget(b.id)}
                              >
                                {busy ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <SendRounded fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Delete draft budget?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes &ldquo;{deleteTarget?.title || "this draft"}&rdquo;. Only
            unsubmitted drafts can be deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void confirmDelete()}
            disabled={deleteBusy}
          >
            {deleteBusy ? <CircularProgress size={22} color="inherit" /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
