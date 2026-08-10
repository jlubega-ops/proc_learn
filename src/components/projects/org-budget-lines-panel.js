"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
} from "@/lib/admin-mui-surfaces";

/**
 * @param {{ projectId: string }} p
 */
export function OrgBudgetLinesPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget-lines`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load budgets.",
          severity: "error",
        });
        return;
      }
      setRows(Array.isArray(data.budgetLines) ? data.budgetLines : []);
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
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="mb-3 flex justify-end">
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>
      {rows.length === 0 ? (
        <Typography sx={adminMutedTextSx}>No budget lines yet.</Typography>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((b) => {
            const approved = Number(b.approvedAmount || 0);
            const committed = Number(b.committedAmount || 0);
            return (
              <li key={b.id} className="rounded-lg border border-[color:var(--border-subtle)] p-3">
                <p className="font-semibold">
                  {b.code} — {b.name}
                </p>
                <p>
                  Approved {approved.toFixed(2)} · Committed {committed.toFixed(2)} · Available{" "}
                  {(approved - committed).toFixed(2)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Paper>
  );
}
