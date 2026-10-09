import {
  OrgSolicitationType,
  OrgSolicitationStatus,
  OrgOfferType,
  OrgOfferStatus,
  OrgProviderStatus,
  Prisma,
} from "@prisma/client";
import { format } from "date-fns";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { serializeProviderSummary } from "@/lib/projects/providers";
import { buildBidDocument } from "@/lib/projects/ppda-forms";
import { validateStartEndDateRange } from "@/lib/validation/date-range";
import { INACTIVE_OFFER_STATUSES, priceOfferLines } from "@/lib/projects/offer-line-items";

/** Ordinal position used to guard against moving a solicitation status backwards. */
const STATUS_ORDER = [
  OrgSolicitationStatus.DRAFT,
  OrgSolicitationStatus.REVIEW,
  OrgSolicitationStatus.APPROVED,
  OrgSolicitationStatus.ISSUED,
  OrgSolicitationStatus.ADVERTISED,
  OrgSolicitationStatus.OPEN,
  OrgSolicitationStatus.CLOSED,
];

/**
 * @param {any} row
 */
export function serializeSolicitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    solicitationType: row.solicitationType,
    title: row.title,
    status: row.status,
    bidDocument: row.bidDocument || null,
    bidDocumentAt: row.bidDocumentAt || null,
    issueDate: row.issueDate || null,
    closingDate: row.closingDate || null,
    originalClosingDate: row.originalClosingDate || null,
    openedAt: row.openedAt || null,
    closedAt: row.closedAt || null,
    invites: Array.isArray(row.invites)
      ? row.invites.map((i) => ({
          id: i.id,
          invitedAt: i.invitedAt,
          noResponseAt: i.noResponseAt || null,
          supplierId: i.supplierId,
          supplier: i.supplier ? serializeProviderSummary(i.supplier) : null,
        }))
      : undefined,
    offerCount: Array.isArray(row.offers) ? row.offers.length : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {any} row
 */
export function serializeOffer(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    solicitationId: row.solicitationId || null,
    offerType: row.offerType,
    amount: row.amount?.toString?.() ?? String(row.amount ?? ""),
    status: row.status,
    submittedAt: row.submittedAt,
    openedAt: row.openedAt || null,
    source: row.source || "OFFICER",
    deliveryDays: row.deliveryDays ?? null,
    remarks: row.remarks || null,
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
    clarifications: Array.isArray(row.clarifications)
      ? row.clarifications.map((c) => ({
          id: c.id,
          question: c.question,
          askedByName: c.askedByName || null,
          askedByRole: c.askedByRole || null,
          askedAt: c.askedAt,
          response: c.response || null,
          responseSource: c.responseSource || null,
          respondedAt: c.respondedAt || null,
        }))
      : [],
    withdrawnAt: row.withdrawnAt || null,
    supplierId: row.supplierId,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SOLICITATION_INCLUDE = {
  invites: { include: { supplier: true }, orderBy: { invitedAt: "asc" } },
  offers: { select: { id: true } },
};

/**
 * Most recent solicitation of a given type for a procurement (each procurement
 * has at most one active RFQ/Tender in this simulation).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; solicitationType: string }} opts
 */
export async function findSolicitationForProcurement(prisma, opts) {
  return prisma.projectOrgSolicitation.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationType: opts.solicitationType,
    },
    orderBy: { createdAt: "desc" },
    include: SOLICITATION_INCLUDE,
  });
}

/**
 * Create the Draft RFQ/Tender for a procurement if one does not already exist
 * (idempotent — repeated "Prepare documents" completions reuse the draft).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   title?: string | null;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function getOrCreateDraftSolicitation(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: { id: true, procurementNumber: true, title: true, procurementMethod: true },
  });
  if (!procurement) {
    return { ok: false, error: "Procurement not found in this organisation.", status: 404 };
  }

  const existing = await findSolicitationForProcurement(prisma, opts);
  if (existing) {
    return { ok: true, solicitation: serializeSolicitation(existing), created: false };
  }

  const label = opts.solicitationType === OrgSolicitationType.TENDER ? "Tender" : "Request for Quotations";
  const title =
    (typeof opts.title === "string" && opts.title.trim()) ||
    `${label}: ${procurement.procurementNumber} — ${procurement.title}`.slice(0, 255);

  const created = await prisma.projectOrgSolicitation.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      solicitationType: /** @type {import("@prisma/client").OrgSolicitationType} */ (
        opts.solicitationType
      ),
      title,
      status: OrgSolicitationStatus.DRAFT,
    },
    include: SOLICITATION_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      solicitationId: created.id,
      solicitationType: opts.solicitationType,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, solicitation: serializeSolicitation(created), created: true };
}

/**
 * Fill educational bid / RFQ document on the latest solicitation for a procurement.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName?: string | null;
 *   body: any;
 *   pdeName?: string | null;
 * }} opts
 */
export async function saveBidDocumentForProcurement(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: {
      requisition: true,
      solicitations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!procurement) return { ok: false, error: "Procurement not found.", status: 404 };

  let solicitation = procurement.solicitations?.[0] || null;
  if (!solicitation) {
    const type =
      procurement.procurementMethod === "TENDER"
        ? OrgSolicitationType.TENDER
        : OrgSolicitationType.RFQ;
    const created = await getOrCreateDraftSolicitation(prisma, {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationType: type,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName || "Procurement Officer",
    });
    if (!created.ok) return created;
    solicitation = await prisma.projectOrgSolicitation.findUnique({
      where: { id: created.solicitation.id },
    });
  }
  if (!solicitation) {
    return { ok: false, error: "Could not prepare solicitation documents.", status: 400 };
  }

  const snapshot = buildBidDocument(
    {
      ...procurement,
      procurementMethod: procurement.procurementMethod,
      procurementNumber: procurement.procurementNumber,
      title: procurement.title,
      requisition: procurement.requisition,
    },
    { ...(opts.body || {}), pdeName: opts.pdeName || opts.body?.pdeName },
  );
  if (!snapshot.subject) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: { subject: "Enter the subject of procurement." },
      status: 400,
    };
  }
  if (!snapshot.specifications) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: { specifications: "Enter specifications or scope." },
      status: 400,
    };
  }
  if (
    !validateStartEndDateRange(snapshot.issueDate, snapshot.closingDate, { requireBoth: false }).ok
  ) {
    return {
      ok: false,
      error: "Validation failed.",
      fieldErrors: { closingDate: "Closing date cannot be before the issue date." },
      status: 400,
    };
  }

  const updated = await prisma.projectOrgSolicitation.update({
    where: { id: solicitation.id },
    data: {
      bidDocument: snapshot,
      bidDocumentAt: new Date(),
      ...(snapshot.issueDate
        ? { issueDate: new Date(`${snapshot.issueDate}T12:00:00.000Z`) }
        : {}),
      ...(snapshot.closingDate
        ? { closingDate: new Date(`${snapshot.closingDate}T12:00:00.000Z`) }
        : {}),
    },
    include: {
      invites: { include: { supplier: true } },
      offers: { include: { supplier: true } },
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: updated.id,
      form: "BID_DOCUMENT",
      actorOrgUserId: opts.actorOrgUserId,
    },
  });

  return { ok: true, solicitation: serializeSolicitation(updated) };
}

/**
 * Move a solicitation forward through the review/approval statuses
 * (DRAFT → REVIEW → APPROVED). Never moves it backwards.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   toStatus: import("@prisma/client").OrgSolicitationStatus;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function advanceSolicitationStatus(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return {
      ok: false,
      error: "No solicitation has been prepared for this procurement yet.",
      status: 400,
    };
  }

  const currentIdx = STATUS_ORDER.indexOf(solicitation.status);
  const targetIdx = STATUS_ORDER.indexOf(opts.toStatus);
  if (targetIdx <= currentIdx) {
    // Already advanced at least this far — treat as a no-op so retries are safe.
    return { ok: true, solicitation: serializeSolicitation(solicitation), changed: false };
  }

  const updated = await prisma.projectOrgSolicitation.update({
    where: { id: solicitation.id },
    data: { status: opts.toStatus },
    include: SOLICITATION_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      previousStatus: solicitation.status,
      newStatus: opts.toStatus,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, solicitation: serializeSolicitation(updated), changed: true };
}

/**
 * @param {unknown} value
 */
function parseClosingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Issue an RFQ (Quotation) or advertise a Tender: invite suppliers (required
 * for RFQ, optional for a publicly advertised Tender) and set the closing
 * date suppliers must submit by.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   inviteSupplierIds?: string[];
 *   closingDate: unknown;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function issueSolicitation(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return {
      ok: false,
      error: "Prepare the solicitation documents before issuing them to suppliers.",
      status: 400,
    };
  }

  const approvedClosingDate = solicitation.closingDate || null;
  const closingDate = approvedClosingDate || parseClosingDate(opts.closingDate);
  if (!closingDate) {
    return {
      ok: false,
      error: "Choose a valid closing date for supplier submissions.",
      status: 400,
      fieldErrors: { closingDate: "Choose a valid closing date." },
    };
  }
  if (closingDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      error: approvedClosingDate
        ? "The approved closing date has passed. Recommend a change to the Contracts Committee."
        : "The closing date cannot be in the past.",
      status: 400,
      fieldErrors: { closingDate: "Choose a closing date today or later." },
    };
  }

  const isRfq = opts.solicitationType === OrgSolicitationType.RFQ;
  const inviteIds = Array.isArray(opts.inviteSupplierIds)
    ? [...new Set(opts.inviteSupplierIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];

  if (isRfq && inviteIds.length === 0) {
    return {
      ok: false,
      error: "Invite at least one registered supplier to receive this RFQ.",
      status: 400,
      fieldErrors: { inviteSupplierIds: "Select at least one supplier to invite." },
    };
  }

  if (inviteIds.length > 0) {
    const suppliers = await prisma.projectOrgProvider.findMany({
      where: {
        id: { in: inviteIds },
        projectId: opts.projectId,
        status: OrgProviderStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (suppliers.length !== inviteIds.length) {
      return {
        ok: false,
        error: "One or more selected suppliers are invalid or inactive.",
        status: 400,
        fieldErrors: { inviteSupplierIds: "Choose only active, registered suppliers." },
      };
    }

    await prisma.projectOrgSolicitationInvite.createMany({
      data: inviteIds.map((supplierId) => ({ solicitationId: solicitation.id, supplierId })),
      skipDuplicates: true,
    });
  }

  const newStatus = isRfq ? OrgSolicitationStatus.ISSUED : OrgSolicitationStatus.ADVERTISED;
  const updated = await prisma.projectOrgSolicitation.update({
    where: { id: solicitation.id },
    data: {
      status: newStatus,
      issueDate: new Date(),
      closingDate,
    },
    include: SOLICITATION_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_ISSUED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      solicitationType: opts.solicitationType,
      invitedSupplierCount: inviteIds.length,
      closingDate,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const docLabel = isRfq ? "Request for quotation" : "Invitation to bid";
  for (const providerId of inviteIds) {
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId,
      linkUrl: "/provider-portal/opportunities",
      relatedEntityType: "procurement",
      relatedEntityId: opts.procurementId,
      title: `${docLabel}: ${updated.title}`,
      body: `Submit your offer by ${format(closingDate, "MMM d, yyyy")}.`,
    });
  }

  return { ok: true, solicitation: serializeSolicitation(updated) };
}

/**
 * Record a supplier's quotation (RFQ) or bid (Tender) against an issued
 * solicitation. RFQ offers may only come from invited suppliers; Tender bids
 * are open to any active registered supplier once advertised.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   supplierId: string;
 *   amount: unknown;
 *   actorOrgUserId: string | null;
 *   actorRoleName: string;
 *   source?: "OFFICER" | "PORTAL" | "AUTO";
 *   lineItems?: unknown;
 *   deliveryDays?: unknown;
 *   remarks?: unknown;
 * }} opts
 */
export async function receiveOffer(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return { ok: false, error: "This procurement has no solicitation to receive offers against.", status: 400 };
  }
  const acceptingStatuses = [
    OrgSolicitationStatus.ISSUED,
    OrgSolicitationStatus.ADVERTISED,
    OrgSolicitationStatus.OPEN,
  ];
  if (!acceptingStatuses.includes(solicitation.status)) {
    return {
      ok: false,
      error: "This solicitation is not currently open to receive offers.",
      status: 400,
    };
  }

  if (solicitation.closingDate && solicitation.closingDate.getTime() < Date.now()) {
    return {
      ok: false,
      error:
        "No quotations or bids can be submitted because the closing date has passed.",
      status: 400,
      code: "SOLICITATION_CLOSED",
    };
  }

  const supplierId = typeof opts.supplierId === "string" ? opts.supplierId.trim() : "";
  if (!supplierId) {
    return {
      ok: false,
      error: "Choose the supplier this offer came from.",
      status: 400,
      fieldErrors: { supplierId: "Choose a supplier." },
    };
  }
  const supplier = await prisma.projectOrgProvider.findFirst({
    where: { id: supplierId, projectId: opts.projectId },
  });
  if (!supplier) {
    return { ok: false, error: "Choose a supplier registered in this organisation.", status: 400 };
  }
  if (supplier.status !== OrgProviderStatus.ACTIVE) {
    return { ok: false, error: "This supplier is inactive. Choose an active supplier.", status: 400 };
  }

  const isRfq = opts.solicitationType === OrgSolicitationType.RFQ;
  if (isRfq) {
    const invited = await prisma.projectOrgSolicitationInvite.findFirst({
      where: { solicitationId: solicitation.id, supplierId },
    });
    if (!invited) {
      return {
        ok: false,
        error: "Only suppliers invited to this RFQ can submit a quotation. Invite this supplier first.",
        status: 400,
        fieldErrors: { supplierId: "This supplier was not invited to this RFQ." },
      };
    }
  }

  const priced = await priceOfferInput(prisma, solicitation.procurementId, opts);
  if (!priced.ok) return priced;
  const amountNum = priced.amount;

  const extras = parseOfferExtras(opts);
  if (!extras.ok) return extras;

  const offerType = isRfq ? OrgOfferType.QUOTATION : OrgOfferType.BID;
  const existing = await prisma.projectOrgOffer.findFirst({
    where: { solicitationId: solicitation.id, supplierId, status: { not: OrgOfferStatus.WITHDRAWN } },
  });
  if (existing) {
    return {
      ok: false,
      error: `A ${offerType === OrgOfferType.QUOTATION ? "quotation" : "bid"} from this supplier has already been recorded.`,
      status: 400,
      code: "OFFER_ALREADY_RECORDED",
    };
  }

  const created = await prisma.projectOrgOffer.create({
    data: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      supplierId,
      offerType,
      amount: new Prisma.Decimal(amountNum.toFixed(2)),
      status: OrgOfferStatus.SUBMITTED,
      source: extras.source,
      deliveryDays: extras.deliveryDays,
      remarks: extras.remarks,
      ...(priced.lines ? { lineItems: priced.lines } : {}),
    },
    include: { supplier: true },
  });
  await prisma.projectOrgSolicitationInvite.updateMany({
    where: { solicitationId: solicitation.id, supplierId, noResponseAt: { not: null } },
    data: { noResponseAt: null },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_OFFER_RECORDED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      offerId: created.id,
      offerType,
      supplierId,
      source: extras.source,
      amount: created.amount?.toString?.(),
      actorOrgUserId: opts.actorOrgUserId || null,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, offer: serializeOffer(created) };
}

const OFFER_SOURCES = ["OFFICER", "PORTAL", "AUTO"];

/**
 * Requisition items a quotation / bid is priced against.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} procurementId
 */
export async function loadOfferItems(prisma, procurementId) {
  const items = await prisma.projectOrgRequisitionItem.findMany({
    where: { requisition: { procurements: { some: { id: procurementId } } } },
    orderBy: { lineNumber: "asc" },
    select: { lineNumber: true, itemName: true, quantity: true, unitOfMeasure: true, estimatedUnitPrice: true },
  });
  return items.map((i) => ({
    lineNumber: i.lineNumber,
    itemName: i.itemName,
    quantity: Number(i.quantity),
    unitOfMeasure: i.unitOfMeasure || null,
    estimatedUnitPrice: Number(i.estimatedUnitPrice),
  }));
}

/**
 * Total from priced lines when given (the total is then derived), else the typed amount.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} procurementId
 * @param {{ amount?: unknown; lineItems?: unknown }} opts
 * @returns {Promise<{ ok: true; amount: number; lines: any[] | null } | { ok: false; error: string; status: number; fieldErrors?: Record<string, string> }>}
 */
async function priceOfferInput(prisma, procurementId, opts) {
  if (Array.isArray(opts.lineItems) && opts.lineItems.length) {
    const items = await loadOfferItems(prisma, procurementId);
    if (items.length) {
      const priced = priceOfferLines(items, opts.lineItems);
      if (!priced.ok) return { ok: false, error: priced.error, status: 400, fieldErrors: priced.fieldErrors };
      if (priced.total <= 0) {
        return { ok: false, error: "The total must be greater than zero.", status: 400, fieldErrors: { amount: "Enter prices." } };
      }
      return { ok: true, amount: priced.total, lines: priced.lines };
    }
  }
  const amountNum = Number(String(opts.amount ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return {
      ok: false,
      error: "Enter a valid offer amount greater than zero.",
      status: 400,
      fieldErrors: { amount: "Enter a valid amount." },
    };
  }
  return { ok: true, amount: amountNum, lines: null };
}

/**
 * @param {{ source?: unknown; deliveryDays?: unknown; remarks?: unknown }} opts
 */
function parseOfferExtras(opts) {
  const source = OFFER_SOURCES.includes(/** @type {string} */ (opts.source)) ? String(opts.source) : "OFFICER";
  let deliveryDays = null;
  if (opts.deliveryDays !== undefined && opts.deliveryDays !== null && String(opts.deliveryDays).trim() !== "") {
    const n = Number(opts.deliveryDays);
    if (!Number.isInteger(n) || n < 1 || n > 730) {
      return {
        ok: false,
        error: "Delivery period must be a whole number of days between 1 and 730.",
        status: 400,
        fieldErrors: { deliveryDays: "Enter days between 1 and 730." },
      };
    }
    deliveryDays = n;
  }
  const remarks = typeof opts.remarks === "string" ? opts.remarks.trim().slice(0, 2000) || null : null;
  return { ok: true, source, deliveryDays, remarks };
}

/**
 * Once evaluation starts or any award exists, every provider's offer on the case is frozen.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} procurementId
 */
export async function offersLockedByDecision(prisma, procurementId) {
  const [reports, awards] = await Promise.all([
    prisma.projectOrgEvaluationReport.count({ where: { procurementId } }),
    prisma.projectOrgAward.count({ where: { procurementId } }),
  ]);
  return reports + awards > 0;
}

/**
 * Load an offer the provider owns, still editable (solicitation accepting and closing date ahead).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; offerId: string; providerId: string }} opts
 */
async function loadEditableProviderOffer(prisma, opts, purpose = "withdraw") {
  const offer = await prisma.projectOrgOffer.findFirst({
    where: { id: opts.offerId, projectId: opts.projectId, supplierId: opts.providerId },
    include: { solicitation: true, _count: { select: { clarifications: true } } },
  });
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (
    purpose === "edit" &&
    offer._count.clarifications > 0 &&
    offer.solicitation?.closingDate &&
    offer.solicitation.closingDate.getTime() < Date.now()
  ) {
    const { clarificationWindowOpen } = await import("@/lib/projects/offer-clarifications");
    if (await clarificationWindowOpen(prisma, offer)) return { ok: true, offer, revision: true };
    return { ok: false, error: "Evaluation has started. Offers can no longer be changed.", status: 400, code: "OFFERS_LOCKED" };
  }
  if (offer.status !== OrgOfferStatus.SUBMITTED) {
    return { ok: false, error: "This offer can no longer be changed.", status: 400 };
  }
  const sol = offer.solicitation;
  if (
    !sol ||
    ![OrgSolicitationStatus.ISSUED, OrgSolicitationStatus.ADVERTISED, OrgSolicitationStatus.OPEN].includes(sol.status)
  ) {
    return { ok: false, error: "This solicitation is no longer accepting changes.", status: 400 };
  }
  if (sol.closingDate && sol.closingDate.getTime() < Date.now()) {
    return {
      ok: false,
      error: "The closing date has passed. Offers can no longer be edited or withdrawn.",
      status: 400,
      code: "SOLICITATION_CLOSED",
    };
  }
  if (await offersLockedByDecision(prisma, offer.procurementId)) {
    return {
      ok: false,
      error: "Evaluation has started. Offers can no longer be edited or withdrawn.",
      status: 400,
      code: "OFFERS_LOCKED",
    };
  }
  return { ok: true, offer };
}

/**
 * Provider edits its own quotation/bid before the closing date, or afterwards in answer
 * to a clarification until evaluation starts (the original submission time is kept).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; offerId: string; providerId: string; amount: unknown; deliveryDays?: unknown; remarks?: unknown }} opts
 */
export async function updateProviderOffer(prisma, opts) {
  const loaded = await loadEditableProviderOffer(prisma, opts, "edit");
  if (!loaded.ok) return loaded;
  const priced = await priceOfferInput(prisma, loaded.offer.procurementId, opts);
  if (!priced.ok) return priced;
  const amountNum = priced.amount;
  const extras = parseOfferExtras({ source: "PORTAL", deliveryDays: opts.deliveryDays, remarks: opts.remarks });
  if (!extras.ok) return extras;

  const updated = await prisma.projectOrgOffer.update({
    where: { id: loaded.offer.id },
    data: {
      amount: new Prisma.Decimal(amountNum.toFixed(2)),
      deliveryDays: extras.deliveryDays,
      remarks: extras.remarks,
      lineItems: priced.lines ?? Prisma.JsonNull,
      source: extras.source,
      ...(loaded.revision ? {} : { submittedAt: new Date() }),
    },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_OFFER_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: loaded.offer.procurementId,
      offerId: loaded.offer.id,
      supplierId: opts.providerId,
      previousAmount: loaded.offer.amount?.toString?.(),
      amount: updated.amount?.toString?.(),
      via: "PROVIDER_PORTAL",
      ...(loaded.revision ? { revision: "CLARIFICATION", actorRoleName: "Provider (portal)" } : {}),
    },
  });

  return { ok: true, offer: serializeOffer(updated) };
}

/**
 * Provider withdraws its own quotation/bid before the closing date.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; offerId: string; providerId: string }} opts
 */
export async function withdrawProviderOffer(prisma, opts) {
  const loaded = await loadEditableProviderOffer(prisma, opts);
  if (!loaded.ok) return loaded;
  const updated = await prisma.projectOrgOffer.update({
    where: { id: loaded.offer.id },
    data: { status: OrgOfferStatus.WITHDRAWN, withdrawnAt: new Date() },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_OFFER_WITHDRAWN,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: loaded.offer.procurementId,
      offerId: loaded.offer.id,
      supplierId: opts.providerId,
      via: "PROVIDER_PORTAL",
    },
  });

  return { ok: true, offer: serializeOffer(updated) };
}

/**
 * Reveal received offers. When `finalize` is true (single-step Quotation
 * "Open Quotations") the solicitation is also closed in the same action;
 * otherwise (Tender "Open Bids") the solicitation moves to OPEN and closes
 * separately once forwarded for evaluation.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   finalize: boolean;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function openSolicitation(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return { ok: false, error: "No issued solicitation was found for this procurement.", status: 400 };
  }
  if (solicitation.closingDate && solicitation.closingDate.getTime() > Date.now()) {
    return {
      ok: false,
      error: "The closing date for submissions has not yet passed.",
      status: 400,
      code: "CLOSING_DATE_NOT_REACHED",
    };
  }

  const offerCount = await prisma.projectOrgOffer.count({
    where: { solicitationId: solicitation.id, status: { notIn: INACTIVE_OFFER_STATUSES } },
  });
  if (offerCount === 0) {
    return {
      ok: false,
      error: "Record at least one offer before opening this solicitation.",
      status: 400,
    };
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.projectOrgSolicitation.update({
      where: { id: solicitation.id },
      data: {
        openedAt: now,
        status: opts.finalize ? OrgSolicitationStatus.CLOSED : OrgSolicitationStatus.OPEN,
        ...(opts.finalize ? { closedAt: now } : {}),
      },
      include: SOLICITATION_INCLUDE,
    }),
    prisma.projectOrgOffer.updateMany({
      where: { solicitationId: solicitation.id, status: OrgOfferStatus.SUBMITTED },
      data: { status: OrgOfferStatus.OPENED, openedAt: now },
    }),
  ]);

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_OPENED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      offerCount,
      finalize: Boolean(opts.finalize),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, solicitation: serializeSolicitation(updated) };
}

/**
 * Close/Lock submissions. Before the closing date this closes early: the closing date
 * moves to now so every "closed" check (portal, receive, generate) applies at once;
 * the original deadline is kept in the audit trail.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; solicitationType: string; actorOrgUserId: string | null; actorRoleName: string }} opts
 */
export async function lockSolicitationSubmissions(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return { ok: false, error: "No issued solicitation was found for this procurement.", status: 400 };
  }
  const offerCount = await prisma.projectOrgOffer.count({
    where: { solicitationId: solicitation.id, status: { notIn: INACTIVE_OFFER_STATUSES } },
  });
  if (offerCount === 0) {
    const word = opts.solicitationType === OrgSolicitationType.RFQ ? "quotation" : "bid";
    return { ok: false, error: `Record at least one ${word} before closing submissions.`, status: 400 };
  }
  const now = new Date();
  const early = !solicitation.closingDate || solicitation.closingDate.getTime() > now.getTime();
  if (!early) return { ok: true, solicitation: serializeSolicitation(solicitation), early: false };

  const updated = await prisma.projectOrgSolicitation.update({
    where: { id: solicitation.id },
    data: {
      closingDate: now,
      ...(solicitation.originalClosingDate ? {} : { originalClosingDate: solicitation.closingDate }),
    },
    include: SOLICITATION_INCLUDE,
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_CLOSED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      earlyClose: true,
      originalClosingDate: solicitation.closingDate ? solicitation.closingDate.toISOString() : null,
      offerCount,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      comment: "Submissions closed before the closing date.",
    },
  });
  return { ok: true, solicitation: serializeSolicitation(updated), early: true };
}

/**
 * Reopen submissions on the Close step with a new future closing date. Only before the
 * offers are opened or any evaluation decision exists. Providers marked as no response
 * may answer again.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; solicitationType: string; closingDate: unknown; actorOrgUserId: string | null; actorRoleName: string }} opts
 */
export async function reopenSolicitationSubmissions(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return { ok: false, error: "No issued solicitation was found for this procurement.", status: 400 };
  }
  const reopenable = [OrgSolicitationStatus.ISSUED, OrgSolicitationStatus.ADVERTISED];
  if (!reopenable.includes(solicitation.status) || solicitation.openedAt) {
    return { ok: false, error: "Submissions can no longer be reopened.", status: 400 };
  }
  if (await offersLockedByDecision(prisma, opts.procurementId)) {
    return { ok: false, error: "Evaluation has started.", status: 400, code: "OFFERS_LOCKED" };
  }
  const raw = typeof opts.closingDate === "string" ? opts.closingDate.trim() : "";
  const closingDate = raw ? new Date(raw) : null;
  if (!closingDate || Number.isNaN(closingDate.getTime()) || closingDate.getTime() <= Date.now()) {
    return {
      ok: false,
      error: "Choose a closing date in the future.",
      status: 400,
      fieldErrors: { closingDate: "Choose a future date and time." },
    };
  }

  const [updated] = await prisma.$transaction([
    prisma.projectOrgSolicitation.update({
      where: { id: solicitation.id },
      data: {
        closingDate,
        ...(solicitation.originalClosingDate ? {} : { originalClosingDate: solicitation.closingDate }),
      },
      include: SOLICITATION_INCLUDE,
    }),
    prisma.projectOrgSolicitationInvite.updateMany({
      where: { solicitationId: solicitation.id, noResponseAt: { not: null } },
      data: { noResponseAt: null },
    }),
  ]);

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_REOPENED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      previousClosingDate: solicitation.closingDate ? solicitation.closingDate.toISOString() : null,
      closingDate: closingDate.toISOString(),
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      comment: `Submissions reopened until ${format(closingDate, "MMM d, yyyy HH:mm")}.`,
    },
  });

  if (solicitation.solicitationType === OrgSolicitationType.RFQ) {
    const word = "quotation";
    for (const invite of solicitation.invites || []) {
      await notifyProvider(prisma, {
        projectId: opts.projectId,
        providerId: invite.supplierId,
        title: "Submissions reopened",
        body: `"${solicitation.title}" is open again until ${format(closingDate, "MMM d, yyyy HH:mm")}. You can submit or revise your ${word}.`,
        linkUrl: `/provider-portal/opportunities/${solicitation.id}`,
        relatedEntityType: "solicitation",
        relatedEntityId: solicitation.id,
      });
    }
  }

  return { ok: true, solicitation: serializeSolicitation(updated) };
}

/**
 * Final close of a solicitation once forwarded for evaluation (Tender only —
 * Quotation closes in the same action as {@link openSolicitation}).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function closeSolicitation(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  if (!solicitation) {
    return { ok: false, error: "No solicitation was found for this procurement.", status: 400 };
  }
  const updated = await prisma.projectOrgSolicitation.update({
    where: { id: solicitation.id },
    data: {
      status: OrgSolicitationStatus.CLOSED,
      closedAt: solicitation.closedAt || new Date(),
    },
    include: SOLICITATION_INCLUDE,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_SOLICITATION_CLOSED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      solicitationId: solicitation.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, solicitation: serializeSolicitation(updated) };
}
