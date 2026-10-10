import { OrgOfferStatus, OrgSolicitationStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { offersLockedByDecision } from "@/lib/projects/solicitations";

const ISSUED_STATUSES = [
  OrgSolicitationStatus.ISSUED,
  OrgSolicitationStatus.ADVERTISED,
  OrgSolicitationStatus.OPEN,
  OrgSolicitationStatus.CLOSED,
];
const LIVE_OFFER_STATUSES = [OrgOfferStatus.SUBMITTED, OrgOfferStatus.OPENED];

/** @param {any} row */
export function serializeClarification(row) {
  return {
    id: row.id,
    offerId: row.offerId,
    supplierId: row.supplierId,
    question: row.question,
    askedByName: row.askedByName || null,
    askedByRole: row.askedByRole || null,
    askedAt: row.askedAt,
    response: row.response || null,
    responseSource: row.responseSource || null,
    respondedAt: row.respondedAt || null,
  };
}

/**
 * Clarifications stay open after closing until evaluation starts (report or award decision).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {any} offer with `solicitation`
 */
export async function clarificationWindowOpen(prisma, offer) {
  const sol = offer.solicitation;
  if (!LIVE_OFFER_STATUSES.includes(offer.status) || !sol || !ISSUED_STATUSES.includes(sol.status)) return false;
  return !(await offersLockedByDecision(prisma, offer.procurementId));
}

/**
 * Whether the procurement is at a stage where officers may ask offer clarifications.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} procurementId
 */
export async function procurementClarificationsOpen(prisma, procurementId) {
  const sol = await prisma.projectOrgSolicitation.findFirst({
    where: { procurementId, status: { in: ISSUED_STATUSES } },
    select: { id: true },
  });
  if (!sol) return false;
  return !(await offersLockedByDecision(prisma, procurementId));
}

/**
 * Officer asks a provider to clarify its quotation / bid; the provider answers in the portal.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; offerId: unknown; question: unknown; actorOrgUserId: string | null; actorRoleName: string }} opts
 */
export async function askOfferClarification(prisma, opts) {
  const offerId = typeof opts.offerId === "string" ? opts.offerId.trim() : "";
  const question = typeof opts.question === "string" ? opts.question.trim() : "";
  if (question.length < 5) {
    return { ok: false, error: "Enter the question.", status: 400, fieldErrors: { question: "Enter the question." } };
  }
  if (question.length > 1000) {
    return { ok: false, error: "Keep the question under 1000 characters.", status: 400, fieldErrors: { question: "Too long." } };
  }
  const offer = offerId
    ? await prisma.projectOrgOffer.findFirst({
        where: { id: offerId, projectId: opts.projectId, procurementId: opts.procurementId },
        include: {
          solicitation: true,
          supplier: { select: { id: true, name: true } },
        },
      })
    : null;
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (!(await clarificationWindowOpen(prisma, offer))) {
    return { ok: false, error: "Clarifications close once evaluation starts.", status: 400 };
  }
  const open = await prisma.projectOrgOfferClarification.count({ where: { offerId: offer.id, respondedAt: null } });
  if (open) return { ok: false, error: "Wait for the provider to answer the open question.", status: 400 };

  const asker = opts.actorOrgUserId
    ? await prisma.projectOrgUser.findFirst({
        where: { id: opts.actorOrgUserId },
        select: { firstName: true, lastName: true },
      })
    : null;
  const created = await prisma.projectOrgOfferClarification.create({
    data: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      offerId: offer.id,
      supplierId: offer.supplierId,
      question,
      askedByName: asker ? `${asker.firstName} ${asker.lastName}`.trim() : null,
      askedByRole: opts.actorRoleName || null,
    },
  });

  const baseMeta = {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    offerId: offer.id,
    supplierId: offer.supplierId,
    clarificationId: created.id,
  };
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_OFFER_CLARIFICATION_REQUESTED,
    actorUserId: null,
    meta: { ...baseMeta, comment: question, actorOrgUserId: opts.actorOrgUserId, actorRoleName: opts.actorRoleName },
  });
  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: offer.supplierId,
    title: "Clarification requested",
    body: `The procuring entity asked about your offer for "${offer.solicitation?.title || "the request"}": ${question} You can answer and revise your offer until evaluation starts.`,
    linkUrl: offer.solicitationId ? `/provider-portal/opportunities/${offer.solicitationId}` : null,
    relatedEntityType: "offer",
    relatedEntityId: offer.id,
  });
  return { ok: true, clarification: serializeClarification(created) };
}

/**
 * Provider answers an open clarification from the portal.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; clarificationId: string; response: unknown }} opts
 */
export async function answerOfferClarification(prisma, opts) {
  const response = typeof opts.response === "string" ? opts.response.trim() : "";
  if (response.length < 2) {
    return { ok: false, error: "Enter your answer.", status: 400, fieldErrors: { response: "Enter your answer." } };
  }
  if (response.length > 2000) {
    return { ok: false, error: "Keep the answer under 2000 characters.", status: 400, fieldErrors: { response: "Too long." } };
  }
  const row = await prisma.projectOrgOfferClarification.findFirst({
    where: { id: opts.clarificationId, projectId: opts.projectId, supplierId: opts.providerId },
    include: { offer: { include: { solicitation: true } } },
  });
  if (!row) return { ok: false, error: "Not found.", status: 404 };
  if (row.respondedAt) return { ok: false, error: "This question is already answered.", status: 400 };
  if (!(await clarificationWindowOpen(prisma, row.offer))) {
    return { ok: false, error: "Evaluation has started.", status: 400 };
  }
  const updated = await prisma.projectOrgOfferClarification.update({
    where: { id: row.id },
    data: { response, responseSource: "PORTAL", respondedAt: new Date() },
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_OFFER_CLARIFICATION_ANSWERED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      offerId: row.offerId,
      supplierId: opts.providerId,
      clarificationId: row.id,
      source: "PORTAL",
      actorRoleName: "Provider (portal)",
      comment: response,
    },
  });
  return { ok: true, clarification: serializeClarification(updated), procurementId: row.procurementId, offer: row.offer };
}
