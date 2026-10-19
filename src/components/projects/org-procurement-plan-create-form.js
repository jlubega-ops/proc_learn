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
import { useToast } from "@/components/providers/toast-provider";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
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
  CIRCULAR_SHEET_OPTIONS,
  EXPECTED_PROCUREMENT_PERIOD_OPTIONS,
  PLAN_SHEET_TYPE,
  PPDA_CONTRACT_TYPE_OPTIONS,
  PPDA_PLAN_METHOD_OPTIONS,
  PPDA_RESERVATION_SCHEME_OPTIONS,
  PPDA_YES_NO,
  defaultCategoryForSheet,
  normalizeCircularPlanItemFields,
  normalizeCircularSheet,
  normalizePlanMethod,
  normalizePlanSheetType,
  validatePlanMilestoneOrder,
} from "@/lib/projects/ppda-forms";
import {
  DEFAULT_FUNDING_SOURCE,
  DEFAULT_UNIT_OF_MEASURE,
  FUNDING_SOURCES,
  fundingSourcesFor,
  unitOptionsFor,
} from "@/lib/projects/line-item-options";
import {
  planMethodOptionState,
  planMethodToEnum,
  suggestPlanMethodLabel,
  suggestTenderSubtype,
  tenderSubtypeOptionState,
  TENDER_SUBTYPE_OPTIONS,
  normalizeTenderSubtype,
} from "@/lib/projects/procurement-thresholds";
import {
  buildGoodsWorksTimetable,
  minimumBiddingWorkingDays,
  evaluationWorkingDays,
  validateGoodsWorksTimetableMinimums,
} from "@/lib/projects/procurement-timetable";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import { useApi } from "@/hooks/use-api";
import { useProcessActivation } from "@/hooks/use-process-activation";
import { ProcessGateTooltip } from "@/components/projects/process-gate";
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";

function emptyItem(circularSheet = "Goods") {
  const circular = normalizeCircularSheet(circularSheet) || "Goods";
  const sheet = normalizePlanSheetType(circular);
  return {
    title: "",
    description: "",
    sheetType: sheet,
    category: circular,
    quantity: "10",
    unitOfMeasure: DEFAULT_UNIT_OF_MEASURE,
    estimatedUnitPrice: "",
    budgetLineId: "",
    expectedProcurementPeriod: "Q1",
    priority: "Normal",
    justification: "",
    currency: "UGX",
    sourceOfFunding: DEFAULT_FUNDING_SOURCE,
    plannedProcurementMethod: "",
    tenderSubtype: "",
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
    awardDecisionDate: "",
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
 * @param {any} item
 */
function formItemFromApi(item) {
  const cf = item?.circularFields && typeof item.circularFields === "object" ? item.circularFields : {};
  const circular =
    normalizeCircularSheet(item?.category || cf.circularSheet || item?.sheetType || cf.sheetType) ||
    "Goods";
  const base = emptyItem(circular);
  return {
    ...base,
    title: item?.title || "",
    description: item?.description || "",
    quantity: item?.quantity != null ? String(item.quantity) : base.quantity,
    unitOfMeasure: item?.unitOfMeasure || base.unitOfMeasure,
    estimatedUnitPrice:
      item?.estimatedUnitPrice != null ? String(item.estimatedUnitPrice) : "",
    budgetLineId: item?.budgetLineId || "",
    expectedProcurementPeriod: item?.expectedProcurementPeriod || "Q1",
    priority: item?.priority || "Normal",
    justification: item?.justification || "",
    currency: cf.currency || "UGX",
    sourceOfFunding: cf.sourceOfFunding || DEFAULT_FUNDING_SOURCE,
    plannedProcurementMethod: normalizePlanMethod(cf.plannedProcurementMethod) || "",
    tenderSubtype: normalizeTenderSubtype(cf.tenderSubtype) || "",
    contractType: cf.contractType || "",
    prequalification: cf.prequalification || "",
    applyReservationScheme: cf.applyReservationScheme || "",
    reservationSchemeDetail: cf.reservationSchemeDetail || "",
    multiYearCurrentCost: cf.multiYearCurrentCost || "",
    multiYearCompletionYears: cf.multiYearCompletionYears || "",
    multiYearPaidUpSum: cf.multiYearPaidUpSum || "",
    multiYearPendingSum: cf.multiYearPendingSum || "",
    multiYearPendingTime: cf.multiYearPendingTime || "",
    bidInvitationDate: cf.bidInvitationDate || "",
    bidClosingOpeningDate: cf.bidClosingOpeningDate || "",
    evaluationReportApprovalDate: cf.evaluationReportApprovalDate || "",
    awardDecisionDate: cf.awardDecisionDate || "",
    awardNotificationDate: cf.awardNotificationDate || "",
    contractSigningDate: cf.contractSigningDate || "",
    completionDate: cf.completionDate || "",
    eoiInvitationDate: cf.eoiInvitationDate || "",
    eoiClosingOpeningDate: cf.eoiClosingOpeningDate || "",
    eoiShortlistApprovalDate: cf.eoiShortlistApprovalDate || "",
    proposalNotificationDate: cf.proposalNotificationDate || "",
    proposalDeadlineDate: cf.proposalDeadlineDate || "",
    proposalOpeningDate: cf.proposalOpeningDate || "",
    proposalEvalApprovalDate: cf.proposalEvalApprovalDate || "",
    proposalAwardNotificationDate: cf.proposalAwardNotificationDate || "",
  };
}

/**
 * @param {{ projectId: string; planId?: string }} p
 */
export function OrgProcurementPlanCreateForm({ projectId, planId = "" }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const isEdit = Boolean(String(planId || "").trim());
  const listHref = `/projects/${projectId}/procurement-plans`;
  const detailHref = isEdit ? `/projects/${projectId}/procurement-plans/${planId}` : listHref;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [awaitingHodReview, setAwaitingHodReview] = useState(false);
  const [existingStatus, setExistingStatus] = useState("");
  const { data: fyData, reload: reloadYears } = useApi(
    `/api/projects/${projectId}/org-financial-years?selectable=1`,
    { silentErrors: true },
  );
  const { data: periodsData } = useApi(
    `/api/projects/${projectId}/org-planning-periods?selectable=1`,
    { silentErrors: true },
  );
  const { data: holidaysData } = useApi(`/api/meta/public-holidays`, {
    silentErrors: true,
  });
  const holidayDatesKey = Array.isArray(holidaysData?.dates)
    ? holidaysData.dates.join(",")
    : "";
  const holidaySet = useMemo(() => {
    if (!holidayDatesKey) return null;
    return new Set(holidayDatesKey.split(","));
  }, [holidayDatesKey]);
  const holidaySetRef = useRef(holidaySet);
  useEffect(() => {
    holidaySetRef.current = holidaySet;
  }, [holidaySet]);
  const holidaysAppliedOnceRef = useRef(false);
  const fyDataRef = useRef(fyData);
  useEffect(() => {
    fyDataRef.current = fyData;
  }, [fyData]);
  const years = useMemo(
    () => (Array.isArray(fyData?.financialYears) ? fyData.financialYears : []),
    [fyData],
  );
  const fyEmptyMessage = typeof fyData?.message === "string" ? fyData.message : null;
  const periods = Array.isArray(periodsData?.planningPeriods) ? periodsData.planningPeriods : [];
  const [budgetLines, setBudgetLines] = useState(/** @type {any[]} */ ([]));
  const [existingRefs, setExistingRefs] = useState(/** @type {string[]} */ ([]));
  const [orgCode, setOrgCode] = useState("");
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
    isEmergency: false,
    emergencyJustification: "",
    items: [emptyItem()],
  });
  const [metaReady, setMetaReady] = useState(false);
  const isEmergency = Boolean(form.isEmergency);
  const processes = useProcessActivation(projectId);
  const annualOff = !processes.isActive(PROCESS_FLOW_CODES.PROCUREMENT_PLANNING);
  const emergencyOff = !processes.isActive(PROCESS_FLOW_CODES.EMERGENCY_PLANNING);
  const selectedPlanCode = isEmergency
    ? PROCESS_FLOW_CODES.EMERGENCY_PLANNING
    : PROCESS_FLOW_CODES.PROCUREMENT_PLANNING;
  const selectedTypeOff = isEmergency ? emergencyOff : annualOff;

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey: isEdit ? `procurement-plan:edit:${planId}` : "procurement-plan:new",
    values: form,
    projectId,
    enabled: metaReady && canCreate && !isEdit,
    onHydrated: (payload) => {
      if (isEdit) return;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        setForm((prev) => ({
          ...prev,
          .../** @type {typeof form} */ (payload),
          items:
            Array.isArray(/** @type {any} */ (payload).items) &&
            /** @type {any} */ (payload).items.length
              ? /** @type {any} */ (payload).items.map((item) => {
                  const circular =
                    normalizeCircularSheet(item?.category || item?.circularSheet || item?.sheetType) ||
                    "Goods";
                  const sheet = normalizePlanSheetType(circular);
                  return {
                    ...item,
                    sheetType: sheet,
                    sourceOfFunding: item?.sourceOfFunding || DEFAULT_FUNDING_SOURCE,
                    unitOfMeasure: item?.unitOfMeasure || DEFAULT_UNIT_OF_MEASURE,
                    category: circular,
                    plannedProcurementMethod: normalizePlanMethod(item?.plannedProcurementMethod),
                    tenderSubtype: normalizeTenderSubtype(item?.tenderSubtype) || "",
                    expectedProcurementPeriod: item?.expectedProcurementPeriod || "Q1",
                  };
                })
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
      const [pRes, yData, bRes, detailRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/procurement-plans`, { credentials: "include" }),
        fyDataRef.current ? Promise.resolve(fyDataRef.current) : reloadYears(),
        fetch(`/api/projects/${projectId}/budgets?selectable=1`, {
          credentials: "include",
        }),
        isEdit
          ? fetch(`/api/projects/${projectId}/procurement-plans/${planId}`, {
              credentials: "include",
            })
          : Promise.resolve(null),
      ]);
      const pData = await pRes.json().catch(() => ({}));
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
      const code = typeof pData.orgCode === "string" ? pData.orgCode : "";
      setOrgCode(code);
      const plans = Array.isArray(pData.plans) ? pData.plans : [];
      const refs = plans.map((p) => p.planReference).filter(Boolean);
      setExistingRefs(refs);
      const nextYears = Array.isArray(yData?.financialYears) ? yData.financialYears : [];
      setBudgetLines(Array.isArray(bData.budgetLines) ? bData.budgetLines : []);

      if (isEdit && detailRes) {
        const dData = await detailRes.json().catch(() => ({}));
        if (!detailRes.ok) {
          showToast({
            message: typeof dData.error === "string" ? dData.error : "Could not load plan.",
            severity: "error",
          });
          router.replace(listHref);
          return;
        }
        if (!dData.canEdit) {
          showToast({
            message: "This plan can no longer be edited.",
            severity: "error",
          });
          router.replace(detailHref);
          return;
        }
        const plan = dData.plan || {};
        setAwaitingHodReview(Boolean(dData.awaitingHodReview));
        setExistingStatus(String(plan.status || ""));
        setForm({
          title: plan.title || "",
          planReference: plan.planReference || "",
          financialYearId: plan.financialYear?.id || plan.financialYearId || "",
          planningPeriodId: plan.planningPeriod?.id || plan.planningPeriodId || "",
          isEmergency: Boolean(plan.isEmergency),
          emergencyJustification: plan.emergencyJustification || "",
          items:
            Array.isArray(plan.items) && plan.items.length
              ? plan.items.map(formItemFromApi)
              : [emptyItem()],
        });
        setMetaReady(true);
        return;
      }

      const firstFyId = nextYears[0]?.id || "";
      const firstFyLabel = nextYears[0]?.label || "";
      const autoRef =
        firstFyLabel || code || dept
          ? nextOrgDocumentReference(refs, {
              orgCode: code,
              deptCode: dept?.code,
              deptName: dept?.name,
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
  }, [
    projectId,
    planId,
    isEdit,
    reloadYears,
    showToast,
    router,
    listHref,
    detailHref,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // When holiday data first arrives, refresh derived timetable dates (weekends-only until then).
  useEffect(() => {
    if (!holidaySet?.size || holidaysAppliedOnceRef.current) return;
    holidaysAppliedOnceRef.current = true;
    setForm((f) => ({
      ...f,
      items: f.items.map((item) => {
        const sheetNow = normalizePlanSheetType(item.category || item.sheetType);
        if (sheetNow === PLAN_SHEET_TYPE.CONSULTANCY) return item;
        if (!planMethodToEnum(item.plannedProcurementMethod)) return item;
        if (!String(item.bidInvitationDate || "").trim()) return item;
        const built = buildGoodsWorksTimetable({
          bidInvitationDate: item.bidInvitationDate,
          plannedProcurementMethod: item.plannedProcurementMethod,
          tenderSubtype: item.tenderSubtype,
          category: item.category || item.circularSheet,
          holidays: holidaySet,
        });
        if (!built) return item;
        return {
          ...item,
          bidClosingOpeningDate: built.bidClosingOpeningDate,
          evaluationReportApprovalDate: built.evaluationReportApprovalDate,
          awardDecisionDate: built.awardDecisionDate,
          awardNotificationDate: built.awardNotificationDate,
          contractSigningDate: built.contractSigningDate,
        };
      }),
    }));
  }, [holidaySet]);

  function applyReferenceForFy(financialYearId) {
    const fy = years.find((y) => y.id === financialYearId);
    if (!fy?.label && !orgCode && !actorDepartment) return;
    const next = nextOrgDocumentReference(existingRefs, {
      orgCode,
      deptCode: actorDepartment?.code,
      deptName: actorDepartment?.name,
      docType: form.isEmergency
        ? ORG_REF_DOC.EMERGENCY_PROCUREMENT_PLAN
        : ORG_REF_DOC.PROCUREMENT_PLAN,
      fyLabel: fy?.label,
    });
    setForm((f) => ({ ...f, planReference: next }));
  }

  function updateItem(idx, patch) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        if ("category" in patch || "circularSheet" in patch || "sheetType" in patch) {
          const circular =
            normalizeCircularSheet(next.category || next.circularSheet || next.sheetType) ||
            defaultCategoryForSheet(PLAN_SHEET_TYPE.GOODS_WORKS_NON_CONSULTANCY);
          next.category = circular;
          next.sheetType = normalizePlanSheetType(circular);
        }
        if (
          "quantity" in patch ||
          "estimatedUnitPrice" in patch ||
          "category" in patch ||
          "circularSheet" in patch
        ) {
          const total = computeLineTotal(next.quantity, next.estimatedUnitPrice);
          const cat = next.category || next.circularSheet;
          const current = normalizePlanMethod(next.plannedProcurementMethod);
          const microState = planMethodOptionState("Micro procurement", total, cat);
          const quotationState = planMethodOptionState("Quotation", total, cat);
          if (current === "Micro procurement" && !microState.enabled) {
            next.plannedProcurementMethod =
              suggestPlanMethodLabel(total, cat) || "Quotation";
          } else if (current === "Quotation" && !quotationState.enabled) {
            next.plannedProcurementMethod = "Tender";
          } else if (!current) {
            next.plannedProcurementMethod = suggestPlanMethodLabel(total, cat);
          }
          const methodNow = normalizePlanMethod(next.plannedProcurementMethod);
          if (methodNow === "Tender") {
            const sub = normalizeTenderSubtype(next.tenderSubtype);
            const subState = sub
              ? tenderSubtypeOptionState(sub, total, cat)
              : { enabled: false };
            if (!sub || !subState.enabled) {
              next.tenderSubtype = suggestTenderSubtype(total, cat);
            }
          } else {
            next.tenderSubtype = "";
          }
        }
        if ("plannedProcurementMethod" in patch) {
          const methodNow = normalizePlanMethod(next.plannedProcurementMethod);
          const total = computeLineTotal(next.quantity, next.estimatedUnitPrice);
          const cat = next.category || next.circularSheet;
          if (methodNow === "Tender") {
            next.tenderSubtype =
              normalizeTenderSubtype(next.tenderSubtype) ||
              suggestTenderSubtype(total, cat);
          } else {
            next.tenderSubtype = "";
          }
        }
        const sheetNow = normalizePlanSheetType(next.category || next.sheetType);
        const timetableDrivers =
          "plannedProcurementMethod" in patch ||
          "tenderSubtype" in patch ||
          "category" in patch ||
          "circularSheet" in patch ||
          "bidInvitationDate" in patch;
        if (timetableDrivers && sheetNow !== PLAN_SHEET_TYPE.CONSULTANCY) {
          const built = buildGoodsWorksTimetable({
            bidInvitationDate: next.bidInvitationDate,
            plannedProcurementMethod: next.plannedProcurementMethod,
            tenderSubtype: next.tenderSubtype,
            category: next.category || next.circularSheet,
            holidays: holidaySetRef.current,
          });
          if (built) {
            next.bidInvitationDate = built.bidInvitationDate;
            next.bidClosingOpeningDate = built.bidClosingOpeningDate;
            next.evaluationReportApprovalDate = built.evaluationReportApprovalDate;
            next.awardDecisionDate = built.awardDecisionDate;
            next.awardNotificationDate = built.awardNotificationDate;
            next.contractSigningDate = built.contractSigningDate;
          }
        }
        return next;
      }),
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
    if (isEmergency && !String(form.emergencyJustification || "").trim()) {
      errors.emergencyJustification = "Enter the emergency justification.";
    }
    if (!isEmergency && !form.planningPeriodId) {
      errors.planningPeriodId = periodsEmpty
        ? "No planning period is open for this financial year. Ask the Organization Administrator to open a planning period — or create an Emergency plan instead."
        : "Choose a planning period.";
    }
    form.items.forEach((item, idx) => {
      const circular = normalizeCircularSheet(item.category);
      const itemSheet = normalizePlanSheetType(circular || item.sheetType);
      if (!item.title.trim()) errors[`items.${idx}.title`] = "Enter an item title.";
      if (!circular) errors[`items.${idx}.category`] = "Choose a Circular sheet type.";
      else if (!CIRCULAR_SHEET_OPTIONS.includes(circular)) {
        errors[`items.${idx}.category`] = "Choose a valid Circular sheet type.";
      }
      if (!String(item.unitOfMeasure || "").trim()) {
        errors[`items.${idx}.unitOfMeasure`] = "Choose a unit.";
      }
      const qtyErr = validatePositiveNumber(item.quantity, "Quantity");
      if (qtyErr) errors[`items.${idx}.quantity`] = qtyErr;
      const priceErr = validatePositiveMoney(item.estimatedUnitPrice, "Unit price");
      if (priceErr) errors[`items.${idx}.estimatedUnitPrice`] = priceErr;
      if (!FUNDING_SOURCES.includes(String(item.sourceOfFunding || "").trim())) {
        errors[`items.${idx}.sourceOfFunding`] = "Choose a source of funding.";
      }
      const method = normalizePlanMethod(item.plannedProcurementMethod);
      const total = computeLineTotal(item.quantity, item.estimatedUnitPrice);
      if (!method) {
        errors[`items.${idx}.plannedProcurementMethod`] = "Choose a procurement method.";
      } else {
        const state = planMethodOptionState(method, total, circular);
        if (!state.enabled) {
          errors[`items.${idx}.plannedProcurementMethod`] =
            state.reason || "This method is not allowed for the estimated amount.";
        }
        if (method === "Tender") {
          const sub = normalizeTenderSubtype(item.tenderSubtype);
          if (!sub) {
            errors[`items.${idx}.tenderSubtype`] = "Choose open or restricted bidding.";
          } else {
            const subState = tenderSubtypeOptionState(sub, total, circular);
            if (!subState.enabled) {
              errors[`items.${idx}.tenderSubtype`] =
                subState.reason || "This bidding type is not allowed for the amount.";
            }
          }
        }
        if (itemSheet !== PLAN_SHEET_TYPE.CONSULTANCY && method) {
          Object.assign(
            errors,
            validateGoodsWorksTimetableMinimums(
              {
                ...item,
                plannedProcurementMethod: method,
                category: circular,
              },
              `items.${idx}`,
              holidaySetRef.current,
            ),
          );
        }
      }
      if (!String(item.contractType || "").trim()) {
        errors[`items.${idx}.contractType`] = "Choose a contract type.";
      } else if (!PPDA_CONTRACT_TYPE_OPTIONS.includes(item.contractType)) {
        errors[`items.${idx}.contractType`] = "Choose a valid contract type.";
      }
      if (!String(item.completionDate || "").trim()) {
        errors[`items.${idx}.completionDate`] = "Enter a completion date.";
      }
      if (
        item.expectedProcurementPeriod &&
        !EXPECTED_PROCUREMENT_PERIOD_OPTIONS.includes(item.expectedProcurementPeriod)
      ) {
        errors[`items.${idx}.expectedProcurementPeriod`] = "Choose a valid period.";
      }
      if (!item.budgetLineId) {
        errors[`items.${idx}.budgetLineId`] = budgetLinesEmpty
          ? "No approved budget lines for this financial year. An approved department budget must exist first."
          : "Choose a budget line.";
      }
      Object.assign(errors, validatePlanMilestoneOrder(item, itemSheet, `items.${idx}`));
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
        planId: isEdit ? planId : undefined,
        planReference: form.planReference.trim(),
        items: form.items.map((item) => {
          const itemSheet = normalizePlanSheetType(item.sheetType);
          return {
            ...item,
            sheetType: itemSheet,
            quantity: parseMoneyInput(item.quantity),
            estimatedUnitPrice: parseMoneyInput(item.estimatedUnitPrice),
            ...normalizeCircularPlanItemFields(item, itemSheet),
          };
        }),
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
      if (!isEdit) await clearDraft();
      showToast({
        message: isEdit ? "Procurement plan updated." : "Procurement plan draft saved.",
        severity: "success",
      });
      router.push(isEdit ? detailHref : listHref);
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

  const blankItem = emptyItem();
  const hasEntry =
    Boolean(String(form.title || "").trim() || String(form.emergencyJustification || "").trim()) ||
    form.items.length > 1 ||
    form.items.some((item) =>
      Object.keys(blankItem).some(
        (k) => String(item?.[k] ?? "") !== String(blankItem[/** @type {keyof typeof blankItem} */ (k)]),
      ),
    );

  /** @param {import("react").MouseEvent} e */
  const leaveForm = async (e) => {
    if (!hasEntry || isEdit) return;
    e.preventDefault();
    if (!(await confirm(discardConfirmOptions()))) return;
    await clearDraft();
    router.push(listHref);
  };

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
          href={isEdit ? detailHref : listHref}
          onClick={(e) => void leaveForm(e)}
          startIcon={<ArrowBackRounded />}
          variant="outlined"
          size="small"
        >
          {isEdit ? "Back to plan" : "Back to list"}
        </Button>
      </div>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {isEdit ? "Edit procurement plan" : "Prepare procurement plan"}
      </Typography>
      {!isEdit ? (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          {serverSyncState === "saving"
            ? "Saving draft…"
            : serverSyncState === "saved"
              ? "Draft saved — you can continue on another device"
              : "Autosaves as you type (local + server, not every keystroke)"}
        </Typography>
      ) : awaitingHodReview || existingStatus === "SUBMITTED" ? (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          Still awaiting Head of User Department — you may update.
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          Update this plan, then submit again if it was returned.
        </Typography>
      )}
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
              if (fy?.label || orgCode || actorDepartment) {
                planReference = nextOrgDocumentReference(existingRefs, {
                  orgCode,
                  deptCode: actorDepartment?.code,
                  deptName: actorDepartment?.name,
                  docType: nextEmergency
                    ? ORG_REF_DOC.EMERGENCY_PROCUREMENT_PLAN
                    : ORG_REF_DOC.PROCUREMENT_PLAN,
                  fyLabel: fy?.label,
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
          <MenuItem value="ANNUAL" disabled={annualOff}>
            {annualOff ? "Annual procurement plan (process inactive)" : "Annual procurement plan"}
          </MenuItem>
          <MenuItem value="EMERGENCY" disabled={emergencyOff}>
            {emergencyOff
              ? "Emergency / unplanned plan (process inactive)"
              : "Emergency / unplanned plan"}
          </MenuItem>
        </TextField>
        {isEmergency ? (
          <TextField
            label="Emergency justification"
            value={form.emergencyJustification || ""}
            onChange={(e) => {
              setForm((f) => ({ ...f, emergencyJustification: e.target.value }));
              setFieldErrors((fe) => {
                const n = { ...fe };
                delete n.emergencyJustification;
                return n;
              });
            }}
            fullWidth
            multiline
            minRows={2}
            className="sm:col-span-2"
            error={Boolean(fieldErrors.emergencyJustification)}
            helperText={fieldErrors.emergencyJustification || "Urgent, unforeseeable, not caused by delay"}
            sx={themedTextFieldSx}
          />
        ) : null}
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
            "Auto-generated as ORGCODE-PP-YEAR-RANDOM; you may edit"
          }
          sx={themedTextFieldSx}
          placeholder="NSI-PP-2026-7K2M9Q4A"
        />
        <TextField
          label="Department"
          value={
            actorDepartment
              ? `${actorDepartment.name || ""}${actorDepartment.code ? ` (${actorDepartment.code})` : ""}`
              : "—"
          }
          fullWidth
          disabled
          helperText="From your organisation user account"
          sx={themedTextFieldSx}
          slotProps={{ input: { readOnly: true } }}
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
        <div className="sm:col-span-2 space-y-3">
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Plan items
          </Typography>
          {form.items.map((item, idx) => {
            const circular =
              normalizeCircularSheet(item.category) || item.category || "Goods";
            const itemSheet = normalizePlanSheetType(circular);
            const isConsultancy = itemSheet === PLAN_SHEET_TYPE.CONSULTANCY;
            const lineTotal = computeLineTotal(item.quantity, item.estimatedUnitPrice);
            return (
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
                select
                label="Circular 1/2024 sheet"
                value={circular}
                onChange={(e) => updateItem(idx, { category: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.category`])}
                helperText={fieldErrors[`items.${idx}.category`] || undefined}
                sx={themedTextFieldSx}
              >
                {CIRCULAR_SHEET_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
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
                select
                label="Unit of measure"
                value={item.unitOfMeasure}
                onChange={(e) => updateItem(idx, { unitOfMeasure: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.unitOfMeasure`])}
                helperText={fieldErrors[`items.${idx}.unitOfMeasure`] || undefined}
                sx={themedTextFieldSx}
              >
                {unitOptionsFor(item.unitOfMeasure).map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
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
                select
                label="Expected period"
                value={item.expectedProcurementPeriod || ""}
                onChange={(e) => updateItem(idx, { expectedProcurementPeriod: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.expectedProcurementPeriod`])}
                helperText={fieldErrors[`items.${idx}.expectedProcurementPeriod`] || undefined}
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {EXPECTED_PROCUREMENT_PERIOD_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
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
                select
                label="Source of funding"
                value={item.sourceOfFunding || ""}
                onChange={(e) => updateItem(idx, { sourceOfFunding: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.sourceOfFunding`])}
                helperText={fieldErrors[`items.${idx}.sourceOfFunding`] || undefined}
                sx={themedTextFieldSx}
              >
                {fundingSourcesFor(item.sourceOfFunding).map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Planned procurement method"
                value={normalizePlanMethod(item.plannedProcurementMethod) || item.plannedProcurementMethod || ""}
                onChange={(e) => updateItem(idx, { plannedProcurementMethod: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.plannedProcurementMethod`])}
                helperText={fieldErrors[`items.${idx}.plannedProcurementMethod`] || undefined}
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_PLAN_METHOD_OPTIONS.map((v) => {
                  const state = planMethodOptionState(v, lineTotal, item.category);
                  return (
                    <MenuItem key={v} value={v} disabled={!state.enabled}>
                      {v}
                      {state.recommended ? " (recommended)" : ""}
                      {!state.enabled && state.reason ? ` — ${state.reason}` : ""}
                    </MenuItem>
                  );
                })}
              </TextField>
              {normalizePlanMethod(item.plannedProcurementMethod) === "Tender" ? (
                <TextField
                  select
                  label="Bidding type"
                  value={normalizeTenderSubtype(item.tenderSubtype) || ""}
                  onChange={(e) => updateItem(idx, { tenderSubtype: e.target.value })}
                  fullWidth
                  error={Boolean(fieldErrors[`items.${idx}.tenderSubtype`])}
                  helperText={
                    fieldErrors[`items.${idx}.tenderSubtype`] ||
                    "PPDA open / restricted (same Tender process)"
                  }
                  sx={themedTextFieldSx}
                >
                  <MenuItem value="">Select…</MenuItem>
                  {TENDER_SUBTYPE_OPTIONS.map((o) => {
                    const state = tenderSubtypeOptionState(o.value, lineTotal, item.category);
                    return (
                      <MenuItem key={o.value} value={o.value} disabled={!state.enabled}>
                        {o.label}
                        {state.recommended ? " (recommended)" : ""}
                        {!state.enabled && state.reason ? ` — ${state.reason}` : ""}
                      </MenuItem>
                    );
                  })}
                </TextField>
              ) : null}
              <TextField
                select
                label="Contract type"
                value={item.contractType}
                onChange={(e) => updateItem(idx, { contractType: e.target.value })}
                fullWidth
                error={Boolean(fieldErrors[`items.${idx}.contractType`])}
                helperText={fieldErrors[`items.${idx}.contractType`] || undefined}
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
                    error={Boolean(fieldErrors[`items.${idx}.bidInvitationDate`])}
                    helperText={
                      fieldErrors[`items.${idx}.bidInvitationDate`] ||
                      "Suggested: next working day after plan approval"
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Bid closing / opening"
                    type="date"
                    value={item.bidClosingOpeningDate}
                    onChange={(e) => updateItem(idx, { bidClosingOpeningDate: e.target.value })}
                    fullWidth
                    error={Boolean(fieldErrors[`items.${idx}.bidClosingOpeningDate`])}
                    helperText={
                      fieldErrors[`items.${idx}.bidClosingOpeningDate`] ||
                      (() => {
                        const n = minimumBiddingWorkingDays(
                          item.plannedProcurementMethod,
                          item.tenderSubtype,
                        );
                        return n > 0
                          ? `Min ${n} working days after invitation`
                          : "No prescribed minimum (micro / direct)";
                      })()
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
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
                    error={Boolean(fieldErrors[`items.${idx}.evaluationReportApprovalDate`])}
                    helperText={
                      fieldErrors[`items.${idx}.evaluationReportApprovalDate`] ||
                      `${evaluationWorkingDays(item.category)} working days after opening`
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Award decision"
                    type="date"
                    value={item.awardDecisionDate || ""}
                    onChange={(e) => updateItem(idx, { awardDecisionDate: e.target.value })}
                    fullWidth
                    error={Boolean(fieldErrors[`items.${idx}.awardDecisionDate`])}
                    helperText={
                      fieldErrors[`items.${idx}.awardDecisionDate`] ||
                      "5 working days after evaluation report"
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="BEB / award notice"
                    type="date"
                    value={item.awardNotificationDate}
                    onChange={(e) => updateItem(idx, { awardNotificationDate: e.target.value })}
                    fullWidth
                    error={Boolean(fieldErrors[`items.${idx}.awardNotificationDate`])}
                    helperText={
                      fieldErrors[`items.${idx}.awardNotificationDate`] ||
                      "5 working days after award decision"
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
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
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="EOI closing / opening"
                    type="date"
                    value={item.eoiClosingOpeningDate}
                    onChange={(e) => updateItem(idx, { eoiClosingOpeningDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Shortlist approval"
                    type="date"
                    value={item.eoiShortlistApprovalDate}
                    onChange={(e) => updateItem(idx, { eoiShortlistApprovalDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal notification"
                    type="date"
                    value={item.proposalNotificationDate}
                    onChange={(e) => updateItem(idx, { proposalNotificationDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal deadline"
                    type="date"
                    value={item.proposalDeadlineDate}
                    onChange={(e) => updateItem(idx, { proposalDeadlineDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal opening"
                    type="date"
                    value={item.proposalOpeningDate}
                    onChange={(e) => updateItem(idx, { proposalOpeningDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={themedTextFieldSx}
                  />
                  <TextField
                    label="Proposal eval approval"
                    type="date"
                    value={item.proposalEvalApprovalDate}
                    onChange={(e) => updateItem(idx, { proposalEvalApprovalDate: e.target.value })}
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
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
                    slotProps={{ inputLabel: { shrink: true } }}
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
                error={Boolean(fieldErrors[`items.${idx}.contractSigningDate`])}
                helperText={
                  fieldErrors[`items.${idx}.contractSigningDate`] ||
                  (!isConsultancy
                    ? planMethodToEnum(item.plannedProcurementMethod) === "TENDER"
                      ? "After 10-day standstill from BEB + 3 working days"
                      : "3 working days after BEB (standstill exempt)"
                    : undefined)
                }
                slotProps={{ inputLabel: { shrink: true } }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Completion date"
                type="date"
                value={item.completionDate}
                onChange={(e) => updateItem(idx, { completionDate: e.target.value })}
                fullWidth
                required
                error={Boolean(fieldErrors[`items.${idx}.completionDate`])}
                helperText={fieldErrors[`items.${idx}.completionDate`] || undefined}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={themedTextFieldSx}
              />
            </div>
            );
          })}
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
          <ProcessGateTooltip
            inactive={selectedTypeOff}
            title={processes.inactiveTitle(selectedPlanCode)}
          >
            <Button type="submit" variant="contained" disabled={busy || selectedTypeOff}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Save draft"}
            </Button>
          </ProcessGateTooltip>
        </div>
      </form>
    </Paper>
  );
}
