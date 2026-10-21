/**
 * PPDA / Circular 1/2024 teaching forms — constants + normalize helpers.
 * Fill-in-app is primary; download is reference-only (no upload loop).
 */

import { downloadOrgDocumentPdf, pdfFieldValue } from "@/lib/projects/org-document-pdf";
import { APP_BRAND_LABEL } from "@/lib/appConfig";
import { DEFAULT_FUNDING_SOURCE } from "@/lib/projects/line-item-options";
import {
  isBiddingMethod,
  isMicroStyleMethod,
  methodRequiresDirectGrounds,
  normalizeProcurementMethod,
  PROCUREMENT_METHOD_PLAN_OPTIONS,
  procurementMethodDef,
  procurementMethodLabel,
} from "@/lib/projects/procurement-methods";

export const PLAN_SHEET_TYPE = {
  GOODS_WORKS_NON_CONSULTANCY: "GOODS_WORKS_NON_CONSULTANCY",
  CONSULTANCY: "CONSULTANCY",
};

/** @deprecated Prefer CIRCULAR_SHEET_OPTIONS — kept for older plan rows. */
export const PLAN_SHEET_TYPE_LABELS = {
  GOODS_WORKS_NON_CONSULTANCY: "Goods, works and non-consultancy services",
  CONSULTANCY: "Consultancy services",
};

/**
 * Circular 1/2024 requirement types — each selectable independently on a plan item.
 * @type {string[]}
 */
export const CIRCULAR_SHEET_OPTIONS = [
  "Goods",
  "Works",
  "Non-consultancy services",
  "Consultancy services",
  "Consultancy services (individual)",
];

/** @type {Record<string, string>} */
export const CIRCULAR_SHEET_LEGACY_MAP = {
  "Supplies (Goods)": "Goods",
  Supplies: "Goods",
  GOODS: "Goods",
  WORKS: "Works",
  "Non-consultancy": "Non-consultancy services",
  "Non consultancy services": "Non-consultancy services",
  Consultancy: "Consultancy services",
  CONSULTANCY: "Consultancy services",
  "Individual consultants": "Consultancy services (individual)",
  "Consultancy (individual)": "Consultancy services (individual)",
  GOODS_WORKS_NON_CONSULTANCY: "Goods",
  "Goods, works and non-consultancy services": "Goods",
};

/** Expected procurement period within the financial year (plan item). */
export const EXPECTED_PROCUREMENT_PERIOD_OPTIONS = ["Q1", "Q2", "Q3", "Q4"];

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCircularSheet(value) {
  const t = String(value || "").trim();
  if (!t) return "";
  if (CIRCULAR_SHEET_OPTIONS.includes(t)) return t;
  return CIRCULAR_SHEET_LEGACY_MAP[t] || t;
}

/**
 * Engine sheet (consultancy vs goods/works/non-consultancy milestone columns).
 * @param {unknown} value circular sheet label or legacy PLAN_SHEET_TYPE
 * @returns {string}
 */
export function normalizePlanSheetType(value) {
  const circular = normalizeCircularSheet(value);
  if (
    circular === "Consultancy services" ||
    circular === "Consultancy services (individual)" ||
    String(value || "").trim() === PLAN_SHEET_TYPE.CONSULTANCY
  ) {
    return PLAN_SHEET_TYPE.CONSULTANCY;
  }
  return PLAN_SHEET_TYPE.GOODS_WORKS_NON_CONSULTANCY;
}

/**
 * Plan method options — seven independent official methods.
 */
export const PPDA_PLAN_METHOD_OPTIONS = PROCUREMENT_METHOD_PLAN_OPTIONS;

/** @type {Record<string, string>} */
export const PPDA_PLAN_METHOD_LEGACY_MAP = {
  "Micro procurement": "Micro Procurement",
  Quotation: "Quotation Method",
  Tender: "Open Domestic Bidding",
  "Request for quotations": "Quotation Method",
  "Open domestic bidding": "Open Domestic Bidding",
  "Open international bidding": "Open International Bidding",
  "Restricted domestic bidding": "Restricted Domestic Bidding",
  "Restricted international bidding": "Restricted International Bidding",
  "Direct procurement": "Direct Procurement",
  Other: "Open Domestic Bidding",
  MICRO: "Micro Procurement",
  QUOTATION: "Quotation Method",
  TENDER: "Open Domestic Bidding",
  DIRECT: "Direct Procurement",
  OPEN_DOMESTIC: "Open Domestic Bidding",
  OPEN_INTERNATIONAL: "Open International Bidding",
  RESTRICTED_DOMESTIC: "Restricted Domestic Bidding",
  RESTRICTED_INTERNATIONAL: "Restricted International Bidding",
};

/**
 * @param {unknown} value
 * @param {{ directProcurement?: boolean }} [opts]
 * @returns {string} Official plan label or ""
 */
export function normalizePlanMethod(value, opts = {}) {
  const code = normalizeProcurementMethod(value, opts);
  if (code) return procurementMethodLabel(code);
  const t = String(value || "").trim();
  if (!t) return "";
  if (PPDA_PLAN_METHOD_OPTIONS.includes(t)) return t;
  const mapped = PPDA_PLAN_METHOD_LEGACY_MAP[t];
  if (mapped) return mapped;
  return t;
}

/**
 * Plan label → enum code.
 * @param {unknown} value
 * @returns {string}
 */
export function planMethodToCode(value) {
  return normalizeProcurementMethod(value) || "";
}

/**
 * @param {unknown} value
 * @returns {import("@/lib/projects/procurement-methods").ProcurementMethodDef | null}
 */
export function planMethodDef(value) {
  return procurementMethodDef(normalizeProcurementMethod(value));
}

/**
 * PPDA Procurement Planning Regulations 2023 — categories of requirement
 * (same independent options as Circular sheet).
 * @type {string[]}
 */
export const PPDA_PLAN_CATEGORY_OPTIONS = CIRCULAR_SHEET_OPTIONS;

/**
 * @param {string | null | undefined} [_sheetType]
 * @returns {string[]}
 */
export function categoriesForSheet() {
  return CIRCULAR_SHEET_OPTIONS;
}

/**
 * @param {string | null | undefined} sheetType
 * @returns {string}
 */
export function defaultCategoryForSheet(sheetType) {
  const circular = normalizeCircularSheet(sheetType);
  if (circular && CIRCULAR_SHEET_OPTIONS.includes(circular)) return circular;
  return normalizePlanSheetType(sheetType) === PLAN_SHEET_TYPE.CONSULTANCY
    ? "Consultancy services"
    : "Goods";
}

export const PPDA_CONTRACT_TYPE_OPTIONS = [
  "Lump sum",
  "Admeasurement",
  "Time-based",
  "Framework",
  "Other",
];

export const PPDA_YES_NO = ["Yes", "No"];

export const PPDA_RESERVATION_SCHEME_OPTIONS = [
  "Local providers",
  "Special interest groups",
  "Local providers and special interest groups",
  "Not applicable",
];

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

/**
 * @param {unknown} v
 * @returns {string | null} ISO date yyyy-MM-dd or null
 */
function dateOrNull(v) {
  const t = trimOrNull(v);
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize Circular 2024 fields from a plan-item body.
 * @param {any} raw
 * @param {string} sheetType
 */
export function normalizeCircularPlanItemFields(raw, sheetType) {
  const circularSheet =
    normalizeCircularSheet(raw?.circularSheet || raw?.category || raw?.sheetType || sheetType) ||
    defaultCategoryForSheet(sheetType);
  const sheet = normalizePlanSheetType(circularSheet || sheetType);
  const isConsultancy = sheet === PLAN_SHEET_TYPE.CONSULTANCY;

  const plannedProcurementMethod =
    normalizePlanMethod(raw?.plannedProcurementMethod, {
      directProcurement: Boolean(raw?.directProcurement),
    }) || null;

  return {
    sheetType: sheet,
    circularSheet,
    currency: trimOrNull(raw?.currency) || "UGX",
    sourceOfFunding: trimOrNull(raw?.sourceOfFunding) || DEFAULT_FUNDING_SOURCE,
    plannedProcurementMethod,
    contractType: trimOrNull(raw?.contractType),
    prequalification: isConsultancy ? null : trimOrNull(raw?.prequalification),
    applyReservationScheme: trimOrNull(raw?.applyReservationScheme),
    reservationSchemeDetail: trimOrNull(raw?.reservationSchemeDetail),
    multiYearCurrentCost: trimOrNull(raw?.multiYearCurrentCost),
    multiYearCompletionYears: trimOrNull(raw?.multiYearCompletionYears),
    multiYearPaidUpSum: trimOrNull(raw?.multiYearPaidUpSum),
    multiYearPendingSum: trimOrNull(raw?.multiYearPendingSum),
    multiYearPendingTime: trimOrNull(raw?.multiYearPendingTime),
    bidInvitationDate: isConsultancy ? null : dateOrNull(raw?.bidInvitationDate),
    bidClosingOpeningDate: isConsultancy ? null : dateOrNull(raw?.bidClosingOpeningDate),
    evaluationReportApprovalDate: isConsultancy
      ? null
      : dateOrNull(raw?.evaluationReportApprovalDate),
    awardDecisionDate: isConsultancy ? null : dateOrNull(raw?.awardDecisionDate),
    awardNotificationDate: isConsultancy ? null : dateOrNull(raw?.awardNotificationDate),
    contractSigningDate: dateOrNull(raw?.contractSigningDate),
    completionDate: dateOrNull(raw?.completionDate),
    eoiInvitationDate: isConsultancy ? dateOrNull(raw?.eoiInvitationDate) : null,
    eoiClosingOpeningDate: isConsultancy ? dateOrNull(raw?.eoiClosingOpeningDate) : null,
    eoiShortlistApprovalDate: isConsultancy ? dateOrNull(raw?.eoiShortlistApprovalDate) : null,
    proposalNotificationDate: isConsultancy ? dateOrNull(raw?.proposalNotificationDate) : null,
    proposalDeadlineDate: isConsultancy ? dateOrNull(raw?.proposalDeadlineDate) : null,
    proposalOpeningDate: isConsultancy ? dateOrNull(raw?.proposalOpeningDate) : null,
    proposalEvalApprovalDate: isConsultancy ? dateOrNull(raw?.proposalEvalApprovalDate) : null,
    proposalAwardNotificationDate: isConsultancy
      ? dateOrNull(raw?.proposalAwardNotificationDate)
      : null,
  };
}

/**
 * Soft chronological checks for Circular plan milestone dates (PDE estimates;
 * Cap. 205 advertising periods apply at solicitation, not at planning).
 *
 * @param {Record<string, unknown>} item
 * @param {string} sheetType
 * @param {string} prefix e.g. `items.0`
 * @returns {Record<string, string>}
 */
export function validatePlanMilestoneOrder(item, sheetType, prefix) {
  /** @type {Record<string, string>} */
  const errors = {};
  const isConsultancy =
    normalizePlanSheetType(item?.sheetType || sheetType) === PLAN_SHEET_TYPE.CONSULTANCY;
  /** @type {[string, string][]} */
  const chain = isConsultancy
    ? [
        ["eoiInvitationDate", "eoiClosingOpeningDate"],
        ["eoiClosingOpeningDate", "eoiShortlistApprovalDate"],
        ["eoiShortlistApprovalDate", "proposalNotificationDate"],
        ["proposalNotificationDate", "proposalDeadlineDate"],
        ["proposalDeadlineDate", "proposalOpeningDate"],
        ["proposalOpeningDate", "proposalEvalApprovalDate"],
        ["proposalEvalApprovalDate", "proposalAwardNotificationDate"],
        ["proposalAwardNotificationDate", "contractSigningDate"],
        ["contractSigningDate", "completionDate"],
      ]
    : [
        ["bidInvitationDate", "bidClosingOpeningDate"],
        ["bidClosingOpeningDate", "evaluationReportApprovalDate"],
        ["evaluationReportApprovalDate", "awardDecisionDate"],
        ["awardDecisionDate", "awardNotificationDate"],
        ["awardNotificationDate", "contractSigningDate"],
        ["contractSigningDate", "completionDate"],
      ];
  for (const [a, b] of chain) {
    const da = dateOrNull(item?.[a]);
    const db = dateOrNull(item?.[b]);
    if (da && db && db < da) {
      errors[`${prefix}.${b}`] = "Cannot be before the previous milestone.";
    }
  }
  // When awardDecisionDate is blank, still require BEB after eval.
  if (!isConsultancy) {
    const evalD = dateOrNull(item?.evaluationReportApprovalDate);
    const beb = dateOrNull(item?.awardNotificationDate);
    const awardD = dateOrNull(item?.awardDecisionDate);
    if (evalD && beb && !awardD && beb < evalD) {
      errors[`${prefix}.awardNotificationDate`] = "Cannot be before the previous milestone.";
    }
  }
  return errors;
}

/**
 * Prefill + merge Form 5 Part I from requisition row + body.
 * @param {any} requisition serialized or prisma-like
 * @param {any} body
 */
export function buildForm5PartI(requisition, body = {}) {
  const items = Array.isArray(requisition?.items) ? requisition.items : [];
  const lineItems =
    Array.isArray(body.lineItems) && body.lineItems.length
      ? body.lineItems
      : items.map((it, i) => ({
          itemNo: it.lineNumber || i + 1,
          description: it.itemName || it.description || "",
          quantity: String(it.quantity ?? ""),
          unitOfMeasure: it.unitOfMeasure || "",
          estimatedUnitCost: String(it.estimatedUnitPrice ?? ""),
          estimatedTotal: String(it.estimatedTotal ?? ""),
        }));

  return {
    pdeCode: trimOrNull(body.pdeCode) || trimOrNull(requisition?.department?.code) || "",
    categorySuppliesWorksServices:
      trimOrNull(body.categorySuppliesWorksServices) ||
      trimOrNull(requisition?.category) ||
      "Supplies",
    financialYearLabel:
      trimOrNull(body.financialYearLabel) ||
      trimOrNull(requisition?.financialYear?.label) ||
      "",
    sequenceNumber:
      trimOrNull(body.sequenceNumber) ||
      trimOrNull(requisition?.requisitionReference) ||
      "",
    budgetCategory: trimOrNull(body.budgetCategory) || "Recurrent",
    projectCode: trimOrNull(body.projectCode) || "",
    projectTitle: trimOrNull(body.projectTitle) || "",
    multiYearContracting: trimOrNull(body.multiYearContracting) || "No",
    resourcesYearOne: trimOrNull(body.resourcesYearOne) || "",
    resourcesYearTwo: trimOrNull(body.resourcesYearTwo) || "",
    resourcesYearThree: trimOrNull(body.resourcesYearThree) || "",
    resourcesYearFour: trimOrNull(body.resourcesYearFour) || "",
    subjectOfProcurement:
      trimOrNull(body.subjectOfProcurement) || trimOrNull(requisition?.title) || "",
    procurementPlanReference:
      trimOrNull(body.procurementPlanReference) ||
      trimOrNull(requisition?.procurementPlan?.planReference) ||
      "",
    locationForDelivery:
      trimOrNull(body.locationForDelivery) ||
      trimOrNull(requisition?.deliveryLocation) ||
      "",
    dateRequired:
      dateOrNull(body.dateRequired) ||
      (requisition?.requiredByDate
        ? String(requisition.requiredByDate).slice(0, 10)
        : "") ||
      "",
    currency: trimOrNull(body.currency) || "UGX",
    marketPrice: trimOrNull(body.marketPrice) || "",
    estimatedTotalCost:
      trimOrNull(body.estimatedTotalCost) ||
      String(requisition?.estimatedTotalValue ?? ""),
    voteHeadNo: trimOrNull(body.voteHeadNo) || "",
    programme: trimOrNull(body.programme) || "",
    subProgramme: trimOrNull(body.subProgramme) || "",
    fundingItem: trimOrNull(body.fundingItem) || "",
    balanceRemaining: trimOrNull(body.balanceRemaining) || "",
    lineItems,
    memberName: trimOrNull(body.memberName) || "",
    memberTitle: trimOrNull(body.memberTitle) || "",
    hodName: trimOrNull(body.hodName) || "",
    hodTitle: trimOrNull(body.hodTitle) || "",
    aoName: trimOrNull(body.aoName) || "",
    aoTitle: trimOrNull(body.aoTitle) || "Accounting Officer",
    submittedAt: new Date().toISOString(),
  };
}

/**
 * @param {any} body
 * @param {{ method?: string | null }} ctx
 */
export function buildForm5PartII(body = {}, ctx = {}) {
  const rawMethod =
    trimOrNull(body.recommendedMethod) || trimOrNull(ctx.method) || "";
  const directFlag =
    Boolean(body.directProcurement) ||
    String(body.directProcurement || "").toLowerCase() === "true" ||
    Boolean(ctx.directProcurement);
  const method =
    normalizeProcurementMethod(rawMethod, {
      directProcurement: directFlag,
    }) || rawMethod;
  const bidding = isBiddingMethod(method);
  const microStyle = isMicroStyleMethod(method);
  const needsDirectGrounds = methodRequiresDirectGrounds(method) || (microStyle && directFlag);
  return {
    dateSubmittedToCc: dateOrNull(body.dateSubmittedToCc) || "",
    ccMeetingReference: trimOrNull(body.ccMeetingReference) || "",
    recommendedMethod: method,
    methodJustification: trimOrNull(body.methodJustification) || "",
    emergencyReasons: trimOrNull(body.emergencyReasons) || "",
    directProcurement: method === "DIRECT" || (microStyle && directFlag),
    directJustification: needsDirectGrounds
      ? trimOrNull(body.directJustification) || ""
      : "",
    shortlistedProviders: trimOrNull(body.shortlistedProviders) || "",
    shortlistJustification: trimOrNull(body.shortlistJustification) || "",
    shortlist: Array.isArray(ctx.shortlist) ? ctx.shortlist : [],
    shortlistValidatedAt: ctx.shortlistValidatedAt || null,
    biddingDocumentPreparers: trimOrNull(body.biddingDocumentPreparers) || "",
    evaluationCommitteeNominees: trimOrNull(body.evaluationCommitteeNominees) || "",
    evaluationCommitteeJustification:
      trimOrNull(body.evaluationCommitteeJustification) || "",
    biddingDocumentCost: bidding ? trimOrNull(body.biddingDocumentCost) || "" : "",
    otherInformation: trimOrNull(body.otherInformation) || "",
    pduOfficerName: trimOrNull(body.pduOfficerName) || "",
    pduOfficerPosition: trimOrNull(body.pduOfficerPosition) || "Procurement Officer",
    ccChairName: trimOrNull(body.ccChairName) || "",
    ccSecretaryName: trimOrNull(body.ccSecretaryName) || "",
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Minimal educational bid / RFQ document.
 * @param {any} procurement
 * @param {any} body
 */
export function buildBidDocument(procurement, body = {}) {
  const req = procurement?.requisition || {};
  const isTender = isBiddingMethod(procurement?.procurementMethod);
  const approvedCost = req.form5PartII?.biddingDocumentCost ?? req.biddingDocumentCost ?? "";
  return {
    documentTitle:
      trimOrNull(body.documentTitle) ||
      (isTender ? "Bidding document" : "Request for quotations"),
    pdeName: trimOrNull(body.pdeName) || "",
    procurementReference:
      trimOrNull(body.procurementReference) ||
      trimOrNull(procurement?.procurementNumber) ||
      "",
    subject:
      trimOrNull(body.subject) ||
      trimOrNull(procurement?.title) ||
      trimOrNull(req.title) ||
      "",
    specifications:
      trimOrNull(body.specifications) ||
      trimOrNull(req.needDescription) ||
      "",
    closingDate: dateOrNull(body.closingDate) || "",
    submissionInstructions:
      trimOrNull(body.submissionInstructions) ||
      (isTender
        ? "Submit a sealed bid before the closing date stated above."
        : "Submit a sealed quotation before the closing date stated above."),
    evaluationCriteria:
      trimOrNull(body.evaluationCriteria) ||
      "Technical compliance and lowest evaluated price among substantially responsive offers.",
    biddingDocumentCost: isTender ? String(approvedCost || "").trim() : "",
    issuedByName: trimOrNull(body.issuedByName) || "",
    issuedByPosition: trimOrNull(body.issuedByPosition) || "Procurement Officer",
    issueDate: dateOrNull(body.issueDate) || new Date().toISOString().slice(0, 10),
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Shared org / department context for PDF headers.
 * @param {any} entity
 * @param {Record<string, string>} [overrides]
 */
export function buildOrgPdfContext(entity, overrides = {}) {
  const stage = entity?.workflowStage;
  const stageLine =
    overrides.workflowStage ||
    (stage?.title
      ? String(stage.title)
      : stage?.requiredRoleName
        ? `Current step: ${stage.requiredRoleName}`
        : "");

  return {
    organisationName:
      overrides.organisationName ||
      entity?.organisationName ||
      entity?.pdeName ||
      "",
    departmentName: overrides.departmentName || entity?.department?.name || "",
    departmentCode: overrides.departmentCode || entity?.department?.code || "",
    financialYear: overrides.financialYear || entity?.financialYear?.label || "",
    referenceNumber:
      overrides.referenceNumber ||
      entity?.requisitionReference ||
      entity?.planReference ||
      entity?.procurementNumber ||
      entity?.budgetReference ||
      "",
    statusLabel:
      overrides.statusLabel || entity?.statusLabel || entity?.status || "Draft",
    statusColor: overrides.statusColor || entity?.statusColor || "info",
    workflowStage: stageLine,
  };
}

/**
 * @param {Record<string, any>} bid
 * @param {ReturnType<typeof buildOrgPdfContext>} ctx
 * @param {{ draftIncomplete?: boolean }} [opts]
 */
export function bidDocumentToPdfSpec(bid, ctx, opts = {}) {
  const ref = bid.procurementReference || ctx.referenceNumber || "";
  return {
    referenceNumber: ref,
    documentTitle: bid.documentTitle || "Bid / RFQ document",
    documentSubtitle: "Educational solicitation document",
    organisationName: bid.pdeName || ctx.organisationName,
    departmentName: ctx.departmentName,
    departmentCode: ctx.departmentCode,
    financialYear: ctx.financialYear,
    status: {
      label: ctx.statusLabel,
      stage: ctx.workflowStage,
      color: ctx.statusColor,
    },
    draftIncomplete: Boolean(opts.draftIncomplete),
    sections: [
      {
        title: "Document details",
        fields: [
          { label: "Procurement reference", value: bid.procurementReference },
          { label: "Subject", value: bid.subject },
          { label: "Issue date", value: bid.issueDate },
          { label: "Closing date", value: bid.closingDate },
          { label: "Issued by", value: bid.issuedByName },
          { label: "Position", value: bid.issuedByPosition },
        ],
      },
      {
        title: "Specifications / scope",
        paragraph: pdfFieldValue(bid.specifications),
      },
      {
        title: "Submission instructions",
        paragraph: pdfFieldValue(bid.submissionInstructions),
      },
      {
        title: "Evaluation criteria",
        paragraph: pdfFieldValue(bid.evaluationCriteria),
      },
    ],
  };
}

/**
 * Client-side: download a structured organisation PDF.
 * @param {import("@/lib/projects/org-document-pdf").OrgDocumentPdfSpec} spec
 */
export async function downloadOrgFormPdf(spec) {
  await downloadOrgDocumentPdf(spec);
}

/**
 * @deprecated Prefer {@link downloadOrgFormPdf} with a structured spec.
 * @param {string} filename
 * @param {string} title
 * @param {string} bodyHtml
 */
export async function downloadPdfReference(filename, title, bodyHtml) {
  await downloadOrgFormPdf({
    referenceNumber: filename.replace(/\.(html|pdf)$/i, ""),
    documentTitle: title,
    organisationName: "",
    status: { label: "Reference copy", color: "info" },
    sections: [{ paragraph: htmlToPlainText(bodyHtml) }],
  });
}

/**
 * @deprecated Prefer {@link downloadPdfReference}.
 */
export function downloadHtmlReference(filename, title, bodyHtml) {
  void downloadPdfReference(filename, title, bodyHtml);
}

/**
 * Strip tags for PDF text layout.
 * @param {string} html
 */
function htmlToPlainText(html) {
  const raw = String(html || "");
  return raw
    .replace(/<\/(h1|h2|h3|p|tr|div|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, ": ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\|[ \t]+/g, " | ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Client-side: download an HTML reference file (print-friendly).
 * @param {string} filename
 * @param {string} title
 * @param {string} bodyHtml
 * @deprecated Kept for compatibility; use downloadPdfReference.
 */
export function downloadHtmlFileReference(filename, title, bodyHtml) {
  if (typeof document === "undefined") return;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{font-family:Georgia,serif;max-width:900px;margin:24px auto;padding:0 16px;color:#18181b;line-height:1.45}
h1{font-size:1.25rem;color:#008bd0}
h2{font-size:1.05rem;margin-top:1.5rem}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:0.9rem}
th,td{border:1px solid #d4d4d8;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f4f4f5}
.meta{color:#52525b;font-size:0.85rem}
.stripe{height:4px;background:linear-gradient(90deg,#008bd0,#fff200,#ed1c24);margin-bottom:16px}
</style></head><body>
<div class="stripe"></div>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${APP_BRAND_LABEL}</p>
${bodyHtml}
</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} s
 */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, any>} bid
 */
export function bidDocumentToHtml(bid) {
  if (!bid) return "<p>Not filled yet.</p>";
  return `
<h2>${escapeHtml(bid.documentTitle || "Bid / RFQ document")}</h2>
<table>
<tr><th>Procuring and Disposing Entity (PDE)</th><td>${escapeHtml(bid.pdeName)}</td></tr>
<tr><th>Procurement reference</th><td>${escapeHtml(bid.procurementReference)}</td></tr>
<tr><th>Subject</th><td>${escapeHtml(bid.subject)}</td></tr>
<tr><th>Issue date</th><td>${escapeHtml(bid.issueDate)}</td></tr>
<tr><th>Closing date</th><td>${escapeHtml(bid.closingDate)}</td></tr>
<tr><th>Issued by</th><td>${escapeHtml(bid.issuedByName)} (${escapeHtml(bid.issuedByPosition)})</td></tr>
</table>
<h2>Specifications / scope</h2>
<p>${escapeHtml(bid.specifications).replace(/\n/g, "<br/>")}</p>
<h2>Submission instructions</h2>
<p>${escapeHtml(bid.submissionInstructions).replace(/\n/g, "<br/>")}</p>
<h2>Evaluation criteria</h2>
<p>${escapeHtml(bid.evaluationCriteria).replace(/\n/g, "<br/>")}</p>`;
}

/**
 * Circular 1/2024 plan item reference HTML.
 * @param {any} item plan item (title + circularFields)
 * @param {string} sheetType
 */
export function circularPlanItemToHtml(item, sheetType) {
  const cf = item?.circularFields || item || {};
  const isConsultancy = sheetType === PLAN_SHEET_TYPE.CONSULTANCY;
  const label = isConsultancy
    ? PLAN_SHEET_TYPE_LABELS.CONSULTANCY
    : PLAN_SHEET_TYPE_LABELS.GOODS_WORKS_NON_CONSULTANCY;
  return `
<h2>Circular No. 1/2024 — ${escapeHtml(label)}</h2>
<p><strong>Subject:</strong> ${escapeHtml(item?.title || "")}</p>
<table>
<tr><th>Currency</th><td>${escapeHtml(cf.currency)}</td><th>Source of funding</th><td>${escapeHtml(cf.sourceOfFunding)}</td></tr>
<tr><th>Planned method</th><td>${escapeHtml(cf.plannedProcurementMethod)}</td><th>Contract type</th><td>${escapeHtml(cf.contractType)}</td></tr>
${
  isConsultancy
    ? ""
    : `<tr><th>Prequalification</th><td>${escapeHtml(cf.prequalification)}</td><th>Reservation scheme</th><td>${escapeHtml(cf.applyReservationScheme)} ${escapeHtml(cf.reservationSchemeDetail || "")}</td></tr>`
}
<tr><th>Multi-year current cost</th><td>${escapeHtml(cf.multiYearCurrentCost)}</td><th>Completion years</th><td>${escapeHtml(cf.multiYearCompletionYears)}</td></tr>
<tr><th>Paid-up sum</th><td>${escapeHtml(cf.multiYearPaidUpSum)}</td><th>Pending sum / time</th><td>${escapeHtml(cf.multiYearPendingSum)} / ${escapeHtml(cf.multiYearPendingTime)}</td></tr>
</table>
<h2>Key dates</h2>
<table>
${
  isConsultancy
    ? `<tr><th>EOI invitation</th><td>${escapeHtml(cf.eoiInvitationDate)}</td><th>EOI closing/opening</th><td>${escapeHtml(cf.eoiClosingOpeningDate)}</td></tr>
<tr><th>Shortlist approval</th><td>${escapeHtml(cf.eoiShortlistApprovalDate)}</td><th>Proposal notification</th><td>${escapeHtml(cf.proposalNotificationDate)}</td></tr>
<tr><th>Proposal deadline</th><td>${escapeHtml(cf.proposalDeadlineDate)}</td><th>Proposal opening</th><td>${escapeHtml(cf.proposalOpeningDate)}</td></tr>
<tr><th>Eval approval</th><td>${escapeHtml(cf.proposalEvalApprovalDate)}</td><th>Award notification</th><td>${escapeHtml(cf.proposalAwardNotificationDate)}</td></tr>`
    : `<tr><th>Bid invitation</th><td>${escapeHtml(cf.bidInvitationDate)}</td><th>Bid closing/opening</th><td>${escapeHtml(cf.bidClosingOpeningDate)}</td></tr>
<tr><th>Eval report approval</th><td>${escapeHtml(cf.evaluationReportApprovalDate)}</td><th>Award decision</th><td>${escapeHtml(cf.awardDecisionDate)}</td></tr>
<tr><th>BEB / award notice</th><td>${escapeHtml(cf.awardNotificationDate)}</td><th></th><td></td></tr>`
}
<tr><th>Contract signing</th><td>${escapeHtml(cf.contractSigningDate)}</td><th>Completion</th><td>${escapeHtml(cf.completionDate)}</td></tr>
</table>`;
}
