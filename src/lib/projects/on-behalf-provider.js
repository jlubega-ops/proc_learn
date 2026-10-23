/**
 * Study shortcuts: officer accept / quick-submit as the provider, same status as the portal.
 * Always marks source/responseSource OFFICER so UIs show "Generated".
 */
import { getLatestAward, respondToAward } from "@/lib/projects/awards";
import { respondToOrder } from "@/lib/projects/contracts-lpo";
import { respondToPurchaseInstruction } from "@/lib/projects/purchase-instructions";
import { submitDeliveryNote } from "@/lib/projects/delivery-notes";
import { createInvoice, INVOICE_SOURCE } from "@/lib/projects/invoices";
import { answerOfferClarification } from "@/lib/projects/offer-clarifications";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function resolveAwardSupplierId(prisma, projectId, procurementId) {
  const award = await getLatestAward(prisma, projectId, procurementId);
  return award?.supplierId || award?.supplier?.id || null;
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   body?: any;
 * }} opts
 */
export async function onBehalfAcceptAward(prisma, opts) {
  const providerId = await resolveAwardSupplierId(prisma, opts.projectId, opts.procurementId);
  if (!providerId) return { ok: false, error: "No award to accept.", status: 400 };
  const acceptedByName =
    typeof opts.body?.acceptedByName === "string" && opts.body.acceptedByName.trim()
      ? opts.body.acceptedByName.trim()
      : "Accepted on behalf of provider";
  return respondToAward(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    providerId,
    responseSource: "OFFICER",
    body: { decision: "ACCEPT", acceptedByName },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; procurementId: string; body?: any }} opts
 */
export async function onBehalfAcceptPurchaseInstruction(prisma, opts) {
  const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: { projectId: opts.projectId, procurementId: opts.procurementId },
    select: { supplierId: true, status: true },
  });
  if (!pi) return { ok: false, error: "No purchase instruction to accept.", status: 400 };
  if (pi.status !== "ISSUED") {
    return { ok: false, error: "This purchase instruction is not awaiting acceptance.", status: 409 };
  }
  const acceptedByName =
    typeof opts.body?.acceptedByName === "string" && opts.body.acceptedByName.trim()
      ? opts.body.acceptedByName.trim()
      : "Accepted on behalf of provider";
  return respondToPurchaseInstruction(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    providerId: pi.supplierId,
    responseSource: "OFFICER",
    body: { decision: "ACCEPT", acceptedByName },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; procurementId: string; body?: any }} opts
 */
export async function onBehalfAcceptOrder(prisma, opts) {
  const where = { projectId: opts.projectId, procurementId: opts.procurementId };
  const [contract, lpo] = await Promise.all([
    prisma.projectOrgContract.findFirst({
      where: { ...where, status: "ISSUED" },
      orderBy: { createdAt: "desc" },
      select: { supplierId: true },
    }),
    prisma.projectOrgLpo.findFirst({
      where: { ...where, status: "ISSUED" },
      orderBy: { createdAt: "desc" },
      select: { supplierId: true },
    }),
  ]);
  const providerId = contract?.supplierId || lpo?.supplierId || null;
  if (!providerId) {
    return { ok: false, error: "No issued LPO or contract awaiting acceptance.", status: 400 };
  }
  const acceptedByName =
    typeof opts.body?.acceptedByName === "string" && opts.body.acceptedByName.trim()
      ? opts.body.acceptedByName.trim()
      : "Accepted on behalf of provider";
  return respondToOrder(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    providerId,
    responseSource: "OFFICER",
    body: { decision: "ACCEPT", acceptedByName },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; procurementId: string; body?: any }} opts
 */
export async function onBehalfSubmitDeliveryNote(prisma, opts) {
  const order = await getActiveOrderValue(prisma, opts.projectId, opts.procurementId);
  if (!order?.supplierId) {
    return { ok: false, error: "No accepted order to deliver against.", status: 400 };
  }
  return submitDeliveryNote(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    providerId: order.supplierId,
    source: "OFFICER",
    body: opts.body || {},
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   body?: any;
 * }} opts
 */
export async function onBehalfSubmitInvoice(prisma, opts) {
  const order = await getActiveOrderValue(prisma, opts.projectId, opts.procurementId);
  if (!order?.supplierId) {
    return { ok: false, error: "No active order for an invoice.", status: 400 };
  }
  const body = opts.body || {};
  return createInvoice(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    amount: body.amount,
    invoiceDate: body.invoiceDate || null,
    deliveryId: body.deliveryId || null,
    supplierReference: typeof body.supplierReference === "string" ? body.supplierReference : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    source: INVOICE_SOURCE.OFFICER,
    allowOfficerShortcut: true,
    portalProviderId: order.supplierId,
  });
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId: string; body?: any }} opts
 */
export async function onBehalfAnswerClarification(prisma, opts) {
  const clarificationId =
    typeof opts.body?.clarificationId === "string" ? opts.body.clarificationId.trim() : "";
  if (!clarificationId) {
    return { ok: false, error: "clarificationId is required.", status: 400 };
  }
  const row = await prisma.projectOrgOfferClarification.findFirst({
    where: { id: clarificationId, projectId: opts.projectId },
    select: { supplierId: true },
  });
  if (!row) return { ok: false, error: "Clarification not found.", status: 404 };
  return answerOfferClarification(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    clarificationId,
    response: opts.body?.response,
    responseSource: "OFFICER",
  });
}
