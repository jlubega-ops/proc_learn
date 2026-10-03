"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableRefetchOverlaySx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { clickableTableRowProps, stopRowClick } from "@/lib/projects/clickable-table-row";
import { PROVIDER_CATEGORY_OPTIONS, providerCategoryLabel } from "@/lib/projects/provider-terms";
import { ProviderQualificationChip } from "@/components/projects/org-provider-compliance";
import { OrgProviderFormDialog } from "@/components/projects/org-provider-form-dialog";
import {
  OrgProviderDeleteDialog,
  OrgProviderGenerateDialog,
  OrgProviderStatusDialog,
} from "@/components/projects/org-provider-dialogs";

/** @type {Record<string, { label: string; color: "info" | "error" | "warning" }>} */
export const PROVIDER_STATUS_CHIP = {
  ACTIVE: { label: "Active", color: "info" },
  SUSPENDED: { label: "Suspended", color: "error" },
  INACTIVE: { label: "Deactivated", color: "warning" },
};

/**
 * @param {{ text: string; label: string; showToast: (t: any) => void }} p
 */
export function CopyIconButton({ text, label, showToast }) {
  return (
    <Tooltip title={`Copy ${label}`}>
      <IconButton
        size="small"
        color="primary"
        aria-label={`Copy ${label}`}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(text);
            showToast({ message: `${label.charAt(0).toUpperCase()}${label.slice(1)} copied.`, severity: "success" });
          } catch {
            showToast({ message: "Could not copy to the clipboard.", severity: "error" });
          }
        }}
      >
        <ContentCopyRounded fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/**
 * Organisation provider register. Managing (create / generate / edit / suspend /
 * delete) is enforced server-side for Procurement Officer and Head PDU; everyone
 * else gets a read-only view.
 *
 * @param {{ projectId: string; detailBase: string }} p
 */
export function OrgProvidersPanel({ projectId, detailBase }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, qualifies: 0, notQualifies: 0 });
  const [canManage, setCanManage] = useState(false);
  const [canSeeCredentials, setCanSeeCredentials] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [qualification, setQualification] = useState("ALL");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(/** @type {any | null} */ (null));
  const [generateOpen, setGenerateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(/** @type {any | null} */ (null));
  const [deleteTarget, setDeleteTarget] = useState(/** @type {any | null} */ (null));

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefetching(true);
      try {
        const qs = new URLSearchParams({
          page: String(page + 1),
          pageSize: String(rowsPerPage),
          qualification,
        });
        if (search) qs.set("search", search);
        if (category) qs.set("category", category);
        if (status) qs.set("status", status);
        const res = await fetch(`/api/projects/${projectId}/providers?${qs}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not load providers.",
            severity: "error",
          });
          return;
        }
        setRows(Array.isArray(data.providers) ? data.providers : []);
        setTotal(Number(data.total) || 0);
        setCounts(data.counts || { all: 0, qualifies: 0, notQualifies: 0 });
        setCanManage(Boolean(data.canManage));
        setCanSeeCredentials(Boolean(data.canSeeCredentials));
      } catch {
        showToast({ message: "Network error. Please try again.", severity: "error" });
      } finally {
        setLoading(false);
        setRefetching(false);
      }
    },
    [projectId, page, rowsPerPage, qualification, search, category, status, showToast],
  );

  const loadedOnce = useRef(false);
  useEffect(() => {
    void load(!loadedOnce.current);
    loadedOnce.current = true;
  }, [load]);

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy role="status">
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!canManage ? (
          <Chip size="small" color="info" label="Read-only view" />
        ) : (
          <span />
        )}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            startIcon={<RefreshRounded />}
            variant="outlined"
            onClick={() => void load()}
            className="w-full sm:w-auto"
            title="Refresh the provider register"
          >
            Refresh
          </Button>
          {canManage ? (
            <>
              <Button
                startIcon={<AutoAwesomeRounded />}
                variant="outlined"
                onClick={() => setGenerateOpen(true)}
                className="w-full sm:w-auto"
                title="Generate fictional providers with different behaviours"
              >
                Generate providers
              </Button>
              <Button
                startIcon={<AddRounded />}
                variant="contained"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
                className="w-full sm:w-auto"
                title="Add a provider to the register"
              >
                Add provider
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <TextField
            placeholder="Search name, TIN, registration or line of business"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ ...themedTextFieldSx, minWidth: { lg: 320 } }}
            className="w-full lg:w-auto lg:flex-1"
            slotProps={{
              input: { startAdornment: <SearchRounded fontSize="small" sx={{ mr: 1, opacity: 0.6 }} /> },
              htmlInput: { "aria-label": "Search providers" },
            }}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={qualification}
            onChange={(_e, v) => {
              if (!v) return;
              setQualification(v);
              setPage(0);
            }}
            aria-label="Filter by eligibility"
            className="flex-wrap"
          >
            <ToggleButton value="ALL">All ({counts.all})</ToggleButton>
            <ToggleButton value="QUALIFIES" color="success">
              Qualifies ({counts.qualifies})
            </ToggleButton>
            <ToggleButton value="NOT_QUALIFIES" color="error">
              Doesn&apos;t qualify ({counts.notQualifies})
            </ToggleButton>
          </ToggleButtonGroup>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
            <TextField
              select
              label="Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
              sx={{ ...themedTextFieldSx, minWidth: 180 }}
            >
              <MenuItem value="">All categories</MenuItem>
              {PROVIDER_CATEGORY_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
              sx={{ ...themedTextFieldSx, minWidth: 150 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="SUSPENDED">Suspended</MenuItem>
              <MenuItem value="INACTIVE">Deactivated</MenuItem>
            </TextField>
          </div>
        </div>
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mt: 1 }}>
          Eligibility uses the full requirement set for competitive methods. Pickers re-check against
          the specific method and category.
        </Typography>
      </Paper>

      <Box sx={{ position: "relative" }}>
        <TableContainer component={Paper} variant="outlined" sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Categories</TableCell>
                <TableCell>Eligibility</TableCell>
                <TableCell>Status</TableCell>
                {canSeeCredentials ? <TableCell>Portal login</TableCell> : null}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canSeeCredentials ? 6 : 5}>
                    <Typography sx={adminMutedTextSx}>
                      {counts.all === 0 && !search && !category && !status
                        ? canManage
                          ? "No providers yet. Add a provider or generate some to get started."
                          : "No providers have been registered yet."
                        : "No providers match these filters."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const href = `${detailBase}/${p.id}`;
                  const st = PROVIDER_STATUS_CHIP[p.status] || PROVIDER_STATUS_CHIP.ACTIVE;
                  return (
                    <TableRow key={p.id} {...clickableTableRowProps({ href, router })}>
                      <TableCell sx={{ minWidth: 200 }}>
                        <span className="font-semibold">{p.name}</span>
                        <div className="text-xs opacity-70">
                          {p.linesOfBusiness || p.physicalAddress || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.categories.length
                            ? p.categories.map((c) => (
                                <Chip key={c} size="small" variant="outlined" color="primary" label={providerCategoryLabel(c)} />
                              ))
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProviderQualificationChip qualification={p.qualification} />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={p.statusReason || ""}>
                          <Chip size="small" color={st.color} label={st.label} />
                        </Tooltip>
                      </TableCell>
                      {canSeeCredentials ? (
                        <TableCell onClick={stopRowClick} onKeyDown={stopRowClick}>
                          {p.portal?.loginEmail ? (
                            <div className="flex items-center gap-1">
                              <span className="max-w-56 truncate font-mono text-xs" title={p.portal.loginEmail}>
                                {p.portal.loginEmail}
                              </span>
                              <CopyIconButton text={p.portal.loginEmail} label="login email" showToast={showToast} />
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell
                        align="right"
                        sx={{ whiteSpace: "nowrap" }}
                        onClick={stopRowClick}
                        onKeyDown={stopRowClick}
                      >
                        <Tooltip title="View provider details">
                          <IconButton
                            component={Link}
                            href={href}
                            size="small"
                            color="primary"
                            aria-label={`View ${p.name}`}
                          >
                            <VisibilityRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canManage ? (
                          <>
                            <Tooltip title="Edit provider">
                              <IconButton
                                size="small"
                                color="primary"
                                aria-label={`Edit ${p.name}`}
                                onClick={() => {
                                  setEditTarget(p);
                                  setFormOpen(true);
                                }}
                              >
                                <EditRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={p.status === "ACTIVE" ? "Suspend provider" : "Reactivate provider"}>
                              <IconButton
                                size="small"
                                color={p.status === "ACTIVE" ? "warning" : "info"}
                                aria-label={`${p.status === "ACTIVE" ? "Suspend" : "Reactivate"} ${p.name}`}
                                onClick={() => setStatusTarget(p)}
                              >
                                {p.status === "ACTIVE" ? (
                                  <BlockRounded fontSize="small" />
                                ) : (
                                  <RestartAltRounded fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete provider">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => setDeleteTarget(p)}
                              >
                                <DeleteOutlineRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 20, 50]}
        />
        {refetching ? (
          <Box sx={adminTableRefetchOverlaySx} aria-busy="true">
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}
      </Box>

      {canManage ? (
        <>
          <OrgProviderFormDialog
            open={formOpen}
            projectId={projectId}
            provider={editTarget}
            onClose={() => setFormOpen(false)}
            onSaved={() => {
              setFormOpen(false);
              void load();
            }}
          />
          <OrgProviderGenerateDialog
            open={generateOpen}
            projectId={projectId}
            onClose={() => setGenerateOpen(false)}
            onDone={() => {
              setGenerateOpen(false);
              void load();
            }}
          />
          <OrgProviderStatusDialog
            projectId={projectId}
            provider={statusTarget}
            onClose={() => setStatusTarget(null)}
            onDone={() => {
              setStatusTarget(null);
              void load();
            }}
          />
          <OrgProviderDeleteDialog
            projectId={projectId}
            provider={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDone={() => {
              setDeleteTarget(null);
              void load();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
