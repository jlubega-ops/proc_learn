import { OrgDeliveryStatus, OrgInspectionStatus, OrgProcurementStatus, Prisma } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { orderNotOpenForDelivery } from "@/lib/projects/delivery-notes";
import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

/** @param {any} row */
export function serializeDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    status: row.status,
    deliveryDate: row.deliveryDate || null,
    deliveryAddress: row.deliveryAddress || null,
    remarks: row.remarks || null,
    deliveryNote: row.deliveryNote
      ? {
          id: row.deliveryNote.id,
          noteNumber: row.deliveryNote.noteNumber,
          dispatchedAt: row.deliveryNote.dispatchedAt,
          deliveredBy: row.deliveryNote.deliveredBy || null,
          vehicleNumber: row.deliveryNote.vehicleNumber || null,
        }
      : null,
    recordedBy: row.recordedBy
      ? { id: row.recordedBy.id, displayName: `${row.recordedBy.firstName || ""} ${row.recordedBy.lastName || ""}`.trim() }
      : null,
    lines: Array.isArray(row.lines)
      ? row.lines.map((l) => ({
          id: l.id,
          itemName: l.itemName,
          orderedQuantity: l.orderedQuantity?.toString?.() ?? String(l.orderedQuantity),
          receivedQuantity: l.receivedQuantity?.toString?.() ?? String(l.receivedQuantity),
          acceptedQuantity: l.acceptedQuantity?.toString?.() ?? String(l.acceptedQuantity ?? 0),
          rejectedQuantity: l.rejectedQuantity?.toString?.() ?? String(l.rejectedQuantity ?? 0),
          unitOfMeasure: l.unitOfMeasure || null,
        }))
      : [],
    inspection: row.inspection
      ? {
          id: row.inspection.id,
          status: row.inspection.status,
          resultNotes: row.inspection.resultNotes || null,
          inspectedAt: row.inspection.inspectedAt || null,
          committeeId: row.inspection.committeeId || null,
          committeeRole: row.inspection.committeeRole || null,
          inspectedBy: row.inspection.inspectedBy
            ? {
                id: row.inspection.inspectedBy.id,
                displayName: `${row.inspection.inspectedBy.firstName || ""} ${row.inspection.inspectedBy.lastName || ""}`.trim(),
              }
            : null,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const deliveryInclude = {
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
  deliveryNote: {
    select: { id: true, noteNumber: true, dispatchedAt: true, deliveredBy: true, vehicleNumber: true },
  },
  lines: true,
  inspection: { include: { inspectedBy: { select: { id: true, firstName: true, lastName: true } } } },
};

/**
 * Record a delivery (partial deliveries are allowed) against the procurement's
 * requisition line items. Requires an accepted order and a delivery note the provider
 * has dispatched — goods cannot be received before the provider delivers them.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   deliveryDate?: string | Date | null;
 *   remarks?: string | null;
 *   deliveryNoteId?: string | null;
 *   lines: { itemName: string; receivedQuantity: string | number }[];
 * }} opts
 */
export async function recordDelivery(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: {
      requisition: { include: { items: true } },
      deliveries: { include: { lines: true } },
    },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  const order = await getActiveOrderValue(prisma, opts.projectId, procurement.id);
  if (!order) {
    return {
      ok: false,
      error:
        "No active order was found. Issue a Purchase Instruction, accepted LPO, or active contract before recording delivery.",
      status: 400,
      code: "NO_ACTIVE_ORDER",
    };
  }
  const notOpen = orderNotOpenForDelivery(order);
  if (notOpen) return { ok: false, error: notOpen, status: 400, code: "ORDER_NOT_ACCEPTED" };

  const deliveryNoteId = typeof opts.deliveryNoteId === "string" ? opts.deliveryNoteId.trim() : "";
  const deliveryNote = await prisma.projectOrgDeliveryNote.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      ...(deliveryNoteId ? { id: deliveryNoteId } : { status: "SUBMITTED" }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, noteNumber: true, supplierId: true, lines: true, dispatchedAt: true },
  });
  if (!deliveryNote) {
    return {
      ok: false,
      error: "The provider has not delivered yet.",
      status: 400,
      code: "NOT_DISPATCHED",
    };
  }
  if (deliveryNote.status !== "SUBMITTED") {
    return { ok: false, error: "This delivery note has already been received.", status: 409 };
  }
  const rawDate = opts.deliveryDate instanceof Date ? toDateInputValue(opts.deliveryDate) : String(opts.deliveryDate ?? "").trim();
  const deliveryDate = rawDate ? parseDateInputValue(rawDate) : new Date();
  if (!deliveryDate) {
    return { ok: false, error: "Please fix the highlighted fields.", status: 400, fieldErrors: { deliveryDate: "Enter a valid date." } };
  }
  if (toDateInputValue(deliveryDate) > toDateInputValue(new Date())) {
    return { ok: false, error: "Please fix the highlighted fields.", status: 400, fieldErrors: { deliveryDate: "Date cannot be in the future." } };
  }
  if (toDateInputValue(deliveryDate) < toDateInputValue(deliveryNote.dispatchedAt)) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      status: 400,
      fieldErrors: { deliveryDate: "Cannot be before the dispatch date." },
    };
  }
  const dispatchedByItem = new Map(
    (Array.isArray(deliveryNote.lines) ? deliveryNote.lines : []).map((l) => [String(l?.itemName || ""), Number(l?.quantity || 0)]),
  );

  const reqItems = procurement.requisition?.items || [];
  if (reqItems.length === 0) {
    return { ok: false, error: "This procurement's requisition has no line items to deliver against.", status: 400 };
  }

  const linesIn = Array.isArray(opts.lines) ? opts.lines : [];
  if (linesIn.length === 0) {
    return { ok: false, error: "Add at least one delivered line item.", status: 400, fieldErrors: { lines: "Add at least one line." } };
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const priorReceived = new Map();
  for (const d of procurement.deliveries || []) {
    for (const l of d.lines || []) {
      priorReceived.set(l.itemName, (priorReceived.get(l.itemName) || 0) + Number(l.receivedQuantity || 0));
    }
  }

  const lineRows = [];
  for (const raw of linesIn) {
    const itemName = typeof raw?.itemName === "string" ? raw.itemName.trim() : "";
    const qty = Number(raw?.receivedQuantity);
    const reqItem = reqItems.find((i) => i.itemName === itemName);
    if (!reqItem) {
      fieldErrors.lines = `"${itemName}" is not a line item on this procurement's requisition.`;
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      fieldErrors.lines = `Enter a valid received quantity for "${itemName}".`;
      continue;
    }
    const already = priorReceived.get(itemName) || 0;
    const ordered = Number(reqItem.quantity);
    if (already + qty > ordered + 0.009) {
      fieldErrors.lines = `Received quantity for "${itemName}" (${already + qty}) exceeds ordered quantity (${ordered}).`;
      continue;
    }
    const dispatched = Number(dispatchedByItem.get(itemName) || 0);
    if (qty > dispatched + 0.009) {
      fieldErrors.lines = `"${itemName}": only ${dispatched} dispatched on ${deliveryNote.noteNumber}.`;
      continue;
    }
    lineRows.push({
      itemName,
      orderedQuantity: reqItem.quantity,
      receivedQuantity: new Prisma.Decimal(qty.toFixed(2)),
      unitOfMeasure: reqItem.unitOfMeasure || null,
    });
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Please fix the highlighted delivery lines.", fieldErrors, status: 400 };
  }

  let fullyDelivered = true;
  for (const item of reqItems) {
    const already = priorReceived.get(item.itemName) || 0;
    const thisDelivery = lineRows.find((l) => l.itemName === item.itemName);
    const total = already + Number(thisDelivery?.receivedQuantity || 0);
    if (total + 0.009 < Number(item.quantity)) fullyDelivered = false;
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.projectOrgDelivery.create({
      data: {
        projectId: opts.projectId,
        procurementId: procurement.id,
        status: fullyDelivered ? OrgDeliveryStatus.COMPLETE : OrgDeliveryStatus.PARTIAL,
        deliveryDate,
        recordedByOrgUserId: opts.actorOrgUserId,
        deliveryAddress: order.deliveryAddress || null,
        remarks: typeof opts.remarks === "string" ? opts.remarks.trim() || null : null,
        lines: { create: lineRows },
      },
      include: deliveryInclude,
    });
    if (deliveryNote) {
      const linked = await tx.projectOrgDeliveryNote.updateMany({
        where: { id: deliveryNote.id, status: "SUBMITTED" },
        data: { status: "RECEIVED", deliveryId: created.id },
      });
      if (linked.count !== 1) throw new Error("NOTE_ALREADY_RECEIVED");
    }
    await tx.projectOrgProcurement.update({
      where: { id: procurement.id },
      data: { status: OrgProcurementStatus.DELIVERY },
    });
    return created;
  }).catch((e) => {
    if (e instanceof Error && e.message === "NOTE_ALREADY_RECEIVED") return null;
    throw e;
  });
  if (!row) return { ok: false, error: "This delivery note has already been received.", status: 409 };

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: order.supplierId,
    procurementId: procurement.id,
    title: `Goods received: ${procurement.procurementNumber}`,
    body: `${fullyDelivered ? "Full" : "Partial"} delivery received against ${order.number}${
      deliveryNote ? ` (delivery note ${deliveryNote.noteNumber})` : ""
    }. Awaiting inspection.`,
    relatedEntityType: "delivery",
    relatedEntityId: row.id,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DELIVERY_RECORDED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      deliveryId: row.id,
      deliveryNoteId: deliveryNote?.id || null,
      status: row.status,
      lineCount: lineRows.length,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, delivery: serializeDelivery(row) };
}

/**
 * Record inspection/acceptance results for a delivery. Accepted + rejected must
 * sum to no more than the received quantity for each line.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   deliveryId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   resultNotes?: string | null;
 *   lineDecisions: { lineId: string; acceptedQuantity: string | number; rejectedQuantity: string | number }[];
 * }} opts
 */
export async function recordInspection(prisma, opts) {
  const delivery = await prisma.projectOrgDelivery.findFirst({
    where: { id: opts.deliveryId, projectId: opts.projectId },
    include: { lines: true, inspection: true },
  });
  if (!delivery) return { ok: false, error: "Delivery not found.", status: 404 };
  if (delivery.inspection?.status && delivery.inspection.status !== OrgInspectionStatus.PENDING) {
    return { ok: false, error: "This delivery has already been inspected.", status: 400 };
  }

  const decisions = Array.isArray(opts.lineDecisions) ? opts.lineDecisions : [];
  if (decisions.length === 0) {
    return { ok: false, error: "Record an accept/reject decision for at least one line.", status: 400 };
  }

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const updates = [];
  for (const d of decisions) {
    const line = delivery.lines.find((l) => l.id === d.lineId);
    if (!line) {
      fieldErrors.lineDecisions = "One or more delivery lines were not found.";
      continue;
    }
    const accepted = Number(d.acceptedQuantity) || 0;
    const rejected = Number(d.rejectedQuantity) || 0;
    if (accepted < 0 || rejected < 0) {
      fieldErrors.lineDecisions = "Quantities cannot be negative.";
      continue;
    }
    if (Math.abs(accepted + rejected - Number(line.receivedQuantity)) > 0.009) {
      fieldErrors.lineDecisions = `Accepted + rejected for "${line.itemName}" must equal the received quantity.`;
      continue;
    }
    updates.push({ id: line.id, accepted, rejected });
  }
  if (!Object.keys(fieldErrors).length && updates.length !== delivery.lines.length) {
    fieldErrors.lineDecisions = "Record a decision for every received line.";
  }
  const resultNotes = typeof opts.resultNotes === "string" ? opts.resultNotes.trim() : "";
  if (updates.some((u) => u.rejected > 0) && !resultNotes) {
    fieldErrors.inspectionNotes = "Enter the reason for rejection.";
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Please fix the highlighted inspection decisions.", fieldErrors, status: 400 };
  }

  let allAccepted = true;
  let anyAccepted = false;
  for (const u of updates) {
    if (u.accepted > 0) anyAccepted = true;
    if (u.rejected > 0) allAccepted = false;
  }
  const inspectionStatus = allAccepted
    ? OrgInspectionStatus.ACCEPTED
    : anyAccepted
      ? OrgInspectionStatus.PARTIAL
      : OrgInspectionStatus.REJECTED;

  const updated = await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.projectOrgDeliveryLine.update({
        where: { id: u.id },
        data: {
          acceptedQuantity: new Prisma.Decimal(u.accepted.toFixed(2)),
          rejectedQuantity: new Prisma.Decimal(u.rejected.toFixed(2)),
        },
      });
    }
    await tx.projectOrgInspection.upsert({
      where: { deliveryId: delivery.id },
      create: {
        projectId: opts.projectId,
        deliveryId: delivery.id,
        status: inspectionStatus,
        resultNotes: typeof opts.resultNotes === "string" ? opts.resultNotes.trim() || null : null,
        inspectedAt: new Date(),
        inspectedByOrgUserId: opts.actorOrgUserId,
        committeeId: typeof opts.committeeId === "string" ? opts.committeeId.trim() || null : null,
        committeeRole:
          typeof opts.committeeRole === "string" ? opts.committeeRole.trim() || null : null,
      },
      update: {
        status: inspectionStatus,
        resultNotes: typeof opts.resultNotes === "string" ? opts.resultNotes.trim() || null : undefined,
        inspectedAt: new Date(),
        inspectedByOrgUserId: opts.actorOrgUserId,
        committeeId:
          typeof opts.committeeId === "string" ? opts.committeeId.trim() || null : undefined,
        committeeRole:
          typeof opts.committeeRole === "string" ? opts.committeeRole.trim() || null : undefined,
      },
    });
    if (inspectionStatus !== OrgInspectionStatus.REJECTED) {
      await tx.projectOrgProcurement.update({
        where: { id: delivery.procurementId },
        data: { status: OrgProcurementStatus.INVOICING },
      });
    } else {
      await tx.projectOrgProcurement.update({
        where: { id: delivery.procurementId },
        data: { status: OrgProcurementStatus.INSPECTION },
      });
    }
    return tx.projectOrgDelivery.findUnique({ where: { id: delivery.id }, include: deliveryInclude });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DELIVERY_INSPECTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: delivery.procurementId,
      deliveryId: delivery.id,
      inspectionStatus,
      committeeId: typeof opts.committeeId === "string" ? opts.committeeId : null,
      committeeRole: typeof opts.committeeRole === "string" ? opts.committeeRole : null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const officer = await prisma.projectOrgProcurement.findUnique({
    where: { id: delivery.procurementId },
    select: { officer: { select: { id: true, linkedUserId: true } } },
  });
  if (officer?.officer) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: [officer.officer],
      type: inspectionStatus === OrgInspectionStatus.REJECTED ? OrgNotificationType.WORKFLOW_REJECTED : OrgNotificationType.WORKFLOW_APPROVED,
      title: `Delivery inspection: ${inspectionStatus}`,
      body:
        inspectionStatus === OrgInspectionStatus.REJECTED
          ? "The delivery was rejected on inspection. Coordinate a re-delivery with the supplier."
          : "The delivery passed inspection. You may now raise an invoice.",
      linkUrl: `/projects/${opts.projectId}/procurements/${delivery.procurementId}`,
      relatedEntityType: "delivery",
      relatedEntityId: delivery.id,
    });
  }

  const order = await getActiveOrderValue(prisma, opts.projectId, delivery.procurementId);
  const inspectionCopy = {
    [OrgInspectionStatus.ACCEPTED]: "accepted. You can now submit your invoice.",
    [OrgInspectionStatus.PARTIAL]: "partly accepted. You can invoice the accepted quantities.",
    [OrgInspectionStatus.REJECTED]: "rejected on inspection. Contact the procurement office about re-delivery.",
  };
  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: order?.supplierId,
    procurementId: delivery.procurementId,
    title: `Delivery ${inspectionStatus === OrgInspectionStatus.REJECTED ? "rejected" : "accepted"}${order?.number ? `: ${order.number}` : ""}`,
    body: `Your delivery was ${inspectionCopy[inspectionStatus] || "inspected."}${
      typeof opts.resultNotes === "string" && opts.resultNotes.trim() ? ` ${opts.resultNotes.trim()}` : ""
    }`,
    relatedEntityType: "delivery",
    relatedEntityId: delivery.id,
  });

  return { ok: true, delivery: serializeDelivery(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function listDeliveries(prisma, projectId, procurementId) {
  const rows = await prisma.projectOrgDelivery.findMany({
    where: { projectId, procurementId },
    orderBy: { createdAt: "asc" },
    include: deliveryInclude,
  });
  return rows.map(serializeDelivery);
}

/**
 * Whether at least one delivery for this procurement has passed inspection
 * (ACCEPTED or PARTIAL) — a prerequisite for invoicing.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function hasAcceptedDelivery(prisma, projectId, procurementId) {
  const count = await prisma.projectOrgDelivery.count({
    where: {
      projectId,
      procurementId,
      inspection: { status: { in: [OrgInspectionStatus.ACCEPTED, OrgInspectionStatus.PARTIAL] } },
    },
  });
  return count > 0;
}
