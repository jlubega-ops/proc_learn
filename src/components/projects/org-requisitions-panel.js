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
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
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

/**
 * @param {{ projectId: string }} p
 */
export function OrgRequisitionsPanel({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));

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
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

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
          title="Refresh requisitions"
        >
          Refresh
        </Button>
        <Button
          component={Link}
          href={`/projects/${projectId}/requisitions/new`}
          variant="contained"
          startIcon={<AddRounded />}
          className="w-full sm:w-auto"
          title="Create a new requisition"
        >
          Create new
        </Button>
      </div>

      {rows.length === 0 ? (
        <Typography sx={adminMutedTextSx}>No requisitions yet.</Typography>
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
    </div>
  );
}
