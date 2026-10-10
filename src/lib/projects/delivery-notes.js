import { OrgWorkflowTaskStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

/** @param {any} row */
export function serializeDeliveryNote(row) {
  if (!row) return null;
  const lines = Array.isArray(row.lines) ? row.lines : [];
  return {
    id: row.id,
    procurementId: row.procurementId,
    noteNumber: row.noteNumber,
    dispatchedAt: row.dispatchedAt,
    deliveredBy: row.deliveredBy || null,
    vehicleNumber: row.vehicleNumber || null,
    remarks: row.remarks || null,
    status: row.status,
    deliveryId: row.deliveryId || null,
    supplier: row.supplier ? { id: row.supplier.id, name: row.supplier.name } : null,
    lines: lines.map((l) => ({
      itemName: String(l?.itemName || ""),
      quantity: String(l?.quantity ?? ""),
      unitOfMeasure: l?.unitOfMeasure || null,
    })),
    createdAt: row.createdAt,
  };
}

/**
 * Quantities still to deliver per requisition line (ordered minus already received).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function outstandingDeliveryLines(prisma, opts) {
  const proc = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: {
      requisition: {
        select: {
          items: {
            orderBy: { lineNumber: "asc" },
            select: { itemName: true, description: true, quantity: true, unitOfMeasure: true },
          },
        },
      },
      deliveries: { select: { lines: { select: { itemName: true, receivedQuantity: true } } } },
    },
  });
  if (!proc) return null;
  const received = new Map();
  for (const d of proc.deliveries) {
    for (const l of d.lines) {
      received.set(l.itemName, (received.get(l.itemName) || 0) + Number(l.receivedQuantity || 0));
    }
  }
  return (proc.requisition?.items || []).map((i) => {
    const ordered = Number(i.quantity || 0);
    const got = received.get(i.itemName) || 0;
    return {
      itemName: i.itemName,
      description: i.description || null,
      unitOfMeasure: i.unitOfMeasure || null,
      ordered,
      received: got,
      outstanding: Math.max(0, Math.round((ordered - got) * 100) / 100),
    };
  });
}

/**
 * Why goods cannot move against this order yet, or null when the provider may dispatch.
 * @param {{ kind: string; status?: string } | null} order
 */
export function orderNotOpenForDelivery(order) {
  if (!order) return "No active order yet.";
  if (order.kind === "purchase_instruction" && order.status !== "ACCEPTED") {
    return "Waiting for the provider to accept the purchase instruction.";
  }
  if (order.kind === "lpo" && order.status !== "ACCEPTED") return "Waiting for the provider to accept the LPO.";
  if (order.kind === "contract" && order.status !== "ACTIVE") {
    return order.status === "ISSUED"
      ? "Waiting for the provider to accept the contract."
      : "The contract has not been issued yet.";
  }
  return null;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} procurementId
 * @param {string} procurementNumber
 */
async function nextNoteNumber(prisma, procurementId, procurementNumber) {
  const count = await prisma.projectOrgDeliveryNote.count({ where: { procurementId } });
  return `DN-${procurementNumber}-${String(count + 1).padStart(2, "0")}`.slice(0, 48);
}

/**
 * Provider dispatches goods against an accepted order. The user department can only
 * confirm receipt against a submitted note, prefilled from it.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   providerId: string;
 *   body: any;
 * }} opts
 */
export async function submitDeliveryNote(prisma, opts) {
  const body = opts.body || {};
  const order = await getActiveOrderValue(prisma, opts.projectId, opts.procurementId);
  if (!order || order.supplierId !== opts.providerId) {
    return { ok: false, status: 404, error: "No order to deliver against." };
  }
  const notOpen = orderNotOpenForDelivery(order);
  if (notOpen) return { ok: false, status: 400, error: notOpen };
  const open = await prisma.projectOrgDeliveryNote.count({
    where: { procurementId: opts.procurementId, status: "SUBMITTED" },
  });
  if (open > 0) {
    return { ok: false, status: 409, error: "Your last delivery note is still waiting to be received." };
  }

  const outstanding = await outstandingDeliveryLines(prisma, opts);
  if (!outstanding) return { ok: false, status: 404, error: "Procurement not found." };

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const rawDate = String(body.dispatchedAt ?? "").trim();
  const dispatchedAt = rawDate ? parseDateInputValue(rawDate) : new Date();
  if (!dispatchedAt) fieldErrors.dispatchedAt = "Enter a valid date.";
  else if (toDateInputValue(dispatchedAt) > toDateInputValue(new Date())) {
    fieldErrors.dispatchedAt = "Date cannot be in the future.";
  }

  const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";
  if (remarks.length > 2000) fieldErrors.remarks = "Max 2000 characters.";
  const deliveredBy = typeof body.deliveredBy === "string" ? body.deliveredBy.trim() : "";
  if (!deliveredBy) fieldErrors.deliveredBy = "Enter who is delivering.";
  else if (deliveredBy.length > 160) fieldErrors.deliveredBy = "Max 160 characters.";
  const vehicleNumber = typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim().toUpperCase() : "";
  if (vehicleNumber.length > 32) fieldErrors.vehicleNumber = "Max 32 characters.";

  const linesIn = Array.isArray(body.lines) ? body.lines : [];
  const lines = [];
  for (const raw of linesIn) {
    const itemName = typeof raw?.itemName === "string" ? raw.itemName.trim() : "";
    const qtyRaw = String(raw?.quantity ?? "").trim();
    if (!qtyRaw) continue;
    const qty = Number(qtyRaw);
    const line = outstanding.find((l) => l.itemName === itemName);
    if (!line) {
      fieldErrors[`line:${itemName}`] = "Not on this order.";
      continue;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      fieldErrors[`line:${itemName}`] = "Enter a valid quantity.";
      continue;
    }
    if (qty === 0) continue;
    if (qty > line.outstanding + 0.009) {
      fieldErrors[`line:${itemName}`] = `Max ${line.outstanding}.`;
      continue;
    }
    lines.push({ itemName, quantity: qty.toFixed(2), unitOfMeasure: line.unitOfMeasure });
  }
  if (!lines.length && !Object.keys(fieldErrors).some((k) => k.startsWith("line:"))) {
    fieldErrors.lines = "Enter at least one quantity.";
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, status: 400, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const proc = await prisma.projectOrgProcurement.findUniqueOrThrow({
    where: { id: opts.procurementId },
    select: {
      id: true,
      procurementNumber: true,
      officerOrgUserId: true,
      instances: {
        where: { status: { in: ["ACTIVE", "IN_PROGRESS"] } },
        select: { id: true },
      },
    },
  });
  const supplier = await prisma.projectOrgProvider.findUnique({
    where: { id: opts.providerId },
    select: { id: true, name: true },
  });

  const note = await prisma.projectOrgDeliveryNote.create({
    data: {
      projectId: opts.projectId,
      procurementId: proc.id,
      supplierId: opts.providerId,
      noteNumber: await nextNoteNumber(prisma, proc.id, proc.procurementNumber),
      dispatchedAt: /** @type {Date} */ (dispatchedAt),
      deliveredBy: deliveredBy || null,
      vehicleNumber: vehicleNumber || null,
      remarks: remarks || null,
      lines,
    },
    include: { supplier: { select: { id: true, name: true } } },
  });

  const providerLabel = supplier?.name || "Provider";
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DELIVERY_NOTE_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: proc.id,
      deliveryNoteId: note.id,
      noteNumber: note.noteNumber,
      supplierId: opts.providerId,
      actorName: providerLabel,
      actorRoleName: "Provider",
      lineCount: lines.length,
      remarks: remarks || null,
    },
  });

  const instanceIds = proc.instances.map((i) => i.id);
  const receivers = instanceIds.length
    ? await prisma.projectOrgWorkflowTask.findMany({
        where: {
          instanceId: { in: instanceIds },
          status: OrgWorkflowTaskStatus.PENDING,
          assigneeOrgUserId: { not: null },
        },
        select: { assignee: { select: { id: true, linkedUserId: true } } },
      })
    : [];
  const recipients = receivers.map((t) => t.assignee).filter(Boolean);
  if (proc.officerOrgUserId) {
    const officer = await prisma.projectOrgUser.findUnique({
      where: { id: proc.officerOrgUserId },
      select: { id: true, linkedUserId: true },
    });
    if (officer) recipients.push(officer);
  }
  try {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients,
      type: OrgNotificationType.WORKFLOW_TASK,
      title: "Goods dispatched",
      body: `${providerLabel} sent delivery note ${note.noteNumber} for ${proc.procurementNumber}. Confirm receipt.`,
      linkUrl: `/projects/${opts.projectId}/procurements/${proc.id}`,
      relatedEntityType: "procurement",
      relatedEntityId: proc.id,
    });
  } catch {
    // Best-effort.
  }

  return { ok: true, deliveryNote: serializeDeliveryNote(note) };
}
