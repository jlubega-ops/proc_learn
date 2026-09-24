/**
 * PPDA / Circular 1/2024 teaching forms — constants + normalize helpers.
 * Fill-in-app is primary; download is reference-only (no upload loop).
 */

import { downloadOrgDocumentPdf, pdfFieldValue } from "@/lib/projects/org-document-pdf";

export const PLAN_SHEET_TYPE = {
  GOODS_WORKS_NON_CONSULTANCY: "GOODS_WORKS_NON_CONSULTANCY",
  CONSULTANCY: "CONSULTANCY",
};

export const PLAN_SHEET_TYPE_LABELS = {
  GOODS_WORKS_NON_CONSULTANCY: "Goods, works and non-consultancy services",
  CONSULTANCY: "Consultancy services",
};

/** Teaching labels mapped later to Micro / Quotation / Tender. */
export const PPDA_PLAN_METHOD_OPTIONS = [
  "Micro procurement",
  "Request for quotations",
  "Open domestic bidding",
  "Open international bidding",
  "Restricted domestic bidding",
  "Restricted international bidding",
  "Direct procurement",
  "Other",
];

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
  const sheet =
    sheetType === PLAN_SHEET_TYPE.CONSULTANCY
      ? PLAN_SHEET_TYPE.CONSULTANCY
      : PLAN_SHEET_TYPE.GOODS_WORKS_NON_CONSULTANCY;
  const isConsultancy = sheet === PLAN_SHEET_TYPE.CONSULTANCY;

  return {
    currency: trimOrNull(raw?.currency) || "UGX",
    sourceOfFunding: trimOrNull(raw?.sourceOfFunding),
    plannedProcurementMethod: trimOrNull(raw?.plannedProcurementMethod),
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
  return {
    dateSubmittedToCc: dateOrNull(body.dateSubmittedToCc) || "",
    ccMeetingReference: trimOrNull(body.ccMeetingReference) || "",
    recommendedMethod:
      trimOrNull(body.recommendedMethod) || trimOrNull(ctx.method) || "",
    methodJustification: trimOrNull(body.methodJustification) || "",
    shortlistedProviders: trimOrNull(body.shortlistedProviders) || "",
    shortlistJustification: trimOrNull(body.shortlistJustification) || "",
    biddingDocumentPreparers: trimOrNull(body.biddingDocumentPreparers) || "",
    evaluationCommitteeNominees: trimOrNull(body.evaluationCommitteeNominees) || "",
    evaluationCommitteeJustification:
      trimOrNull(body.evaluationCommitteeJustification) || "",
    biddingDocumentCost: trimOrNull(body.biddingDocumentCost) || "",
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
  return {
    documentTitle:
      trimOrNull(body.documentTitle) ||
      (procurement?.procurementMethod === "TENDER"
        ? "Bidding document"
        : "Request for quotations"),
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
      "Submit a sealed quotation/bid before the closing date stated above.",
    evaluationCriteria:
      trimOrNull(body.evaluationCriteria) ||
      "Technical compliance and lowest evaluated price among substantially responsive offers.",
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
 * @param {Record<string, any>} form5
 * @param {ReturnType<typeof buildOrgPdfContext>} ctx
 * @param {{ draftIncomplete?: boolean }} [opts]
 */
export function form5PartIToPdfSpec(form5, ctx, opts = {}) {
  const ref = form5.sequenceNumber || ctx.referenceNumber || "";
  const lineRows = (form5.lineItems || []).map((li) => [
    li.itemNo,
    li.description,
    li.quantity,
    li.unitOfMeasure,
    li.estimatedUnitCost,
    li.estimatedTotal,
  ]);

  return {
    referenceNumber: ref,
    documentTitle: "FORM 5 — Part I",
    documentSubtitle: "Request by User Department (PPDA teaching form)",
    organisationName: ctx.organisationName,
    departmentName: ctx.departmentName,
    departmentCode: ctx.departmentCode,
    financialYear: ctx.financialYear || form5.financialYearLabel,
    status: {
      label: ctx.statusLabel,
      stage: ctx.workflowStage,
      color: ctx.statusColor,
    },
    draftIncomplete: Boolean(opts.draftIncomplete),
    sections: [
      {
        title: "Requisition details",
        fields: [
          { label: "Subject of procurement", value: form5.subjectOfProcurement },
          { label: "PDE code", value: form5.pdeCode },
          { label: "Category (supplies / works / services)", value: form5.categorySuppliesWorksServices },
          { label: "Financial year", value: form5.financialYearLabel },
          { label: "Sequence / requisition reference", value: form5.sequenceNumber },
          { label: "Budget category", value: form5.budgetCategory },
          { label: "Project code", value: form5.projectCode },
          { label: "Project title", value: form5.projectTitle },
          { label: "Multi-year contracting", value: form5.multiYearContracting },
          { label: "Resources year 1", value: form5.resourcesYearOne },
          { label: "Resources year 2", value: form5.resourcesYearTwo },
          { label: "Resources year 3", value: form5.resourcesYearThree },
          { label: "Resources year 4", value: form5.resourcesYearFour },
          { label: "Procurement plan reference", value: form5.procurementPlanReference },
          { label: "Date required", value: form5.dateRequired },
          { label: "Location for delivery", value: form5.locationForDelivery },
          { label: "Currency", value: form5.currency },
          { label: "Estimated total cost", value: form5.estimatedTotalCost },
          { label: "Market price", value: form5.marketPrice },
        ],
      },
      {
        title: "Line items",
        table: {
          headers: ["#", "Description", "Qty", "UoM", "Unit cost", "Total"],
          rows: lineRows.length
            ? lineRows
            : [["—", "—", "—", "—", "—", "—"]],
        },
      },
      {
        title: "Funding confirmation",
        fields: [
          { label: "Vote / head no.", value: form5.voteHeadNo },
          { label: "Programme", value: form5.programme },
          { label: "Sub-programme", value: form5.subProgramme },
          { label: "Funding item", value: form5.fundingItem },
          { label: "Balance remaining", value: form5.balanceRemaining },
        ],
      },
      {
        title: "Signatories",
        fields: [
          { label: "Member (User Department)", value: form5.memberName },
          { label: "Member title", value: form5.memberTitle },
          { label: "Head of User Department", value: form5.hodName },
          { label: "HOD title", value: form5.hodTitle },
          { label: "Accounting Officer", value: form5.aoName },
          { label: "AO title", value: form5.aoTitle },
        ],
      },
    ],
  };
}

/**
 * @param {Record<string, any>} form5
 * @param {ReturnType<typeof buildOrgPdfContext>} ctx
 * @param {{ draftIncomplete?: boolean }} [opts]
 */
export function form5PartIIToPdfSpec(form5, ctx, opts = {}) {
  const ref = ctx.referenceNumber || "";
  return {
    referenceNumber: `${ref}-F5-II`,
    documentTitle: "FORM 5 — Part II",
    documentSubtitle: "PDU to Contracts Committee (PPDA teaching form)",
    organisationName: ctx.organisationName,
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
        title: "Contracts Committee submission",
        fields: [
          { label: "Date submitted to CC", value: form5.dateSubmittedToCc },
          { label: "CC meeting reference", value: form5.ccMeetingReference },
          { label: "Recommended method", value: form5.recommendedMethod },
          { label: "Method justification", value: form5.methodJustification },
          { label: "Shortlisted providers", value: form5.shortlistedProviders },
          { label: "Shortlist justification", value: form5.shortlistJustification },
          { label: "Bidding document preparers", value: form5.biddingDocumentPreparers },
          { label: "Evaluation committee nominees", value: form5.evaluationCommitteeNominees },
          { label: "EC justification", value: form5.evaluationCommitteeJustification },
          { label: "Bidding document cost", value: form5.biddingDocumentCost },
          { label: "Other information", value: form5.otherInformation },
        ],
      },
      {
        title: "Officers",
        fields: [
          { label: "PDU officer", value: form5.pduOfficerName },
          { label: "PDU position", value: form5.pduOfficerPosition },
          { label: "CC Chair", value: form5.ccChairName },
          { label: "CC Secretary", value: form5.ccSecretaryName },
        ],
      },
    ],
    footerNote:
      "Teaching note: Part II records the Form 5 packet; method selection still happens on the workflow task.",
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
          { label: "Closing date", value: bid.closingDate },
          { label: "Issue date", value: bid.issueDate },
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
 * @param {any} item
 * @param {string} sheetType
 * @param {ReturnType<typeof buildOrgPdfContext>} ctx
 * @param {{ itemIndex?: number; draftIncomplete?: boolean }} [opts]
 */
export function circularPlanItemToPdfSpec(item, sheetType, ctx, opts = {}) {
  const cf = item?.circularFields || item || {};
  const isConsultancy = sheetType === PLAN_SHEET_TYPE.CONSULTANCY;
  const label = isConsultancy
    ? PLAN_SHEET_TYPE_LABELS.CONSULTANCY
    : PLAN_SHEET_TYPE_LABELS.GOODS_WORKS_NON_CONSULTANCY;
  const idx = opts.itemIndex != null ? opts.itemIndex + 1 : 1;
  const ref = ctx.referenceNumber
    ? `${ctx.referenceNumber}-ITEM-${String(idx).padStart(2, "0")}`
    : `PLAN-ITEM-${String(idx).padStart(2, "0")}`;

  /** @type {import("@/lib/projects/org-document-pdf").OrgPdfField[]} */
  const generalFields = [
    { label: "Subject / title", value: item?.title },
    { label: "Currency", value: cf.currency },
    { label: "Source of funding", value: cf.sourceOfFunding },
    { label: "Planned procurement method", value: cf.plannedProcurementMethod },
    { label: "Contract type", value: cf.contractType },
    { label: "Multi-year current cost", value: cf.multiYearCurrentCost },
    { label: "Completion years", value: cf.multiYearCompletionYears },
    { label: "Paid-up sum", value: cf.multiYearPaidUpSum },
    { label: "Pending sum", value: cf.multiYearPendingSum },
    { label: "Pending time", value: cf.multiYearPendingTime },
  ];

  if (!isConsultancy) {
    generalFields.splice(5, 0, {
      label: "Prequalification",
      value: cf.prequalification,
    });
    generalFields.splice(6, 0, {
      label: "Reservation scheme",
      value: [cf.applyReservationScheme, cf.reservationSchemeDetail].filter(Boolean).join(" — "),
    });
  }

  /** @type {import("@/lib/projects/org-document-pdf").OrgPdfField[]} */
  const dateFields = isConsultancy
    ? [
        { label: "EOI invitation", value: cf.eoiInvitationDate },
        { label: "EOI closing / opening", value: cf.eoiClosingOpeningDate },
        { label: "Shortlist approval", value: cf.eoiShortlistApprovalDate },
        { label: "Proposal notification", value: cf.proposalNotificationDate },
        { label: "Proposal deadline", value: cf.proposalDeadlineDate },
        { label: "Proposal opening", value: cf.proposalOpeningDate },
        { label: "Evaluation approval", value: cf.proposalEvalApprovalDate },
        { label: "Award notification", value: cf.proposalAwardNotificationDate },
        { label: "Contract signing", value: cf.contractSigningDate },
        { label: "Completion", value: cf.completionDate },
      ]
    : [
        { label: "Bid invitation", value: cf.bidInvitationDate },
        { label: "Bid closing / opening", value: cf.bidClosingOpeningDate },
        { label: "Evaluation report approval", value: cf.evaluationReportApprovalDate },
        { label: "Award notification", value: cf.awardNotificationDate },
        { label: "Contract signing", value: cf.contractSigningDate },
        { label: "Completion", value: cf.completionDate },
      ];

  return {
    referenceNumber: ref,
    documentTitle: "Procurement plan item",
    documentSubtitle: `Circular No. 1/2024 — ${label}`,
    organisationName: ctx.organisationName,
    departmentName: ctx.departmentName,
    departmentCode: ctx.departmentCode,
    financialYear: ctx.financialYear,
    status: {
      label: ctx.statusLabel || "Draft",
      stage: ctx.workflowStage,
      color: ctx.statusColor || "info",
    },
    draftIncomplete: Boolean(opts.draftIncomplete),
    sections: [
      { title: "Item details", fields: generalFields },
      { title: "Key dates", fields: dateFields },
    ],
  };
}

/**
 * Saved procurement plan record from the API.
 * @param {any} plan
 */
export function procurementPlanRecordToPdfSpec(plan) {
  const ctx = buildOrgPdfContext(plan);
  const sheetLabel =
    plan.sheetType === PLAN_SHEET_TYPE.CONSULTANCY
      ? PLAN_SHEET_TYPE_LABELS.CONSULTANCY
      : PLAN_SHEET_TYPE_LABELS.GOODS_WORKS_NON_CONSULTANCY;

  const itemRows = (plan.items || []).map((item, i) => [
    i + 1,
    item.title,
    item.category,
    item.quantity,
    item.unitOfMeasure,
    item.estimatedUnitPrice,
    item.estimatedTotal,
    item.budgetLine?.code || "—",
  ]);

  const sections = [
    {
      title: "Plan summary",
      fields: [
        { label: "Plan title", value: plan.title },
        { label: "Plan reference", value: plan.planReference },
        { label: "Plan type", value: plan.isEmergency ? "Emergency" : "Annual" },
        { label: "Circular sheet", value: sheetLabel },
        { label: "Created by", value: plan.createdBy?.displayName },
        { label: "Approved by", value: plan.approvedBy?.displayName },
      ],
    },
    {
      title: "Plan items",
      table: {
        headers: ["#", "Title", "Category", "Qty", "UoM", "Unit price", "Line total", "Budget line"],
        rows: itemRows.length ? itemRows : [["—", "—", "—", "—", "—", "—", "—", "—"]],
      },
    },
  ];

  (plan.items || []).forEach((item, idx) => {
    const itemSpec = circularPlanItemToPdfSpec(item, plan.sheetType, ctx, {
      itemIndex: idx,
    });
    for (const section of itemSpec.sections) {
      sections.push({
        title: section.title
          ? `Item ${idx + 1} · ${section.title}`
          : `Item ${idx + 1}`,
        fields: section.fields,
        table: section.table,
        paragraph: section.paragraph,
      });
    }
  });

  return {
    referenceNumber: plan.planReference || ctx.referenceNumber || "PROCUREMENT-PLAN",
    documentTitle: "Procurement plan",
    documentSubtitle: plan.isEmergency
      ? "Emergency / unplanned procurement plan"
      : `Annual procurement plan · Circular 1/2024 — ${sheetLabel}`,
    organisationName: ctx.organisationName,
    departmentName: ctx.departmentName,
    departmentCode: ctx.departmentCode,
    financialYear: ctx.financialYear,
    status: {
      label: ctx.statusLabel,
      stage: ctx.workflowStage,
      color: ctx.statusColor,
    },
    sections,
  };
}

/**
 * Full procurement plan form (all items).
 * @param {any} form
 * @param {ReturnType<typeof buildOrgPdfContext>} ctx
 * @param {any[]} budgetLines
 * @param {{ draftIncomplete?: boolean }} [opts]
 */
export function procurementPlanFormToPdfSpec(form, ctx, budgetLines = [], opts = {}) {
  const sheetLabel =
    form.sheetType === PLAN_SHEET_TYPE.CONSULTANCY
      ? PLAN_SHEET_TYPE_LABELS.CONSULTANCY
      : PLAN_SHEET_TYPE_LABELS.GOODS_WORKS_NON_CONSULTANCY;

  const itemRows = (form.items || []).map((item, i) => {
    const bl = budgetLines.find((b) => b.id === item.budgetLineId);
    return [
      i + 1,
      item.title,
      item.category,
      item.quantity,
      item.unitOfMeasure,
      item.estimatedUnitPrice,
      item.estimatedUnitPrice && item.quantity
        ? String(Number(item.quantity) * Number(String(item.estimatedUnitPrice).replace(/,/g, "")))
        : "",
      bl?.code || "—",
    ];
  });

  return {
    referenceNumber: form.planReference || ctx.referenceNumber || "PROCUREMENT-PLAN",
    documentTitle: "Procurement plan",
    documentSubtitle: form.isEmergency
      ? "Emergency / unplanned procurement plan"
      : `Annual procurement plan · Circular 1/2024 — ${sheetLabel}`,
    organisationName: ctx.organisationName,
    departmentName: ctx.departmentName,
    departmentCode: ctx.departmentCode,
    financialYear: ctx.financialYear,
    status: {
      label: ctx.statusLabel || "Draft",
      stage: ctx.workflowStage || (form.isEmergency ? "Emergency planning process" : "Annual planning process"),
      color: ctx.statusColor || "info",
    },
    draftIncomplete: Boolean(opts.draftIncomplete),
    sections: [
      {
        title: "Plan summary",
        fields: [
          { label: "Plan title", value: form.title },
          { label: "Plan reference", value: form.planReference },
          { label: "Plan type", value: form.isEmergency ? "Emergency" : "Annual" },
          { label: "Circular sheet", value: sheetLabel },
        ],
      },
      {
        title: "Plan items",
        table: {
          headers: ["#", "Title", "Category", "Qty", "UoM", "Unit price", "Line total", "Budget line"],
          rows: itemRows.length
            ? itemRows
            : [["—", "—", "—", "—", "—", "—", "—", "—"]],
        },
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
<p class="meta">Proc Learn teaching reference — fill and submit in the simulator; this file is for review only.</p>
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
 * @param {Record<string, any>} form5
 */
export function form5PartIToHtml(form5) {
  if (!form5) return "<p>Not filled yet.</p>";
  const rows = (form5.lineItems || [])
    .map(
      (li) =>
        `<tr><td>${escapeHtml(li.itemNo)}</td><td>${escapeHtml(li.description)}</td><td>${escapeHtml(li.quantity)}</td><td>${escapeHtml(li.unitOfMeasure)}</td><td>${escapeHtml(li.estimatedUnitCost)}</td><td>${escapeHtml(li.estimatedTotal)}</td></tr>`,
    )
    .join("");
  return `
<h2>FORM 5 — Part I (Request by User Department)</h2>
<table>
<tr><th>PDE code</th><td>${escapeHtml(form5.pdeCode)}</td><th>Category</th><td>${escapeHtml(form5.categorySuppliesWorksServices)}</td></tr>
<tr><th>FY</th><td>${escapeHtml(form5.financialYearLabel)}</td><th>Sequence / ref</th><td>${escapeHtml(form5.sequenceNumber)}</td></tr>
<tr><th>Budget category</th><td>${escapeHtml(form5.budgetCategory)}</td><th>Multi-year</th><td>${escapeHtml(form5.multiYearContracting)}</td></tr>
<tr><th>Subject</th><td colspan="3">${escapeHtml(form5.subjectOfProcurement)}</td></tr>
<tr><th>Plan reference</th><td>${escapeHtml(form5.procurementPlanReference)}</td><th>Date required</th><td>${escapeHtml(form5.dateRequired)}</td></tr>
<tr><th>Delivery location</th><td colspan="3">${escapeHtml(form5.locationForDelivery)}</td></tr>
<tr><th>Estimated total</th><td>${escapeHtml(form5.currency)} ${escapeHtml(form5.estimatedTotalCost)}</td><th>Market price</th><td>${escapeHtml(form5.marketPrice)}</td></tr>
</table>
<h2>Line items</h2>
<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>UoM</th><th>Unit cost</th><th>Total</th></tr></thead><tbody>${rows || "<tr><td colspan=6>—</td></tr>"}</tbody></table>
<h2>Funding confirmation</h2>
<table>
<tr><th>Vote/head</th><td>${escapeHtml(form5.voteHeadNo)}</td><th>Programme</th><td>${escapeHtml(form5.programme)}</td></tr>
<tr><th>Sub-programme</th><td>${escapeHtml(form5.subProgramme)}</td><th>Item</th><td>${escapeHtml(form5.fundingItem)}</td></tr>
<tr><th>Balance remaining</th><td colspan="3">${escapeHtml(form5.balanceRemaining)}</td></tr>
</table>
<p><strong>Member UD:</strong> ${escapeHtml(form5.memberName)} (${escapeHtml(form5.memberTitle)}) ·
<strong>Head UD:</strong> ${escapeHtml(form5.hodName)} (${escapeHtml(form5.hodTitle)}) ·
<strong>AO:</strong> ${escapeHtml(form5.aoName)} (${escapeHtml(form5.aoTitle)})</p>`;
}

/**
 * @param {Record<string, any>} form5
 */
export function form5PartIIToHtml(form5) {
  if (!form5) return "<p>Not filled yet.</p>";
  return `
<h2>FORM 5 — Part II (PDU to Contracts Committee)</h2>
<table>
<tr><th>Date to CC</th><td>${escapeHtml(form5.dateSubmittedToCc)}</td><th>Meeting ref</th><td>${escapeHtml(form5.ccMeetingReference)}</td></tr>
<tr><th>Recommended method</th><td colspan="3">${escapeHtml(form5.recommendedMethod)}</td></tr>
<tr><th>Justification</th><td colspan="3">${escapeHtml(form5.methodJustification)}</td></tr>
<tr><th>Shortlisted providers</th><td colspan="3">${escapeHtml(form5.shortlistedProviders)}</td></tr>
<tr><th>Shortlist justification</th><td colspan="3">${escapeHtml(form5.shortlistJustification)}</td></tr>
<tr><th>Bidding doc preparers</th><td colspan="3">${escapeHtml(form5.biddingDocumentPreparers)}</td></tr>
<tr><th>Evaluation committee nominees</th><td colspan="3">${escapeHtml(form5.evaluationCommitteeNominees)}</td></tr>
<tr><th>EC justification</th><td colspan="3">${escapeHtml(form5.evaluationCommitteeJustification)}</td></tr>
<tr><th>Bidding document cost</th><td colspan="3">${escapeHtml(form5.biddingDocumentCost)}</td></tr>
<tr><th>Other information</th><td colspan="3">${escapeHtml(form5.otherInformation)}</td></tr>
</table>
<p><strong>PDU:</strong> ${escapeHtml(form5.pduOfficerName)} (${escapeHtml(form5.pduOfficerPosition)}) ·
<strong>CC Chair:</strong> ${escapeHtml(form5.ccChairName)} ·
<strong>CC Secretary:</strong> ${escapeHtml(form5.ccSecretaryName)}</p>
<p class="meta">Teaching note: in this simulator phase the Procurement Officer still selects the method; Part II records the Form 5 packet for learning.</p>`;
}

/**
 * @param {Record<string, any>} bid
 */
export function bidDocumentToHtml(bid) {
  if (!bid) return "<p>Not filled yet.</p>";
  return `
<h2>${escapeHtml(bid.documentTitle || "Bid / RFQ document")}</h2>
<table>
<tr><th>PDE / Organisation</th><td>${escapeHtml(bid.pdeName)}</td></tr>
<tr><th>Procurement reference</th><td>${escapeHtml(bid.procurementReference)}</td></tr>
<tr><th>Subject</th><td>${escapeHtml(bid.subject)}</td></tr>
<tr><th>Closing date</th><td>${escapeHtml(bid.closingDate)}</td></tr>
<tr><th>Issue date</th><td>${escapeHtml(bid.issueDate)}</td></tr>
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
<tr><th>Eval report approval</th><td>${escapeHtml(cf.evaluationReportApprovalDate)}</td><th>Award notification</th><td>${escapeHtml(cf.awardNotificationDate)}</td></tr>`
}
<tr><th>Contract signing</th><td>${escapeHtml(cf.contractSigningDate)}</td><th>Completion</th><td>${escapeHtml(cf.completionDate)}</td></tr>
</table>`;
}
