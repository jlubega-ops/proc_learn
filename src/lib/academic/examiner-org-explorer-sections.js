/**
 * Sidebar sections of the examiner's read-only organisation explorer (shared client + server).
 */
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";

export const EXPLORER_SECTION_GROUPS = [
  {
    key: "organisation",
    label: "Organisation",
    items: [
      { key: "overview", label: "Overview" },
      { key: "financial-years", label: "Financial years" },
      { key: "planning-periods", label: "Planning periods" },
      { key: "budgets", label: "Budgets" },
      { key: "plans", label: "Procurement plans" },
      { key: "users", label: "Users" },
      { key: "committees", label: "Committees" },
      { key: "departments", label: "Departments" },
      { key: "structure", label: "Org structure" },
      { key: "processes", label: "Process workflows" },
      { key: "providers", label: "Providers" },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    items: [
      { key: "procurements", label: "All procurements" },
      { key: "requisitions", label: "Requisitions" },
      { key: "sourcing", label: "RFQs & bids" },
      { key: "evaluations", label: "Evaluations" },
      { key: "awards", label: "Awards" },
      { key: "purchase-instructions", label: "Purchase instructions" },
      { key: "orders", label: "Contracts & LPOs" },
      { key: "deliveries", label: "Deliveries" },
      { key: "invoices", label: "Invoices" },
      { key: "payments", label: "Payments" },
      { key: "closures", label: "Closures" },
    ],
  },
];

export const EXPLORER_SECTION_KEYS = EXPLORER_SECTION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

const C = PROCESS_FLOW_CODES;

/** Explorer section → scoring section keys whose marks it shows. */
export const EXPLORER_SCORING_SECTIONS = {
  "financial-years": ["ORG_FINANCIAL_YEARS"],
  "planning-periods": ["ORG_FINANCIAL_YEARS"],
  budgets: [C.BUDGETING],
  plans: [C.PROCUREMENT_PLANNING, C.EMERGENCY_PLANNING],
  users: ["ORG_USERS"],
  committees: ["ORG_COMMITTEES"],
  departments: ["ORG_DEPARTMENTS"],
  structure: ["ORG_DEPARTMENTS"],
  providers: ["ORG_PROVIDERS"],
  requisitions: [C.PROCUREMENT_REQUISITION],
  sourcing: [C.MICRO_PROCUREMENT, C.QUOTATION_PROCESS, C.TENDER_PROCESS],
  evaluations: [C.EVALUATION_PROCESS],
  awards: [C.POST_QUALIFICATION_PROCESS],
  orders: [C.LPO_PROCESS, C.CONTRACT_PROCESS],
  invoices: [C.INVOICE_PROCESS],
  payments: [C.PAYMENT_PROCESS],
};

/** @param {string} key */
export function explorerSectionLabel(key) {
  for (const group of EXPLORER_SECTION_GROUPS) {
    const hit = group.items.find((i) => i.key === key);
    if (hit) return hit.label;
  }
  return "Overview";
}
