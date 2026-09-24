"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { ActiveFinancialYearSelect } from "@/components/projects/active-financial-year-select";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import {
  computeLineTotal,
  formatMoneyAmount,
  parseMoneyInput,
  toMoneyNumber,
  validatePositiveMoney,
  validatePositiveNumber,
} from "@/lib/money";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import {
  PLAN_SHEET_TYPE,
  PLAN_SHEET_TYPE_LABELS,
  PPDA_CONTRACT_TYPE_OPTIONS,
  PPDA_PLAN_METHOD_OPTIONS,
  PPDA_RESERVATION_SCHEME_OPTIONS,
  PPDA_YES_NO,
  buildOrgPdfContext,
  circularPlanItemToPdfSpec,
  downloadOrgFormPdf,
  normalizeCircularPlanItemFields,
  procurementPlanFormToPdfSpec,
} from "@/lib/projects/ppda-forms";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";

function emptyItem() {
  return {
    title: "",
    description: "",
    category: "ICT Equipment",
    quantity: "10",
    unitOfMeasure: "Unit",
    estimatedUnitPrice: "",
    budgetLineId: "",
    expectedProcurementPeriod: "Q1",
    priority: "Normal",
    justification: "",
    currency: "UGX",
    sourceOfFunding: "",
    plannedProcurementMethod: "",
    contractType: "",
    prequalification: "",
    applyReservationScheme: "",
    reservationSchemeDetail: "",
    multiYearCurrentCost: "",
    multiYearCompletionYears: "",
    multiYearPaidUpSum: "",
    multiYearPendingSum: "",
    multiYearPendingTime: "",
    bidInvitationDate: "",
    bidClosingOpeningDate: "",
    evaluationReportApprovalDate: "",
    awardNotificationDate: "",
    contractSigningDate: "",
    completionDate: "",
    eoiInvitationDate: "",
    eoiClosingOpeningDate: "",
    eoiShortlistApprovalDate: "",
    proposalNotificationDate: "",
    proposalDeadlineDate: "",
    proposalOpeningDate: "",
    proposalEvalApprovalDate: "",
    proposalAwardNotificationDate: "",
  };
}

/**
 * @param {{ projectId: string }} p
 */
export function OrgProcurementPlanCreateForm({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const listHref = `/projects/${projectId}/procurement-plans`;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [years, setYears] = useState(/** @type {any[]} */ ([]));
  const [fyEmptyMessage, setFyEmptyMessage] = useState(/** @type {string | null} */ (null));
  const [periods, setPeriods] = useState(/** @type {any[]} */ ([]));
  const [budgetLines, setBudgetLines] = useState(/** @type {any[]} */ ([]));
  const [existingRefs, setExistingRefs] = useState(/** @type {string[]} */ ([]));
  const [actorDepartment, setActorDepartment] = useState(
    /** @type {{ id?: string; name?: string; code?: string | null } | null} */ (null),
  );
  const [canCreate, setCanCreate] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [form, setForm] = useState({
    title: "",
    planReference: "",
    financialYearId: "",
    planningPeriodId: "",
    sheetType: PLAN_SHEET_TYPE.GOODS_WORKS_NON_CONSULTANCY,
    isEmergency: false,
    items: [emptyItem()],
  });
  const [metaReady, setMetaReady] = useState(false);
  const isConsultancy = form.sheetType === PLAN_SHEET_TYPE.CONSULTANCY;
  const isEmergency = Boolean(form.isEmergency);

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey: "procurement-plan:new",
    values: form,
    projectId,
    enabled: metaReady && canCreate,
    onHydrated: (payload) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        setForm((prev) => ({
          ...prev,
          .../** @type {typeof form} */ (payload),
          items:
            Array.isArray(/** @type {any} */ (payload).items) &&
            /** @type {any} */ (payload).items.length
              ? /** @type {any} */ (payload).items
              : prev.items,
        }));
      }
    },
  });

  const selectedFy = years.find((y) => y.id === form.financialYearId);
  const fyPeriods = periods.filter(
    (p) => !form.financialYearId || p.financialYearId === form.financialYearId,
  );
  const fyBudgetLines = budgetLines.filter(
    (b) => !form.financialYearId || b.financialYearId === form.financialYearId,
  );
  const periodsEmpty = Boolean(form.financialYearId) && fyPeriods.length === 0;
  const budgetLinesEmpty = Boolean(form.financialYearId) && fyBudgetLines.length === 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, yRes, perRes, bRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/procurement-plans`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/org-financial-years?selectable=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/org-planning-periods?selectable=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/budgets?selectable=1`, {
          credentials: "include",
        }),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      const yData = await yRes.json().catch(() => ({}));
      const perData = await perRes.json().catch(() => ({}));
      const bData = await bRes.json().catch(() => ({}));
      if (!pRes.ok) {
        showToast({
          message: typeof pData.error === "string" ? pData.error : "Could not load plan form.",
          severity: "error",
        });
        return;
      }
      setCanCreate(Boolean(pData.canCreate));
      const dept =
        pData.actorDepartment ||
        (Array.isArray(bData.budgetLines) && bData.budgetLines[0]?.department) ||
        null;
      setActorDepartment(dept);
      const plans = Array.isArray(pData.plans) ? pData.plans : [];
      const refs = plans.map((p) => p.planReference).filter(Boolean);
      setExistingRefs(refs);
      const nextYears = Array.isArray(yData.financialYears) ? yData.financialYears : [];
      setYears(nextYears);
      setFyEmptyMessage(typeof yData.message === "string" ? yData.message : null);
      setPeriods(Array.isArray(perData.planningPeriods) ? perData.planningPeriods : []);
      setBudgetLines(Array.isArray(bData.budgetLines) ? bData.budgetLines : []);
      const firstFyId = nextYears[0]?.id || "";
      const firstFyLabel = nextYears[0]?.label || "";
      const autoRef =
        firstFyLabel && dept
          ? nextOrgDocumentReference(refs, {
              deptCode: dept.code,
              deptName: dept.name,
              docType: ORG_REF_DOC.PROCUREMENT_PLAN,
              fyLabel: firstFyLabel,
            })
          : "";
      setForm((f) => ({
        ...f,
        financialYearId: firstFyId,
        planReference: autoRef || f.planReference,
      }));
      setMetaReady(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyReferenceForFy(financialYearId) {
    const fy = years.find((y) => y.id === financialYearId);
    if (!fy?.label || !actorDepartment) return;
    const next = nextOrgDocumentReference(existingRefs, {
      deptCode: actorDepartment.code,
      deptName: actorDepartment.name,
      docType: form.isEmergency
        ? ORG_REF_DOC.EMERGENCY_PROCUREMENT_PLAN
        : ORG_REF_DOC.PROCUREMENT_PLAN,
      fyLabel: fy.label,
    });
    setForm((f) => ({ ...f, planReference: next }));
  }

  function updateItem(idx, patch) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));
    setFieldErrors((fe) => {
      const n = { ...fe };
      for (const key of Object.keys(patch)) {
        delete n[`items.${idx}.${key}`];
      }
      return n;
    });
  }

  function removeItem(idx) {
    setForm((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.filter((_, i) => i !== idx) };
    });
    setFieldErrors({});
  }

  /**
   * @returns {Record<string, string>}
   */
  function validateClient() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!form.title.trim()) errors.title = "Enter a plan title.";
    if (!form.planReference.trim()) errors.planReference = "Enter a plan reference.";
    if (!form.financialYearId) {
      errors.financialYearId =
        fyEmptyMessage || "Choose a financial year.";
    }
    if (!isEmergency && !form.planningPeriodId) {
      errors.planningPeriodId = periodsEmpty
        ? "No planning period is open for this financial year. Ask the Organization Administrator to open a planning period — or create an Emergency plan instead."
        : "Choose a planning period.";
    }
    form.items.forEach((item, idx) => {
      if (!item.title.trim()) errors[`items.${idx}.title`] = "Enter an item title.";
      if (!item.category.trim()) errors[`items.${idx}.category`] = "Enter a category.";
      const qtyErr = validatePositiveNumber(item.quantity, "Quantity");
      if (qtyErr) errors[`items.${idx}.quantity`] = qtyErr;
      const priceErr = validatePositiveMoney(item.estimatedUnitPrice, "Unit price");
      if (priceErr) errors[`items.${idx}.estimatedUnitPrice`] = priceErr;
      if (!item.budgetLineId) {
        errors[`items.${idx}.budgetLineId`] = budgetLinesEmpty
          ? "No approved budget lines for this financial year. An approved department budget must exist first."
          : "Choose a budget line.";
      }
    });
    return errors;
  }

  async function saveDraft(e) {
    e.preventDefault();
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        planReference: form.planReference.trim(),
        sheetType: form.sheetType,
        items: form.items.map((item) => ({
          ...item,
          quantity: parseMoneyInput(item.quantity),
          estimatedUnitPrice: parseMoneyInput(item.estimatedUnitPrice),
          ...normalizeCircularPlanItemFields(item, form.sheetType),
        })),
      };
      const res = await fetch(`/api/projects/${projectId}/procurement-plans`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save plan.",
          severity: "error",
        });
        return;
      }
      await clearDraft();
      showToast({ message: "Procurement plan draft saved.", severity: "success" });
      router.push(listHref);
    } finally {
      setBusy(false);
    }
  }

  const previewRows = useMemo(() => {
    return form.items.map((item, idx) => {
      const bl = fyBudgetLines.find((b) => b.id === item.budgetLineId);
      return {
        id: idx,
        index: idx + 1,
        title: item.title.trim() || `Item ${idx + 1}`,
        quantity: toMoneyNumber(item.quantity),
        unitPrice: toMoneyNumber(item.estimatedUnitPrice),
        lineTotal: computeLineTotal(item.quantity, item.estimatedUnitPrice),
        budgetLine: bl ? `${bl.code} — ${bl.name}` : "—",
      };
    });
  }, [form.items, fyBudgetLines]);

  const footerTotal = previewRows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!canCreate) {
    return (
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
        <Typography sx={{ mb: 2 }}>
          You cannot create a procurement plan with your current role.
        </Typography>
        <Button component={Link} href={listHref} startIcon={<ArrowBackRounded />} variant="outlined">
          Back to plans
        </Button>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="mb-3">
        <Button
          component={Link}
          href={listHref}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
          size="small"
        >
          Back to list
        </Button>
      </div>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Prepare procurement plan
      </Typography>
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
        {serverSyncState === "saving"
          ? "Saving draft…"
          : serverSyncState === "saved"
            ? "Draft saved — you can continue on another device"
            : "Autosaves as you type (local + server, not every keystroke)"}
      </Typography>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveDraft} noValidate>
        <TextField
          select
          label="Plan type"
          value={isEmergency ? "EMERGENCY" : "ANNUAL"}
          onChange={(e) => {
            const nextEmergency = e.target.value === "EMERGENCY";
            setForm((f) => {
              const fy = years.find((y) => y.id === f.financialYearId);
              let planReference = f.planReference;
              if (fy?.label && actorDepartment) {
                planReference = nextOrgDocumentReference(existingRefs, {
                  deptCode: actorDepartment.code,
                  deptName: actorDepartment.name,
                  docType: nextEmergency
                    ? ORG_REF_DOC.EMERGENCY_PROCUREMENT_PLAN
                    : ORG_REF_DOC.PROCUREMENT_PLAN,
                  fyLabel: fy.label,
                });
              }
              return {
                ...f,
                isEmergency: nextEmergency,
                planningPeriodId: nextEmergency ? "" : f.planningPeriodId,
                planReference,
              };
            });
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.planningPeriodId;
              return n;
            });
          }}
          fullWidth
          helperText={
            isEmergency
              ? "Uses the Emergency Planning Process (short path). Planning period is optional."
              : "Uses the annual Procurement Planning Process. Requires an open planning period."
          }
          sx={themedTextFieldSx}
          className="sm:col-span-2"
        >
          <MenuItem value="ANNUAL">Annual procurement plan</MenuItem>
          <MenuItem value="EMERGENCY">Emergency / unplanned plan</MenuItem>
        </TextField>
        <TextField
          label="Plan title"
          value={form.title}
          onChange={(e) => {
            setForm((f) => ({ ...f, title: e.target.value }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.title;
              return n;
            });
          }}
          fullWidth
          className="sm:col-span-2"
          error={Boolean(fieldErrors.title)}
          helperText={fieldErrors.title || undefined}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Plan reference"
          value={form.planReference}
          onChange={(e) => {
            setForm((f) => ({ ...f, planReference: e.target.value }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.planReference;
              return n;
            });
          }}
          fullWidth
          error={Boolean(fieldErrors.planReference)}
          helperText={
            fieldErrors.planReference ||
            "Auto-generated as DEPT-PP-YYYY-SEQ; you may edit"
          }
          sx={themedTextFieldSx}
          placeholder="ICT-PP-2026-001"
        />
        <ActiveFinancialYearSelect
          value={form.financialYearId}
          onChange={(financialYearId) => {
            setForm((f) => ({
              ...f,
              financialYearId,
              planningPeriodId: "",
            }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.financialYearId;
              delete n.planningPeriodId;
              return n;
            });
            applyReferenceForFy(financialYearId);
          }}
          years={years}
          emptyMessage={fyEmptyMessage}
          error={Boolean(fieldErrors.financialYearId)}
          helperText={fieldErrors.financialYearId || undefined}
        />
        <TextField
          select
          label="Planning period"
          value={form.planningPeriodId}
          onChange={(e) => {
            setForm((f) => ({ ...f, planningPeriodId: e.target.value }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.planningPeriodId;
              return n;
            });
          }}
          fullWidth
          error={!isEmergency && (Boolean(fieldErrors.planningPeriodId) || periodsEmpty)}
          helperText={
            isEmergency
              ? "Optional for emergency plans."
              : fieldErrors.planningPeriodId ||
                (periodsEmpty
                  ? "No planning period is open for this financial year. Ask the Organization Administrator to open a planning period."
                  : undefined)
          }
          sx={themedTextFieldSx}
        >
          {isEmergency ? (
            <MenuItem value="">None (emergency)</MenuItem>
          ) : null}
          {fyPeriods.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label || p.financialYear?.label || selectedFy?.label || "Period"} ·{" "}
              {p.statusLabel || p.status} · {p.periodLabel || ""}
            </MenuItem>
          ))}
          {!isEmergency && periodsEmpty ? (
            <MenuItem value="" disabled>
              No planning period open
            </MenuItem>
          ) : null}
        </TextField>
        <TextField
          select
          label="Circular 1/2024 sheet"
          value={form.sheetType}
          onChange={(e) => setForm((f) => ({ ...f, sheetType: e.target.value }))}
          fullWidth
          helperText="Choose Goods/Works/Non-consultancy or Consultancy columns."
          sx={themedTextFieldSx}
          className="sm:col-span-2"
        >
          {Object.entries(PLAN_SHEET_TYPE_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>

        <div className="sm:col-span-2 space-y-3">
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Plan items
          </Typography>
          <Typography variant="body2" sx={adminMutedTextSx}>
            Fill Circular No. 1/2024 fields per item (teaching). Optional download is a reference
            HTML copy — submit stays in-app.
          </Typography>
          {form.items.map((item, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 flex items-center justify-between gap-2">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Plan item {idx + 1}
                </Typography>
                <Tooltip title="Remove item">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Remove plan item ${idx + 1}`}
                      disabled={form.items.length <= 1 || busy}
                      onClick={() => removeItem(idx)}
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
              <TextField
                label="Item title"
                value={item.title}
                onChange={(e) => updateItem(idx, { title: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.title`])}
                helperText={fieldErrors[`items.${idx}.title`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Category"
                value={item.category}
                onChange={(e) => updateItem(idx, { category: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.category`])}
                helperText={fieldErrors[`items.${idx}.category`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Quantity"
                value={item.quantity}
                onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                onBlur={(e) => {
                  const formatted = formatMoneyAmount(e.target.value);
                  if (formatted) updateItem(idx, { quantity: formatted });
                }}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.quantity`])}
                helperText={fieldErrors[`items.${idx}.quantity`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Estimated unit price (UGX)"
                value={item.estimatedUnitPrice}
                onChange={(e) => updateItem(idx, { estimatedUnitPrice: e.target.value })}
                onBlur={(e) => {
                  const formatted = formatMoneyAmount(e.target.value);
                  if (formatted) updateItem(idx, { estimatedUnitPrice: formatted });
                }}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.estimatedUnitPrice`])}
                helperText={fieldErrors[`items.${idx}.estimatedUnitPrice`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                select
                label="Budget line"
                value={item.budgetLineId}
                onChange={(e) => updateItem(idx, { budgetLineId: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.budgetLineId`]) || budgetLinesEmpty}
                helperText={
                  fieldErrors[`items.${idx}.budgetLineId`] ||
                  (budgetLinesEmpty
                    ? "No approved budget lines for this financial year. An approved department budget must exist first."
                    : undefined)
                }
                sx={themedTextFieldSx}
              >
                {fyBudgetLines.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </MenuItem>
                ))}
                {budgetLinesEmpty ? (
                  <MenuItem value="" disabled>
                    No approved budget lines
                  </MenuItem>
                ) : null}
              </TextField>
              <TextField
                label="Expected period"
                value={item.expectedProcurementPeriod}
                onChange={(e) => updateItem(idx, { expectedProcurementPeriod: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Description / specification"
                value={item.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                fullWidth
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />

              <Typography variant="subtitle2" sx={{ fontWeight: 600 }} className="sm:col-span-2">
                Circular 1/2024 fields
              </Typography>
              <TextField
                label="Source of funding"
                value={item.sourceOfFunding}
                onChange={(e) => updateItem(idx, { sourceOfFunding: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                select
                label="Planned procurement method"
                value={item.plannedProcurementMethod}
                onChange={(e) => updateItem(idx, { plannedProcurementMethod: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_PLAN_METHOD_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Contract type"
                value={item.contractType}
                onChange={(e) => updateItem(idx, { contractType: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_CONTRACT_TYPE_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              {!isConsultancy ? (
                <TextField
                  select
                  label="Prequalification"
                  value={item.prequalification}
                  onChange={(e) => updateItem(idx, { prequalification: e.target.value })}
                  fullWidth
                  sx={themedTextFieldSx}
                >
                  <MenuItem value="">Select…</MenuItem>
                  {PPDA_YES_NO.map((v) => (
                    <MenuItem key={v} value={v}>
                      {v}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <TextField
                select
                label="Apply reservation scheme"
                value={item.applyReservationScheme}
                onChange={(e) => updateItem(idx, { applyReservationScheme: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_YES_NO.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Reservation scheme detail"
                value={item.reservationSchemeDetail}
                onChange={(e) => updateItem(idx, { reservationSchemeDetail: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_RESERVATION_SCHEME_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Multi-year current cost"
                value={item.multiYearCurrentCost}
                onChange={(e) => updateItem(idx, { multiYearCurrentCost: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Multi-year completion years"
                value={item.multiYearCompletionYears}
                onChange={(e) => updateItem(idx, { multiYearCompletionYears: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Paid-up sum"
                value={item.multiYearPaidUpSum}
                onChange={(e) => updateItem(idx, { multiYearPaidUpSum: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Pending sum"
                value={item.multiYearPendingSum}
                onChange={(e) => updateItem(idx, { multiYearPendingSum: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Pending time"
                value={item.multiYearPendingTime}
                onChange={(e) => updateItem(idx, { multiYearPendingTime: e.target.value })}
                fullWidth
                sx={themedTextFieldSx}
              />
              {!isConsultancy ? (
                <>
                  <TextField
                    label="Bid invitation date"
                    type="date"
                    value={item.bidInvitationDate}
                    onChange={(e) => updateItem(idx, { bidInvitationDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Bid closing / opening"
                    type="date"
                    value={item.bidClosingOpeningDate}
                    onChange={(e) => updateItem(idx, { bidClosingOpeningDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Eval report approval"
                    type="date"
                    value={item.evaluationReportApprovalDate}
                    onChange={(e) =>
                      updateItem(idx, { evaluationReportApprovalDate: e.target.value })
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Award notification"
                    type="date"
                    value={item.awardNotificationDate}
                    onChange={(e) => updateItem(idx, { awardNotificationDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="EOI invitation"
                    type="date"
                    value={item.eoiInvitationDate}
                    onChange={(e) => updateItem(idx, { eoiInvitationDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="EOI closing / opening"
                    type="date"
                    value={item.eoiClosingOpeningDate}
                    onChange={(e) => updateItem(idx, { eoiClosingOpeningDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Shortlist approval"
                    type="date"
                    value={item.eoiShortlistApprovalDate}
                    onChange={(e) => updateItem(idx, { eoiShortlistApprovalDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal notification"
                    type="date"
                    value={item.proposalNotificationDate}
                    onChange={(e) => updateItem(idx, { proposalNotificationDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal deadline"
                    type="date"
                    value={item.proposalDeadlineDate}
                    onChange={(e) => updateItem(idx, { proposalDeadlineDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal opening"
                    type="date"
                    value={item.proposalOpeningDate}
                    onChange={(e) => updateItem(idx, { proposalOpeningDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal eval approval"
                    type="date"
                    value={item.proposalEvalApprovalDate}
                    onChange={(e) => updateItem(idx, { proposalEvalApprovalDate: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal award notification"
                    type="date"
                    value={item.proposalAwardNotificationDate}
                    onChange={(e) =>
                      updateItem(idx, { proposalAwardNotificationDate: e.target.value })
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={themedTextFieldSx}
                  />
                </>
              )}
              <TextField
                label="Contract signing"
                type="date"
                value={item.contractSigningDate}
                onChange={(e) => updateItem(idx, { contractSigningDate: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Completion date"
                type="date"
                value={item.completionDate}
                onChange={(e) => updateItem(idx, { completionDate: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={themedTextFieldSx}
              />
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  startIcon={<DownloadRounded />}
                  disabled={!String(item.title || "").trim()}
                  title={
                    String(item.title || "").trim()
                      ? "Download this plan item as PDF"
                      : "Enter an item title before downloading"
                  }
                  onClick={() => {
                    if (!String(item.title || "").trim()) {
                      showToast({
                        message: "Enter an item title before downloading the PDF.",
                        severity: "error",
                      });
                      return;
                    }
                    const cf = normalizeCircularPlanItemFields(item, form.sheetType);
                    const ctx = buildOrgPdfContext(null, {
                      departmentName: actorDepartment?.name || "",
                      departmentCode: actorDepartment?.code || "",
                      financialYear: selectedFy?.label || "",
                      referenceNumber: form.planReference || "",
                      statusLabel: "Draft",
                      statusColor: "info",
                    });
                    void downloadOrgFormPdf(
                      circularPlanItemToPdfSpec(
                        { title: item.title, circularFields: cf },
                        form.sheetType,
                        ctx,
                        { itemIndex: idx },
                      ),
                    );
                  }}
                >
                  Download item PDF
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outlined"
            startIcon={<AddRounded />}
            onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
          >
            Add plan item
          </Button>

          <OrgLineItemsTable
            title="Line items computation"
            columns={[
              { id: "index", label: "#" },
              { id: "title", label: "Item" },
              { id: "quantity", label: "Qty", align: "right", money: true },
              { id: "unitPrice", label: "Unit price", align: "right", money: true },
              { id: "lineTotal", label: "Line total", align: "right", money: true },
              { id: "budgetLine", label: "Budget line" },
            ]}
            rows={previewRows}
            getRowKey={(row) => row.id}
            footerLabel="Estimated total"
            footerTotal={footerTotal}
            emptyMessage="Add plan items to see totals."
          />
        </div>

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="button"
            variant="outlined"
            startIcon={<DownloadRounded />}
            disabled={!String(form.planReference || "").trim()}
            title={
              String(form.planReference || "").trim()
                ? "Download the full plan as PDF (named from plan reference)"
                : "Enter a plan reference first"
            }
            onClick={() => {
              if (!String(form.planReference || "").trim()) {
                showToast({
                  message: "Enter a plan reference before downloading the PDF.",
                  severity: "error",
                });
                return;
              }
              const ctx = buildOrgPdfContext(null, {
                departmentName: actorDepartment?.name || "",
                departmentCode: actorDepartment?.code || "",
                financialYear: selectedFy?.label || "",
                referenceNumber: form.planReference,
                statusLabel: "Draft",
                statusColor: "info",
              });
              void downloadOrgFormPdf(
                procurementPlanFormToPdfSpec(form, ctx, budgetLines),
              );
            }}
          >
            Download plan PDF
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Paper>
  );
}
