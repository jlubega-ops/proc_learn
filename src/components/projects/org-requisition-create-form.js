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
  formatMoneyUGX,
  parseMoneyInput,
  toMoneyNumber,
  validatePositiveMoney,
  validatePositiveNumber,
} from "@/lib/money";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";

/**
 * @param {{ projectId: string }} p
 */
export function OrgRequisitionCreateForm({ projectId }) {
  const { showToast } = useToast();
  const router = useRouter();
  const listHref = `/projects/${projectId}/requisitions`;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actorDepartment, setActorDepartment] = useState(
    /** @type {{ id?: string; name?: string; code?: string | null } | null} */ (null),
  );
  const [existingRefs, setExistingRefs] = useState(/** @type {string[]} */ ([]));
  const [meta, setMeta] = useState({
    years: [],
    plans: [],
    budgetLines: [],
    fyEmptyMessage: null,
  });
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [form, setForm] = useState({
    title: "",
    requisitionReference: "",
    financialYearId: "",
    procurementPlanId: "",
    procurementPlanItemId: "",
    budgetLineId: "",
    category: "",
    justification: "",
    needDescription: "",
    requiredByDate: "",
    deliveryLocation: "",
    remarks: "",
    items: [{ itemName: "", quantity: "1", unitOfMeasure: "Unit", estimatedUnitPrice: "" }],
  });
  const [metaReady, setMetaReady] = useState(false);

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey: "requisition:new",
    values: form,
    projectId,
    enabled: metaReady,
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

  function emptyReqLine() {
    return { itemName: "", quantity: "1", unitOfMeasure: "Unit", estimatedUnitPrice: "" };
  }

  function clearFieldError(key) {
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const n = { ...fe };
      delete n[key];
      return n;
    });
  }

  function updateReqLine(idx, patch) {
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

  function removeReqLine(idx) {
    setForm((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.filter((_, i) => i !== idx) };
    });
    setFieldErrors({});
  }

  function applyReferenceForFy(financialYearId, yearsList, dept, refs) {
    const list = yearsList || meta.years;
    const department = dept !== undefined ? dept : actorDepartment;
    const refList = refs !== undefined ? refs : existingRefs;
    const fy = list.find((y) => y.id === financialYearId);
    if (!fy?.label || !department) return;
    return nextOrgDocumentReference(refList, {
      deptCode: department.code,
      deptName: department.name,
      docType: ORG_REF_DOC.REQUISITION,
      fyLabel: fy.label,
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [yRes, pRes, bRes, rRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/org-financial-years?selectable=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/procurement-plans?approved=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/budgets?selectable=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/requisitions`, { credentials: "include" }),
      ]);
      const yData = await yRes.json().catch(() => ({}));
      const pData = await pRes.json().catch(() => ({}));
      const bData = await bRes.json().catch(() => ({}));
      const rData = await rRes.json().catch(() => ({}));
      const nextYears = Array.isArray(yData.financialYears) ? yData.financialYears : [];
      const dept =
        rData.actorDepartment ||
        pData.actorDepartment ||
        (Array.isArray(bData.budgetLines) && bData.budgetLines[0]?.department) ||
        null;
      setActorDepartment(dept);
      const requisitions = Array.isArray(rData.requisitions) ? rData.requisitions : [];
      const refs = requisitions.map((r) => r.requisitionReference).filter(Boolean);
      setExistingRefs(refs);
      setMeta({
        years: nextYears,
        plans: (Array.isArray(pData.plans) ? pData.plans : []).filter(
          (p) => p.status === "APPROVED",
        ),
        budgetLines: Array.isArray(bData.budgetLines) ? bData.budgetLines : [],
        fyEmptyMessage: typeof yData.message === "string" ? yData.message : null,
      });
      const firstFyId = nextYears[0]?.id || "";
      const firstFyLabel = nextYears[0]?.label || "";
      const autoRef =
        firstFyLabel && dept
          ? nextOrgDocumentReference(refs, {
              deptCode: dept.code,
              deptName: dept.name,
              docType: ORG_REF_DOC.REQUISITION,
              fyLabel: firstFyLabel,
            })
          : "";
      setForm((f) => ({
        ...f,
        financialYearId: firstFyId,
        requisitionReference: autoRef || f.requisitionReference,
      }));
    } finally {
      setLoading(false);
      setMetaReady(true);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPlan = meta.plans.find((p) => p.id === form.procurementPlanId);
  const hasApprovedPlans = meta.plans.length > 0;
  const planItems = selectedPlan?.items || [];
  const hasPlanItems = planItems.length > 0;
  const fyBudgetLines = meta.budgetLines.filter(
    (b) => !form.financialYearId || b.financialYearId === form.financialYearId,
  );
  const hasBudgetLines = fyBudgetLines.length > 0;
  const canCreateRequisition = hasApprovedPlans && hasBudgetLines;

  /**
   * @returns {Record<string, string>}
   */
  function validateClient() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!form.title.trim()) errors.title = "Enter a procurement title.";
    if (!form.requisitionReference.trim()) {
      errors.requisitionReference = "Enter a requisition reference.";
    }
    if (!form.financialYearId) {
      errors.financialYearId = meta.fyEmptyMessage || "Choose a financial year.";
    }
    if (!form.procurementPlanId) {
      errors.procurementPlanId = !hasApprovedPlans
        ? "No approved procurement plans are available for your department."
        : "Choose a procurement plan.";
    }
    if (!form.procurementPlanItemId) {
      errors.procurementPlanItemId =
        selectedPlan && !hasPlanItems
          ? "No approved procurement plan items are available on this plan."
          : "Choose a plan item.";
    }
    if (!form.budgetLineId) {
      errors.budgetLineId = !hasBudgetLines
        ? "No approved budget lines for this financial year."
        : "Choose a budget line.";
    }
    if (!form.justification.trim()) errors.justification = "Enter a justification.";
    if (!form.needDescription.trim()) errors.needDescription = "Enter a need description.";
    if (!form.requiredByDate) errors.requiredByDate = "Choose a required-by date.";
    form.items.forEach((item, idx) => {
      if (!item.itemName.trim()) errors[`items.${idx}.itemName`] = "Enter an item name.";
      const qtyErr = validatePositiveNumber(item.quantity, "Quantity");
      if (qtyErr) errors[`items.${idx}.quantity`] = qtyErr;
      if (!item.unitOfMeasure.trim()) errors[`items.${idx}.unitOfMeasure`] = "Enter a unit.";
      const priceErr = validatePositiveMoney(item.estimatedUnitPrice, "Unit price");
      if (priceErr) errors[`items.${idx}.estimatedUnitPrice`] = priceErr;
    });
    return errors;
  }

  const previewRows = useMemo(() => {
    return form.items.map((item, idx) => ({
      id: idx,
      index: idx + 1,
      itemName: item.itemName.trim() || `Item ${idx + 1}`,
      quantity: toMoneyNumber(item.quantity),
      unit: item.unitOfMeasure.trim() || "—",
      unitPrice: toMoneyNumber(item.estimatedUnitPrice),
      lineTotal: computeLineTotal(item.quantity, item.estimatedUnitPrice),
    }));
  }, [form.items]);

  const footerTotal = previewRows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);

  async function submit(e) {
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
        requisitionReference: form.requisitionReference.trim(),
        items: form.items.map((item) => ({
          ...item,
          quantity: parseMoneyInput(item.quantity),
          estimatedUnitPrice: parseMoneyInput(item.estimatedUnitPrice),
        })),
        submit: true,
      };
      const res = await fetch(`/api/projects/${projectId}/requisitions`, {
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
          message: typeof data.error === "string" ? data.error : "Could not submit requisition.",
          severity: "error",
        });
        return;
      }
      await clearDraft();
      showToast({ message: "Requisition submitted.", severity: "success" });
      router.push(listHref);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
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
        New procurement requisition
      </Typography>
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
        {serverSyncState === "saving"
          ? "Saving draft…"
          : serverSyncState === "saved"
            ? "Draft saved — you can continue on another device"
            : "Autosaves as you type (local + server)"}
      </Typography>
      {!canCreateRequisition ? (
        <div className="mb-4 space-y-2 rounded-lg border border-[color:var(--brand-yellow)] bg-[color:var(--surface-elevated)] p-3 text-sm">
          {!hasApprovedPlans ? (
            <p>
              No approved procurement plans are available for your department. Procurement planning
              must be completed and approved before creating a requisition.
            </p>
          ) : null}
          {hasApprovedPlans && !hasBudgetLines ? (
            <p>
              No approved budget line is available for this requirement. An approved department
              budget must exist first.
            </p>
          ) : null}
          <p>
            <Link
              href={`/projects/${projectId}/procurement-plans`}
              className="cursor-pointer font-semibold text-primary underline"
            >
              View Procurement Plans
            </Link>
            {" · "}
            <Link
              href={`/projects/${projectId}/budgets`}
              className="cursor-pointer font-semibold text-primary underline"
            >
              View Department Budgets
            </Link>
          </p>
        </div>
      ) : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <TextField
          label="Procurement title"
          value={form.title}
          onChange={(e) => {
            setForm((f) => ({ ...f, title: e.target.value }));
            clearFieldError("title");
          }}
          fullWidth
          className="sm:col-span-2"
          error={Boolean(fieldErrors.title)}
          helperText={fieldErrors.title || undefined}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Requisition reference"
          value={form.requisitionReference}
          onChange={(e) => {
            setForm((f) => ({ ...f, requisitionReference: e.target.value }));
            clearFieldError("requisitionReference");
          }}
          fullWidth
          error={Boolean(fieldErrors.requisitionReference)}
          helperText={
            fieldErrors.requisitionReference ||
            "Auto-generated as DEPT-REQ-YYYY-SEQ; you may edit"
          }
          sx={themedTextFieldSx}
          placeholder="ICT-REQ-2026-001"
        />
        <ActiveFinancialYearSelect
          value={form.financialYearId}
          onChange={(financialYearId) => {
            const nextRef = applyReferenceForFy(financialYearId);
            setForm((f) => ({
              ...f,
              financialYearId,
              procurementPlanId: "",
              procurementPlanItemId: "",
              budgetLineId: "",
              ...(nextRef ? { requisitionReference: nextRef } : {}),
            }));
            clearFieldError("financialYearId");
          }}
          years={meta.years}
          emptyMessage={meta.fyEmptyMessage}
          error={Boolean(fieldErrors.financialYearId)}
          helperText={fieldErrors.financialYearId || undefined}
        />
        <TextField
          select
          label="Procurement plan"
          value={form.procurementPlanId}
          onChange={(e) => {
            setForm((f) => ({
              ...f,
              procurementPlanId: e.target.value,
              procurementPlanItemId: "",
            }));
            clearFieldError("procurementPlanId");
            clearFieldError("procurementPlanItemId");
          }}
          fullWidth
          error={Boolean(fieldErrors.procurementPlanId) || !hasApprovedPlans}
          helperText={
            fieldErrors.procurementPlanId ||
            (!hasApprovedPlans
              ? "No approved procurement plans are available for your department."
              : undefined)
          }
          sx={themedTextFieldSx}
        >
          {meta.plans
            .filter((p) => p.status === "APPROVED")
            .map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.planReference ? `${p.planReference} · ` : ""}
                {p.title}
              </MenuItem>
            ))}
          {!hasApprovedPlans ? (
            <MenuItem value="" disabled>
              No approved plans available
            </MenuItem>
          ) : null}
        </TextField>
        <TextField
          select
          label="Plan item"
          value={form.procurementPlanItemId}
          onChange={(e) => {
            setForm((f) => ({ ...f, procurementPlanItemId: e.target.value }));
            clearFieldError("procurementPlanItemId");
          }}
          fullWidth
          sx={themedTextFieldSx}
          disabled={!selectedPlan}
          error={
            Boolean(fieldErrors.procurementPlanItemId) ||
            Boolean(selectedPlan && !hasPlanItems)
          }
          helperText={
            fieldErrors.procurementPlanItemId ||
            (selectedPlan && !hasPlanItems
              ? "No approved procurement plan items are available on this plan."
              : undefined)
          }
        >
          {planItems.map((i) => (
            <MenuItem key={i.id} value={i.id}>
              {i.title}
            </MenuItem>
          ))}
          {selectedPlan && !hasPlanItems ? (
            <MenuItem value="" disabled>
              No plan items available
            </MenuItem>
          ) : null}
        </TextField>
        <TextField
          select
          label="Budget line"
          value={form.budgetLineId}
          onChange={(e) => {
            setForm((f) => ({ ...f, budgetLineId: e.target.value }));
            clearFieldError("budgetLineId");
          }}
          fullWidth
          error={Boolean(fieldErrors.budgetLineId) || !hasBudgetLines}
          sx={themedTextFieldSx}
          helperText={
            fieldErrors.budgetLineId ||
            (!hasBudgetLines
              ? "No approved budget lines for this financial year."
              : undefined)
          }
        >
          {fyBudgetLines.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.code} — {b.name} (avail.{" "}
              {formatMoneyUGX(b.availableBalance ?? b.approvedAmount, { empty: "—" })})
            </MenuItem>
          ))}
          {!hasBudgetLines ? (
            <MenuItem value="" disabled>
              No approved budget lines
            </MenuItem>
          ) : null}
        </TextField>
        <TextField
          label="Category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Required by"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={form.requiredByDate}
          onChange={(e) => {
            setForm((f) => ({ ...f, requiredByDate: e.target.value }));
            clearFieldError("requiredByDate");
          }}
          fullWidth
          error={Boolean(fieldErrors.requiredByDate)}
          helperText={fieldErrors.requiredByDate || undefined}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Justification"
          value={form.justification}
          onChange={(e) => {
            setForm((f) => ({ ...f, justification: e.target.value }));
            clearFieldError("justification");
          }}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          error={Boolean(fieldErrors.justification)}
          helperText={fieldErrors.justification || undefined}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Need / requirement description"
          value={form.needDescription}
          onChange={(e) => {
            setForm((f) => ({ ...f, needDescription: e.target.value }));
            clearFieldError("needDescription");
          }}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          error={Boolean(fieldErrors.needDescription)}
          helperText={fieldErrors.needDescription || undefined}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Delivery location"
          value={form.deliveryLocation}
          onChange={(e) => setForm((f) => ({ ...f, deliveryLocation: e.target.value }))}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Remarks"
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          fullWidth
          sx={themedTextFieldSx}
        />

        <div className="sm:col-span-2 space-y-2">
          <Typography variant="subtitle2">Line items</Typography>
          {form.items.map((item, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-lg border border-[color:var(--border-subtle)] p-2 sm:grid-cols-4"
            >
              <div className="sm:col-span-4 flex items-center justify-between gap-2">
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Line {idx + 1}
                </Typography>
                <Tooltip title="Remove line">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Remove requisition line ${idx + 1}`}
                      disabled={form.items.length <= 1 || busy}
                      onClick={() => removeReqLine(idx)}
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
              <TextField
                label="Item name"
                value={item.itemName}
                onChange={(e) => updateReqLine(idx, { itemName: e.target.value })}
                error={Boolean(fieldErrors[`items.${idx}.itemName`])}
                helperText={fieldErrors[`items.${idx}.itemName`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Qty"
                value={item.quantity}
                onChange={(e) => updateReqLine(idx, { quantity: e.target.value })}
                onBlur={(e) => {
                  const formatted = formatMoneyAmount(e.target.value);
                  if (formatted) updateReqLine(idx, { quantity: formatted });
                }}
                error={Boolean(fieldErrors[`items.${idx}.quantity`])}
                helperText={fieldErrors[`items.${idx}.quantity`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="UoM"
                value={item.unitOfMeasure}
                onChange={(e) => updateReqLine(idx, { unitOfMeasure: e.target.value })}
                error={Boolean(fieldErrors[`items.${idx}.unitOfMeasure`])}
                helperText={fieldErrors[`items.${idx}.unitOfMeasure`] || undefined}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Unit price"
                value={item.estimatedUnitPrice}
                onChange={(e) => updateReqLine(idx, { estimatedUnitPrice: e.target.value })}
                onBlur={(e) => {
                  const formatted = formatMoneyAmount(e.target.value);
                  if (formatted) updateReqLine(idx, { estimatedUnitPrice: formatted });
                }}
                error={Boolean(fieldErrors[`items.${idx}.estimatedUnitPrice`])}
                helperText={fieldErrors[`items.${idx}.estimatedUnitPrice`] || undefined}
                sx={themedTextFieldSx}
              />
            </div>
          ))}
          <Button
            type="button"
            startIcon={<AddRounded />}
            onClick={() =>
              setForm((f) => ({
                ...f,
                items: [...f.items, emptyReqLine()],
              }))
            }
          >
            Add line
          </Button>

          <OrgLineItemsTable
            title="Line items computation"
            columns={[
              { id: "index", label: "#" },
              { id: "itemName", label: "Item" },
              { id: "quantity", label: "Qty", align: "right", money: true },
              { id: "unit", label: "Unit" },
              { id: "unitPrice", label: "Unit price", align: "right", money: true },
              { id: "lineTotal", label: "Line total", align: "right", money: true },
            ]}
            rows={previewRows}
            getRowKey={(row) => row.id}
            footerLabel="Estimated total"
            footerTotal={footerTotal}
            emptyMessage="Add line items to see totals."
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" variant="contained" disabled={busy || !canCreateRequisition}>
            {busy ? "Submitting…" : "Submit requisition"}
          </Button>
        </div>
      </form>
    </Paper>
  );
}
