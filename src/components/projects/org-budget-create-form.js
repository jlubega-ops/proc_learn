"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/toast-provider";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { OrgBudgetLinesEditor, budgetLineTotal } from "@/components/projects/org-budget-lines-editor";
import {
  DEFAULT_FUNDING_SOURCE,
  DEFAULT_UNIT_OF_MEASURE,
  validateLineText,
} from "@/lib/projects/line-item-options";
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
  validatePositiveMoney,
  validatePositiveNumber,
} from "@/lib/money";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import { useApi } from "@/hooks/use-api";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";

function emptyLine() {
  return {
    category: "",
    description: "",
    quantity: "1",
    unitOfMeasure: DEFAULT_UNIT_OF_MEASURE,
    unitCost: "",
    approvedAmount: "",
    fundingSource: DEFAULT_FUNDING_SOURCE,
  };
}

/** @param {any} line */
function withLineDefaults(line) {
  const base = { ...emptyLine(), ...(line && typeof line === "object" ? line : {}) };
  delete base.totalManual;
  if (!String(base.unitOfMeasure || "").trim()) base.unitOfMeasure = DEFAULT_UNIT_OF_MEASURE;
  if (!String(base.fundingSource || "").trim()) base.fundingSource = DEFAULT_FUNDING_SOURCE;
  return base;
}

/**
 * @param {{ projectId: string; budgetId?: string }} p
 */
export function OrgBudgetCreateForm({ projectId, budgetId = "" }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
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
  const { data: fyData, reload: reloadYears } = useApi(
    `/api/projects/${projectId}/org-financial-years?selectable=1`,
    { silentErrors: true },
  );
  const fyDataRef = useRef(fyData);
  useEffect(() => {
    fyDataRef.current = fyData;
  }, [fyData]);
  const [editFinancialYear, setEditFinancialYear] = useState(/** @type {any} */ (null));
  const years = useMemo(() => {
    const list = Array.isArray(fyData?.financialYears) ? fyData.financialYears : [];
    if (editFinancialYear?.id && !list.some((y) => y.id === editFinancialYear.id)) {
      return [editFinancialYear, ...list];
    }
    return list;
  }, [fyData, editFinancialYear]);
  const fyEmptyMessage = typeof fyData?.message === "string" ? fyData.message : null;
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
  const processes = useProcessActivation(projectId);
  const createBlocked = !isEdit && !processes.isActive(PROCESS_FLOW_CODES.BUDGETING);

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
              ? /** @type {any} */ (payload).lines.map(withLineDefaults)
              : prev.lines,
        }));
      }
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, yData, detailRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/budgets`, { credentials: "include" }),
        fyDataRef.current ? Promise.resolve(fyDataRef.current) : reloadYears(),
        isEdit
          ? fetch(`/api/projects/${projectId}/budgets/${budgetId}`, {
              credentials: "include",
            })
          : Promise.resolve(null),
      ]);
      const bData = await bRes.json().catch(() => ({}));
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
      const nextYears = Array.isArray(yData?.financialYears) ? yData.financialYears : [];

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
        setEditFinancialYear(budget.financialYear?.id ? budget.financialYear : null);
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
                  fundingSource: line.fundingSource || DEFAULT_FUNDING_SOURCE,
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
  }, [projectId, budgetId, isEdit, reloadYears, showToast]);

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
          const total = computeLineTotal(next.quantity, next.unitCost);
          next.approvedAmount = total !== null ? formatMoneyAmount(total) : "";
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
      if ("unitCost" in patch || "quantity" in patch) delete next[`lines.${idx}.approvedAmount`];
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
      const categoryErr = validateLineText(line.category, "Category");
      if (categoryErr) errors[`lines.${idx}.category`] = categoryErr;
      const qtyErr = validatePositiveNumber(line.quantity, "Quantity");
      if (qtyErr) errors[`lines.${idx}.quantity`] = qtyErr;
      if (!line.unitOfMeasure.trim()) errors[`lines.${idx}.unitOfMeasure`] = "Choose a unit.";
      const costErr = validatePositiveMoney(line.unitCost, "Unit cost");
      if (costErr) errors[`lines.${idx}.unitCost`] = costErr;
      const fundingErr = validateLineText(line.fundingSource, "Source of funding");
      if (fundingErr) errors[`lines.${idx}.fundingSource`] = fundingErr;
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
        lines: form.lines.map((line) => {
          const total = budgetLineTotal(line);
          return {
            category: line.category.trim(),
            description: line.description.trim() || null,
            quantity: parseMoneyInput(line.quantity),
            unitOfMeasure: line.unitOfMeasure.trim(),
            unitCost: parseMoneyInput(line.unitCost),
            approvedAmount: total != null ? String(total) : "",
            fundingSource: line.fundingSource.trim(),
          };
        }),
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

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} aria-busy>
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  const hasEntry =
    !isEdit &&
    (Boolean(String(form.title || "").trim() || String(form.description || "").trim()) ||
      form.lines.some(
        (l) =>
          String(l.category || "").trim() ||
          String(l.description || "").trim() ||
          String(l.unitCost || "").trim() ||
          String(l.approvedAmount || "").trim() ||
          String(l.quantity || "1").trim() !== "1",
      ));

  /** @param {import("react").MouseEvent} e */
  const leaveForm = async (e) => {
    if (!hasEntry) return;
    e.preventDefault();
    if (!(await confirm(discardConfirmOptions()))) return;
    await clearDraft();
    router.push(listHref);
  };

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
          onClick={(e) => void leaveForm(e)}
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

        <div className="sm:col-span-2">
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Budget lines
          </Typography>
          <OrgBudgetLinesEditor
            lines={form.lines}
            errors={fieldErrors}
            disabled={busy}
            onChange={updateLine}
            onAdd={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}
            onRemove={removeLine}
          />
        </div>

        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <ProcessGateTooltip
            inactive={createBlocked}
            title={processes.inactiveTitle(PROCESS_FLOW_CODES.BUDGETING)}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={busy || (!isEdit && years.length === 0) || createBlocked}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
            >
              {isEdit ? "Save changes" : "Save draft"}
            </Button>
          </ProcessGateTooltip>
        </div>
      </form>
    </Paper>
  );
}

