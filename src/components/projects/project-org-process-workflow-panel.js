"use client";

import { useCallback, useEffect, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { format, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";

/**
 * @param {unknown} value
 */
function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

/**
 * @param {{ items: any[]; loading?: boolean }} p
 */
function ProcessStepsTable({ items, loading = false }) {
  if (loading) {
    return (
      <Box sx={{ ...adminCenteredLoadingBoxSx, minHeight: 100, py: 2 }} aria-busy="true">
        <CircularProgress size={28} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
      <Table size="small" sx={adminTableSx}>
        <TableHead>
          <TableRow>
            <TableCell>Step</TableCell>
            <TableCell>Task description</TableCell>
            <TableCell>Required role</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                <Typography variant="body2" sx={adminMutedTextSx}>
                  This process has no steps defined yet.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.stepNumber}</TableCell>
                <TableCell>{row.taskDescription}</TableCell>
                <TableCell>{row.requiredRole?.name || "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * @param {{ projectId: string }} p
 */
export function ProjectOrgProcessWorkflowPanel({ projectId }) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [canAdopt, setCanAdopt] = useState(false);

  const [adopted, setAdopted] = useState(/** @type {any[]} */ ([]));
  const [catalogue, setCatalogue] = useState(/** @type {any[]} */ ([]));

  const [expandedCatalogueId, setExpandedCatalogueId] = useState(
    /** @type {string | false} */ (false),
  );
  const [expandedAdoptedId, setExpandedAdoptedId] = useState(/** @type {string | false} */ (false));

  const [itemsCache, setItemsCache] = useState(/** @type {Record<string, any[]>} */ ({}));
  const [itemsLoadingId, setItemsLoadingId] = useState(/** @type {string | null} */ (null));

  const [adoptBusyId, setAdoptBusyId] = useState(/** @type {string | null} */ (null));
  const [removeRow, setRemoveRow] = useState(/** @type {any} */ (null));
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(
    async (opts = /** @type {{ silent?: boolean }} */ ({})) => {
      const silent = Boolean(opts.silent);
      if (silent) setRefetching(true);
      else setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/org-process-flow-adoptions`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load process workflows.",
            severity: "error",
          });
          return;
        }
        setAdopted(Array.isArray(data.adopted) ? data.adopted : []);
        setCatalogue(Array.isArray(data.catalogue) ? data.catalogue : []);
        if (typeof data.canAdopt === "boolean") setCanAdopt(data.canAdopt);
      } finally {
        if (silent) setRefetching(false);
        else setLoading(false);
      }
    },
    [projectId, showToast],
  );

  const loadItems = useCallback(
    async (processFlowId) => {
      if (!processFlowId) return;
      setItemsLoadingId(processFlowId);
      try {
        const qp = new URLSearchParams({ page: "1", pageSize: "50" });
        const res = await fetch(
          `/api/projects/${projectId}/org-process-flows/${processFlowId}/items?${qp.toString()}`,
          { credentials: "include" },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load process steps.",
            severity: "error",
          });
          return;
        }
        const items = Array.isArray(data.items) ? data.items : [];
        setItemsCache((prev) => ({ ...prev, [processFlowId]: items }));
      } finally {
        setItemsLoadingId((current) => (current === processFlowId ? null : current));
      }
    },
    [projectId, showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (expandedCatalogueId && typeof expandedCatalogueId === "string" && !itemsCache[expandedCatalogueId]) {
      void loadItems(expandedCatalogueId);
    }
  }, [expandedCatalogueId, itemsCache, loadItems]);

  useEffect(() => {
    if (expandedAdoptedId && typeof expandedAdoptedId === "string") {
      const row = adopted.find((r) => r.id === expandedAdoptedId);
      if (row?.processFlowId && !itemsCache[row.processFlowId]) {
        void loadItems(row.processFlowId);
      }
    }
  }, [adopted, expandedAdoptedId, itemsCache, loadItems]);

  async function adoptProcess(processRow) {
    if (!processRow?.id || processRow.isAdopted) return;
    setAdoptBusyId(processRow.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-process-flow-adoptions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processFlowId: processRow.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not add process.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process added to your organisation.", severity: "success" });
      await load({ silent: true });
    } finally {
      setAdoptBusyId(null);
    }
  }

  async function removeAdoption() {
    if (!removeRow?.id) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/org-process-flow-adoptions/${removeRow.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not remove process.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process removed from your organisation.", severity: "success" });
      if (expandedAdoptedId === removeRow.id) setExpandedAdoptedId(false);
      setRemoveRow(null);
      await load({ silent: true });
    } finally {
      setRemoveBusy(false);
    }
  }

  function statusChip(isAdopted) {
    return isAdopted ? (
      <Chip size="small" color="success" icon={<CheckCircleRounded />} label="Added" />
    ) : (
      <Chip size="small" color="warning" label="Not added" />
    );
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading process workflows">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-4">
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Organisation processes
        </Typography>
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          Processes added to this organisation. Expand a process to view its steps
          {canAdopt ? " or remove it" : ""}.
        </Typography>

        {adopted.length === 0 ? (
          <Typography variant="body2" sx={adminMutedTextSx}>
            No processes added yet. Choose one from the available list below.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {adopted.map((row) => {
              const expanded = expandedAdoptedId === row.id;
              const items = itemsCache[row.processFlowId] || [];
              const stepsLoading = itemsLoadingId === row.processFlowId;
              return (
                <Accordion
                  key={row.id}
                  expanded={expanded}
                  onChange={(_e, isExpanded) => setExpandedAdoptedId(isExpanded ? row.id : false)}
                  disableGutters
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    "&:before": { display: "none" },
                    bgcolor: "background.paper",
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRounded />}
                    aria-controls={`adopted-process-${row.id}`}
                    id={`adopted-process-header-${row.id}`}
                    sx={{ "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1, flexWrap: "wrap" } }}
                  >
                    <Typography component="span" sx={{ fontWeight: 600, flex: "1 1 auto", minWidth: 0 }}>
                      {row.name}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ ...adminMutedTextSx, display: { xs: "none", sm: "inline" } }}>
                      {row.itemCount ?? 0} steps · Added {fmtDate(row.createdAt)}
                    </Typography>
                    <Chip size="small" color="success" icon={<CheckCircleRounded />} label="Added" />
                  </AccordionSummary>
                  <AccordionDetails id={`adopted-process-${row.id}`} sx={{ pt: 0 }}>
                    {row.description ? (
                      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
                        {row.description}
                      </Typography>
                    ) : null}
                    <ProcessStepsTable items={items} loading={stepsLoading && items.length === 0} />
                    {canAdopt ? (
                      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteOutlineRounded />}
                          onClick={() => setRemoveRow(row)}
                          className="w-full sm:w-auto"
                          title={`Remove ${row.name}`}
                        >
                          Remove process
                        </Button>
                      </Box>
                    ) : null}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </Paper>

      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx, position: "relative" }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Available processes
        </Typography>
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
          {canAdopt
            ? "Expand a process to review its steps and add it to your organisation."
            : "Expand a process to view its steps."}
        </Typography>

        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="outlined"
            startIcon={refetching ? <CircularProgress size={16} /> : <RefreshRounded />}
            disabled={refetching}
            onClick={() => load({ silent: true })}
            className="w-full sm:w-auto"
            title="Refresh processes"
          >
            Refresh
          </Button>
        </div>

        {catalogue.length === 0 ? (
          <Typography variant="body2" sx={adminMutedTextSx}>
            No processes are available yet. System administrators must add process flows under
            Project settings.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {catalogue.map((row) => {
              const expanded = expandedCatalogueId === row.id;
              const items = itemsCache[row.id] || [];
              const stepsLoading = itemsLoadingId === row.id;
              const adoptBusy = adoptBusyId === row.id;
              return (
                <Accordion
                  key={row.id}
                  expanded={expanded}
                  onChange={(_e, isExpanded) => setExpandedCatalogueId(isExpanded ? row.id : false)}
                  disableGutters
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    "&:before": { display: "none" },
                    bgcolor: "background.paper",
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRounded />}
                    aria-controls={`catalogue-process-${row.id}`}
                    id={`catalogue-process-header-${row.id}`}
                    sx={{ "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1, flexWrap: "wrap" } }}
                  >
                    <Typography component="span" sx={{ fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>
                      {row.name}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ ...adminMutedTextSx, display: { xs: "none", sm: "inline" } }}>
                      {row.itemCount ?? 0} steps
                    </Typography>
                    {statusChip(row.isAdopted)}
                  </AccordionSummary>
                  <AccordionDetails id={`catalogue-process-${row.id}`} sx={{ pt: 0 }}>
                    {row.description ? (
                      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
                        {row.description}
                      </Typography>
                    ) : null}
                    <ProcessStepsTable items={items} loading={stepsLoading && items.length === 0} />
                    {canAdopt ? (
                      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                        {row.isAdopted ? (
                          <Chip
                            color="success"
                            icon={<CheckCircleRounded />}
                            label="Already added"
                          />
                        ) : (
                          <Button
                            variant="contained"
                            startIcon={
                              adoptBusy ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <AddRounded />
                              )
                            }
                            disabled={adoptBusy || refetching}
                            onClick={() => void adoptProcess(row)}
                            className="w-full sm:w-auto"
                            title={`Add ${row.name} to organisation`}
                          >
                            {adoptBusy ? "Adding…" : "Add process"}
                          </Button>
                        )}
                      </Box>
                    ) : null}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
        {refetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}
      </Paper>

      <Dialog
        open={Boolean(removeRow)}
        onClose={() => !removeBusy && setRemoveRow(null)}
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>Remove process?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Remove <strong>{removeRow?.name}</strong> from your organisation? You can add it again
            later from the available list.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveRow(null)} disabled={removeBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void removeAdoption()}
            disabled={removeBusy}
            startIcon={removeBusy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {removeBusy ? "Removing…" : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
