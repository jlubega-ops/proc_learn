import {
  OrgOfferStatus,
  OrgOfferType,
  OrgProviderStatus,
  OrgSolicitationStatus,
  OrgSolicitationType,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { PROVIDER_BEHAVIOUR, providerConductIssues } from "@/lib/projects/provider-behaviours";
import { normalizeProviderCategories, normalizeProviderCategory } from "@/lib/projects/provider-terms";
import {
  findSolicitationForProcurement,
  loadOfferItems,
  offersLockedByDecision,
} from "@/lib/projects/solicitations";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { getActiveOrderValue } from "@/lib/projects/contracts-lpo";
import { acceptedShareOfOrder, createInvoice, INVOICE_SOURCE } from "@/lib/projects/invoices";

export const OFFER_SOURCE = Object.freeze({ OFFICER: "OFFICER", PORTAL: "PORTAL", AUTO: "AUTO" });

const FALLBACK_ESTIMATE = 1_000_000;
const RECEIVING_STATUSES = [OrgSolicitationStatus.ISSUED, OrgSolicitationStatus.ADVERTISED, OrgSolicitationStatus.OPEN];

/**
 * @param {number} min
 * @param {number} max
 */
function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * @param {number} value
 */
function roundToThousand(value) {
  return Math.max(1000, Math.round(value / 1000) * 1000);
}

/**
 * How a provider's conduct shapes its quotation. Issues combine (e.g. high prices
 * and late). Price ranges overlap so the cheapest provider changes between runs;
 * cheaper profiles tend to deliver slower.
 * @param {{ behaviour?: string | null; conductIssues?: unknown } | null} provider
 * @returns {{ factor: [number, number]; deliveryDays: [number, number]; respondChance: number; late: boolean }}
 */
function quoteProfile(provider) {
  const issues = providerConductIssues(provider);
  const profiled = Boolean(provider?.behaviour) || Array.isArray(provider?.conductIssues);
  /** @type {[number, number]} */
  let factor = profiled ? [0.82, 0.98] : [0.9, 1.12];
  /** @type {[number, number]} */
  let deliveryDays = profiled ? [7, 21] : [10, 30];
  if (issues.has(PROVIDER_BEHAVIOUR.POOR_DELIVERY)) {
    factor = [0.78, 0.92];
    deliveryDays = [30, 60];
  }
  if (issues.has(PROVIDER_BEHAVIOUR.COMPLIANT_EXPENSIVE)) {
    factor = [1.12, 1.35];
    if (!issues.has(PROVIDER_BEHAVIOUR.POOR_DELIVERY)) deliveryDays = [5, 14];
  }
  return {
    factor,
    deliveryDays,
    respondChance: issues.has(PROVIDER_BEHAVIOUR.NON_RESPONSIVE) ? 0.15 : 1,
    late: issues.has(PROVIDER_BEHAVIOUR.LATE_SUBMITTER),
  };
}

const QUOTE_VALIDITY_DAYS = [30, 60, 90];

/**
 * @param {number} value
 * @param {number} step
 */
function roundTo(value, step) {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Requisition context a quotation is priced against.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
async function loadQuoteContext(prisma, opts) {
  const [procurement, items] = await Promise.all([
    prisma.projectOrgProcurement.findFirst({
      where: { id: opts.procurementId, projectId: opts.projectId },
      select: { requisition: { select: { estimatedTotalValue: true, category: true } } },
    }),
    loadOfferItems(prisma, opts.procurementId),
  ]);
  return {
    estimate: Number(procurement?.requisition?.estimatedTotalValue || 0) || FALLBACK_ESTIMATE,
    category: normalizeProviderCategory(procurement?.requisition?.category),
    items,
  };
}

/**
 * A quotation in the provider's character: priced lines, total, delivery period and terms.
 * @param {{ behaviour?: string | null; conductIssues?: unknown } | null} provider
 * @param {{ estimate: number; items: { lineNumber: number; itemName: string; quantity: number; unitOfMeasure: string | null; estimatedUnitPrice: number }[] }} ctx
 */
export function buildQuoteDraft(provider, ctx) {
  const profile = quoteProfile(provider);
  const factor = randBetween(profile.factor[0], profile.factor[1]);
  const deliveryDays = Math.round(randBetween(profile.deliveryDays[0], profile.deliveryDays[1]));
  const validity = QUOTE_VALIDITY_DAYS[Math.floor(Math.random() * QUOTE_VALIDITY_DAYS.length)];
  const remarks = `Prices inclusive of all taxes and delivery to the stated location. Quotation valid for ${validity} days.`;

  const priceable = ctx.items.filter((i) => i.quantity > 0 && i.estimatedUnitPrice > 0);
  if (priceable.length === ctx.items.length && ctx.items.length) {
    const lineItems = ctx.items.map((i) => {
      const unitPrice = roundTo(i.estimatedUnitPrice * factor * randBetween(0.94, 1.06), 50);
      return {
        lineNumber: i.lineNumber,
        itemName: i.itemName,
        quantity: i.quantity,
        unitOfMeasure: i.unitOfMeasure,
        unitPrice,
        total: Math.round(unitPrice * i.quantity * 100) / 100,
      };
    });
    const amount = Math.round(lineItems.reduce((s, l) => s + l.total, 0) * 100) / 100;
    return { amount, deliveryDays, remarks, lineItems };
  }
  return { amount: roundToThousand(ctx.estimate * factor), deliveryDays, remarks, lineItems: [] };
}

/**
 * Pre-filled quotation for a provider opening the portal form.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; providerId: string }} opts
 */
export async function draftQuoteForProvider(prisma, opts) {
  const [ctx, provider] = await Promise.all([
    loadQuoteContext(prisma, opts),
    prisma.projectOrgProvider.findFirst({
      where: { id: opts.providerId, projectId: opts.projectId },
      select: { behaviour: true, conductIssues: true },
    }),
  ]);
  return buildQuoteDraft(provider, ctx);
}

/**
 * Providers who may answer this solicitation: the invite list for an RFQ, active
 * providers in the requisition category for an open tender.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; solicitation: any; category: string | null }} p
 */
export async function solicitationResponders(prisma, p) {
  if (p.solicitation.solicitationType === OrgSolicitationType.RFQ) {
    return (p.solicitation.invites || [])
      .map((i) => i.supplier)
      .filter((s) => s && s.status === OrgProviderStatus.ACTIVE);
  }
  const active = await prisma.projectOrgProvider.findMany({
    where: { projectId: p.projectId, status: OrgProviderStatus.ACTIVE },
    orderBy: { name: "asc" },
  });
  return p.category ? active.filter((s) => normalizeProviderCategories(s.categories).includes(p.category)) : active;
}

/**
 * Receive-step panel: every provider who may answer, and who was recorded as no response.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function loadQuotePool(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: { procurementMethod: true, requisition: { select: { category: true } } },
  });
  if (!procurement) return null;
  const solicitationType =
    procurement.procurementMethod === "TENDER" ? OrgSolicitationType.TENDER : OrgSolicitationType.RFQ;
  const solicitation = await findSolicitationForProcurement(prisma, { ...opts, solicitationType });
  if (!solicitation) return null;
  const pool = await solicitationResponders(prisma, {
    projectId: opts.projectId,
    solicitation,
    category: normalizeProviderCategory(procurement.requisition?.category),
  });
  const noResponse = new Map(
    (solicitation.invites || []).filter((i) => i.noResponseAt).map((i) => [i.supplierId, i.noResponseAt]),
  );
  const accepting =
    RECEIVING_STATUSES.includes(solicitation.status) &&
    (!solicitation.closingDate || solicitation.closingDate.getTime() > Date.now()) &&
    !(await offersLockedByDecision(prisma, opts.procurementId));
  const offers = await prisma.projectOrgOffer.findMany({
    where: { solicitationId: solicitation.id, status: { not: OrgOfferStatus.WITHDRAWN } },
    select: { supplierId: true, status: true },
  });
  const offered = new Set(offers.map((o) => o.supplierId));
  const awaiting = pool.filter((s) => !offered.has(s.id) && !noResponse.has(s.id)).length;
  const valid = offers.filter((o) => o.status !== OrgOfferStatus.LATE).length;
  const word = solicitationType === OrgSolicitationType.RFQ ? "quotation" : "bid";

  /** @type {string[]} */
  const blockers = [];
  if (accepting && awaiting > 0) {
    blockers.push(`${awaiting} awaiting — record every answer or wait for the closing date.`);
  }
  if (valid === 0) blockers.push(`Record at least one valid ${word}.`);

  return {
    accepting,
    providers: pool.map((s) => ({ id: s.id, name: s.name, noResponseAt: noResponse.get(s.id) || null })),
    awaiting,
    valid,
    ready: blockers.length === 0,
    blockers,
  };
}

/**
 * Who has answered: active or late offers, and invites marked as no response.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {any} solicitation
 */
async function answeredSupplierIds(prisma, solicitation) {
  const offers = await prisma.projectOrgOffer.findMany({
    where: { solicitationId: solicitation.id, status: { not: OrgOfferStatus.WITHDRAWN } },
    select: { supplierId: true, amount: true },
  });
  const noResponse = (solicitation.invites || []).filter((i) => i.noResponseAt).map((i) => i.supplierId);
  return {
    answered: new Set([...offers.map((o) => o.supplierId), ...noResponse]),
    amounts: new Set(offers.map((o) => Number(o.amount))),
  };
}

/**
 * The officer receives quotations / bids on providers' behalf, each one in the
 * provider's character: high-price providers quote high, late submitters arrive
 * after closing (recorded, not accepted), rarely-responsive providers usually do
 * not answer (recorded as no response). Providers that already answered are never touched.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   solicitationType: string;
 *   supplierId: string;
 *   actorOrgUserId: string | null;
 *   actorRoleName: string;
 * }} opts `supplierId` is a provider id or "ALL"
 */
export async function generateQuotes(prisma, opts) {
  const solicitation = await findSolicitationForProcurement(prisma, opts);
  const word = opts.solicitationType === OrgSolicitationType.RFQ ? "quotation" : "bid";
  if (!solicitation || !RECEIVING_STATUSES.includes(solicitation.status)) {
    return { ok: false, error: `This ${opts.solicitationType === "RFQ" ? "RFQ" : "tender"} is not open for ${word}s.`, status: 400 };
  }
  if (solicitation.closingDate && solicitation.closingDate.getTime() < Date.now()) {
    return { ok: false, error: "The closing date has passed.", status: 400, code: "SOLICITATION_CLOSED" };
  }
  if (await offersLockedByDecision(prisma, opts.procurementId)) {
    return { ok: false, error: "Evaluation has started.", status: 400, code: "OFFERS_LOCKED" };
  }

  const ctx = await loadQuoteContext(prisma, opts);
  const pool = await solicitationResponders(prisma, { projectId: opts.projectId, solicitation, category: ctx.category });
  const { answered, amounts } = await answeredSupplierIds(prisma, solicitation);
  const all = opts.supplierId === "ALL";
  const targets = all ? pool.filter((s) => !answered.has(s.id)) : pool.filter((s) => s.id === opts.supplierId);
  if (!all) {
    if (!targets.length) {
      return { ok: false, error: `This provider cannot submit a ${word} here.`, status: 400, fieldErrors: { offerSupplierId: "Not on the list." } };
    }
    if (answered.has(targets[0].id)) {
      return { ok: false, error: `This provider has already answered.`, status: 400, code: "OFFER_ALREADY_RECORDED" };
    }
  }
  if (!targets.length) return { ok: false, error: "Every provider has already answered.", status: 400 };

  const isRfq = opts.solicitationType === OrgSolicitationType.RFQ;
  const results = { quoted: /** @type {any[]} */ ([]), late: /** @type {any[]} */ ([]), noResponse: /** @type {any[]} */ ([]) };
  const actorMeta = {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    solicitationId: solicitation.id,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
  };

  for (const provider of targets) {
    const profile = quoteProfile(provider);
    if (Math.random() >= profile.respondChance) {
      await prisma.projectOrgSolicitationInvite.upsert({
        where: { solicitationId_supplierId: { solicitationId: solicitation.id, supplierId: provider.id } },
        create: { solicitationId: solicitation.id, supplierId: provider.id, noResponseAt: new Date() },
        update: { noResponseAt: new Date() },
      });
      await writeAuditLog({
        eventType: AuditEvent.PROJECT_ORG_OFFER_NO_RESPONSE,
        actorUserId: null,
        meta: { ...actorMeta, supplierId: provider.id, comment: `${provider.name} did not respond.` },
      });
      results.noResponse.push({ supplierId: provider.id, name: provider.name });
      continue;
    }

    const draft = buildQuoteDraft(provider, ctx);
    while (amounts.has(draft.amount)) {
      draft.amount += draft.lineItems.length ? 50 * (draft.lineItems[0].quantity || 1) : 1000;
      if (draft.lineItems.length) {
        draft.lineItems[0].unitPrice += 50;
        draft.lineItems[0].total = Math.round(draft.lineItems[0].unitPrice * draft.lineItems[0].quantity * 100) / 100;
      }
    }
    amounts.add(draft.amount);

    const closing = solicitation.closingDate || new Date();
    const submittedAt = profile.late
      ? new Date(closing.getTime() + Math.round(randBetween(2, 48)) * 60 * 60 * 1000)
      : new Date();
    const offer = await prisma.projectOrgOffer.create({
      data: {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        solicitationId: solicitation.id,
        supplierId: provider.id,
        offerType: isRfq ? OrgOfferType.QUOTATION : OrgOfferType.BID,
        amount: new Prisma.Decimal(draft.amount.toFixed(2)),
        status: profile.late ? OrgOfferStatus.LATE : OrgOfferStatus.SUBMITTED,
        source: OFFER_SOURCE.AUTO,
        submittedAt,
        deliveryDays: draft.deliveryDays,
        remarks: profile.late ? `${draft.remarks} Received after the closing date.` : draft.remarks,
        ...(draft.lineItems.length ? { lineItems: draft.lineItems } : {}),
      },
    });
    await writeAuditLog({
      eventType: profile.late ? AuditEvent.PROJECT_ORG_OFFER_LATE : AuditEvent.PROJECT_ORG_OFFER_GENERATED,
      actorUserId: null,
      meta: {
        ...actorMeta,
        ...(profile.late ? { actorOrgUserId: null, actorRoleName: null, generatedByOrgUserId: opts.actorOrgUserId } : {}),
        supplierId: provider.id,
        offerId: offer.id,
        source: OFFER_SOURCE.AUTO,
        amount: draft.amount.toFixed(2),
        deliveryDays: draft.deliveryDays,
      },
    });
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: provider.id,
      title: profile.late ? `Late ${word} not accepted` : `${word[0].toUpperCase()}${word.slice(1)} recorded`,
      body: profile.late
        ? `Your ${word} for "${solicitation.title}" arrived after the closing date and was not accepted.`
        : `Your ${word} of UGX ${draft.amount.toLocaleString("en-US")} for "${solicitation.title}" was recorded.`,
      linkUrl: `/provider-portal/opportunities/${solicitation.id}`,
      relatedEntityType: "offer",
      relatedEntityId: offer.id,
    });
    (profile.late ? results.late : results.quoted).push({
      supplierId: provider.id,
      name: provider.name,
      amount: draft.amount.toFixed(2),
    });
  }

  return { ok: true, ...results };
}

/**
 * After a delivery passes inspection, a simulated (generated) provider sends its
 * invoice automatically. INVOICE_MISMATCH providers deliberately send an amount
 * that does not match the order so the verifier has something to catch.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function autoInvoiceFromGeneratedProvider(prisma, opts) {
  const order = await getActiveOrderValue(prisma, opts.projectId, opts.procurementId);
  if (!order?.supplierId) return { ok: true, skipped: "NO_ORDER" };

  const provider = await prisma.projectOrgProvider.findFirst({
    where: { id: order.supplierId, projectId: opts.projectId },
    select: { id: true, name: true, isGenerated: true, behaviour: true, conductIssues: true },
  });
  if (!provider?.isGenerated) return { ok: true, skipped: "NOT_SIMULATED" };

  const open = await prisma.projectOrgInvoice.count({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      status: { in: ["RECEIVED", "CERTIFIED", "VERIFIED", "APPROVED_FOR_PAYMENT"] },
    },
  });
  if (open > 0) return { ok: true, skipped: "ALREADY_INVOICED" };

  const due = await acceptedShareOfOrder(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    orderValue: order.value,
  });
  const mismatch = providerConductIssues(provider).has(PROVIDER_BEHAVIOUR.INVOICE_MISMATCH);
  const amount = mismatch ? Math.round(due * randBetween(0.9, 0.97)) : Math.round(due * 100) / 100;

  const reference = `${provider.name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase() || "PROV"}-INV-${Math.floor(randBetween(1000, 9999))}`;

  return createInvoice(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    actorOrgUserId: null,
    actorRoleName: "Provider (auto-response)",
    amount,
    source: INVOICE_SOURCE.AUTO,
    supplierReference: reference,
    notes: mismatch
      ? `Invoice issued against ${order.number}. Check the total against the order before verifying.`
      : `Invoice issued against ${order.number}.`,
  });
}
