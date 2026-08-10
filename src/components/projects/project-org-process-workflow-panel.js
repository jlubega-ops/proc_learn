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

        // Prefill step cache from embedded items (avoids a fragile second fetch).
        const nextCache = {};
        for (const row of Array.isArray(data.catalogue) ? data.catalogue : []) {
          if (row?.id && Array.isArray(row.items)) nextCache[row.id] = row.items;
        }
        for (const row of Array.isArray(data.adopted) ? data.adopted : []) {
          if (row?.processFlowId && Array.isArray(row.items)) {
            nextCache[row.processFlowId] = row.items;
          }
        }
        if (Object.keys(nextCache).length > 0) {
          setItemsCache((prev) => ({ ...prev, ...nextCache }));
        }
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
          message: typeof data.error === "string" ? data.error : "Could not activate process.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Process activated for your organisation.", severity: "success" });
      await load({ silent: true });
    } finally {
      setAdoptBusyId(null);
    }
  }

  async function setAdoptionActive(row, isActive) {
    if (!row?.id) return;
    setAdoptBusyId(row.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/org-process-flow-adoptions/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update process status.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: isActive ? "Process activated." : "Process deactivated.",
        severity: "success",
      });
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

  function statusChip(row) {
    if (row?.isAdopted && row?.isActive !== false) {
      return (
        <Chip size="small" color="success" icon={<CheckCircleRounded />} label="Active" />
      );
    }
    if (row?.isAdopted && row?.isActive === false) {
      return <Chip size="small" color="warning" label="Inactive" />;
    }
    return <Chip size="small" color="default" label="Not activated" />;
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
          Processes activated for this organisation. Expand a process to view its steps
          {canAdopt ? ", activate/deactivate it, or remove it" : ""}.
        </Typography>

        {adopted.length === 0 ? (
          <Typography variant="body2" sx={adminMutedTextSx}>
            No processes activated yet. Choose one from the available list below.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {adopted.map((row) => {
              const expanded = expandedAdoptedId === row.id;
              const items = itemsCache[row.processFlowId] || row.items || [];
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
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ ...adminMutedTextSx, display: { xs: "none", md: "inline" } }}
                    >
                      {row.triggerKey
                        ? `Engine: ${row.triggerKey}`
                        : row.code
                          ? `Code: ${row.code}`
                          : "No engine event"}
                      {` · ${row.itemCount ?? 0} steps`}
                    </Typography>
                    {row.triggerKey ? (
                      <Chip size="small" color="info" label={row.triggerKey} />
                    ) : (
                      <Chip size="small" color="default" label="Not wired" />
                    )}
                    <Chip
                      size="small"
                      color={row.isActive === false ? "warning" : "success"}
                      icon={row.isActive === false ? undefined : <CheckCircleRounded />}
                      label={row.isActive === false ? "Inactive" : "Active"}
                    />
                  </AccordionSummary>
                  <AccordionDetails id={`adopted-process-${row.id}`} sx={{ pt: 0 }}>
                    {row.description ? (
                      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
                        {row.description}
                      </Typography>
                    ) : null}
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      <strong>Engine event:</strong> {row.triggerKey || "—"}
                      {row.code ? (
                        <>
                          {" "}
                          · <strong>Code:</strong> {row.code}
                        </>
                      ) : null}
                    </Typography>
                    <ProcessStepsTable items={items} loading={stepsLoading && items.length === 0} />
                    {canAdopt ? (
                      <Box
                        sx={{
                          mt: 2,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 1,
                          justifyContent: "flex-end",
                        }}
                      >
                        <Button
                          variant="outlined"
                          color={row.isActive === false ? "primary" : "warning"}
                          disabled={adoptBusyId === row.id}
                          onClick={() => setAdoptionActive(row, row.isActive === false)}
                          className="w-full sm:w-auto"
                          title={
                            row.isActive === false
                              ? `Activate ${row.name}`
                              : `Deactivate ${row.name}`
                          }
                        >
                          {adoptBusyId === row.id
                            ? "Updating…"
                            : row.isActive === false
                              ? "Activate"
                              : "Deactivate"}
                        </Button>
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
            ? "Expand a process to review its steps and activate it for your organisation."
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
              const items = itemsCache[row.id] || row.items || [];
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
                      {row.triggerKey ? ` · ${row.triggerKey}` : row.code ? ` · ${row.code}` : " · legacy"}
                    </Typography>
                    {row.triggerKey ? (
                      <Chip size="small" color="info" label="Engine" />
                    ) : (
                      <Chip size="small" color="default" label="Not wired" />
                    )}
                    {statusChip(row)}
                  </AccordionSummary>
                  <AccordionDetails id={`catalogue-process-${row.id}`} sx={{ pt: 0 }}>
                    {row.description ? (
                      <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
                        {row.description}
                      </Typography>
                    ) : null}
                    {row.triggerKey ? (
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        Budget/plan/requisition submit uses this when trigger is{" "}
                        <strong>{row.triggerKey}</strong>
                        {row.code ? ` (code ${row.code})` : ""}.
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ mb: 2, color: "error.main" }}>
                        Legacy catalogue row — activating this will not drive budget/plan/requisition
                        submit. Prefer the engine template with the same name that shows trigger{" "}
                        <strong>BUDGET_SUBMITTED</strong> / <strong>PLANNING_SUBMITTED</strong> /{" "}
                        <strong>REQUISITION_SUBMITTED</strong>.
                      </Typography>
                    )}
                    <ProcessStepsTable items={items} loading={stepsLoading && items.length === 0} />
                    {canAdopt ? (
                      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                        {row.isAdopted && row.isActive !== false ? (
                          <Chip
                            color="success"
                            icon={<CheckCircleRounded />}
                            label="Already activated"
                          />
                        ) : row.isAdopted && row.isActive === false ? (
                          <Button
                            variant="contained"
                            disabled={adoptBusy || refetching || !row.triggerKey}
                            onClick={() => {
                              const adoption = adopted.find((a) => a.processFlowId === row.id);
                              if (adoption) void setAdoptionActive(adoption, true);
                            }}
                            className="w-full sm:w-auto"
                            title={`Activate ${row.name}`}
                          >
                            {adoptBusy ? "Activating…" : "Activate process"}
                          </Button>
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
                            disabled={adoptBusy || refetching || !row.triggerKey}
                            onClick={() => void adoptProcess(row)}
                            className="w-full sm:w-auto"
                            title={
                              row.triggerKey
                                ? `Activate ${row.name} for this organisation`
                                : "Legacy process is not wired to submit triggers"
                            }
                          >
                            {adoptBusy ? "Activating…" : "Activate process"}
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
            Remove <strong>{removeRow?.name}</strong> from your organisation? You can activate it
            again later from the available list.
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
