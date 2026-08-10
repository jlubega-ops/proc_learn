"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgAuditLogsPanel({ projectId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: "1", pageSize: "50" });
      if (q.trim()) qp.set("q", q.trim());
      const res = await fetch(`/api/projects/${projectId}/audit-logs?${qp}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not load audit logs.",
          severity: "error",
        });
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } finally {
      setLoading(false);
    }
  }, [projectId, q, showToast]);

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
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <TextField
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          size="small"
          sx={{ ...themedTextFieldSx, minWidth: 220 }}
        />
        <Button startIcon={<RefreshRounded />} variant="outlined" onClick={() => load()}>
          Refresh
        </Button>
      </div>
      <Typography sx={{ ...adminMutedTextSx, mb: 2 }} variant="body2">
        Showing organisation configuration and operational actions ({total}).
      </Typography>
      {items.length === 0 ? (
        <Typography sx={adminMutedTextSx}>No activity entries yet.</Typography>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-[color:var(--border-subtle)] p-3"
            >
              <p className="font-semibold">{row.eventType}</p>
              <p>
                {String(row.createdAt).slice(0, 19).replace("T", " ")}
                {row.actorRoleName ? ` · ${row.actorRoleName}` : ""}
                {row.actor?.displayName ? ` · ${row.actor.displayName}` : ""}
              </p>
              {row.meta?.previousStatus || row.meta?.newStatus ? (
                <p>
                  Status: {row.meta.previousStatus || "—"} → {row.meta.newStatus || "—"}
                </p>
              ) : null}
              {row.meta?.comment ? <p>Comment: {String(row.meta.comment)}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Paper>
  );
}
