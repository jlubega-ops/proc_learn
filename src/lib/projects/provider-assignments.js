import { OrgAwardStatus, OrgContractStatus, OrgLpoStatus } from "@prisma/client";
import { loadPurchaseInstructionDoc } from "@/lib/projects/purchase-instructions";
import {
  orderNotOpenForDelivery,
  outstandingDeliveryLines,
  serializeDeliveryNote,
} from "@/lib/projects/delivery-notes";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";
import { loadPrintOrganisation } from "@/lib/projects/print-context";
import { acceptedShareOfOrder, nextInvoiceNumber } from "@/lib/projects/invoices";
import { loadProcurementDomainTimeline } from "@/lib/projects/procurement-timeline";
import { INACTIVE_OFFER_STATUSES } from "@/lib/projects/offer-line-items";

const OPEN_INVOICE_STATUSES = ["RECEIVED", "CERTIFIED", "VERIFIED", "APPROVED_FOR_PAYMENT"];
/** Orders the provider sees: issued to it onwards (drafts stay internal). */
const PROVIDER_LPO_STATUSES = [OrgLpoStatus.ISSUED, OrgLpoStatus.ACCEPTED, OrgLpoStatus.DECLINED];
const PROVIDER_CONTRACT_STATUSES = [OrgContractStatus.ISSUED, OrgContractStatus.ACTIVE, OrgContractStatus.DECLINED];

/** Org events a provider may see on its own assignment. */
const PROVIDER_VISIBLE_EVENTS = new Set([
  "PROJECT_ORG_AWARD_COMMUNICATED",
  "PROJECT_ORG_AWARD_ACCEPTED",
  "PROJECT_ORG_AWARD_DECLINED",
  "PROJECT_ORG_PURCHASE_INSTRUCTION_ISSUED",
  "PROJECT_ORG_PURCHASE_INSTRUCTION_ACCEPTED",
  "PROJECT_ORG_PURCHASE_INSTRUCTION_DECLINED",
  "PROJECT_ORG_LPO_ISSUED",
  "PROJECT_ORG_LPO_ACCEPTED",
  "PROJECT_ORG_LPO_DECLINED",
  "PROJECT_ORG_CONTRACT_ISSUED",
  "PROJECT_ORG_CONTRACT_ACCEPTED",
  "PROJECT_ORG_CONTRACT_DECLINED",
  "PROJECT_ORG_SOLICITATION_ISSUED",
  "PROJECT_ORG_SOLICITATION_OPENED",
  "PROJECT_ORG_SOLICITATION_CLOSED",
  "PROJECT_ORG_SOLICITATION_REOPENED",
  "PROJECT_ORG_OFFER_RECORDED",
  "PROJECT_ORG_OFFER_UPDATED",
  "PROJECT_ORG_OFFER_WITHDRAWN",
  "PROJECT_ORG_OFFER_GENERATED",
  "PROJECT_ORG_OFFER_LATE",
  "PROJECT_ORG_OFFER_NO_RESPONSE",
  "PROJECT_ORG_OFFER_CLARIFICATION_REQUESTED",
  "PROJECT_ORG_OFFER_CLARIFICATION_ANSWERED",
  "PROJECT_ORG_DELIVERY_NOTE_SUBMITTED",
  "PROJECT_ORG_DELIVERY_RECORDED",
  "PROJECT_ORG_DELIVERY_INSPECTED",
  "PROJECT_ORG_INVOICE_CREATED",
  "PROJECT_ORG_INVOICE_RECEIVED",
  "PROJECT_ORG_INVOICE_CERTIFIED",
  "PROJECT_ORG_INVOICE_VERIFIED",
  "PROJECT_ORG_INVOICE_REJECTED",
  "PROJECT_ORG_PAYMENT_PAID",
  "PROJECT_ORG_PROCUREMENT_CLOSED",
  "PROJECT_ORG_PROCUREMENT_CANCELLED",
]);
const PROVIDER_VISIBLE_COMMENTS = new Set([
  "PROJECT_ORG_INVOICE_REJECTED",
  "PROJECT_ORG_DELIVERY_INSPECTED",
  "PROJECT_ORG_OFFER_CLARIFICATION_REQUESTED",
]);

/**
 * History of one assignment as the provider sees it — never other providers' actions.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; procurementNumber: string; providerId: string }} opts
 */
export async function loadProviderHistory(prisma, opts) {
  const entries = await loadProcurementDomainTimeline(prisma, opts);
  return entries
    .filter(
      (e) =>
        PROVIDER_VISIBLE_EVENTS.has(String(e.eventType || "")) &&
        (!e.supplierId || e.supplierId === opts.providerId),
    )
    .map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      action: e.actionText,
      actor: e.actor?.displayName || null,
      role: e.actorRoleName || null,
      comment: e.byProvider || PROVIDER_VISIBLE_COMMENTS.has(String(e.eventType)) ? e.comment : null,
    }));
}

/** @param {any} form5PartII */
function approvedMicroProviderId(form5PartII) {
  const list = Array.isArray(form5PartII?.shortlist) ? form5PartII.shortlist : [];
  return list[0]?.id ? String(list[0].id) : null;
}

/**
 * Procurement ids where the provider holds (or is approved for) the order.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string }} opts
 */
async function assignedProcurementIds(prisma, opts) {
  const where = { projectId: opts.projectId, supplierId: opts.providerId };
  const [pis, awards, lpos, contracts, micro] = await Promise.all([
    prisma.projectOrgPurchaseInstruction.findMany({ where, select: { procurementId: true } }),
    prisma.projectOrgAward.findMany({
      where: {
        ...where,
        status: { in: [OrgAwardStatus.COMMUNICATED, OrgAwardStatus.ACCEPTED, OrgAwardStatus.DECLINED] },
      },
      select: { procurementId: true },
    }),
    prisma.projectOrgLpo.findMany({
      where: { ...where, status: { in: PROVIDER_LPO_STATUSES } },
      select: { procurementId: true },
    }),
    prisma.projectOrgContract.findMany({
      where: { ...where, status: { in: PROVIDER_CONTRACT_STATUSES } },
      select: { procurementId: true },
    }),
    prisma.projectOrgProcurement.findMany({
      where: { projectId: opts.projectId, procurementMethod: "MICRO", purchaseInstructions: { none: {} } },
      select: { id: true, requisition: { select: { form5PartII: true } } },
    }),
  ]);
  const ids = new Set([
    ...pis.map((r) => r.procurementId),
    ...awards.map((r) => r.procurementId),
    ...lpos.map((r) => r.procurementId),
    ...contracts.map((r) => r.procurementId),
  ]);
  for (const p of micro) {
    if (approvedMicroProviderId(p.requisition?.form5PartII) === opts.providerId) ids.add(p.id);
  }
  return [...ids];
}

/**
 * Provider-side progress for one procurement.
 * @param {{
 *   status: string;
 *   pi: any | null;
 *   award?: any | null;
 *   order: any | null;
 *   notes: any[];
 *   deliveries: any[];
 *   invoices: any[];
 *   payments: any[];
 * }} s
 */
function providerProgress(s) {
  const lastNote = s.notes[0] || null;
  const accepted = s.deliveries.some((d) => ["ACCEPTED", "PARTIAL"].includes(d.inspection?.status));
  const rejected = s.deliveries.some((d) => d.inspection?.status === "REJECTED");
  const awaitingInspection = s.deliveries.some((d) => !d.inspection || d.inspection.status === "PENDING");
  const openInvoice = s.invoices.find((i) => OPEN_INVOICE_STATUSES.includes(i.status));
  const paid = s.payments.some((p) => p.status === "PAID");

  const orderAccepted = s.pi ? s.pi.status === "ACCEPTED" : ["ACCEPTED", "ACTIVE"].includes(s.order?.status);
  const orderWord = s.order && "contractNumber" in s.order ? "contract" : "LPO";
  const orderLabel = !s.order ? "Order" : orderWord === "contract" ? "Contract" : "LPO";
  const award = s.award || null;
  const steps = [
    { key: "selected", label: award ? "Awarded" : "Selected", done: true },
    ...(award ? [{ key: "award", label: "Award accepted", done: award.status === "ACCEPTED" }] : []),
    { key: "order", label: s.pi ? "Purchase instruction" : `${orderLabel} issued`, done: Boolean(s.pi || s.order) },
    { key: "accepted", label: `${s.pi ? "Order" : orderLabel} accepted`, done: orderAccepted },
    { key: "dispatched", label: "Dispatched", done: s.notes.length > 0 || s.deliveries.length > 0 },
    { key: "received", label: "Received", done: s.deliveries.length > 0 },
    { key: "inspected", label: "Inspected", done: accepted || rejected },
    { key: "invoiced", label: "Invoiced", done: s.invoices.some((i) => i.status !== "REJECTED") },
    { key: "paid", label: "Paid", done: paid },
  ];

  /** @type {{ label: string; color: "success" | "warning" | "error" | "info" | "primary"; action?: string }} */
  let status;
  if (s.status === "CANCELLED" || s.status === "REJECTED") status = { label: "Cancelled", color: "error" };
  else if (s.status === "CLOSED") status = { label: "Closed", color: "success" };
  else if (award?.status === "DECLINED") status = { label: "You declined the award", color: "error" };
  else if (award?.status === "COMMUNICATED") status = { label: "Respond to award", color: "primary" };
  else if (s.order?.status === "DECLINED") status = { label: `You declined the ${orderWord}`, color: "error" };
  else if (s.order?.status === "ISSUED") status = { label: `Respond to ${orderWord}`, color: "primary" };
  else if (s.pi?.status === "DECLINED") status = { label: "You declined", color: "error" };
  else if (s.pi?.status === "ISSUED") status = { label: "Accept purchase instruction", color: "primary" };
  else if (!s.pi && !s.order) {
    status = { label: award ? "Award accepted — awaiting order" : "Selected — awaiting order", color: "warning" };
  }
  else if (paid) status = { label: "Paid", color: "success" };
  else if (openInvoice) status = { label: "Invoice under review", color: "warning" };
  else if (accepted) status = { label: "Delivery accepted — invoice", color: "primary", action: "invoice" };
  else if (rejected && !awaitingInspection) status = { label: "Delivery rejected", color: "error" };
  else if (awaitingInspection && s.deliveries.length) status = { label: "Awaiting inspection", color: "warning" };
  else if (lastNote?.status === "SUBMITTED") status = { label: "Awaiting receipt", color: "warning" };
  else status = { label: "Deliver goods", color: "primary" };

  const firstOpen = steps.findIndex((st) => !st.done);
  return {
    status,
    steps: steps.map((st, i) => ({ ...st, current: i === firstOpen })),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string[]} ids
 * @param {string} providerId
 */
function loadAssignmentRows(prisma, ids, providerId) {
  return prisma.projectOrgProcurement.findMany({
    where: { id: { in: ids } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      procurementNumber: true,
      title: true,
      status: true,
      procurementMethod: true,
      updatedAt: true,
      requisition: { select: { category: true, deliveryLocation: true, estimatedTotalValue: true } },
      purchaseInstructions: { where: { supplierId: providerId } },
      awards: {
        where: {
          supplierId: providerId,
          status: { in: [OrgAwardStatus.COMMUNICATED, OrgAwardStatus.ACCEPTED, OrgAwardStatus.DECLINED] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      lpos: {
        where: { supplierId: providerId, status: { in: PROVIDER_LPO_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      contracts: {
        where: { supplierId: providerId, status: { in: PROVIDER_CONTRACT_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      deliveryNotes: { where: { supplierId: providerId }, orderBy: { createdAt: "desc" } },
      deliveries: {
        orderBy: { createdAt: "asc" },
        include: { lines: true, inspection: { select: { status: true, resultNotes: true, inspectedAt: true } } },
      },
      invoices: { where: { supplierId: providerId }, orderBy: { createdAt: "asc" } },
      payments: { where: { invoice: { supplierId: providerId } }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** @param {any} r */
function orderOf(r) {
  const pi = r.purchaseInstructions[0] || null;
  const lpo = r.lpos[0] || null;
  const contract = r.contracts[0] || null;
  const doc = contract || lpo;
  if (doc) {
    return {
      kind: contract ? "CONTRACT" : "LPO",
      number: contract ? contract.contractNumber : lpo.lpoNumber,
      value: (contract ? contract.contractValue : lpo.lpoValue)?.toString?.(),
      status: doc.status,
      issuedAt: doc.issuedAt || null,
      acceptedAt: doc.acceptedAt || null,
      acceptedByName: doc.acceptedByName || null,
      declinedAt: doc.declinedAt || null,
      declineReason: doc.declineReason || null,
      deliveryAddress: doc.deliveryAddress || null,
      startDate: contract?.startDate || null,
      endDate: contract?.endDate || null,
    };
  }
  if (pi) return { kind: "PURCHASE_INSTRUCTION", number: pi.instructionNumber, value: pi.amount?.toString?.(), status: pi.status };
  return null;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; page: number; pageSize: number; skip: number }} opts
 */
export async function listProviderAssignments(prisma, opts) {
  const ids = await assignedProcurementIds(prisma, opts);
  if (!ids.length) return { total: 0, page: opts.page, pageSize: opts.pageSize, items: [] };
  const rows = await loadAssignmentRows(prisma, ids, opts.providerId);
  const items = rows.slice(opts.skip, opts.skip + opts.pageSize).map((r) => {
    const order = orderOf(r);
    const progress = providerProgress({
      status: r.status,
      pi: r.purchaseInstructions[0] || null,
      award: r.awards[0] || null,
      order: r.lpos[0] || r.contracts[0] || null,
      notes: r.deliveryNotes,
      deliveries: r.deliveries,
      invoices: r.invoices,
      payments: r.payments,
    });
    return {
      procurementId: r.id,
      procurementNumber: r.procurementNumber,
      title: r.title,
      category: r.requisition?.category || null,
      order,
      value: order?.value || r.requisition?.estimatedTotalValue?.toString?.() || null,
      status: progress.status,
      updatedAt: r.updatedAt,
    };
  });
  return { total: rows.length, page: opts.page, pageSize: opts.pageSize, items };
}

/**
 * Assignments waiting on the provider (accept the order, deliver, or invoice).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string }} opts
 */
export async function countProviderAssignmentsNeedingAction(prisma, opts) {
  const ids = await assignedProcurementIds(prisma, opts);
  if (!ids.length) return 0;
  const rows = await loadAssignmentRows(prisma, ids, opts.providerId);
  return rows.filter(
    (r) =>
      providerProgress({
        status: r.status,
        pi: r.purchaseInstructions[0] || null,
        award: r.awards[0] || null,
        order: r.lpos[0] || r.contracts[0] || null,
        notes: r.deliveryNotes,
        deliveries: r.deliveries,
        invoices: r.invoices,
        payments: r.payments,
      }).status.color === "primary",
  ).length;
}

/**
 * Assignments whose accepted goods the provider has not invoiced yet.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string }} opts
 */
export async function listProviderAssignmentsToInvoice(prisma, opts) {
  const ids = await assignedProcurementIds(prisma, opts);
  if (!ids.length) return [];
  const rows = await loadAssignmentRows(prisma, ids, opts.providerId);
  return rows
    .filter(
      (r) =>
        providerProgress({
          status: r.status,
          pi: r.purchaseInstructions[0] || null,
          award: r.awards[0] || null,
          order: r.lpos[0] || r.contracts[0] || null,
          notes: r.deliveryNotes,
          deliveries: r.deliveries,
          invoices: r.invoices,
          payments: r.payments,
        }).status.action === "invoice",
    )
    .map((r) => {
      const order = orderOf(r);
      return {
        procurementId: r.id,
        procurementNumber: r.procurementNumber,
        title: r.title,
        order,
        value: order?.value || null,
        acceptedOn:
          r.deliveries
            .map((d) => d.inspection?.inspectedAt)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] || null,
      };
    });
}

/**
 * Full provider view of one assignment, or null when the provider is not on it.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; procurementId: string }} opts
 */
export async function loadProviderAssignment(prisma, opts) {
  const ids = await assignedProcurementIds(prisma, opts);
  if (!ids.includes(opts.procurementId)) return null;
  const [r] = await loadAssignmentRows(prisma, [opts.procurementId], opts.providerId);
  if (!r) return null;

  const pi = r.purchaseInstructions[0] || null;
  const [piDoc, organisation, provider] = await Promise.all([
    pi ? loadPurchaseInstructionDoc(prisma, opts) : Promise.resolve(null),
    loadPrintOrganisation(prisma, opts.projectId),
    prisma.projectOrgProvider.findFirst({
      where: { id: opts.providerId, projectId: opts.projectId },
      select: { name: true, email: true, phone: true, physicalAddress: true, tin: true },
    }),
  ]);
  const activeOrder = await getActiveOrderValue(prisma, opts.projectId, r.id);
  const myOrder = activeOrder?.supplierId === opts.providerId ? activeOrder : null;
  const outstanding = (await outstandingDeliveryLines(prisma, opts)) || [];
  const notes = r.deliveryNotes.map(serializeDeliveryNote);
  const terminal = ["CANCELLED", "REJECTED", "CLOSED"].includes(r.status);
  const invoiced = r.invoices
    .filter((i) => OPEN_INVOICE_STATUSES.includes(i.status))
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const hasAcceptedDelivery = r.deliveries.some((d) => ["ACCEPTED", "PARTIAL"].includes(d.inspection?.status));
  const remaining = myOrder ? Math.max(0, myOrder.value - invoiced) : 0;
  const orderAccepted = Boolean(myOrder) && !orderNotOpenForDelivery(myOrder);
  const acceptedValue =
    myOrder && hasAcceptedDelivery
      ? await acceptedShareOfOrder(prisma, { projectId: opts.projectId, procurementId: r.id, orderValue: myOrder.value })
      : 0;
  const invoiceable = Math.min(remaining, Math.max(0, acceptedValue - invoiced));
  const canInvoice = !terminal && hasAcceptedDelivery && invoiceable > 0.5;
  const invoiceNumber = canInvoice ? await nextInvoiceNumber(prisma, opts.projectId, r.id) : null;
  const history = await loadProviderHistory(prisma, {
    projectId: opts.projectId,
    procurementId: r.id,
    procurementNumber: r.procurementNumber,
    providerId: opts.providerId,
  });

  const award = r.awards[0] || null;
  const awardedOffer = award
    ? await prisma.projectOrgOffer.findFirst({
        where: {
          procurementId: r.id,
          supplierId: opts.providerId,
          status: { notIn: INACTIVE_OFFER_STATUSES },
        },
        orderBy: { submittedAt: "desc" },
        select: {
          amount: true,
          deliveryDays: true,
          submittedAt: true,
          lineItems: true,
          offerType: true,
        },
      })
    : null;
  const progress = providerProgress({
    status: r.status,
    pi,
    award,
    order: r.lpos[0] || r.contracts[0] || null,
    notes: r.deliveryNotes,
    deliveries: r.deliveries,
    invoices: r.invoices,
    payments: r.payments,
  });

  return {
    procurement: {
      id: r.id,
      procurementNumber: r.procurementNumber,
      title: r.title,
      status: r.status,
      method: r.procurementMethod,
      category: r.requisition?.category || null,
      deliveryLocation: r.requisition?.deliveryLocation || null,
    },
    order: orderOf(r),
    award: award
      ? {
          id: award.id,
          status: award.status,
          amount: award.awardedAmount?.toString?.() ?? "",
          awardDate: award.awardDate || null,
          communicatedAt: award.communicatedAt || null,
          acceptedAt: award.acceptedAt || null,
          acceptedByName: award.acceptedByName || null,
          declinedAt: award.declinedAt || null,
          declineReason: award.declineReason || null,
          approvalReference: award.approvalReference || null,
          offerType: awardedOffer?.offerType || null,
          offerSubmittedAt: awardedOffer?.submittedAt || null,
          deliveryDays: awardedOffer?.deliveryDays ?? null,
          lines: Array.isArray(awardedOffer?.lineItems)
            ? awardedOffer.lineItems.map((l) => ({
                lineNumber: Number(l?.lineNumber) || 0,
                itemName: String(l?.itemName || ""),
                quantity: Number(l?.quantity) || 0,
                unitOfMeasure: l?.unitOfMeasure || null,
                unitPrice: Number(l?.unitPrice) || 0,
                total: Number(l?.total) || 0,
              }))
            : [],
        }
      : null,
    organisation,
    provider,
    purchaseInstructionDoc: piDoc,
    status: progress.status,
    steps: progress.steps,
    outstanding,
    deliveryNotes: notes,
    deliveries: r.deliveries.map((d) => ({
      id: d.id,
      status: d.status,
      deliveryDate: d.deliveryDate,
      lines: d.lines.map((l) => ({
        itemName: l.itemName,
        receivedQuantity: l.receivedQuantity?.toString?.() ?? "",
        acceptedQuantity: l.acceptedQuantity?.toString?.() ?? "0",
        rejectedQuantity: l.rejectedQuantity?.toString?.() ?? "0",
        unitOfMeasure: l.unitOfMeasure || null,
      })),
      inspection: d.inspection
        ? { status: d.inspection.status, resultNotes: d.inspection.resultNotes || null, inspectedAt: d.inspection.inspectedAt }
        : null,
    })),
    invoices: r.invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      supplierReference: i.supplierReference || null,
      amount: i.amount?.toString?.() ?? "",
      status: i.status,
      invoiceDate: i.invoiceDate,
      rejectionReason: i.rejectionReason || null,
    })),
    payments: r.payments.map((p) => ({
      id: p.id,
      amount: p.amount?.toString?.() ?? "",
      status: p.status,
      paymentReference: p.paymentReference || null,
      paymentDate: p.paymentDate || null,
    })),
    history,
    actions: {
      canRespond: !terminal && pi?.status === "ISSUED",
      canRespondAward: !terminal && award?.status === "COMMUNICATED",
      canRespondOrder: !terminal && (r.lpos[0] || r.contracts[0])?.status === "ISSUED",
      canDeliver:
        !terminal &&
        Boolean(orderAccepted) &&
        !notes.some((n) => n.status === "SUBMITTED") &&
        outstanding.some((l) => l.outstanding > 0),
      canInvoice,
      nextInvoiceNumber: invoiceNumber,
      remaining: remaining.toFixed(2),
      invoiceable: invoiceable.toFixed(2),
      acceptedValue: acceptedValue.toFixed(2),
      invoiced: invoiced.toFixed(2),
      orderValue: myOrder ? myOrder.value.toFixed(2) : null,
    },
  };
}
