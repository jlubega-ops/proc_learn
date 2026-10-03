/**
 * Procurements sidebar sub-pages. `section` maps to `procurementSectionAccess` keys;
 * null = any viewer of procurements.
 */
export const PROCUREMENT_STAGE_PAGES = {
  "review-tasks": {
    label: "Review tasks",
    title: "Where every procurement is in its workflow and which steps are waiting for you",
    section: null,
    description:
      "Every procurement's current workflow step. Rows marked “Your turn” are waiting for you; the rest show who the case is waiting on.",
    recordedLabel: "In progress",
    pendingLabel: "In progress",
  },
  awards: {
    label: "Awards",
    title: "Contract awards from approved evaluations",
    section: "award",
    description: "Award decisions per procurement (Micro procurements have no award stage).",
    recordedLabel: "Awarded",
    pendingLabel: "Not yet awarded",
  },
  contracts: {
    label: "Contracts / LPO",
    title: "Contracts, LPOs and purchase instructions",
    section: "contract",
    description:
      "The order document for each procurement — contract or LPO, or the purchase instruction for Micro.",
    recordedLabel: "Order issued",
    pendingLabel: "No order yet",
  },
  deliveries: {
    label: "Delivery & inspections",
    title: "Goods/works received and their inspection results",
    section: "delivery",
    description: "Latest delivery per procurement and whether it has been inspected and accepted.",
    recordedLabel: "Delivered",
    pendingLabel: "Awaiting delivery",
  },
  invoices: {
    label: "Invoices",
    title: "Provider invoices and their certification/verification",
    section: "invoice",
    description: "Latest invoice per procurement and how far it has been processed.",
    recordedLabel: "Invoiced",
    pendingLabel: "No invoice yet",
  },
  payments: {
    label: "Payments",
    title: "Payment approvals and payments made",
    section: "payment",
    description: "Latest payment per procurement — pending approval, approved or paid.",
    recordedLabel: "Payment raised",
    pendingLabel: "No payment yet",
  },
  closures: {
    label: "Closures",
    title: "Closed procurements and those still open",
    section: "closure",
    description: "Closure status per procurement. Closing is final for the simulation case.",
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
