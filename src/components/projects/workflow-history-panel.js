"use client";

import { useId } from "react";
import { format, isValid } from "date-fns";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import {
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { workflowDecisionPastLabel } from "@/lib/projects/workflow-status-presentation";

/** @param {unknown} value */
function fmt(value) {
  const d = value ? new Date(String(value)) : null;
  return d && isValid(d) ? format(d, "MMM d, yyyy · h:mm a") : "—";
}

/** @param {string | null | undefined} decision */
function decisionColor(decision) {
  const d = String(decision || "").toUpperCase();
  if (d === "REJECT" || d === "FLAG_EXCEPTION" || d === "CANCEL") return "error";
  if (d === "RETURN") return "warning";
  if (d === "APPROVE" || d === "COMPLETE" || d === "VERIFY") return "success";
  return "primary";
}

/**
 * @typedef {{
 *   id: string;
 *   createdAt: string;
 *   decision?: string | null;
 *   actionLabel?: string | null;
 *   actorName?: string | null;
 *   actorRoleName?: string | null;
 *   previousStatus?: string | null;
 *   newStatus?: string | null;
 *   statusLabel?: string | null;
 *   comment?: string | null;
 *   notes?: (string | null | undefined)[];
 * }} WorkflowHistoryEntry
 */

/** @param {WorkflowHistoryEntry} h */
function statusText(h) {
  if (h.statusLabel) return h.statusLabel;
  if (h.previousStatus || h.newStatus) return `${h.previousStatus || "—"} → ${h.newStatus || "—"}`;
  return "—";
}

/**
 * Collapsed-by-default workflow history table for organisation records.
 * @param {{
 *   history: WorkflowHistoryEntry[];
 *   showStatusChange?: boolean;
 *   title?: string;
 *   emptyMessage?: string | null;
 * }} p
 */
export function WorkflowHistoryPanel({
  history,
  showStatusChange = false,
  title = "Workflow history",
  emptyMessage = null,
}) {
  const baseId = useId();
  const rows = history || [];
  if (!rows.length && !emptyMessage) return null;
  const colCount = showStatusChange ? 6 : 5;

  return (
    <Accordion
      defaultExpanded={false}
      disableGutters
      elevation={0}
      sx={{
        ...adminOutlinedTableContainerSx,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        aria-controls={`${baseId}-content`}
        id={`${baseId}-header`}
        title={`Show or hide ${title.toLowerCase()}`}
        sx={{ "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1 } }}
      >
        <HistoryRounded fontSize="small" color="primary" aria-hidden />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Chip size="small" color="info" label={rows.length} />
      </AccordionSummary>
      <AccordionDetails id={`${baseId}-content`} sx={{ pt: 0 }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={{ ...adminTableSx, minWidth: showStatusChange ? 760 : 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }}>#</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>Date &amp; time</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>By</TableCell>
                {showStatusChange ? <TableCell>Status</TableCell> : null}
                <TableCell>Comment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      {emptyMessage}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((h, idx) => {
                  const notes = (h.notes || []).filter(Boolean);
                  return (
                    <TableRow key={h.id} hover sx={{ "& td": { verticalAlign: "top" } }}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmt(h.createdAt)}</TableCell>
                      <TableCell>
                        {h.actionLabel ? (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {h.actionLabel}
                          </Typography>
                        ) : (
                          <Chip
                            size="small"
                            variant="outlined"
                            color={decisionColor(h.decision)}
                            label={workflowDecisionPastLabel(h.decision)}
                          />
                        )}
                        {notes.map((n) => (
                          <Typography key={n} variant="caption" component="p" sx={adminMutedTextSx}>
                            {n}
                          </Typography>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {h.actorName || "—"}
                        </Typography>
                        {h.actorRoleName ? (
                          <Typography variant="caption" sx={adminMutedTextSx}>
                            {h.actorRoleName}
                          </Typography>
                        ) : null}
                      </TableCell>
                      {showStatusChange ? <TableCell>{statusText(h)}</TableCell> : null}
                      <TableCell sx={{ whiteSpace: "pre-wrap", maxWidth: 320 }}>
                        {h.comment || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}
