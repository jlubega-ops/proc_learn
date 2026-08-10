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
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";

/**
 * @param {{ projectId: string }} p
 */
export function OrgProcurementPlansPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState(/** @type {any[]} */ ([]));
  const [canCreate, setCanCreate] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPlan(planId) {
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
          <Button
            component={Link}
            href={`/projects/${projectId}/procurement-plans/new`}
            variant="contained"
            startIcon={<AddRounded />}
            className="w-full sm:w-auto"
            title="Create a new procurement plan"
          >
            Create new
          </Button>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <Typography sx={adminMutedTextSx}>No procurement plans yet.</Typography>
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
              {plans.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <span className="font-medium">{p.title}</span>
                    <div className="text-xs opacity-70">
                      {(p.items || []).length} item{(p.items || []).length === 1 ? "" : "s"}
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
                    <Chip size="small" color={statusColor(p.status)} label={p.status} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Box sx={{ display: "inline-flex", gap: 0.25, justifyContent: "flex-end" }}>
                      <Tooltip title="Open plan details">
                        <IconButton
                          component={Link}
                          href={`/projects/${projectId}/procurement-plans/${p.id}`}
                          size="small"
                          color="primary"
                          aria-label={`Open plan ${p.title}`}
                        >
                          <VisibilityRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canCreate && ["DRAFT", "RETURNED"].includes(p.status) ? (
                        <Tooltip title="Submit for planning review">
                          <span>
                            <IconButton
                              size="small"
                              color="info"
                              aria-label={`Submit plan ${p.title}`}
                              disabled={busy}
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
