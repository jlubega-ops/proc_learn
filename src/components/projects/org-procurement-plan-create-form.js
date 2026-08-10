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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { OrgLineItemsTable } from "@/components/projects/org-line-items-table";
import { ActiveFinancialYearSelect } from "@/components/projects/active-financial-year-select";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
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
    items: [emptyItem()],
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
      docType: ORG_REF_DOC.PROCUREMENT_PLAN,
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
    if (!form.planningPeriodId) {
      errors.planningPeriodId = periodsEmpty
        ? "No planning period is open for this financial year. Ask the Organization Administrator to open a planning period."
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
        items: form.items.map((item) => ({
          ...item,
          quantity: parseMoneyInput(item.quantity),
          estimatedUnitPrice: parseMoneyInput(item.estimatedUnitPrice),
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
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
        Prepare procurement plan
      </Typography>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveDraft} noValidate>
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
          error={Boolean(fieldErrors.planningPeriodId) || periodsEmpty}
          helperText={
            fieldErrors.planningPeriodId ||
            (periodsEmpty
              ? "No planning period is open for this financial year. Ask the Organization Administrator to open a planning period."
              : undefined)
          }
          sx={themedTextFieldSx}
          className="sm:col-span-2"
        >
          {fyPeriods.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.financialYear?.label || selectedFy?.label || "Period"} · {p.status} ·{" "}
              {p.periodLabel || ""}
            </MenuItem>
          ))}
          {periodsEmpty ? (
            <MenuItem value="" disabled>
              No planning period open
            </MenuItem>
          ) : null}
        </TextField>

        <div className="sm:col-span-2 space-y-3">
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Plan items
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

        <div className="sm:col-span-2">
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Paper>
  );
}
