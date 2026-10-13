"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useToast } from "@/components/providers/toast-provider";
import { notifyProcessActivationChanged } from "@/hooks/use-process-activation";
import { useApi } from "@/hooks/use-api";
import {
  PROCESS_PATH_ORDER,
  processActivationBlockers,
  processCodeOfFlow,
  processDeactivationBlockers,
  processNeedsLabel,
} from "@/lib/projects/process-dependencies";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";

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
                  No steps yet.
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

  const {
    data,
    loading,
    refreshing: refetching,
    reload,
  } = useApi(`/api/projects/${projectId}/org-process-flow-adoptions`, {
    errorMessage: "Could not load process workflows.",
  });
  const canAdopt = data?.canAdopt === true;
  const restrictedByExaminer = Boolean(data?.restrictedByExaminer);
  const adopted = useMemo(() => (Array.isArray(data?.adopted) ? data.adopted : []), [data]);
  const catalogue = useMemo(() => (Array.isArray(data?.catalogue) ? data.catalogue : []), [data]);

  const [expandedId, setExpandedId] = useState(/** @type {string | false} */ (false));
  const [loadedItems, setLoadedItems] = useState(/** @type {Record<string, any[]>} */ ({}));
  const [itemsLoadingId, setItemsLoadingId] = useState(/** @type {string | null} */ (null));
  const [busyId, setBusyId] = useState(/** @type {string | null} */ (null));

  const itemsCache = useMemo(() => {
    /** @type {Record<string, any[]>} */
    const next = { ...loadedItems };
    for (const row of catalogue) {
      if (row?.id && Array.isArray(row.items)) next[row.id] = row.items;
    }
    for (const row of adopted) {
      if (row?.processFlowId && Array.isArray(row.items)) next[row.processFlowId] = row.items;
    }
    return next;
  }, [adopted, catalogue, loadedItems]);

  const load = useCallback(async () => {
    await reload();
  }, [reload]);

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
        setLoadedItems((prev) => ({ ...prev, [processFlowId]: Array.isArray(data.items) ? data.items : [] }));
      } finally {
        setItemsLoadingId((current) => (current === processFlowId ? null : current));
      }
    },
    [projectId, showToast],
  );

  useEffect(() => {
    if (typeof expandedId === "string" && !itemsCache[expandedId]) {
      void loadItems(expandedId);
    }
  }, [expandedId, itemsCache, loadItems]);

  const rows = useMemo(() => {
    const adoptionByFlow = new Map(adopted.map((a) => [a.processFlowId, a]));
    const list = catalogue.map((c) => ({
      processFlowId: c.id,
      name: c.name,
      description: c.description,
      triggerKey: c.triggerKey,
      code: c.code,
      itemCount: c.itemCount,
      items: c.items,
      adoption: adoptionByFlow.get(c.id) || null,
    }));
    const listed = new Set(list.map((r) => r.processFlowId));
    for (const a of adopted) {
      if (listed.has(a.processFlowId)) continue;
      list.push({
        processFlowId: a.processFlowId,
        name: a.name,
        description: a.description,
        triggerKey: a.triggerKey,
        code: a.code,
        itemCount: a.itemCount,
        items: a.items,
        adoption: a,
      });
    }
    const orderOf = (row) => {
      const i = PROCESS_PATH_ORDER.indexOf(processCodeOfFlow(row) || "");
      return i === -1 ? PROCESS_PATH_ORDER.length : i;
    };
    return list.sort((a, b) => orderOf(a) - orderOf(b) || String(a.name).localeCompare(String(b.name)));
  }, [adopted, catalogue]);

  const { activeCodes, processNames } = useMemo(() => {
    const codes = [];
    /** @type {Record<string, string>} */
    const names = {};
    for (const row of rows) {
      const code = processCodeOfFlow(row);
      if (!code) continue;
      names[code] = row.name;
      if (row.adoption && row.adoption.isActive !== false) codes.push(code);
    }
    return { activeCodes: codes, processNames: names };
  }, [rows]);

  async function setEnabled(row, enable) {
    setBusyId(row.processFlowId);
    try {
      const res = row.adoption
        ? await fetch(`/api/projects/${projectId}/org-process-flow-adoptions/${row.adoption.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: enable }),
          })
        : await fetch(`/api/projects/${projectId}/org-process-flow-adoptions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ processFlowId: row.processFlowId }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not update process.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: enable ? `${row.name} enabled.` : `${row.name} disabled.`,
        severity: "success",
      });
      notifyProcessActivationChanged();
      await load({ silent: true });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy="true" aria-label="Loading process workflows">
        <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, ...adminOutlinedTableContainerSx, position: "relative" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Organisation processes
        </Typography>
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

      {restrictedByExaminer ? (
        <Alert severity="info" className="mb-3">
          Limited to processes allowed for your programme or project.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No processes yet.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {rows.map((row) => {
            const enabled = Boolean(row.adoption) && row.adoption.isActive !== false;
            const busy = busyId === row.processFlowId;
            const wired = Boolean(row.triggerKey);
            const items = itemsCache[row.processFlowId] || row.items || [];
            const stepsLoading = itemsLoadingId === row.processFlowId;
            const code = processCodeOfFlow(row);
            const blockers = code
              ? enabled
                ? processDeactivationBlockers(code, activeCodes, processNames)
                : processActivationBlockers(code, activeCodes, processNames)
              : [];
            const needs = code ? processNeedsLabel(code, processNames) : "";
            const frozen = Boolean(row.adoption?.frozen);
            const switchDisabled =
              !canAdopt || busy || refetching || frozen || (!enabled && !wired) || blockers.length > 0;
            const switchTitle = !canAdopt
              ? "View only"
              : frozen
                ? "Disabled for your programme this academic year"
                : !enabled && !wired
                ? "Not linked to a workflow event"
                : blockers.length
                  ? blockers[0]
                  : enabled
                    ? `Disable ${row.name}`
                    : `Enable ${row.name}`;

            return (
              <Accordion
                key={row.processFlowId}
                expanded={expandedId === row.processFlowId}
                onChange={(_e, isExpanded) => setExpandedId(isExpanded ? row.processFlowId : false)}
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
                  aria-controls={`process-${row.processFlowId}`}
                  id={`process-header-${row.processFlowId}`}
                  sx={{
                    flexDirection: "row-reverse",
                    gap: 1,
                    "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1, minWidth: 0 },
                  }}
                >
                  <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                    <Typography component="span" sx={{ fontWeight: 600, display: "block" }} noWrap>
                      {row.name}
                    </Typography>
                    <Typography component="span" variant="caption" sx={adminMutedTextSx}>
                      {row.itemCount ?? items.length} steps
                      {needs ? ` · Needs ${needs}` : ""}
                    </Typography>
                  </Box>
                  {!wired ? <Chip size="small" color="warning" label="Not wired" /> : null}
                  {row.adoption?.frozen ? (
                    <Tooltip title="Paused — disabled for your programme this academic year">
                      <Chip size="small" color="error" label="Off for programme" />
                    </Tooltip>
                  ) : null}
                  {canAdopt && wired && blockers.length ? (
                    <Tooltip title={blockers.join(" ")}>
                      <LockRounded fontSize="small" color="warning" aria-label={blockers[0]} />
                    </Tooltip>
                  ) : null}
                  <Box
                    sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: enabled ? "success.main" : "error.main",
                        display: { xs: "none", sm: "inline" },
                      }}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </Typography>
                    {busy ? (
                      <CircularProgress size={18} sx={{ mx: 1.5 }} aria-label="Updating" />
                    ) : (
                      <Tooltip title={switchTitle}>
                        <span>
                          <Switch
                            checked={enabled}
                            onChange={(e) => void setEnabled(row, e.target.checked)}
                            disabled={switchDisabled}
                            color="success"
                            slotProps={{ input: { "aria-label": `${row.name}: ${enabled ? "enabled" : "disabled"}` } }}
                          />
                        </span>
                      </Tooltip>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails id={`process-${row.processFlowId}`} sx={{ pt: 0 }}>
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
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      )}
      {refetching ? <Box sx={adminTableRefetchOverlaySx} aria-hidden /> : null}
    </Paper>
  );
}
