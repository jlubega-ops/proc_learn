"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
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
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { ActiveFinancialYearSelect } from "@/components/projects/active-financial-year-select";
import {
  computeLineTotal,
  formatMoneyAmount,
  parseMoneyInput,
  toMoneyNumber,
  validatePositiveMoney,
  validatePositiveNumber,
} from "@/lib/money";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";

function emptyLine() {
  return {
    category: "",
    description: "",
    quantity: "1",
    unitOfMeasure: "Lot",
    unitCost: "",
    approvedAmount: "",
    fundingSource: "",
    totalManual: false,
  };
}

/**
 * @param {{ projectId: string; budgetId?: string }} p
 */
export function OrgBudgetCreateForm({ projectId, budgetId = "" }) {
  const { showToast } = useToast();
  const router = useRouter();
  const listHref = `/projects/${projectId}/budgets`;
  const isEdit = Boolean(String(budgetId || "").trim());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [actorDepartment, setActorDepartment] = useState(
    /** @type {{ id?: string; name?: string; code?: string | null } | null} */ (null),
  );
  const [existingRefs, setExistingRefs] = useState(/** @type {string[]} */ ([]));
  const [years, setYears] = useState(/** @type {any[]} */ ([]));
  const [fyEmptyMessage, setFyEmptyMessage] = useState(/** @type {string | null} */ (null));
  /** @type {[Record<string, string>, Function]} */
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    title: "",
    budgetReference: "",
    description: "",
    financialYearId: "",
    lines: [emptyLine()],
  });
  const [metaReady, setMetaReady] = useState(false);

  const departmentLabel = actorDepartment?.name || "Your department";

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey: isEdit ? `budget:edit:${budgetId}` : "budget:new",
    values: form,
    projectId,
    enabled: metaReady && canCreate && !isEdit,
    onHydrated: (payload) => {
      if (isEdit) return;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        setForm((prev) => ({
          ...prev,
          .../** @type {typeof form} */ (payload),
          lines:
            Array.isArray(/** @type {any} */ (payload).lines) &&
            /** @type {any} */ (payload).lines.length
              ? /** @type {any} */ (payload).lines
              : prev.lines,
        }));
      }
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [
        fetch(`/api/projects/${projectId}/budgets`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/org-financial-years?selectable=1`, {
          credentials: "include",
        }),
      ];
      if (isEdit) {
        requests.push(
          fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
            credentials: "include",
          }),
        );
      }
      const [bRes, yRes, detailRes] = await Promise.all(requests);
      const bData = await bRes.json().catch(() => ({}));
      const yData = await yRes.json().catch(() => ({}));
      if (!bRes.ok) {
        showToast({
          message: typeof bData.error === "string" ? bData.error : "Could not load budget form.",
          severity: "error",
        });
        return;
      }
      setCanCreate(Boolean(bData.canCreate));
      const dept = bData.actorDepartment || null;
      setActorDepartment(dept);
      const budgets = Array.isArray(bData.budgets) ? bData.budgets : [];
      const refs = budgets.map((b) => b.budgetReference).filter(Boolean);
      setExistingRefs(refs);
      const nextYears = Array.isArray(yData.financialYears) ? yData.financialYears : [];
      setYears(nextYears);
      setFyEmptyMessage(typeof yData.message === "string" ? yData.message : null);

      if (isEdit && detailRes) {
        const dData = await detailRes.json().catch(() => ({}));
        if (!detailRes.ok) {
          showToast({
            message: typeof dData.error === "string" ? dData.error : "Could not load budget.",
            severity: "error",
          });
          setCanCreate(false);
          return;
        }
        if (!dData.canEditDraft) {
          showToast({
            message: "This budget can no longer be edited.",
            severity: "error",
          });
          setCanCreate(false);
          return;
        }
        const budget = dData.budget || {};
        let editYears = nextYears;
        if (
          budget.financialYear?.id &&
          !editYears.some((y) => y.id === budget.financialYear.id)
        ) {
          editYears = [budget.financialYear, ...editYears];
        }
        setYears(editYears);
        setForm({
          title: budget.title || "",
          budgetReference: budget.budgetReference || "",
          description: budget.description || "",
          financialYearId: budget.financialYearId || budget.financialYear?.id || "",
          lines:
            Array.isArray(budget.lines) && budget.lines.length
              ? budget.lines.map((line) => ({
                  category: line.category || line.name || "",
                  description: line.description || "",
                  quantity:
                    line.quantity != null
                      ? formatMoneyAmount(line.quantity) || String(line.quantity)
                      : "1",
                  unitOfMeasure: line.unitOfMeasure || "Lot",
                  unitCost:
                    line.unitCost != null
                      ? formatMoneyAmount(line.unitCost) || String(line.unitCost)
                      : "",
                  approvedAmount:
                    line.approvedAmount != null
                      ? formatMoneyAmount(line.approvedAmount) || String(line.approvedAmount)
                      : "",
                  fundingSource: line.fundingSource || "",
                  totalManual: true,
                }))
              : [emptyLine()],
        });
        setMetaReady(true);
        return;
      }

      const firstFyId = nextYears[0]?.id || "";
      const firstFyLabel = nextYears[0]?.label || "";
      const autoRef =
        firstFyLabel && dept
          ? nextOrgDocumentReference(refs, {
              deptCode: dept.code,
              deptName: dept.name,
              docType: ORG_REF_DOC.BUDGET,
              fyLabel: firstFyLabel,
            })
          : "";
      setForm((f) => ({
        ...f,
        financialYearId: firstFyId,
        budgetReference: autoRef || f.budgetReference,
      }));
      setMetaReady(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, budgetId, isEdit, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyReferenceForFy(financialYearId) {
    if (isEdit) return;
    const fy = years.find((y) => y.id === financialYearId);
    if (!fy?.label || !actorDepartment) return;
    const next = nextOrgDocumentReference(existingRefs, {
      deptCode: actorDepartment.code,
      deptName: actorDepartment.name,
      docType: ORG_REF_DOC.BUDGET,
      fyLabel: fy.label,
    });
    setForm((f) => ({ ...f, budgetReference: next }));
  }

  function updateLine(idx, patch) {
    setForm((f) => {
      const lines = f.lines.map((line, i) => {
        if (i !== idx) return line;
        const next = { ...line, ...patch };
        if ("unitCost" in patch || "quantity" in patch) {
          if (!next.totalManual) {
            const total = computeLineTotal(next.quantity, next.unitCost);
            if (total !== null) {
              next.approvedAmount = formatMoneyAmount(total);
            }
          }
        }
        if ("approvedAmount" in patch) {
          next.totalManual = true;
        }
        return next;
      });
      return { ...f, lines };
    });
    setFieldErrors((fe) => {
      const next = { ...fe };
      Object.keys(patch).forEach((k) => {
        delete next[`lines.${idx}.${k}`];
        delete next[`lines.${idx}`];
      });
      return next;
    });
  }

  function removeLine(idx) {
    setForm((f) => {
      if (f.lines.length <= 1) return f;
      return { ...f, lines: f.lines.filter((_, i) => i !== idx) };
    });
  }

  /**
   * @returns {Record<string, string>}
   */
  function validateClient() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!form.title.trim()) errors.title = "Enter a budget title.";
    if (!form.budgetReference.trim()) errors.budgetReference = "Enter a budget reference.";
    if (!form.financialYearId) {
      errors.financialYearId = fyEmptyMessage || "Choose a financial year.";
    }
    form.lines.forEach((line, idx) => {
      if (!line.category.trim()) errors[`lines.${idx}.category`] = "Enter a category.";
      if (!line.description.trim()) errors[`lines.${idx}.description`] = "Enter a description.";
      const qtyErr = validatePositiveNumber(line.quantity, "Quantity");
      if (qtyErr) errors[`lines.${idx}.quantity`] = qtyErr;
      if (!line.unitOfMeasure.trim()) errors[`lines.${idx}.unitOfMeasure`] = "Enter a unit.";
      const costErr = validatePositiveMoney(line.unitCost, "Unit cost");
      if (costErr) errors[`lines.${idx}.unitCost`] = costErr;
      const totalErr = validatePositiveMoney(line.approvedAmount, "Total");
      if (totalErr) errors[`lines.${idx}.approvedAmount`] = totalErr;
      if (!line.fundingSource.trim()) {
        errors[`lines.${idx}.fundingSource`] = "Enter a funding source.";
      }
    });
    return errors;
  }

  async function createBudget(e) {
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
        title: form.title.trim(),
        description: form.description.trim() || null,
        lines: form.lines.map((line) => ({
          category: line.category.trim(),
          description: line.description.trim(),
          quantity: parseMoneyInput(line.quantity),
          unitOfMeasure: line.unitOfMeasure.trim(),
          unitCost: parseMoneyInput(line.unitCost),
          approvedAmount: parseMoneyInput(line.approvedAmount),
          fundingSource: line.fundingSource.trim(),
        })),
      };
      const res = isEdit
        ? await fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "updateDraft", ...payload }),
          })
        : await fetch(`/api/projects/${projectId}/budgets`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              budgetReference: form.budgetReference.trim(),
              financialYearId: form.financialYearId,
            }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors);
        }
        showToast({
          message:
            typeof data.error === "string"
              ? data.error
              : isEdit
                ? "Could not update budget."
                : "Could not create budget.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: isEdit ? "Budget draft updated." : "Department budget draft saved.",
        severity: "success",
      });
      if (!isEdit) await clearDraft();
      router.push(isEdit ? `/projects/${projectId}/budgets/${budgetId}` : listHref);
    } finally {
      setBusy(false);
    }
  }

  const previewRows = useMemo(() => {
    return form.lines.map((line, idx) => ({
      id: idx,
      category: line.category.trim() || `Line ${idx + 1}`,
      quantity: toMoneyNumber(line.quantity),
      unit: line.unitOfMeasure.trim() || "—",
      unitCost: toMoneyNumber(line.unitCost),
      total: toMoneyNumber(line.approvedAmount) ?? computeLineTotal(line.quantity, line.unitCost),
      funding: line.fundingSource.trim() || "—",
    }));
  }, [form.lines]);

  const footerTotal = previewRows.reduce((sum, row) => sum + (row.total || 0), 0);

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
          {isEdit
            ? "You cannot edit this department budget with your current role or status."
            : "You cannot create a department budget with your current role."}
        </Typography>
        <Button component={Link} href={listHref} startIcon={<ArrowBackRounded />} variant="outlined">
          Back to budgets
        </Button>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        {isEdit ? "Edit department budget draft" : "Prepare department budget requirement"}
      </Typography>
      {!isEdit ? (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          {serverSyncState === "saving"
            ? "Saving draft…"
            : serverSyncState === "saved"
              ? "Draft saved — you can continue on another device"
              : "Autosaves as you type (local + server)"}
        </Typography>
      ) : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={createBudget} noValidate>
        <TextField
          label="Title"
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
          placeholder="ICT Computer Equipment Budget 2026/2027"
        />
        <TextField
          label="Budget reference"
          value={form.budgetReference}
          onChange={(e) => {
            if (isEdit) return;
            setForm((f) => ({ ...f, budgetReference: e.target.value }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.budgetReference;
              return n;
            });
          }}
          fullWidth
          disabled={isEdit}
          error={Boolean(fieldErrors.budgetReference)}
          helperText={
            fieldErrors.budgetReference ||
            (isEdit
              ? "Reference is fixed after the draft is created"
              : "Auto-generated as DEPT-BUD-YYYY-SEQ; you may edit")
          }
          sx={themedTextFieldSx}
          placeholder="ICT-BUD-2026-001"
        />
        <ActiveFinancialYearSelect
          value={form.financialYearId}
          onChange={(financialYearId) => {
            if (isEdit) return;
            setForm((f) => ({ ...f, financialYearId }));
            setFieldErrors((fe) => {
              const n = { ...fe };
              delete n.financialYearId;
              return n;
            });
            applyReferenceForFy(financialYearId);
          }}
          years={years}
          emptyMessage={fyEmptyMessage}
          error={Boolean(fieldErrors.financialYearId)}
          helperText={
            fieldErrors.financialYearId ||
            (isEdit ? "Financial year is fixed after the draft is created" : undefined)
          }
          disabled={isEdit}
        />
        <TextField
          label="Department"
          value={departmentLabel}
          fullWidth
          disabled
          helperText="Auto-populated from your organisation user account"
          sx={themedTextFieldSx}
        />
        <TextField
          label="Budget narrative (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          sx={themedTextFieldSx}
        />

        {form.lines.map((line, idx) => (
          <div
            key={idx}
            className="sm:col-span-2 grid gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3 sm:grid-cols-3"
          >
            <div className="sm:col-span-3 flex items-center justify-between gap-2">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Budget line {idx + 1}
              </Typography>
              <Tooltip title="Remove line">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`Remove budget line ${idx + 1}`}
                    disabled={form.lines.length <= 1 || busy}
                    onClick={() => removeLine(idx)}
                  >
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
            <TextField
              label="Category"
              value={line.category}
              onChange={(e) => updateLine(idx, { category: e.target.value })}
              fullWidth
              className="sm:col-span-3"
              error={Boolean(fieldErrors[`lines.${idx}.category`])}
              helperText={fieldErrors[`lines.${idx}.category`] || undefined}
              sx={themedTextFieldSx}
              placeholder="Computer Equipment"
            />
            <TextField
              label="Description"
              value={line.description}
              onChange={(e) => updateLine(idx, { description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              className="sm:col-span-3"
              error={Boolean(fieldErrors[`lines.${idx}.description`])}
              helperText={fieldErrors[`lines.${idx}.description`] || undefined}
              sx={themedTextFieldSx}
              placeholder="Computer equipment for ICT operations"
            />
            <TextField
              label="Quantity"
              value={line.quantity}
              onChange={(e) => updateLine(idx, { quantity: e.target.value, totalManual: false })}
              onBlur={(e) => {
                const formatted = formatMoneyAmount(e.target.value);
                if (formatted) updateLine(idx, { quantity: formatted, totalManual: false });
              }}
              fullWidth
              error={Boolean(fieldErrors[`lines.${idx}.quantity`])}
              helperText={fieldErrors[`lines.${idx}.quantity`] || undefined}
              sx={themedTextFieldSx}
            />
            <TextField
              label="Unit"
              value={line.unitOfMeasure}
              onChange={(e) => updateLine(idx, { unitOfMeasure: e.target.value })}
              fullWidth
              error={Boolean(fieldErrors[`lines.${idx}.unitOfMeasure`])}
              helperText={fieldErrors[`lines.${idx}.unitOfMeasure`] || undefined}
              sx={themedTextFieldSx}
              placeholder="Lot"
            />
            <TextField
              label="Unit cost (UGX)"
              value={line.unitCost}
              onChange={(e) => updateLine(idx, { unitCost: e.target.value, totalManual: false })}
              onBlur={(e) => {
                const formatted = formatMoneyAmount(e.target.value);
                if (formatted) updateLine(idx, { unitCost: formatted, totalManual: false });
              }}
              fullWidth
              error={Boolean(fieldErrors[`lines.${idx}.unitCost`])}
              helperText={fieldErrors[`lines.${idx}.unitCost`] || undefined}
              sx={themedTextFieldSx}
              placeholder="100,000,000"
            />
            <TextField
              label="Total (UGX)"
              value={line.approvedAmount}
              onChange={(e) => updateLine(idx, { approvedAmount: e.target.value })}
              onBlur={(e) => {
                const formatted = formatMoneyAmount(e.target.value);
                if (formatted) updateLine(idx, { approvedAmount: formatted });
              }}
              fullWidth
              error={Boolean(fieldErrors[`lines.${idx}.approvedAmount`])}
              helperText={
                fieldErrors[`lines.${idx}.approvedAmount`] ||
                "Auto-computed from quantity × unit cost; you may edit"
              }
              sx={themedTextFieldSx}
            />
            <TextField
              label="Funding source"
              value={line.fundingSource}
              onChange={(e) => updateLine(idx, { fundingSource: e.target.value })}
              fullWidth
              className="sm:col-span-2"
              error={Boolean(fieldErrors[`lines.${idx}.fundingSource`])}
              helperText={fieldErrors[`lines.${idx}.fundingSource`] || undefined}
              sx={themedTextFieldSx}
              placeholder="Institutional Budget"
            />
          </div>
        ))}

        <div className="sm:col-span-2 space-y-3">
          <Button
            type="button"
            variant="outlined"
            startIcon={<AddRounded />}
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}
          >
            Add line
          </Button>

          <OrgLineItemsTable
            title="Line items computation"
            columns={[
              { id: "category", label: "Category" },
              { id: "quantity", label: "Qty", align: "right", money: true },
              { id: "unit", label: "Unit" },
              { id: "unitCost", label: "Unit cost", align: "right", money: true },
              { id: "total", label: "Total", align: "right", money: true },
              { id: "funding", label: "Funding" },
            ]}
            rows={previewRows}
            getRowKey={(row) => row.id}
            footerLabel="Grand total"
            footerTotal={footerTotal}
            emptyMessage="Add budget lines to see totals."
          />
        </div>

        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="contained"
            disabled={busy || (!isEdit && years.length === 0)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
          >
            {isEdit ? "Save changes" : "Save draft"}
          </Button>
        </div>
      </form>
    </Paper>
  );
}
