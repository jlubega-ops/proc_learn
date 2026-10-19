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
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";
import { OrgAutosavedDraftBanner } from "@/components/projects/org-autosaved-draft-banner";
import { ORG_AUTOSAVE_FORM_KEYS } from "@/lib/projects/org-form-drafts";

/**
 * @param {{ projectId: string }} p
 */
export function OrgRequisitionsPanel({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const processes = useProcessActivation(projectId);
  const requisitionOff = !processes.isActive(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [canCreate, setCanCreate] = useState(false);
  const [hasApprovedPlan, setHasApprovedPlan] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(/** @type {any | null} */ (null));
  const [autosaveDraft, setAutosaveDraft] = useState(
    /** @type {{ formKey: string } | null} */ (null),
  );
  const createHref = `/projects/${projectId}/requisitions/new`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rRes = await fetch(`/api/projects/${projectId}/requisitions`, {
        credentials: "include",
      });
      const rData = await rRes.json().catch(() => ({}));
      if (!rRes.ok) {
        showToast({
          message: typeof rData.error === "string" ? rData.error : "Could not load requisitions.",
          severity: "error",
        });
        return;
      }
      setRows(Array.isArray(rData.requisitions) ? rData.requisitions : []);
      setCanCreate(Boolean(rData.canCreate));
      setHasApprovedPlan(Boolean(rData.hasApprovedPlan));
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteRequisition() {
    if (!deleteTarget?.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requisitions/${deleteTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not delete requisition.",
          severity: "error",
        });
        return;
      }
      setDeleteTarget(null);
      showToast({ message: "Requisition deleted.", severity: "success" });
      await load();
    } finally {
      setBusy(false);
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
          formKey={ORG_AUTOSAVE_FORM_KEYS.REQUISITION_NEW}
          continueHref={createHref}
          noun="requisition"
          onChange={setAutosaveDraft}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          startIcon={<RefreshRounded />}
          variant="outlined"
          onClick={() => load()}
          className="w-full sm:w-auto"
          title="Refresh requisitions"
        >
          Refresh
        </Button>
        {canCreate ? (
          <ProcessGateTooltip
            inactive={requisitionOff || !hasApprovedPlan}
            title={
              !hasApprovedPlan
                ? "An approved procurement plan is required first."
                : processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION)
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
                !hasApprovedPlan
                  ? "An approved procurement plan is required first."
                  : requisitionOff
                    ? undefined
                    : autosaveDraft
                      ? "Continue your auto-saved requisition"
                      : "Create a new requisition"
              }
              disabled={requisitionOff || !hasApprovedPlan}
            >
              {autosaveDraft ? "Continue draft" : "Create new"}
            </Button>
          </ProcessGateTooltip>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-4">
          {canCreate && hasApprovedPlan ? (
            <>
              <Typography sx={adminMutedTextSx}>
                {autosaveDraft
                  ? "No submitted requisitions yet. Continue your auto-saved draft above."
                  : "No requisitions yet."}
              </Typography>
              {!autosaveDraft ? (
                <ProcessGateTooltip
                  inactive={requisitionOff}
                  title={processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION)}
                >
                  <Button
                    component={Link}
                    href={createHref}
                    variant="contained"
                    startIcon={<AddRounded />}
                    disabled={requisitionOff}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    title="Submit a requisition for the approved plan"
                  >
                    Submit requisition
                  </Button>
                </ProcessGateTooltip>
              ) : null}
            </>
          ) : canCreate ? (
            <Typography sx={adminMutedTextSx}>No approved plan yet.</Typography>
          ) : (
            <Typography sx={adminMutedTextSx}>No requisitions yet.</Typography>
          )}
        </div>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Estimated total</TableCell>
                <TableCell>Created by</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const detailHref = `/projects/${projectId}/requisitions/${r.id}`;
                return (
                  <TableRow
                    key={r.id}
                    {...clickableTableRowProps({ href: detailHref, router })}
                  >
                    <TableCell>
                      <span className="font-medium">{r.title}</span>
                    </TableCell>
                    <TableCell>{r.requisitionReference || "—"}</TableCell>
                    <TableCell>{formatMoneyUGX(r.estimatedTotalValue)}</TableCell>
                    <TableCell>
                      {r.requester?.displayName || "—"}
                      {r.approvedBy?.displayName ? (
                        <div className="text-xs opacity-70">
                          Approved by {r.approvedBy.displayName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={r.statusColor || statusColor(r.status)}
                        label={r.statusLabel || r.status}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: "nowrap" }}
                      onClick={stopRowClick}
                      onKeyDown={stopRowClick}
                    >
                      {r.canEdit ? (
                        <Tooltip title="Edit requisition">
                          <IconButton
                            component={Link}
                            href={`/projects/${projectId}/requisitions/${r.id}/edit`}
                            size="small"
                            color="primary"
                            aria-label={`Edit requisition ${r.title}`}
                          >
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {r.canDelete ? (
                        <Tooltip title="Delete requisition">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Delete requisition ${r.title}`}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      <Tooltip title="Open requisition details">
                        <IconButton
                          component={Link}
                          href={detailHref}
                          size="small"
                          color="primary"
                          aria-label={`Open requisition ${r.title}`}
                        >
                          <VisibilityRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
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
        onClose={() => !busy && setDeleteTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete requisition?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes <strong>{deleteTarget?.title || "this requisition"}</strong>. Only drafts
            can be deleted. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => void deleteRequisition()}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
