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
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { decisionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
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
import {
  clickableTableRowProps,
  stopRowClick,
} from "@/lib/projects/clickable-table-row";

/**
 * @param {{ projectId: string }} p
 */
export function OrgProcurementPlansPanel({ projectId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState(/** @type {any[]} */ ([]));
  const [canCreate, setCanCreate] = useState(false);
  const [hasApprovedBudget, setHasApprovedBudget] = useState(false);
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
    setLoading(true);
    try {
      const pRes = await fetch(`/api/projects/${projectId}/procurement-plans`, {
        credentials: "include",
      });
      const pData = await pRes.json().catch(() => ({}));
      if (!pRes.ok) {
        showToast({
          message: typeof pData.error === "string" ? pData.error : "Could not load plans.",
          severity: "error",
        });
        return;
      }
      setPlans(Array.isArray(pData.plans) ? pData.plans : []);
      setCanCreate(Boolean(pData.canCreate));
      setHasApprovedBudget(Boolean(pData.hasApprovedBudget));
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit plan.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Procurement plan submitted for review.", severity: "success" });
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          startIcon={<RefreshRounded />}
          variant="outlined"
          onClick={() => load()}
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
              href={`/projects/${projectId}/procurement-plans/new`}
              variant="contained"
              startIcon={<AddRounded />}
              className="w-full sm:w-auto"
              title={
                !hasApprovedBudget
                  ? "An approved budget is required first."
                  : allPlanningOff
                    ? undefined
                    : "Create a new procurement plan"
              }
              disabled={allPlanningOff || !hasApprovedBudget}
            >
              Create new
            </Button>
          </ProcessGateTooltip>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-4">
          {canCreate && hasApprovedBudget ? (
            <>
              <Typography sx={adminMutedTextSx}>No procurement plans yet.</Typography>
              <ProcessGateTooltip
                inactive={allPlanningOff}
                title={processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_PLANNING)}
              >
                <Button
                  component={Link}
                  href={`/projects/${projectId}/procurement-plans/new`}
                  variant="contained"
                  startIcon={<AddRounded />}
                  disabled={allPlanningOff}
                  className="cursor-pointer disabled:cursor-not-allowed"
                  title="Submit a plan for the approved budget"
                >
                  Submit plan
                </Button>
              </ProcessGateTooltip>
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
    </div>
  );
}
