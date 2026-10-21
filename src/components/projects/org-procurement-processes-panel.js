"use client";

import { useCallback } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { procurementMethodLabel } from "@/lib/projects/procurement-methods";

/**
 * Lists procurements that have started a method workflow after method selection.
 *
 * @param {{ projectId: string }} p
 */
export function OrgProcurementProcessesPanel({ projectId }) {
  const listUrl = `/api/projects/${projectId}/procurements`;
  const { data, loading, refreshing, reload } = useApi(listUrl, {
    errorMessage: "Could not load procurements.",
  });
  const rows = Array.isArray(data?.procurements) ? data.procurements : [];

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
        <Typography sx={adminMutedTextSx}>
          No method processes have started. After Accounting Officer approval, select a
          procurement method on the requisition (and ensure that process is activated).
        </Typography>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3"
            >
              <div>
                <p className="font-semibold">
                  {r.procurementNumber} — {r.title}
                </p>
                <p className="text-sm">
                  {procurementMethodLabel(r.procurementMethod)} · {r.status}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="small" color="info" label={procurementMethodLabel(r.procurementMethod)} />
                <Link
                  href={`/projects/${projectId}/procurements/${r.id}`}
                  className="cursor-pointer text-sm font-semibold text-primary underline"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Paper>
  );
}
