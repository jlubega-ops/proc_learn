"use client";

import { useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
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
  const listUrl = `/api/projects/${projectId}/budget-lines`;
  const { data, loading, refreshing, reload } = useApi(listUrl, {
    errorMessage: "Could not load budgets.",
  });
  const rows = Array.isArray(data?.budgetLines) ? data.budgetLines : [];

  const load = useCallback(async () => {
    await reload();
    void revalidateApi(listUrl);
  }, [listUrl, reload]);

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
        <Button
          startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRounded />}
          variant="outlined"
          onClick={() => void load()}
          disabled={refreshing}
        >
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
