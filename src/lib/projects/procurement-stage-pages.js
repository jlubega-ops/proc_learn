import { NAV_LABELS } from "@/lib/nav-labels";
import {
  isMicroStyleMethod,
  normalizeProcurementMethod,
} from "@/lib/projects/procurement-methods";

/**
 * Procurements sidebar sub-pages, in lifecycle order. `section` maps to
 * `procurementSectionAccess` keys (null = any viewer of procurements); `stage` is the
 * single-procurement stage shown when a row is opened from the page.
 */
export const PROCUREMENT_STAGE_PAGES = {
  solicitations: {
    label: NAV_LABELS.solicitations,
    title: "Requests for quotations and bidding",
    section: "sourcing",
    stage: "sourcing",
    description: "Requests for quotations and bids.",
    recordedLabel: "Issued",
    pendingLabel: "Not issued",
  },
  evaluations: {
    label: NAV_LABELS.evaluations,
    title: "Evaluation of quotations and bids",
    section: "evaluation",
    stage: "evaluation",
    description: "Evaluation of quotations and bids.",
    recordedLabel: "Evaluated",
    pendingLabel: "Not evaluated",
  },
  awards: {
    label: NAV_LABELS.awards,
    title: "Contract awards from approved evaluations",
    section: "award",
    stage: "award",
    description: "Award decisions.",
    recordedLabel: "Awarded",
    pendingLabel: "Not yet awarded",
  },
  "purchase-instructions": {
    label: NAV_LABELS.purchaseInstructions,
    title: "Purchase instructions for Micro and Direct",
    section: "contract",
    stage: "contract",
    description: "Purchase instructions for Micro and Direct.",
    recordedLabel: "Issued",
    pendingLabel: "Not issued",
  },
  contracts: {
    label: NAV_LABELS.contracts,
    title: "Contracts and local purchase orders",
    section: "contract",
    stage: "contract",
    description: "Contracts and local purchase orders.",
    recordedLabel: "Order issued",
    pendingLabel: "No order yet",
  },
  deliveries: {
    label: NAV_LABELS.deliveries,
    title: "Goods/works received and their inspection",
    section: "delivery",
    stage: "delivery",
    description: "Deliveries and inspections.",
    recordedLabel: "Delivered",
    pendingLabel: "Awaiting delivery",
  },
  invoices: {
    label: NAV_LABELS.invoices,
    title: "Provider invoices and their verification",
    section: "invoice",
    stage: "invoice",
    description: "Provider invoices.",
    recordedLabel: "Invoiced",
    pendingLabel: "No invoice yet",
  },
  payments: {
    label: NAV_LABELS.payments,
    title: "Payment approvals and payments made",
    section: "payment",
    stage: "payment",
    description: "Payment approvals and payments.",
    recordedLabel: "Payment raised",
    pendingLabel: "No payment yet",
  },
  closures: {
    label: NAV_LABELS.closures,
    title: "Closed procurements and those still open",
    section: "closure",
    stage: "closure",
    description: "Procurement closure.",
    recordedLabel: "Closed",
    pendingLabel: "Still open",
  },
};

/**
 * @param {string} stage
 * @param {Record<string, { view: boolean }> | null | undefined} sections
 */
export function canViewProcurementStage(stage, sections) {
  const page = PROCUREMENT_STAGE_PAGES[stage];
  if (!page) return false;
  if (!page.section || !sections) return true;
  return Boolean(sections[page.section]?.view);
}

/**
 * Sidebar page that holds a procurement stage (contract splits by method).
 * @param {string | null | undefined} stage
 * @param {string | null | undefined} method
 * @returns {string | null}
 */
export function procurementSectionSlug(stage, method) {
  if (!stage) return null;
  if (stage === "contract") {
    const m = normalizeProcurementMethod(method);
    return isMicroStyleMethod(m) ? "purchase-instructions" : "contracts";
  }
  for (const [slug, page] of Object.entries(PROCUREMENT_STAGE_PAGES)) {
    if (page.stage === stage) return slug;
  }
  return null;
}
