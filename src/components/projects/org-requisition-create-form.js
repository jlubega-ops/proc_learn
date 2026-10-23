"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { format } from "date-fns";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { useToast } from "@/components/providers/toast-provider";
import {
  decisionConfirmOptions,
  discardConfirmOptions,
  useConfirm,
} from "@/components/providers/confirm-provider";
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
import { PPDA_YES_NO } from "@/lib/projects/ppda-forms";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import {
  DEFAULT_UNIT_OF_MEASURE,
  unitOptionsFor,
} from "@/lib/projects/line-item-options";

/** @param {any} planItem */
function planItemCategory(planItem) {
  if (!planItem) return "";
  return String(planItem.category || planItem.circularFields?.circularSheet || "").trim();
}

/** @param {any} planItem */
function planItemUnit(planItem) {
  if (!planItem) return DEFAULT_UNIT_OF_MEASURE;
  return String(planItem.unitOfMeasure || "").trim() || DEFAULT_UNIT_OF_MEASURE;
}

/**
 * @param {unknown} current
 * @param {unknown} value
 */
function fillIfBlank(current, value) {
  if (String(current ?? "").trim()) return /** @type {string} */ (current);
  return typeof value === "string" ? value : current ? String(current) : "";
}

/** @param {unknown} value `yyyy-MM-dd` */
function futureDateOrEmpty(value) {
  const s = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s >= format(new Date(), "yyyy-MM-dd") ? s : "";
}

/**
 * Fields the user fills in (auto-filled references, member name and market price excluded).
 * @param {any} f
 */
function requisitionEntryFingerprint(f) {
  const form5 = f.form5 || {};
  return JSON.stringify({
    title: f.title,
    category: f.category,
    justification: f.justification,
    needDescription: f.needDescription,
    requiredByDate: f.requiredByDate,
    deliveryLocation: f.deliveryLocation,
    remarks: f.remarks,
    procurementPlanId: f.procurementPlanId,
    procurementPlanItemId: f.procurementPlanItemId,
    budgetLineId: f.budgetLineId,
    items: (Array.isArray(f.items) ? f.items : []).map((i) => [
      i.itemName,
      i.quantity,
      i.unitOfMeasure,
      i.estimatedUnitPrice,
    ]),
    form5: [
      form5.multiYearContracting,
      form5.resourcesYearOne,
      form5.resourcesYearTwo,
      form5.resourcesYearThree,
      form5.resourcesYearFour,
      form5.voteHeadNo,
      form5.programme,
      form5.subProgramme,
    ],
  });
}

/**
 * @param {{ projectId: string; requisitionId?: string }} p
 */
export function OrgRequisitionCreateForm({ projectId, requisitionId = "" }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { session } = useAuthSession();
  const router = useRouter();
  const isEdit = Boolean(requisitionId);
  const processes = useProcessActivation(projectId);
  const listHref = `/projects/${projectId}/requisitions`;
  const detailHref = isEdit ? `/projects/${projectId}/requisitions/${requisitionId}` : listHref;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [existingStatus, setExistingStatus] = useState("");
  const [awaitingHodReview, setAwaitingHodReview] = useState(false);
  const [actorDepartment, setActorDepartment] = useState(
    /** @type {{ id?: string; name?: string; code?: string | null } | null} */ (null),
  );
  const [actorDisplayName, setActorDisplayName] = useState("");
  const [existingRefs, setExistingRefs] = useState(/** @type {string[]} */ ([]));
  const [orgCode, setOrgCode] = useState("");
  const [meta, setMeta] = useState({
    years: [],
    plans: [],
    budgetLines: [],
    fyEmptyMessage: null,
  });
  const { data: fyData, reload: reloadYears } = useApi(
    `/api/projects/${projectId}/org-financial-years?selectable=1`,
    { silentErrors: true },
  );
  const fyDataRef = useRef(fyData);
  useEffect(() => {
    fyDataRef.current = fyData;
  }, [fyData]);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [marketPriceManual, setMarketPriceManual] = useState(false);
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
    items: [
      {
        itemName: "",
        quantity: "1",
        unitOfMeasure: DEFAULT_UNIT_OF_MEASURE,
        estimatedUnitPrice: "",
        lineTotal: "",
      },
    ],
    form5: {
      marketPrice: "",
      multiYearContracting: "No",
      resourcesYearOne: "",
      resourcesYearTwo: "",
      resourcesYearThree: "",
      resourcesYearFour: "",
      voteHeadNo: "",
      programme: "",
      subProgramme: "",
      fundingItem: "",
      balanceRemaining: "",
      memberName: "",
      memberTitle: "User Department Officer",
    },
  });
  const [metaReady, setMetaReady] = useState(false);
  const [orgVoteCode, setOrgVoteCode] = useState("");
  const [entryBaseline, setEntryBaseline] = useState(/** @type {string | null} */ (null));
  if (metaReady && entryBaseline === null) setEntryBaseline(requisitionEntryFingerprint(form));
  const hasEntry = entryBaseline !== null && requisitionEntryFingerprint(form) !== entryBaseline;

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey: isEdit ? `requisition:edit:${requisitionId}` : "requisition:new",
    values: form,
    projectId,
    enabled: metaReady,
    onHydrated: (payload) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const p = /** @type {any} */ (payload);
        setForm((prev) => {
          const draftForm5 =
            p.form5 && typeof p.form5 === "object" ? p.form5 : {};
          const rawItems = Array.isArray(p.items) && p.items.length ? p.items : prev.items;
          const items = rawItems.map((item) => {
            const quantity = item.quantity ?? "1";
            const estimatedUnitPrice =
              item.estimatedUnitPrice ?? item.unitPrice ?? "";
            const total = computeLineTotal(quantity, estimatedUnitPrice);
            return {
              itemName: item.itemName || item.title || "",
              quantity: formatMoneyAmount(quantity) || String(quantity || "1"),
              unitOfMeasure: item.unitOfMeasure || DEFAULT_UNIT_OF_MEASURE,
              estimatedUnitPrice:
                formatMoneyAmount(estimatedUnitPrice) || String(estimatedUnitPrice || ""),
              lineTotal: total != null ? formatMoneyAmount(total) : "",
            };
          });
          return {
            ...prev,
            ...p,
            deliveryLocation: String(p.deliveryLocation || "").trim()
              ? p.deliveryLocation
              : prev.deliveryLocation,
            items,
            form5: {
              ...prev.form5,
              ...draftForm5,
              memberName:
                String(draftForm5.memberName || "").trim() ||
                String(prev.form5?.memberName || "").trim() ||
                "",
              memberTitle:
                String(draftForm5.memberTitle || "").trim() ||
                String(prev.form5?.memberTitle || "").trim() ||
                "User Department Officer",
            },
          };
        });
      }
    },
  });

  /** @param {string} [unitOfMeasure] */
  function emptyReqLine(unitOfMeasure = DEFAULT_UNIT_OF_MEASURE) {
    return {
      itemName: "",
      quantity: "1",
      unitOfMeasure: unitOfMeasure || DEFAULT_UNIT_OF_MEASURE,
      estimatedUnitPrice: "",
      lineTotal: "",
    };
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
    setForm((f) => {
      const items = f.items.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        if ("quantity" in patch || "estimatedUnitPrice" in patch) {
          const total = computeLineTotal(next.quantity, next.estimatedUnitPrice);
          next.lineTotal = total != null ? formatMoneyAmount(total) : "";
        }
        return next;
      });
      return { ...f, items };
    });
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

  function applyReferenceForFy(financialYearId, yearsList, dept, refs, code) {
    const list = yearsList || meta.years;
    const department = dept !== undefined ? dept : actorDepartment;
    const refList = refs !== undefined ? refs : existingRefs;
    const org = code !== undefined ? code : orgCode;
    const fy = list.find((y) => y.id === financialYearId);
    if (!fy?.label && !org && !department) return;
    return nextOrgDocumentReference(refList, {
      orgCode: org,
      deptCode: department?.code,
      deptName: department?.name,
      docType: ORG_REF_DOC.REQUISITION,
      fyLabel: fy?.label,
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetches = [
        fetch(`/api/projects/${projectId}/procurement-plans?approved=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/budgets?selectable=1`, {
          credentials: "include",
        }),
        fetch(`/api/projects/${projectId}/requisitions`, { credentials: "include" }),
      ];
      if (isEdit) {
        fetches.push(
          fetch(`/api/projects/${projectId}/requisitions/${requisitionId}`, {
            credentials: "include",
          }),
        );
      }
      const [yData, [pRes, bRes, rRes, editRes]] = await Promise.all([
        fyDataRef.current ? Promise.resolve(fyDataRef.current) : reloadYears(),
        Promise.all(fetches),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      const bData = await bRes.json().catch(() => ({}));
      const rData = await rRes.json().catch(() => ({}));
      const editData = editRes ? await editRes.json().catch(() => ({})) : null;
      const nextYears = Array.isArray(yData?.financialYears) ? yData.financialYears : [];
      const dept =
        rData.actorDepartment ||
        pData.actorDepartment ||
        (Array.isArray(bData.budgetLines) && bData.budgetLines[0]?.department) ||
        null;
      setActorDepartment(dept);
      const code = typeof rData.orgCode === "string" ? rData.orgCode : "";
      setOrgCode(code);
      const actorName =
        typeof rData.actorDisplayName === "string" ? rData.actorDisplayName.trim() : "";
      setActorDisplayName(actorName);
      setOrgVoteCode(typeof rData.voteCode === "string" ? rData.voteCode : "");
      const requisitions = Array.isArray(rData.requisitions) ? rData.requisitions : [];
      const refs = requisitions.map((r) => r.requisitionReference).filter(Boolean);
      setExistingRefs(refs);
      setMeta({
        years: nextYears,
        plans: (Array.isArray(pData.plans) ? pData.plans : []).filter(
          (p) => p.status === "APPROVED",
        ),
        budgetLines: Array.isArray(bData.budgetLines) ? bData.budgetLines : [],
        fyEmptyMessage: typeof yData?.message === "string" ? yData.message : null,
      });

      if (isEdit) {
        if (!editRes?.ok || !editData?.requisition) {
          showToast({
            message:
              typeof editData?.error === "string"
                ? editData.error
                : "Could not load requisition for editing.",
            severity: "error",
          });
          router.replace(listHref);
          return;
        }
        if (!editData.canEdit) {
          showToast({
            message:
              "This requisition can no longer be edited (Head of User Department may already have acted).",
            severity: "error",
          });
          router.replace(detailHref);
          return;
        }
        const req = editData.requisition;
        setExistingStatus(String(req.status || ""));
        setAwaitingHodReview(String(req.status || "") === "SUBMITTED");
        const partI = req.form5PartI && typeof req.form5PartI === "object" ? req.form5PartI : {};
        const items = Array.isArray(req.items) && req.items.length
          ? req.items.map((item) => {
              const quantity = formatMoneyAmount(item.quantity) || String(item.quantity || "1");
              const estimatedUnitPrice =
                formatMoneyAmount(item.estimatedUnitPrice) ||
                String(item.estimatedUnitPrice || "");
              const total = computeLineTotal(quantity, estimatedUnitPrice);
              return {
                itemName: item.itemName || "",
                quantity,
                unitOfMeasure: item.unitOfMeasure || DEFAULT_UNIT_OF_MEASURE,
                estimatedUnitPrice,
                lineTotal:
                  formatMoneyAmount(item.estimatedTotal) ||
                  (total != null ? formatMoneyAmount(total) : ""),
              };
            })
          : [emptyReqLine()];
        setForm({
          title: req.title || "",
          requisitionReference: req.requisitionReference || "",
          financialYearId: req.financialYear?.id || req.financialYearId || "",
          procurementPlanId: req.procurementPlan?.id || req.procurementPlanId || "",
          procurementPlanItemId: req.procurementPlanItem?.id || req.procurementPlanItemId || "",
          budgetLineId: req.budgetLine?.id || req.budgetLineId || "",
          category:
            req.category ||
            req.procurementPlanItem?.category ||
            "",
          justification: req.justification || "",
          needDescription: req.needDescription || "",
          requiredByDate: req.requiredByDate
            ? String(req.requiredByDate).slice(0, 10)
            : "",
          deliveryLocation: req.deliveryLocation || partI.locationForDelivery || "",
          remarks: req.remarks || "",
          items,
          form5: {
            marketPrice: partI.marketPrice || "",
            multiYearContracting: partI.multiYearContracting || "No",
            resourcesYearOne: partI.resourcesYearOne || "",
            resourcesYearTwo: partI.resourcesYearTwo || "",
            resourcesYearThree: partI.resourcesYearThree || "",
            resourcesYearFour: partI.resourcesYearFour || "",
            voteHeadNo: partI.voteHeadNo || "",
            programme: partI.programme || "",
            subProgramme: partI.subProgramme || "",
            fundingItem: partI.fundingItem || "",
            balanceRemaining: partI.balanceRemaining || "",
            memberName: partI.memberName || actorName || "",
            memberTitle: partI.memberTitle || "User Department Officer",
          },
        });
        if (partI.marketPrice) setMarketPriceManual(true);
      } else {
        const firstFyId = nextYears[0]?.id || "";
        const firstFyLabel = nextYears[0]?.label || "";
        const autoRef =
          firstFyLabel || code || dept
            ? nextOrgDocumentReference(refs, {
                orgCode: code,
                deptCode: dept?.code,
                deptName: dept?.name,
                docType: ORG_REF_DOC.REQUISITION,
                fyLabel: firstFyLabel,
              })
            : "";
        const defaultLocation =
          typeof rData.defaultDeliveryLocation === "string" ? rData.defaultDeliveryLocation : "";
        setForm((f) => ({
          ...f,
          financialYearId: firstFyId,
          requisitionReference: autoRef || f.requisitionReference,
          deliveryLocation: f.deliveryLocation || defaultLocation,
          form5: {
            ...f.form5,
            memberName: f.form5.memberName || actorName,
            memberTitle:
              f.form5.memberTitle ||
              (typeof rData.actorRoleName === "string" && rData.actorRoleName
                ? rData.actorRoleName
                : "User Department Officer"),
          },
        }));
      }
    } finally {
      setLoading(false);
      setMetaReady(true);
    }
  }, [projectId, isEdit, requisitionId, reloadYears, showToast, router, listHref, detailHref]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionDisplayName =
    session?.sessionType === "org" && typeof session.displayName === "string"
      ? session.displayName.trim()
      : "";
  const sessionRoleName =
    session?.sessionType === "org" && typeof session.orgRoleName === "string"
      ? session.orgRoleName.trim()
      : "";
  const resolvedMemberName = sessionDisplayName || actorDisplayName;

  useEffect(() => {
    if (!resolvedMemberName) return;
    setForm((f) => {
      if (String(f.form5?.memberName || "").trim()) return f;
      return {
        ...f,
        form5: {
          ...f.form5,
          memberName: resolvedMemberName,
          memberTitle: f.form5.memberTitle || sessionRoleName || "User Department Officer",
        },
      };
    });
  }, [resolvedMemberName, sessionRoleName]);

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
    if (!String(form.deliveryLocation || "").trim()) {
      errors.deliveryLocation = "Enter the delivery location (Form 5 Part I).";
    }
    if (!String(form.form5?.memberName || "").trim()) {
      errors["form5.memberName"] = "Enter the User Department member name (Form 5 Part I).";
    }
    form.items.forEach((item, idx) => {
      if (!item.itemName.trim()) errors[`items.${idx}.itemName`] = "Enter an item name.";
      const qtyErr = validatePositiveNumber(item.quantity, "Quantity");
      if (qtyErr) errors[`items.${idx}.quantity`] = qtyErr;
      if (!item.unitOfMeasure.trim()) errors[`items.${idx}.unitOfMeasure`] = "Choose a unit.";
      const priceErr = validatePositiveMoney(item.estimatedUnitPrice, "Unit price");
      if (priceErr) errors[`items.${idx}.estimatedUnitPrice`] = priceErr;
    });
    return errors;
  }

  const previewRows = useMemo(() => {
    return form.items.map((item, idx) => {
      const qty = toMoneyNumber(item.quantity);
      const unitPrice = toMoneyNumber(item.estimatedUnitPrice);
      const computed = computeLineTotal(item.quantity, item.estimatedUnitPrice);
      const stored = toMoneyNumber(item.lineTotal);
      return {
        id: idx,
        index: idx + 1,
        itemName: String(item.itemName || "").trim() || `Item ${idx + 1}`,
        quantity: qty,
        unit: String(item.unitOfMeasure || "").trim() || "—",
        unitPrice,
        lineTotal: computed ?? stored,
      };
    });
  }, [form.items]);

  const footerTotal = previewRows.reduce(
    (sum, row) => sum + (typeof row.lineTotal === "number" ? row.lineTotal : 0),
    0,
  );
  const estimatedTotalDisplay = footerTotal > 0 ? formatMoneyAmount(footerTotal) : "";

  const selectedBudgetLine = fyBudgetLines.find((b) => b.id === form.budgetLineId) || null;
  const fundingItemDisplay = selectedBudgetLine
    ? [selectedBudgetLine.code, selectedBudgetLine.name].filter(Boolean).join(" — ")
    : "";
  const availableOnLine = selectedBudgetLine
    ? toMoneyNumber(selectedBudgetLine.availableBalance ?? selectedBudgetLine.approvedAmount)
    : null;
  const balanceAfterRequest =
    typeof availableOnLine === "number" ? availableOnLine - footerTotal : null;
  const balanceRemainingDisplay =
    balanceAfterRequest == null ? "" : formatMoneyAmount(balanceAfterRequest) || "0.00";

  const selectedPlanItem = planItems.find((i) => i.id === form.procurementPlanItemId) || null;
  const planItemCost = selectedPlanItem ? formatMoneyAmount(selectedPlanItem.estimatedTotal) : "";
  const marketPriceDefault = planItemCost || estimatedTotalDisplay || "";

  useEffect(() => {
    if (marketPriceManual) return;
    setForm((f) => {
      if (String(f.form5?.marketPrice || "") === String(marketPriceDefault)) return f;
      return { ...f, form5: { ...f.form5, marketPrice: marketPriceDefault } };
    });
  }, [marketPriceDefault, marketPriceManual]);

  function applyPlanItem(planItemId) {
    const item = planItems.find((i) => i.id === planItemId);
    setForm((f) => {
      const next = {
        ...f,
        procurementPlanItemId: planItemId,
        category: planItemCategory(item),
      };
      if (!item) return next;
      const qty = formatMoneyAmount(item.quantity) || String(item.quantity ?? "1");
      const unitPrice =
        formatMoneyAmount(item.estimatedUnitPrice) ||
        String(item.estimatedUnitPrice ?? "");
      const total = computeLineTotal(qty, unitPrice);
      const uom = planItemUnit(item);
      const first = f.items[0] || emptyReqLine(uom);
      const firstIsBlank =
        !String(first.itemName || "").trim() &&
        !String(first.estimatedUnitPrice || "").trim();
      next.items = firstIsBlank
        ? [
            {
              itemName: item.title || first.itemName || "",
              quantity: qty || first.quantity || "1",
              unitOfMeasure: uom,
              estimatedUnitPrice: unitPrice || first.estimatedUnitPrice || "",
              lineTotal: total != null ? formatMoneyAmount(total) : "",
            },
            ...f.items.slice(1),
          ]
        : f.items.map((line, i) =>
            i === 0 && !String(line.unitOfMeasure || "").trim()
              ? { ...line, unitOfMeasure: uom }
              : line,
          );
      const cf = item.circularFields || {};
      next.title = fillIfBlank(f.title, item.title);
      next.justification = fillIfBlank(f.justification, item.justification);
      next.needDescription = fillIfBlank(
        f.needDescription,
        item.description || item.specification,
      );
      next.requiredByDate = fillIfBlank(
        f.requiredByDate,
        futureDateOrEmpty(cf.completionDate) || futureDateOrEmpty(cf.contractSigningDate),
      );
      if (item.budgetLineId && !f.budgetLineId) {
        next.budgetLineId = item.budgetLineId;
      }
      return next;
    });
    clearFieldError("procurementPlanItemId");
    for (const key of ["title", "justification", "needDescription", "requiredByDate", "category"]) {
      clearFieldError(key);
    }
    if (item?.budgetLineId) clearFieldError("budgetLineId");
  }

  function applyBudgetLine(budgetLineId) {
    setForm((f) => ({ ...f, budgetLineId }));
    clearFieldError("budgetLineId");
  }

  function applyPlan(procurementPlanId) {
    const plan = meta.plans.find((p) => p.id === procurementPlanId);
    const planFyId = plan?.financialYear?.id || "";
    const fyChanged = Boolean(planFyId) && planFyId !== form.financialYearId;
    const nextRef = fyChanged ? applyReferenceForFy(planFyId) : null;
    setForm((f) => ({
      ...f,
      procurementPlanId,
      procurementPlanItemId: "",
      category: "",
      ...(fyChanged ? { financialYearId: planFyId, budgetLineId: "" } : {}),
      ...(nextRef ? { requisitionReference: nextRef } : {}),
    }));
    clearFieldError("procurementPlanId");
    clearFieldError("procurementPlanItemId");
    if (fyChanged) clearFieldError("financialYearId");
  }

  const saveOnly = isEdit && (awaitingHodReview || existingStatus === "SUBMITTED");
  const requisitionOff = !saveOnly && !processes.isActive(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION);

  async function submit(e) {
    e.preventDefault();
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      focusFirstFieldError(errors);
      return;
    }
    if (!saveOnly && !(await confirm(decisionConfirmOptions("SUBMIT", "this requisition")))) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        category: planItemCategory(selectedPlanItem) || form.category || "",
        requisitionReference: form.requisitionReference.trim(),
        items: form.items.map((item) => ({
          ...item,
          unitOfMeasure: item.unitOfMeasure || planItemUnit(selectedPlanItem),
          quantity: parseMoneyInput(item.quantity),
          estimatedUnitPrice: parseMoneyInput(item.estimatedUnitPrice),
        })),
        form5: {
          ...form.form5,
          marketPrice: form.form5.marketPrice || formatMoneyAmount(footerTotal) || "",
          estimatedTotalCost: formatMoneyAmount(footerTotal) || "",
          fundingItem: fundingItemDisplay,
          balanceRemaining: balanceRemainingDisplay,
          memberName: form.form5.memberName || resolvedMemberName || "",
        },
      };

      if (isEdit) {
        const updateRes = await fetch(
          `/api/projects/${projectId}/requisitions/${requisitionId}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", ...payload }),
          },
        );
        const updateData = await updateRes.json().catch(() => ({}));
        if (!updateRes.ok) {
          const nextErrors =
            updateData.fieldErrors && typeof updateData.fieldErrors === "object"
              ? updateData.fieldErrors
              : {};
          setFieldErrors(nextErrors);
          showToast({
            message:
              typeof updateData.error === "string"
                ? updateData.error
                : "Could not save requisition.",
            severity: "error",
          });
          focusFirstFieldError(nextErrors);
          return;
        }

        if (saveOnly) {
          await clearDraft();
          showToast({ message: "Requisition updated.", severity: "success" });
          void revalidateApi(`/api/projects/${projectId}/requisitions`);
          router.push(detailHref);
          return;
        }

        const submitRes = await fetch(
          `/api/projects/${projectId}/requisitions/${requisitionId}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "submit" }),
          },
        );
        const submitData = await submitRes.json().catch(() => ({}));
        if (!submitRes.ok) {
          showToast({
            message:
              typeof submitData.error === "string"
                ? submitData.error
                : "Saved, but could not submit for review.",
            severity: "error",
          });
          router.push(detailHref);
          return;
        }
        await clearDraft();
        showToast({ message: "Requisition submitted.", severity: "success" });
        void revalidateApi(
          `/api/projects/${projectId}/requisitions`,
          `/api/projects/${projectId}/tasks`,
        );
        router.push(listHref);
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/requisitions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, submit: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const nextErrors =
          data.fieldErrors && typeof data.fieldErrors === "object" ? data.fieldErrors : {};
        setFieldErrors(nextErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit requisition.",
          severity: "error",
        });
        focusFirstFieldError(nextErrors);
        return;
      }
      await clearDraft();
      showToast({ message: "Requisition submitted.", severity: "success" });
      void revalidateApi(
        `/api/projects/${projectId}/requisitions`,
        `/api/projects/${projectId}/tasks`,
      );
      router.push(listHref);
    } finally {
      setBusy(false);
    }
  }

  function focusFirstFieldError(errors) {
    const order = [
      "title",
      "requisitionReference",
      "financialYearId",
      "procurementPlanId",
      "procurementPlanItemId",
      "budgetLineId",
      "requiredByDate",
      "justification",
      "needDescription",
      "deliveryLocation",
      "departmentId",
      "items",
      "estimatedTotalValue",
      "form5.memberName",
      ...form.items.flatMap((_, idx) => [
        `items.${idx}.itemName`,
        `items.${idx}.quantity`,
        `items.${idx}.unitOfMeasure`,
        `items.${idx}.estimatedUnitPrice`,
      ]),
    ];
    const firstKey = order.find((key) => errors[key]);
    if (!firstKey) return;
    requestAnimationFrame(() => {
      const byName = document.querySelector(`[name="${CSS.escape(firstKey)}"]`);
      const byData = document.querySelector(`[data-field="${CSS.escape(firstKey)}"]`);
      const target = /** @type {HTMLElement | null} */ (byName || byData);
      if (!target) return;
      const scrollEl =
        target.closest(".MuiFormControl-root") ||
        target.closest("[data-field]") ||
        target;
      if (scrollEl && typeof scrollEl.scrollIntoView === "function") {
        scrollEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (typeof target.focus === "function") target.focus();
    });
  }

  /** @param {import("react").MouseEvent} e */
  async function leaveForm(e) {
    if (!hasEntry) return;
    e.preventDefault();
    if (!(await confirm(discardConfirmOptions()))) return;
    await clearDraft();
    router.push(isEdit ? detailHref : listHref);
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
          href={isEdit ? detailHref : listHref}
          onClick={(e) => void leaveForm(e)}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
          size="small"
        >
          {isEdit ? "Back to requisition" : "Back to list"}
        </Button>
      </div>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {isEdit ? "Edit procurement requisition" : "New procurement requisition"}
      </Typography>
      {saveOnly ? (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          Still awaiting Head of User Department review — you can update details until HOD acts.
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          {serverSyncState === "saving"
            ? "Saving draft…"
            : serverSyncState === "saved"
              ? "Draft saved — you can continue on another device"
              : "Autosaves as you type (local + server)"}
        </Typography>
      )}
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
        {fieldErrors.departmentId ? (
          <Typography
            data-field="departmentId"
            variant="body2"
            color="error"
            className="sm:col-span-2"
          >
            {fieldErrors.departmentId}
          </Typography>
        ) : null}
        <TextField
          name="title"
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
          name="requisitionReference"
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
        <div data-field="financialYearId">
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
        </div>
        <TextField
          name="procurementPlanId"
          select
          label="Procurement plan"
          value={form.procurementPlanId}
          onChange={(e) => applyPlan(e.target.value)}
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
          name="procurementPlanItemId"
          select
          label="Plan item"
          value={form.procurementPlanItemId}
          onChange={(e) => applyPlanItem(e.target.value)}
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
              : "Fills in details from the plan")
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
          name="budgetLineId"
          select
          label="Budget line"
          value={form.budgetLineId}
          onChange={(e) => applyBudgetLine(e.target.value)}
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
          value={form.category || (selectedPlanItem ? planItemCategory(selectedPlanItem) : "")}
          fullWidth
          slotProps={{
            input: { readOnly: true },
            inputLabel: { shrink: true },
          }}
          helperText={
            selectedPlanItem
              ? "From the selected plan item"
              : "Select a plan item"
          }
          sx={themedTextFieldSx}
        />
        <TextField
          name="requiredByDate"
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
          name="justification"
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
          name="needDescription"
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
          name="deliveryLocation"
          label="Delivery location"
          value={form.deliveryLocation}
          onChange={(e) => {
            setForm((f) => ({ ...f, deliveryLocation: e.target.value }));
            clearFieldError("deliveryLocation");
          }}
          fullWidth
          error={Boolean(fieldErrors.deliveryLocation)}
          helperText={fieldErrors.deliveryLocation || "Form 5 Part I — location for delivery"}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Remarks"
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          fullWidth
          sx={themedTextFieldSx}
        />

        <div className="sm:col-span-2 space-y-2" data-field="items">
          <Typography variant="subtitle2">Line items</Typography>
          {fieldErrors.items || fieldErrors.estimatedTotalValue ? (
            <Typography variant="body2" color="error" data-field="estimatedTotalValue">
              {fieldErrors.items || fieldErrors.estimatedTotalValue}
            </Typography>
          ) : null}
          {form.items.map((item, idx) => {
            const computedTotal = computeLineTotal(item.quantity, item.estimatedUnitPrice);
            const lineTotal =
              item.lineTotal ||
              (computedTotal != null ? formatMoneyAmount(computedTotal) : "");
            const lineFieldSx = {
              ...themedTextFieldSx,
              overflow: "visible",
            };
            return (
              <div
                key={idx}
                className="rounded-lg border border-[color:var(--border-subtle)] px-2 py-3"
              >
                <div className="flex min-w-0 flex-nowrap items-start gap-2 overflow-x-auto">
                  <TextField
                    name={`items.${idx}.itemName`}
                    label="Item name"
                    value={item.itemName}
                    onChange={(e) => updateReqLine(idx, { itemName: e.target.value })}
                    error={Boolean(fieldErrors[`items.${idx}.itemName`])}
                    helperText={fieldErrors[`items.${idx}.itemName`] || undefined}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ ...lineFieldSx, minWidth: 180, flex: "1 1 180px" }}
                  />
                  <TextField
                    name={`items.${idx}.quantity`}
                    label="Qty"
                    value={item.quantity}
                    onChange={(e) => updateReqLine(idx, { quantity: e.target.value })}
                    onBlur={(e) => {
                      const formatted = formatMoneyAmount(e.target.value);
                      if (formatted) updateReqLine(idx, { quantity: formatted });
                    }}
                    error={Boolean(fieldErrors[`items.${idx}.quantity`])}
                    helperText={fieldErrors[`items.${idx}.quantity`] || undefined}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ ...lineFieldSx, minWidth: 100, width: 110, flex: "0 0 110px" }}
                  />
                  <TextField
                    select
                    name={`items.${idx}.unitOfMeasure`}
                    label="UoM"
                    value={item.unitOfMeasure || DEFAULT_UNIT_OF_MEASURE}
                    onChange={(e) => updateReqLine(idx, { unitOfMeasure: e.target.value })}
                    error={Boolean(fieldErrors[`items.${idx}.unitOfMeasure`])}
                    helperText={fieldErrors[`items.${idx}.unitOfMeasure`] || undefined}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ ...lineFieldSx, minWidth: 120, width: 130, flex: "0 0 130px" }}
                  >
                    {unitOptionsFor(item.unitOfMeasure).map((v) => (
                      <MenuItem key={v} value={v}>
                        {v}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    name={`items.${idx}.estimatedUnitPrice`}
                    label="Unit price"
                    value={item.estimatedUnitPrice}
                    onChange={(e) => updateReqLine(idx, { estimatedUnitPrice: e.target.value })}
                    onBlur={(e) => {
                      const formatted = formatMoneyAmount(e.target.value);
                      if (formatted) updateReqLine(idx, { estimatedUnitPrice: formatted });
                    }}
                    error={Boolean(fieldErrors[`items.${idx}.estimatedUnitPrice`])}
                    helperText={fieldErrors[`items.${idx}.estimatedUnitPrice`] || undefined}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ ...lineFieldSx, minWidth: 130, flex: "1 1 130px" }}
                  />
                  <TextField
                    label="Line total"
                    value={lineTotal}
                    slotProps={{
                      input: { readOnly: true },
                      inputLabel: { shrink: true },
                    }}
                    sx={{ ...lineFieldSx, minWidth: 130, flex: "1 1 130px" }}
                  />
                  <Tooltip title="Remove line">
                    <span className="mt-1.5 shrink-0">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Remove requisition line ${idx + 1}`}
                        disabled={form.items.length <= 1 || busy}
                        onClick={() => removeReqLine(idx)}
                        className="cursor-pointer disabled:cursor-not-allowed"
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              startIcon={<AddRounded />}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  items: [
                    ...f.items,
                    emptyReqLine(planItemUnit(selectedPlanItem)),
                  ],
                }))
              }
            >
              Add line
            </Button>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Estimated total:{" "}
              {estimatedTotalDisplay ? formatMoneyUGX(footerTotal) : "—"}
            </Typography>
          </div>

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
            footerTotal={footerTotal > 0 ? footerTotal : null}
            emptyMessage="Add line items to see totals."
          />
        </div>

        <div className="sm:col-span-2 mt-2">
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Form 5 Part I — additional PPDA fields
          </Typography>
        </div>
        <TextField
          label="Market price"
          value={form.form5.marketPrice}
          onChange={(e) => {
            const value = e.target.value;
            setMarketPriceManual(Boolean(String(value || "").trim()));
            setForm((f) => ({ ...f, form5: { ...f.form5, marketPrice: value } }));
          }}
          onBlur={(e) => {
            const formatted = formatMoneyAmount(e.target.value);
            if (formatted) {
              setForm((f) => ({ ...f, form5: { ...f.form5, marketPrice: formatted } }));
            }
          }}
          fullWidth
          helperText={
            marketPriceManual
              ? "Edited · clear to reset"
              : planItemCost
                ? "From plan · editable"
                : "From line items · editable"
          }
          sx={themedTextFieldSx}
        />
        <TextField
          select
          label="Multi-year contracting"
          value={form.form5.multiYearContracting}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              form5: { ...f.form5, multiYearContracting: e.target.value },
            }))
          }
          fullWidth
          sx={themedTextFieldSx}
        >
          {PPDA_YES_NO.map((v) => (
            <MenuItem key={v} value={v}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Vote / head no."
          value={orgVoteCode}
          placeholder="Not set"
          fullWidth
          helperText="From organisation settings"
          slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Programme"
          value={form.form5.programme}
          onChange={(e) =>
            setForm((f) => ({ ...f, form5: { ...f.form5, programme: e.target.value } }))
          }
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Sub-programme"
          value={form.form5.subProgramme}
          onChange={(e) =>
            setForm((f) => ({ ...f, form5: { ...f.form5, subProgramme: e.target.value } }))
          }
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Funding item"
          value={fundingItemDisplay}
          placeholder="Choose a budget line"
          fullWidth
          helperText="From the budget line"
          slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Balance remaining"
          value={balanceRemainingDisplay}
          placeholder="Choose a budget line"
          fullWidth
          error={typeof balanceAfterRequest === "number" && balanceAfterRequest < 0}
          helperText={
            typeof balanceAfterRequest === "number" && balanceAfterRequest < 0
              ? "Exceeds funds available on this budget line"
              : "Available on budget line minus this request"
          }
          slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
          sx={themedTextFieldSx}
        />
        <TextField
          name="form5.memberName"
          label="Member (User Department)"
          value={form.form5.memberName}
          fullWidth
          error={Boolean(fieldErrors["form5.memberName"])}
          helperText={fieldErrors["form5.memberName"] || "Auto-filled"}
          slotProps={{ input: { readOnly: true } }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Member title"
          value={form.form5.memberTitle}
          fullWidth
          helperText="Auto-filled"
          slotProps={{ input: { readOnly: true } }}
          sx={themedTextFieldSx}
        />

        <div className="sm:col-span-2">
          <ProcessGateTooltip
            inactive={requisitionOff}
            title={processes.inactiveTitle(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION)}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !canCreateRequisition || requisitionOff}
            >
              {busy
                ? saveOnly
                  ? "Saving…"
                  : "Submitting…"
                : saveOnly
                  ? "Save changes"
                  : isEdit
                    ? existingStatus === "RETURNED"
                      ? "Save and resubmit"
                      : "Save and submit"
                    : "Submit requisition"}
            </Button>
          </ProcessGateTooltip>
        </div>
      </form>
    </Paper>
  );
}
