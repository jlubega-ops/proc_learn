"use client";

import { useCallback, useState } from "react";
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
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { decisionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import { notifyOrgTasksChanged } from "@/hooks/use-pending-task-counts";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";
import { OrgAutosavedDraftBanner } from "@/components/projects/org-autosaved-draft-banner";
import { ORG_AUTOSAVE_FORM_KEYS } from "@/lib/projects/org-form-drafts";

/**
 * @param {{ projectId: string }} p
 */
export function OrgProcurementPlansPanel({ projectId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const listUrl = `/api/projects/${projectId}/procurement-plans`;
  const { data, loading, refreshing, reload } = useApi(listUrl, {
    errorMessage: "Could not load plans.",
  });
  const plans = Array.isArray(data?.plans) ? data.plans : [];
  const canCreate = Boolean(data?.canCreate);
  const hasApprovedBudget = Boolean(data?.hasApprovedBudget);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(/** @type {any} */ (null));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [autosaveDraft, setAutosaveDraft] = useState(
    /** @type {{ formKey: string } | null} */ (null),
  );
  const createHref = `/projects/${projectId}/procurement-plans/new`;
  const processes = useProcessActivation(projectId);
  const allPlanningOff =
    !processes.isActive(PROCESS_FLOW_CODES.PROCUREMENT_PLANNING) &&
    !processes.isActive(PROCESS_FLOW_CODES.EMERGENCY_PLANNING);
  /** @param {any} p */
  const planCode = (p) =>
    p.isEmergency ? PROCESS_FLOW_CODES.EMERGENCY_PLANNING : PROCESS_FLOW_CODES.PROCUREMENT_PLANNING;
  /** @param {any} p */
  const planProcessOff = (p) => !processes.isActive(planCode(p));

  const load = useCallback(async () => {
    await reload();
    void revalidateApi(listUrl);
  }, [listUrl, reload]);

  async function submitPlan(planId) {
    if (!(await confirm(decisionConfirmOptions("SUBMIT", "this plan for review")))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurement-plans`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", planId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof body.error === "string" ? body.error : "Could not submit plan.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Procurement plan submitted for review.", severity: "success" });
      notifyOrgTasksChanged(projectId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/procurement-plans/${deleteTarget.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof body.error === "string" ? body.error : "Could not delete plan.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Procurement plan deleted.", severity: "success" });
      setDeleteTarget(null);
      notifyOrgTasksChanged(projectId);
      await load();
    } finally {
      setDeleteBusy(false);
    }
  }

  const statusColor = (s) => {
    if (s === "APPROVED") return "success";
    if (s === "REJECTED" || s === "CLOSED") return "error";
    if (s === "RETURNED" || s === "SUBMITTED" || s === "UNDER_REVIEW") return "warning";
    return "info";
  };

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-3">
      {canCreate ? (
        <OrgAutosavedDraftBanner
          projectId={projectId}
          formKey={ORG_AUTOSAVE_FORM_KEYS.PROCUREMENT_PLAN_NEW}
          continueHref={createHref}
          noun="procurement plan"
          onChange={setAutosaveDraft}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRounded />}
          variant="outlined"
          onClick={() => void load()}
          disabled={refreshing}
          className="w-full sm:w-auto"
          title="Refresh procurement plans"
        >
          Refresh
        </Button>
        {canCreate ? (
          <ProcessGateTooltip
            inactive={allPlanningOff || !hasApprovedBudget}
            title={
              !hasApprovedBudget
                ? "An approved budget is required first."
                : processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_PLANNING)
            }
            className="w-full sm:w-auto"
          >
            <Button
              component={Link}
              href={createHref}
              variant="contained"
              startIcon={<AddRounded />}
              className="w-full sm:w-auto"
              title={
                !hasApprovedBudget
                  ? "An approved budget is required first."
                  : allPlanningOff
                    ? undefined
                    : autosaveDraft
                      ? "Continue your auto-saved plan"
                      : "Create a new procurement plan"
              }
              disabled={allPlanningOff || !hasApprovedBudget}
            >
              {autosaveDraft ? "Continue draft" : "Create new"}
            </Button>
          </ProcessGateTooltip>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-4">
          {canCreate && hasApprovedBudget ? (
            <>
              <Typography sx={adminMutedTextSx}>
                {autosaveDraft
                  ? "No submitted plans yet. Continue your auto-saved draft above."
                  : "No procurement plans yet."}
              </Typography>
              {!autosaveDraft ? (
                <ProcessGateTooltip
                  inactive={allPlanningOff}
                  title={processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_PLANNING)}
                >
                  <Button
                    component={Link}
                    href={createHref}
                    variant="contained"
                    startIcon={<AddRounded />}
                    disabled={allPlanningOff}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    title="Submit a plan for the approved budget"
                  >
                    Submit plan
                  </Button>
                </ProcessGateTooltip>
              ) : null}
            </>
          ) : canCreate ? (
            <Typography sx={adminMutedTextSx}>No approved budget yet.</Typography>
          ) : (
            <Typography sx={adminMutedTextSx}>No procurement plans yet.</Typography>
          )}
        </div>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Financial year</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Created by</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((p) => {
                const detailHref = `/projects/${projectId}/procurement-plans/${p.id}`;
                return (
                  <TableRow
                    key={p.id}
                    {...clickableTableRowProps({ href: detailHref, router })}
                  >
                    <TableCell>
                      <span className="font-medium">{p.title}</span>
                      <div className="text-xs opacity-70">
                        {(p.items || []).length} item{(p.items || []).length === 1 ? "" : "s"}
                        {p.isEmergency ? " · Emergency" : ""}
                      </div>
                    </TableCell>
                    <TableCell>{p.planReference || "—"}</TableCell>
                    <TableCell>{p.financialYear?.label || "—"}</TableCell>
                    <TableCell>{p.department?.name || "—"}</TableCell>
                    <TableCell>
                      {p.createdBy?.displayName || "—"}
                      {p.approvedBy?.displayName ? (
                        <div className="text-xs opacity-70">
                          Approved by {p.approvedBy.displayName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.isEmergency ? (
                          <Chip size="small" color="warning" label="Emergency" />
                        ) : null}
                        <Chip
                          size="small"
                          color={p.statusColor || statusColor(p.status)}
                          label={p.statusLabel || p.status}
                        />
                      </div>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: "nowrap" }}
                      onClick={stopRowClick}
                      onKeyDown={stopRowClick}
                    >
                      <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                        <Tooltip title="Open plan details">
                          <IconButton
                            component={Link}
                            href={detailHref}
                            size="small"
                            color="primary"
                            aria-label={`Open plan ${p.title}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {p.canEdit ? (
                          <Tooltip title="Edit plan">
                            <IconButton
                              component={Link}
                              href={`/projects/${projectId}/procurement-plans/${p.id}/edit`}
                              size="small"
                              color="primary"
                              aria-label={`Edit plan ${p.title}`}
                            >
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {p.canDelete ? (
                          <Tooltip title="Delete plan">
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`Delete plan ${p.title}`}
                              disabled={busy || deleteBusy}
                              onClick={() => setDeleteTarget(p)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canCreate && ["DRAFT", "RETURNED"].includes(p.status) ? (
                          <Tooltip
                            title={
                              planProcessOff(p)
                                ? processes.inactiveTitle(planCode(p))
                                : "Submit for planning review"
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                color="info"
                                aria-label={`Submit plan ${p.title}`}
                                disabled={busy || planProcessOff(p)}
                                onClick={() => submitPlan(p.id)}
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
        <DialogTitle>Delete plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes &ldquo;{deleteTarget?.title || "this plan"}&rdquo;. Only
            drafts can be deleted.
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
