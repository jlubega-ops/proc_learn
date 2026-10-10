import { procurementInclude } from "@/lib/projects/procurements";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import { procurementStagesForMethod } from "@/lib/projects/procurement-task-stage";

/** Procurement relations that belong to each section. */
const SECTION_RELATIONS = {
  sourcing: ["solicitations", "offers"],
  evaluation: ["evaluationReports", "postQualificationReports"],
  award: ["awards"],
  contract: ["purchaseInstructions", "contracts", "lpos"],
  delivery: ["deliveries", "deliveryNotes"],
  invoice: ["invoices"],
  payment: ["payments"],
  closure: ["closedBy"],
};

/** Data a section's screen needs from earlier sections (e.g. receiving goods needs the order). */
const SECTION_DEPENDENCIES = {
  sourcing: [],
  evaluation: ["sourcing"],
  award: ["evaluation", "sourcing"],
  contract: ["award"],
  delivery: ["contract"],
  invoice: ["delivery", "contract"],
  payment: ["invoice", "contract", "delivery"],
  closure: ["contract", "delivery", "invoice", "payment"],
};

const latestStatus = { orderBy: { createdAt: /** @type {const} */ ("desc") }, take: 1, select: { status: true } };

/** Status-only selects for sections the viewer cannot open, enough for the stage cards. */
const STATUS_ONLY = {
  solicitations: latestStatus,
  offers: { select: { status: true } },
  evaluationReports: latestStatus,
  postQualificationReports: latestStatus,
  awards: latestStatus,
  purchaseInstructions: latestStatus,
  contracts: latestStatus,
  lpos: latestStatus,
  deliveries: { select: { inspection: { select: { status: true } } } },
  deliveryNotes: { where: { status: /** @type {const} */ ("SUBMITTED") }, take: 1, select: { status: true } },
  invoices: { select: { status: true } },
  payments: { select: { status: true, amount: true } },
  closedBy: false,
};

/**
 * Sections whose records are loaded for this viewer: the ones they may view plus the direct
 * dependencies of those. `null` access (project owner / org admin session) loads everything.
 * @param {Record<string, { view: boolean }> | null} sections
 * @returns {Set<string>}
 */
export function sectionsWithData(sections) {
  const all = Object.keys(SECTION_RELATIONS);
  if (!sections) return new Set(all);
  const keep = new Set();
  for (const key of all) {
    if (!sections[key]?.view) continue;
    keep.add(key);
    for (const dep of SECTION_DEPENDENCIES[key] || []) keep.add(dep);
  }
  return keep;
}

/**
 * One query's include: full relations for loaded sections, status-only for the rest.
 * @param {Set<string>} keep
 */
export function procurementIncludeForSections(keep) {
  /** @type {Record<string, any>} */
  const include = { ...procurementInclude };
  for (const [section, relations] of Object.entries(SECTION_RELATIONS)) {
    if (keep.has(section)) continue;
    for (const rel of relations) include[rel] = STATUS_ONLY[rel];
  }
  return include;
}

/**
 * Stage card status for every stage of the method; summaries only for stages the viewer may view.
 * @param {any} row raw procurement row
 * @param {Record<string, { view: boolean }> | null} sections
 */
export function procurementStageSummaries(row, sections) {
  /** @type {Record<string, { status: any; summary: string[] }>} */
  const out = {};
  for (const key of procurementStagesForMethod(row.procurementMethod)) {
    const { status, summary } = describeProcurementStage(key, row);
    out[key] = { status, summary: !sections || sections[key]?.view ? summary : [] };
  }
  return out;
}

const EVENT_SECTIONS = [
  { re: /^PROJECT_ORG_(SOLICITATION|OFFER)_/, section: "sourcing" },
  { re: /^PROJECT_ORG_(EVALUATION|POST_QUALIFICATION)_/, section: "evaluation" },
  { re: /^PROJECT_ORG_AWARD_/, section: "award" },
  { re: /^PROJECT_ORG_(CONTRACT|LPO|PURCHASE_INSTRUCTION|DELIVERY_ADDRESS)_/, section: "contract" },
  { re: /^PROJECT_ORG_DELIVERY_/, section: "delivery" },
  { re: /^PROJECT_ORG_INVOICE_/, section: "invoice" },
  { re: /^PROJECT_ORG_PAYMENT_/, section: "payment" },
  { re: /^PROJECT_ORG_PROCUREMENT_CLOSED$/, section: "closure" },
];

/**
 * Procurement section a domain audit event belongs to, or null.
 * @param {string | null | undefined} eventType
 */
export function domainEventSection(eventType) {
  return EVENT_SECTIONS.find((m) => m.re.test(String(eventType || "")))?.section || null;
}

/**
 * Domain history entries limited to the sections the viewer may view.
 * @param {any[]} entries
 * @param {Record<string, { view: boolean }> | null} sections
 */
export function filterDomainTimeline(entries, sections) {
  if (!sections) return entries;
  return entries.filter((e) => {
    const section = domainEventSection(e.eventType);
    return !section || Boolean(sections[section]?.view);
  });
}

/**
 * Drop status-only relations before serializing so hidden sections reach the client empty.
 * @param {any} row
 * @param {Set<string>} keep
 */
export function redactHiddenSections(row, keep) {
  const out = { ...row };
  for (const [section, relations] of Object.entries(SECTION_RELATIONS)) {
    if (keep.has(section)) continue;
    for (const rel of relations) out[rel] = rel === "closedBy" ? null : [];
    if (section === "closure") out.closureRemarks = null;
  }
  return out;
}
