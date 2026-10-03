"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Pagination from "@mui/material/Pagination";
import Radio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useToast } from "@/components/providers/toast-provider";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { providerTerm } from "@/lib/projects/provider-terms";
import {
  ProviderQualificationChip,
  checkIconFor,
} from "@/components/projects/org-provider-compliance";

const PICKER_PAGE_SIZE = 6;
const VERIFY_MS = 3000;

/**
 * @param {string} projectId
 * @param {Record<string, string>} params
 */
async function fetchProviders(projectId, params) {
  const qs = new URLSearchParams({ status: "ACTIVE", ...params });
  const res = await fetch(`/api/projects/${projectId}/providers?${qs}`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Could not load providers.");
  }
  return data;
}

/**
 * System-run eligibility validation ("Run validation"). Opens a dialog where
 * every check spins for a few seconds (simulated register lookups), then shows
 * the results and offers the stage-named action (e.g. "Select supplier"). Learning mode:
 * failed checks never block — the action becomes "… with warnings" and asks for
 * confirmation in the same dialog. The dialog closes once the action completes.
 *
 * @param {{
 *   providers: any[];
 *   actionLabel: string;
 *   onConfirm: (summary: { failedProviders: any[]; warnings: string[] }) => void | Promise<void>;
 *   busy?: boolean;
 *   busyLabel?: string;
 *   extraWarnings?: string[];
 *   confirmed?: boolean;
 *   confirmedLabel?: string;
 *   disabled?: boolean;
 *   disabledReason?: string;
 *   autoStart?: boolean;
 * }} p
 */
export function OrgProviderRunValidation({
  providers,
  actionLabel,
  onConfirm,
  busy = false,
  busyLabel = "Saving…",
  extraWarnings = [],
  confirmed = false,
  confirmedLabel,
  disabled = false,
  disabledReason,
  autoStart = false,
}) {
  const [open, setOpen] = useState(() => autoStart && !confirmed);
  const [verifying, setVerifying] = useState(true);
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasRun, setHasRun] = useState(() => autoStart);

  const running = open && verifying;

  useEffect(() => {
    if (!running) return undefined;
    const t = setTimeout(() => setVerifying(false), VERIFY_MS);
    return () => clearTimeout(t);
  }, [running]);

  const failedProviders = providers.filter((p) => p.qualification && !p.qualification.qualifies);
  const expiringCount = providers.filter(
    (p) => p.qualification?.qualifies && p.qualification?.warningCount > 0,
  ).length;
  const warnings = [
    ...failedProviders.map((p) => `${p.name}: ${(p.qualification.failedReasons || []).join("; ")}`),
    ...extraWarnings,
  ];
  const hasWarnings = warnings.length > 0;

  if (!providers.length) return null;

  const start = () => {
    setVerifying(true);
    setConfirmStep(false);
    setHasRun(true);
    setOpen(true);
  };

  const close = () => {
    if (submitting || busy) return;
    setVerifying(false);
    setConfirmStep(false);
    setOpen(false);
  };

  const doConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm({ failedProviders, warnings });
    } finally {
      setSubmitting(false);
      setConfirmStep(false);
      setOpen(false);
    }
  };

  const working = submitting || busy;

  return (
    <Box
      className="rounded-lg border border-(--border-subtle) p-3"
      role="region"
      aria-label="Provider validation"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle2" className="flex items-center gap-1">
          <FactCheckRounded fontSize="small" color="primary" aria-hidden />
          Eligibility validation
        </Typography>
        {confirmed ? (
          <Chip color="success" icon={<CheckCircleRounded />} label={confirmedLabel || "Confirmed"} />
        ) : (
          <Tooltip title="Run the simulated URSB, URA, NSSF and PPDA register checks">
            <span>
              <Button
                variant="contained"
                color="primary"
                startIcon={hasRun ? <ReplayRounded /> : <FactCheckRounded />}
                onClick={start}
                disabled={disabled || working}
              >
                {hasRun ? "Run validation again" : "Run validation"}
              </Button>
            </span>
          </Tooltip>
        )}
      </div>

      {!hasRun && !confirmed ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
          {disabled && disabledReason
            ? disabledReason
            : "Run validation before continuing."}
        </Typography>
      ) : (
        <ul className="mt-2 space-y-1">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 font-medium wrap-break-word">{p.name}</span>
              <ProviderQualificationChip qualification={p.qualification} />
              {!p.qualification?.qualifies && p.qualification?.failedReasons?.length ? (
                <span className="w-full text-xs text-brand-red wrap-break-word">
                  {p.qualification.failedReasons.join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={(_e, reason) => {
          if (reason === "backdropClick") return;
          close();
        }}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="provider-validation-title"
      >
        <DialogTitle id="provider-validation-title" className="flex items-center gap-2">
          <FactCheckRounded color="primary" aria-hidden />
          {confirmStep ? `${actionLabel} with warnings?` : "Eligibility validation"}
        </DialogTitle>
        {running ? <LinearProgress aria-hidden /> : null}
        <DialogContent dividers>
          {confirmStep ? (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Issues found. You can continue; the warnings are recorded.
              </Typography>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {warnings.map((w) => (
                  <li key={w} className="wrap-break-word">
                    {w}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="space-y-3" aria-live="polite" aria-busy={running}>
              {running ? (
                <Typography variant="body2" role="status" sx={adminMutedTextSx}>
                  Verifying with the external registers…
                </Typography>
              ) : null}
              {providers.map((p) => {
                const checks = p.qualification?.checks || [];
                return (
                  <div key={p.id} className="rounded-md bg-surface-card p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Typography variant="body2" fontWeight={700} className="wrap-break-word">
                        {p.name}
                      </Typography>
                      {!running ? <ProviderQualificationChip qualification={p.qualification} /> : null}
                    </div>
                    <ul className="mt-1 space-y-1.5">
                      {checks.map((c) => {
                        if (running) {
                          return (
                            <li key={c.key} className="flex items-center gap-2 text-sm">
                              <span className="inline-flex size-5 shrink-0 items-center justify-center">
                                <CircularProgress
                                  size={16}
                                  thickness={5}
                                  disableShrink
                                  sx={{ color: "text.disabled", animationDuration: "800ms" }}
                                  aria-hidden
                                />
                              </span>
                              <span className="opacity-70">
                                {c.label} <span className="italic">— verifying…</span>
                              </span>
                            </li>
                          );
                        }
                        const { Icon, color } = checkIconFor(c);
                        return (
                          <li key={c.key} className="flex items-start gap-2 text-sm">
                            <span className="inline-flex size-5 shrink-0 items-center justify-center">
                              <Icon fontSize="small" sx={{ color }} aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="font-medium">{c.label}</span>
                              <span className={c.passed && !c.warning ? "opacity-70" : ""}>
                                {" — "}
                                {c.passed ? "" : "Failed: "}
                                {c.reason}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}

              {!running ? (
                <div className="space-y-2">
                  <Alert
                    severity={failedProviders.length ? "error" : expiringCount ? "warning" : "success"}
                    variant="outlined"
                  >
                    {failedProviders.length
                      ? `${providers.length - failedProviders.length} of ${providers.length} passed all checks. ${failedProviders.length} did not — you can still continue; the warnings will be recorded.`
                      : expiringCount
                        ? "All selected providers passed. Some documents expire soon."
                        : "All selected providers passed every check."}
                  </Alert>
                  {extraWarnings.map((w) => (
                    <Alert key={w} severity="warning" variant="outlined">
                      {w}
                    </Alert>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          {running ? (
            <Button onClick={close}>Cancel</Button>
          ) : confirmStep ? (
            <>
              <Button onClick={() => setConfirmStep(false)} disabled={working}>
                Go back
              </Button>
              <Button
                variant="contained"
                color="warning"
                startIcon={working ? <CircularProgress size={16} color="inherit" /> : <WarningAmberRounded />}
                disabled={working}
                onClick={() => void doConfirm()}
              >
                {working ? busyLabel : `${actionLabel} anyway`}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close} disabled={working}>
                Cancel
              </Button>
              <Button startIcon={<ReplayRounded />} onClick={start} disabled={working}>
                Run again
              </Button>
              {!confirmed ? (
                <Button
                  variant="contained"
                  color={hasWarnings ? "warning" : "success"}
                  startIcon={
                    working ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : hasWarnings ? (
                      <WarningAmberRounded />
                    ) : (
                      <CheckCircleRounded />
                    )
                  }
                  disabled={working}
                  onClick={() => (hasWarnings ? setConfirmStep(true) : void doConfirm())}
                >
                  {working ? busyLabel : hasWarnings ? `${actionLabel} with warnings` : actionLabel}
                </Button>
              ) : null}
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Provider picker (single or multi) over the organisation register, with
 * qualification evaluated for the procurement method + category, followed by
 * Run validation and a stage-named action.
 *
 * @param {{
 *   projectId: string;
 *   mode: "single" | "multi";
 *   method?: string | null;
 *   category?: string | null;
 *   value: string[];
 *   onChange: (ids: string[]) => void;
 *   actionLabel: string;
 *   onConfirm: (summary: { providers: any[]; failedProviders: any[]; warnings: string[] }) => void | Promise<void>;
 *   busy?: boolean;
 *   busyLabel?: string;
 *   confirmed?: boolean;
 *   confirmedLabel?: string;
 *   onUnconfirm?: () => void;
 *   extraWarnings?: string[];
 *   error?: string;
 *   label?: string;
 *   helperText?: string;
 * }} p
 */
export function OrgProviderSelection({
  projectId,
  mode,
  method,
  category,
  value,
  onChange,
  actionLabel,
  onConfirm,
  busy,
  busyLabel,
  confirmed,
  confirmedLabel,
  onUnconfirm,
  extraWarnings,
  error,
  label,
  helperText,
}) {
  const { showToast } = useToast();
  const term = providerTerm(category);
  const termPlural = providerTerm(category, { plural: true });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [qualification, setQualification] = useState("ALL");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState({ all: 0, qualifies: 0, notQualifies: 0 });
  const [loading, setLoading] = useState(true);
  const [known, setKnown] = useState(/** @type {Record<string, any>} */ ({}));
  const [validatedProviders, setValidatedProviders] = useState(/** @type {any[] | null} */ (null));
  const [validationRun, setValidationRun] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const baseParams = useMemo(() => {
    /** @type {Record<string, string>} */
    const p = {};
    if (method) p.method = method;
    if (category) p.checkCategory = category;
    return p;
  }, [method, category]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProviders(projectId, {
        ...baseParams,
        page: String(page),
        pageSize: String(PICKER_PAGE_SIZE),
        qualification,
        ...(search ? { search } : {}),
      });
      const list = Array.isArray(data.providers) ? data.providers : [];
      setRows(list);
      setPageCount(Number(data.pageCount) || 1);
      setCounts(data.counts || { all: 0, qualifies: 0, notQualifies: 0 });
      setKnown((prev) => {
        const next = { ...prev };
        for (const r of list) next[r.id] = r;
        return next;
      });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Could not load providers.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [projectId, baseParams, page, qualification, search, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingKey = value.filter((id) => !known[id]).join(",");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    fetchProviders(projectId, { ...baseParams, ids: missingKey, pageSize: "100" })
      .then((data) => {
        if (cancelled) return;
        setKnown((prev) => {
          const next = { ...prev };
          for (const r of data.providers || []) next[r.id] = r;
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missingKey, projectId, baseParams]);

  const valueKey = value.join(",");
  useEffect(() => {
    setValidatedProviders(null);
  }, [valueKey, method, category]);

  const selected = value.map((id) => known[id]).filter(Boolean);

  const toggle = (id) => {
    if (confirmed) return;
    if (mode === "single") {
      onChange(value[0] === id ? [] : [id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  /** Fetch fresh qualification for the selection, then open the validation dialog. */
  const prepareValidation = async () => {
    setRefreshing(true);
    try {
      const data = await fetchProviders(projectId, { ...baseParams, ids: valueKey, pageSize: "100" });
      const byId = new Map((data.providers || []).map((r) => [r.id, r]));
      const fresh = value.map((id) => byId.get(id)).filter(Boolean);
      setValidatedProviders(fresh);
      setValidationRun((n) => n + 1);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Could not run validation.", severity: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  const Control = mode === "single" ? Radio : Checkbox;

  return (
    <div className="space-y-3">
      <div>
        <Typography variant="subtitle2">
          {label || (mode === "single" ? `Select ${term}` : `Shortlist ${termPlural}`)}
        </Typography>
        {helperText ? (
          <Typography variant="caption" sx={adminMutedTextSx}>
            {helperText}
          </Typography>
        ) : null}
      </div>

      {!confirmed ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <TextField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${termPlural} by name, TIN or line of business`}
              aria-label={`Search ${termPlural}`}
              className="w-full sm:flex-1"
              sx={themedTextFieldSx}
              slotProps={{ input: { startAdornment: <SearchRounded fontSize="small" sx={{ mr: 1 }} /> } }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={qualification}
              onChange={(_e, v) => {
                if (v) {
                  setQualification(v);
                  setPage(1);
                }
              }}
              aria-label="Filter by qualification"
              className="flex-wrap"
            >
              <ToggleButton value="ALL">All ({counts.all})</ToggleButton>
              <ToggleButton value="QUALIFIES">Qualifies ({counts.qualifies})</ToggleButton>
              <ToggleButton value="NOT_QUALIFIES">Doesn&apos;t qualify ({counts.notQualifies})</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <div
            className={`rounded-lg border ${error ? "border-brand-red" : "border-(--border-subtle)"}`}
            aria-busy={loading}
          >
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm">
                <CircularProgress size={18} /> Loading {termPlural}…
              </div>
            ) : rows.length === 0 ? (
              <Typography variant="body2" sx={{ ...adminMutedTextSx, p: 2 }}>
                No matching {termPlural}. Add some on the Providers page.
              </Typography>
            ) : (
              <ul className="divide-y divide-(--border-subtle)">
                {rows.map((r) => {
                  const checked = value.includes(r.id);
                  return (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                        <Control
                          size="small"
                          checked={checked}
                          onChange={() => toggle(r.id)}
                          slotProps={{ input: { "aria-label": `Select ${r.name}` } }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium wrap-break-word">{r.name}</span>
                          {r.linesOfBusiness ? (
                            <span className="block text-xs opacity-70 wrap-break-word">
                              {r.linesOfBusiness}
                            </span>
                          ) : null}
                        </span>
                        <ProviderQualificationChip qualification={r.qualification} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {error ? (
            <Typography variant="caption" color="error" role="alert">
              {error}
            </Typography>
          ) : null}
          {pageCount > 1 ? (
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_e, p) => setPage(p)}
              size="small"
              color="primary"
            />
          ) : null}
        </>
      ) : null}

      {selected.length ? (
        <div className="flex flex-wrap gap-1" aria-label="Selected providers">
          {selected.map((p) => (
            <Chip
              key={p.id}
              color="primary"
              variant="outlined"
              label={p.name}
              onDelete={confirmed ? undefined : () => toggle(p.id)}
            />
          ))}
          {confirmed && onUnconfirm ? (
            <Button size="small" startIcon={<EditRounded />} onClick={onUnconfirm} disabled={busy}>
              Change selection
            </Button>
          ) : null}
        </div>
      ) : null}

      {value.length ? (
        validatedProviders ? (
          <OrgProviderRunValidation
            key={`${validatedProviders.map((p) => p.id).join(",")}-${validationRun}`}
            providers={validatedProviders}
            actionLabel={actionLabel}
            onConfirm={(s) => onConfirm({ providers: validatedProviders, ...s })}
            busy={busy}
            busyLabel={busyLabel}
            confirmed={confirmed}
            confirmedLabel={confirmedLabel}
            extraWarnings={extraWarnings}
            autoStart
          />
        ) : (
          <Box className="rounded-lg border border-(--border-subtle) p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="body2" sx={adminMutedTextSx}>
                {value.length} selected.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <FactCheckRounded />}
                onClick={() => void prepareValidation()}
                disabled={refreshing}
              >
                {refreshing ? "Preparing checks…" : "Run validation"}
              </Button>
            </div>
          </Box>
        )
      ) : (
        <Box className="rounded-lg border border-(--border-subtle) p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Typography variant="body2" sx={adminMutedTextSx}>
              {mode === "single" ? `Select a ${term} above.` : `Select ${termPlural} above.`}
            </Typography>
            <Button variant="contained" color="primary" startIcon={<FactCheckRounded />} disabled>
              Run validation
            </Button>
          </div>
        </Box>
      )}
    </div>
  );
}

/**
 * Read-only shortlist (as validated at Form 5 Part II) for reviewers.
 * @param {{ shortlist: any[]; category?: string | null; justification?: string | null }} p
 */
export function OrgProviderShortlistSummary({ shortlist, category, justification }) {
  if (!Array.isArray(shortlist) || shortlist.length === 0) return null;
  const termPlural = providerTerm(category, { plural: true, capitalize: true });
  return (
    <div className="space-y-1">
      <Typography variant="subtitle2">Shortlisted {termPlural.toLowerCase()}</Typography>
      <ul className="divide-y divide-(--border-subtle) rounded-lg border border-(--border-subtle)">
        {shortlist.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
            <span className="min-w-0 text-sm font-medium wrap-break-word">{s.name}</span>
            {s.qualifies ? (
              <Chip size="small" color="success" icon={<CheckCircleRounded />} label="Passed validation" />
            ) : (
              <Tooltip title={(s.failedReasons || []).join(" · ")}>
                <Chip
                  size="small"
                  color="error"
                  icon={<WarningAmberRounded />}
                  label={`Warnings (${(s.failedReasons || []).length})`}
                />
              </Tooltip>
            )}
            {!s.qualifies && s.failedReasons?.length ? (
              <span className="w-full text-xs text-brand-red wrap-break-word">
                {s.failedReasons.join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {shortlist.length < 3 && justification ? (
        <Typography variant="caption" sx={adminMutedTextSx}>
          Justification for fewer than three: {justification}
        </Typography>
      ) : null}
    </div>
  );
}
