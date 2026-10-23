/**
 * Stable process catalogue codes and triggers for the procurement engine.
 */

import { throttleSync } from "@/lib/sync-throttle";
import {
  isBiddingMethod,
  isQuotationMethod,
  METHOD_PROCESS_BY_METHOD,
  METHOD_PROCESS_CODES,
  normalizeProcurementMethod,
} from "@/lib/projects/procurement-methods";

export const PROCESS_FLOW_CODES = {
  BUDGETING: "BUDGETING",
  PROCUREMENT_PLANNING: "PROCUREMENT_PLANNING",
  EMERGENCY_PLANNING: "EMERGENCY_PLANNING",
  PROCUREMENT_REQUISITION: "PROCUREMENT_REQUISITION",
  /** Independent method engines (7). */
  OPEN_DOMESTIC_BIDDING: "OPEN_DOMESTIC_BIDDING",
  OPEN_INTERNATIONAL_BIDDING: "OPEN_INTERNATIONAL_BIDDING",
  RESTRICTED_DOMESTIC_BIDDING: "RESTRICTED_DOMESTIC_BIDDING",
  RESTRICTED_INTERNATIONAL_BIDDING: "RESTRICTED_INTERNATIONAL_BIDDING",
  QUOTATION_PROCESS: "QUOTATION_PROCESS",
  MICRO_PROCUREMENT: "MICRO_PROCUREMENT",
  DIRECT_PROCUREMENT: "DIRECT_PROCUREMENT",
  EVALUATION_PROCESS: "EVALUATION_PROCESS",
  POST_QUALIFICATION_PROCESS: "POST_QUALIFICATION_PROCESS",
  LPO_PROCESS: "LPO_PROCESS",
  CONTRACT_PROCESS: "CONTRACT_PROCESS",
  INVOICE_PROCESS: "INVOICE_PROCESS",
  PAYMENT_PROCESS: "PAYMENT_PROCESS",
};

export const WORKFLOW_TRIGGERS = {
  BUDGET_SUBMITTED: "BUDGET_SUBMITTED",
  PLANNING_INITIATED: "PLANNING_INITIATED",
  PLANNING_SUBMITTED: "PLANNING_SUBMITTED",
  PLANNING_APPROVED: "PLANNING_APPROVED",
  EMERGENCY_PLANNING_SUBMITTED: "EMERGENCY_PLANNING_SUBMITTED",
  REQUISITION_SUBMITTED: "REQUISITION_SUBMITTED",
  REQUISITION_APPROVED: "REQUISITION_APPROVED",
  PROCUREMENT_METHOD_SELECTED: "PROCUREMENT_METHOD_SELECTED",
  OPEN_DOMESTIC_BIDDING_STARTED: "OPEN_DOMESTIC_BIDDING_STARTED",
  OPEN_INTERNATIONAL_BIDDING_STARTED: "OPEN_INTERNATIONAL_BIDDING_STARTED",
  RESTRICTED_DOMESTIC_BIDDING_STARTED: "RESTRICTED_DOMESTIC_BIDDING_STARTED",
  RESTRICTED_INTERNATIONAL_BIDDING_STARTED: "RESTRICTED_INTERNATIONAL_BIDDING_STARTED",
  QUOTATION_STARTED: "QUOTATION_STARTED",
  MICRO_PROCUREMENT_STARTED: "MICRO_PROCUREMENT_STARTED",
  DIRECT_PROCUREMENT_STARTED: "DIRECT_PROCUREMENT_STARTED",
  EVALUATION_STARTED: "EVALUATION_STARTED",
  POST_QUALIFICATION_STARTED: "POST_QUALIFICATION_STARTED",
  LPO_STARTED: "LPO_STARTED",
  CONTRACT_STARTED: "CONTRACT_STARTED",
  INVOICE_STARTED: "INVOICE_STARTED",
  PAYMENT_STARTED: "PAYMENT_STARTED",
};

/** Engine process code for each operational trigger. */
export const TRIGGER_TO_PROCESS_CODE = {
  [WORKFLOW_TRIGGERS.BUDGET_SUBMITTED]: PROCESS_FLOW_CODES.BUDGETING,
  [WORKFLOW_TRIGGERS.PLANNING_SUBMITTED]: PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
  [WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED]: PROCESS_FLOW_CODES.EMERGENCY_PLANNING,
  [WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED]: PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
  [WORKFLOW_TRIGGERS.OPEN_DOMESTIC_BIDDING_STARTED]: PROCESS_FLOW_CODES.OPEN_DOMESTIC_BIDDING,
  [WORKFLOW_TRIGGERS.OPEN_INTERNATIONAL_BIDDING_STARTED]: PROCESS_FLOW_CODES.OPEN_INTERNATIONAL_BIDDING,
  [WORKFLOW_TRIGGERS.RESTRICTED_DOMESTIC_BIDDING_STARTED]: PROCESS_FLOW_CODES.RESTRICTED_DOMESTIC_BIDDING,
  [WORKFLOW_TRIGGERS.RESTRICTED_INTERNATIONAL_BIDDING_STARTED]:
    PROCESS_FLOW_CODES.RESTRICTED_INTERNATIONAL_BIDDING,
  [WORKFLOW_TRIGGERS.QUOTATION_STARTED]: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
  [WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED]: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
  [WORKFLOW_TRIGGERS.DIRECT_PROCUREMENT_STARTED]: PROCESS_FLOW_CODES.DIRECT_PROCUREMENT,
  [WORKFLOW_TRIGGERS.EVALUATION_STARTED]: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
  [WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED]: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
  [WORKFLOW_TRIGGERS.LPO_STARTED]: PROCESS_FLOW_CODES.LPO_PROCESS,
  [WORKFLOW_TRIGGERS.CONTRACT_STARTED]: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  [WORKFLOW_TRIGGERS.INVOICE_STARTED]: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  [WORKFLOW_TRIGGERS.PAYMENT_STARTED]: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
};

/**
 * Map OrgProcurementMethod → independent process code / trigger.
 * @type {Record<string, { code: string; triggerKey: string; label: string }>}
 */
export const METHOD_PROCESS_BY_ENUM = METHOD_PROCESS_BY_METHOD;

/** Procurement lifecycle actions that belong to a phase process. */
export const PHASE_PROCESS_BY_ACTION = {
  save_evaluation: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
  submit_evaluation: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
  run_post_qualification: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
  decide_post_qualification: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
  create_lpo: PROCESS_FLOW_CODES.LPO_PROCESS,
  approve_lpo: PROCESS_FLOW_CODES.LPO_PROCESS,
  issue_lpo: PROCESS_FLOW_CODES.LPO_PROCESS,
  create_contract: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  approve_contract: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  sign_contract: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  issue_contract: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  create_invoice: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  certify_invoice: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  verify_invoice: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  reject_invoice: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  create_payment: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
  approve_payment: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
  mark_payment_paid: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
  reject_payment: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
};

/**
 * Phase process a method-workflow task belongs to (null = the method process itself).
 * Matches on the step part of the title ("<step>: <PROC no>: <title>").
 * @param {string | null | undefined} title
 * @param {string | null | undefined} method
 * @returns {string | null}
 */
export function phaseProcessForTask(title, method) {
  const step = String(title || "").split(":")[0].trim();
  if (!step) return null;
  if (/post-qualification/i.test(step)) return PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS;
  if (/technical evaluation|financial evaluation|evaluation report|evaluation\/recommendation/i.test(step)) {
    return PROCESS_FLOW_CODES.EVALUATION_PROCESS;
  }
  if (/\blpo\b|contract|supplier acceptance/i.test(step) && !/purchase instruction/i.test(step)) {
    const m = normalizeProcurementMethod(method);
    if (isBiddingMethod(m)) return PROCESS_FLOW_CODES.CONTRACT_PROCESS;
    if (isQuotationMethod(m)) return PROCESS_FLOW_CODES.LPO_PROCESS;
    return null;
  }
  if (/invoice/i.test(step)) return PROCESS_FLOW_CODES.INVOICE_PROCESS;
  if (/payment/i.test(step)) return PROCESS_FLOW_CODES.PAYMENT_PROCESS;
  return null;
}

const BIDDING_REQUIRED_PHASES = [
  PROCESS_FLOW_CODES.EVALUATION_PROCESS,
  PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
  PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  PROCESS_FLOW_CODES.INVOICE_PROCESS,
  PROCESS_FLOW_CODES.PAYMENT_PROCESS,
];

/**
 * Phase processes each method needs end to end. Post-qualification on QUOTATION is
 * only needed when flagged, so it is checked when the checklist opens instead.
 * @type {Record<string, string[]>}
 */
export const METHOD_REQUIRED_PHASES = {
  OPEN_DOMESTIC: BIDDING_REQUIRED_PHASES,
  OPEN_INTERNATIONAL: BIDDING_REQUIRED_PHASES,
  RESTRICTED_DOMESTIC: BIDDING_REQUIRED_PHASES,
  RESTRICTED_INTERNATIONAL: BIDDING_REQUIRED_PHASES,
  QUOTATION: [
    PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    PROCESS_FLOW_CODES.LPO_PROCESS,
    PROCESS_FLOW_CODES.INVOICE_PROCESS,
    PROCESS_FLOW_CODES.PAYMENT_PROCESS,
  ],
  MICRO: [PROCESS_FLOW_CODES.INVOICE_PROCESS, PROCESS_FLOW_CODES.PAYMENT_PROCESS],
  DIRECT: [PROCESS_FLOW_CODES.INVOICE_PROCESS, PROCESS_FLOW_CODES.PAYMENT_PROCESS],
};

/**
 * Method process plus every phase it needs.
 * @param {string | null | undefined} method
 * @returns {string[]}
 */
export function processCodesForMethod(method) {
  const key = normalizeProcurementMethod(method);
  const meta = METHOD_PROCESS_BY_ENUM[key];
  if (!meta) return [];
  return [meta.code, ...(METHOD_REQUIRED_PHASES[key] || [])];
}

export { METHOD_PROCESS_CODES };

/**
 * Fixed app events the simulation engine currently listens for.
 * System Admin binds a catalogue process to one of these — rename never changes the trigger.
 * New stages are added here when the app wires that submit action.
 */
export const ENGINE_PROCESS_BINDINGS = [
  {
    code: PROCESS_FLOW_CODES.BUDGETING,
    triggerKey: WORKFLOW_TRIGGERS.BUDGET_SUBMITTED,
    label: "Budget submitted",
    description: "Starts when a department budget is submitted for approval.",
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    triggerKey: WORKFLOW_TRIGGERS.PLANNING_SUBMITTED,
    label: "Procurement plan submitted",
    description: "Starts when a procurement plan is submitted for review.",
  },
  {
    code: PROCESS_FLOW_CODES.EMERGENCY_PLANNING,
    triggerKey: WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED,
    label: "Emergency plan submitted",
    description:
      "Starts when an emergency / unplanned procurement plan is submitted (short path, outside annual consolidation).",
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    triggerKey: WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED,
    label: "Requisition submitted",
    description: "Starts when a procurement requisition is submitted.",
  },
  {
    code: PROCESS_FLOW_CODES.OPEN_DOMESTIC_BIDDING,
    triggerKey: WORKFLOW_TRIGGERS.OPEN_DOMESTIC_BIDDING_STARTED,
    label: "Open domestic bidding started",
    description: "Starts when Open Domestic Bidding is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.OPEN_INTERNATIONAL_BIDDING,
    triggerKey: WORKFLOW_TRIGGERS.OPEN_INTERNATIONAL_BIDDING_STARTED,
    label: "Open international bidding started",
    description: "Starts when Open International Bidding is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.RESTRICTED_DOMESTIC_BIDDING,
    triggerKey: WORKFLOW_TRIGGERS.RESTRICTED_DOMESTIC_BIDDING_STARTED,
    label: "Restricted domestic bidding started",
    description: "Starts when Restricted Domestic Bidding is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.RESTRICTED_INTERNATIONAL_BIDDING,
    triggerKey: WORKFLOW_TRIGGERS.RESTRICTED_INTERNATIONAL_BIDDING_STARTED,
    label: "Restricted international bidding started",
    description: "Starts when Restricted International Bidding is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.QUOTATION_STARTED,
    label: "Quotation method started",
    description: "Starts when Quotation Method is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    triggerKey: WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED,
    label: "Micro procurement started",
    description: "Starts when Micro Procurement is approved after requisition.",
  },
  {
    code: PROCESS_FLOW_CODES.DIRECT_PROCUREMENT,
    triggerKey: WORKFLOW_TRIGGERS.DIRECT_PROCUREMENT_STARTED,
    label: "Direct procurement started",
    description: "Starts when Direct Procurement is approved after requisition (documented grounds).",
  },
  {
    code: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.EVALUATION_STARTED,
    label: "Evaluation started",
    description: "Phase gate: evaluation reports can only be opened while active.",
  },
  {
    code: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED,
    label: "Post-qualification started",
    description: "Phase gate: post-qualification checklists can only be opened while active.",
  },
  {
    code: PROCESS_FLOW_CODES.LPO_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.LPO_STARTED,
    label: "LPO started",
    description: "Phase gate: LPOs can only be drafted while active.",
  },
  {
    code: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.CONTRACT_STARTED,
    label: "Contract started",
    description: "Phase gate: contracts can only be drafted while active.",
  },
  {
    code: PROCESS_FLOW_CODES.INVOICE_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.INVOICE_STARTED,
    label: "Invoice started",
    description: "Phase gate: invoices can only be submitted while active.",
  },
  {
    code: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.PAYMENT_STARTED,
    label: "Payment started",
    description: "Phase gate: payments can only be raised while active.",
  },
];

/**
 * Built-in engine processes: steps are owned by code, only the label can be renamed.
 * @param {string | null | undefined} code
 */
export function isBuiltInProcessCode(code) {
  return Boolean(code) && Object.values(PROCESS_FLOW_CODES).includes(String(code));
}

export const BUILT_IN_PROCESS_LOCKED_MESSAGE =
  "Built-in process steps are fixed. You can only rename this process.";

/**
 * @param {string | null | undefined} triggerKey
 * @returns {(typeof ENGINE_PROCESS_BINDINGS)[number] | null}
 */
export function resolveEngineBinding(triggerKey) {
  const key = String(triggerKey || "").trim();
  if (!key) return null;
  return ENGINE_PROCESS_BINDINGS.find((b) => b.triggerKey === key) || null;
}

/**
 * Older catalogue rows shared the display names but had no `code` / `triggerKey`.
 * Budget/plan/requisition submit will not find those until migrated to the engine templates.
 */
export const LEGACY_PROCESS_ALIASES = [
  {
    code: PROCESS_FLOW_CODES.BUDGETING,
    triggerKey: WORKFLOW_TRIGGERS.BUDGET_SUBMITTED,
    legacyNames: ["budgeting process"],
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    triggerKey: WORKFLOW_TRIGGERS.PLANNING_SUBMITTED,
    legacyNames: ["planning process", "procurement planning", "procurement planning process"],
  },
  {
    code: PROCESS_FLOW_CODES.EMERGENCY_PLANNING,
    triggerKey: WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED,
    legacyNames: ["emergency planning process", "emergency planning"],
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    triggerKey: WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED,
    legacyNames: ["requisition process"],
  },
];

/**
 * Independent bidding-method step list (open advert vs restricted invite).
 * Each bidding method has its own catalogue row so steps can diverge later.
 * @param {"open" | "restricted"} kind
 */
function biddingMethodSteps(kind) {
  const solicitStep =
    kind === "restricted"
      ? {
          stepNumber: 4,
          taskDescription: "Invite Shortlisted Providers",
          roleName: "Procurement Officer",
          actionKey: "COMPLETE",
        }
      : {
          stepNumber: 4,
          taskDescription: "Advertise Tender",
          roleName: "Procurement Officer",
          actionKey: "COMPLETE",
        };
  return [
    {
      stepNumber: 1,
      taskDescription: "Prepare Bidding Documents",
      roleName: "Procurement Officer",
      actionKey: "SUBMIT",
    },
    {
      stepNumber: 2,
      taskDescription: "Review Bidding Documents",
      roleName: "Head PDU",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 3,
      taskDescription: "Approve Bidding Documents",
      roleName: "Contracts Committee",
      actionKey: "APPROVE",
    },
    solicitStep,
    {
      stepNumber: 5,
      taskDescription: "Receive Bids",
      roleName: "Procurement Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 6,
      taskDescription: "Close Bid Submission",
      roleName: "Procurement Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 7,
      taskDescription: "Open Bids",
      roleName: "Procurement Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 8,
      taskDescription: "Forward Bids for Evaluation",
      roleName: "Head PDU",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 11,
      taskDescription: "Technical Evaluation",
      roleName: "Evaluation Committee",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 12,
      taskDescription: "Financial Evaluation",
      roleName: "Evaluation Committee",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 13,
      taskDescription: "Prepare Evaluation Report",
      roleName: "Evaluation Committee",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 14,
      taskDescription: "Review Evaluation Report",
      roleName: "Head PDU",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 15,
      taskDescription: "Post-Qualification where applicable",
      roleName: "Evaluation Committee",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 16,
      taskDescription: "Approve Evaluation/Recommendation",
      roleName: "Contracts Committee",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 17,
      taskDescription: "Prepare Award Recommendation",
      roleName: "Head PDU",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 18,
      taskDescription: "Approve Award",
      roleName: "Contracts Committee",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 19,
      taskDescription: "Communicate Award",
      roleName: "Procurement Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 20,
      taskDescription: "Prepare Contract",
      roleName: "Contracts Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 21,
      taskDescription: "Sign/Approve Contract",
      roleName: "Accounting Officer",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 22,
      taskDescription: "Issue Contract",
      roleName: "Contracts Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 23,
      taskDescription: "Supplier Acceptance",
      roleName: "Procurement Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 24,
      taskDescription: "Delivery",
      roleName: "User Department Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 25,
      taskDescription: "Inspection/Acceptance",
      roleName: "Inspection/Acceptance Committee",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 26,
      taskDescription: "Invoice",
      roleName: "Finance/Budget Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 27,
      taskDescription: "Invoice Verification",
      roleName: "Contracts Officer",
      actionKey: "VERIFY",
    },
    {
      stepNumber: 28,
      taskDescription: "Payment Approval",
      roleName: "Accounting Officer",
      actionKey: "APPROVE",
    },
    {
      stepNumber: 29,
      taskDescription: "Payment Recording",
      roleName: "Finance/Budget Officer",
      actionKey: "COMPLETE",
    },
    {
      stepNumber: 30,
      taskDescription: "Procurement Closure",
      roleName: "Contracts Officer",
      actionKey: "COMPLETE",
    },
  ];
}

const MICRO_STYLE_STEPS = [
  {
    stepNumber: 1,
    taskDescription: "Issue Purchase Instruction",
    roleName: "Procurement Officer",
    actionKey: "COMPLETE",
  },
  {
    stepNumber: 2,
    taskDescription: "Record Delivery/Receipt",
    roleName: "User Department Officer",
    actionKey: "COMPLETE",
  },
  {
    stepNumber: 3,
    taskDescription: "Verify/Accept Delivery",
    roleName: "Head User Department",
    actionKey: "APPROVE",
  },
  {
    stepNumber: 4,
    taskDescription: "Process Invoice",
    roleName: "Contracts Officer",
    actionKey: "VERIFY",
  },
  {
    stepNumber: 5,
    taskDescription: "Approve Payment",
    roleName: "Accounting Officer",
    actionKey: "APPROVE",
  },
  {
    stepNumber: 6,
    taskDescription: "Record Payment",
    roleName: "Finance/Budget Officer",
    actionKey: "COMPLETE",
  },
  {
    stepNumber: 7,
    taskDescription: "Close Procurement",
    roleName: "Contracts Officer",
    actionKey: "COMPLETE",
  },
];

/** Baseline budgeting + planning + requisition templates for seed/ensure. */
export const BASELINE_PROCESS_TEMPLATES = [
  {
    code: PROCESS_FLOW_CODES.BUDGETING,
    name: "Budgeting Process",
    description:
      "Department budget preparation, review, finance consolidation, and Accounting Officer approval.",
    triggerKey: WORKFLOW_TRIGGERS.BUDGET_SUBMITTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare Department Budget Requirement",
        roleName: "User Department Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review Department Budget",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Review and Consolidate Budgets",
        roleName: "Finance/Budget Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 4,
        taskDescription: "Approve Budget",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    name: "Procurement Planning Process",
    description:
      "Departmental preparation, review, consolidation, and approval of the procurement plan.",
    triggerKey: WORKFLOW_TRIGGERS.PLANNING_SUBMITTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Preparation of Procurement Plan",
        roleName: "User Department Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review and Approval of Procurement Plan",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Consolidation of Procurement Plans",
        roleName: "Head PDU",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 4,
        taskDescription: "Review Consolidated Procurement Plan",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 5,
        taskDescription: "Approve Consolidated Procurement Plan",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.EMERGENCY_PLANNING,
    name: "Emergency Planning Process",
    description:
      "Short-path approval for an emergency or unplanned procurement plan outside the annual consolidation cycle.",
    triggerKey: WORKFLOW_TRIGGERS.EMERGENCY_PLANNING_SUBMITTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare Emergency Procurement Plan",
        roleName: "User Department Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review Emergency Procurement Plan",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Verify Emergency Plan and Funding Context",
        roleName: "Head PDU",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 4,
        taskDescription: "Approve Emergency Procurement Plan",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    name: "Procurement Requisition Process",
    description:
      "Create and approve a procurement requisition with plan verification, then Accounting Officer funding check and approval.",
    triggerKey: WORKFLOW_TRIGGERS.REQUISITION_SUBMITTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Create Procurement Requisition",
        roleName: "User Department Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review Requisition",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Verify Procurement Plan Availability",
        roleName: "Procurement Officer",
        actionKey: "VERIFY",
      },
      {
        // Former steps 4 (Head PDU funding) + 5 (AO approve) — step 5 number is retired.
        stepNumber: 4,
        taskDescription: "Verify Funding Availability and Approve Requisition",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 6,
        taskDescription: "Recommend Procurement Method (Form 5 Part II)",
        roleName: "Procurement Officer",
        actionKey: "SELECT_METHOD",
      },
      {
        stepNumber: 7,
        taskDescription: "Approve Procurement Method (Contracts Committee)",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    name: "Micro Procurement Process",
    description:
      "Independent micro path: purchase instruction, delivery, acceptance, invoice, payment and closure after method approval.",
    triggerKey: WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED,
    steps: MICRO_STYLE_STEPS,
  },
  {
    code: PROCESS_FLOW_CODES.DIRECT_PROCUREMENT,
    name: "Direct Procurement Process",
    description:
      "Independent direct path (documented legal grounds only): purchase instruction to the sole/selected provider, delivery, acceptance, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.DIRECT_PROCUREMENT_STARTED,
    steps: MICRO_STYLE_STEPS.map((s) => ({ ...s })),
  },
  {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    name: "Quotation Method Process",
    description:
      "Independent quotation path: RFQ through award, LPO, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.QUOTATION_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare RFQ Documents",
        roleName: "Procurement Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review RFQ Documents",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Approve RFQ Documents",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 4,
        taskDescription: "Issue RFQs to Suppliers",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 5,
        taskDescription: "Receive Quotations",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 6,
        taskDescription: "Close/Lock Quotation Submission",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 7,
        taskDescription: "Open Quotations",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 10,
        taskDescription: "Technical Evaluation",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 11,
        taskDescription: "Financial Evaluation",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 12,
        taskDescription: "Prepare Evaluation Report",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 13,
        taskDescription: "Review Evaluation Report",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 14,
        taskDescription: "Approve Evaluation Report",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 15,
        taskDescription: "Prepare Award Recommendation",
        roleName: "Head PDU",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 16,
        taskDescription: "Review Award Recommendation",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 17,
        taskDescription: "Approve Award",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 18,
        taskDescription: "Communicate Award Decision",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 19,
        taskDescription: "Prepare LPO/Contract",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 20,
        taskDescription: "Approve/Sign LPO/Contract",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 21,
        taskDescription: "Issue LPO/Contract",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 22,
        taskDescription: "Confirm Supplier Acceptance",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 23,
        taskDescription: "Record Delivery",
        roleName: "User Department Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 24,
        taskDescription: "Verify Delivery",
        roleName: "User Department Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 25,
        taskDescription: "Certify Delivery",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 26,
        taskDescription: "Receive/Record Invoice",
        roleName: "Finance/Budget Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 27,
        taskDescription: "Verify Invoice",
        roleName: "Contracts Officer",
        actionKey: "VERIFY",
      },
      {
        stepNumber: 28,
        taskDescription: "Approve Payment",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 29,
        taskDescription: "Record Payment",
        roleName: "Finance/Budget Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 30,
        taskDescription: "Close Procurement",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.OPEN_DOMESTIC_BIDDING,
    name: "Open Domestic Bidding Process",
    description:
      "Independent ODB path: public domestic advert through evaluation, award, contract, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.OPEN_DOMESTIC_BIDDING_STARTED,
    steps: biddingMethodSteps("open"),
  },
  {
    code: PROCESS_FLOW_CODES.OPEN_INTERNATIONAL_BIDDING,
    name: "Open International Bidding Process",
    description:
      "Independent OIB path: international advert through evaluation, award, contract, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.OPEN_INTERNATIONAL_BIDDING_STARTED,
    steps: biddingMethodSteps("open"),
  },
  {
    code: PROCESS_FLOW_CODES.RESTRICTED_DOMESTIC_BIDDING,
    name: "Restricted Domestic Bidding Process",
    description:
      "Independent RDB path: invite domestic shortlist (no open advert) through evaluation, award, contract, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.RESTRICTED_DOMESTIC_BIDDING_STARTED,
    steps: biddingMethodSteps("restricted"),
  },
  {
    code: PROCESS_FLOW_CODES.RESTRICTED_INTERNATIONAL_BIDDING,
    name: "Restricted International Bidding Process",
    description:
      "Independent RIB path: invite shortlist including foreign providers through evaluation, award, contract, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.RESTRICTED_INTERNATIONAL_BIDDING_STARTED,
    steps: biddingMethodSteps("restricted"),
  },
  {
    code: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    name: "Evaluation Process",
    description:
      "Evaluation of quotations/bids through to approval of the evaluation report. Required by Quotation and bidding methods.",
    triggerKey: WORKFLOW_TRIGGERS.EVALUATION_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Technical Evaluation",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 2,
        taskDescription: "Financial Evaluation",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 3,
        taskDescription: "Prepare Evaluation Report",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 4,
        taskDescription: "Review Evaluation Report",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 5,
        taskDescription: "Approve Evaluation Report",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
    name: "Post-Qualification Process",
    description:
      "Checks the best evaluated bidder before award. Required by bidding methods, and by Quotation when flagged.",
    triggerKey: WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Post-Qualification Checklist",
        roleName: "Evaluation Committee",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 2,
        taskDescription: "Approve Evaluation/Recommendation",
        roleName: "Contracts Committee",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.LPO_PROCESS,
    name: "LPO Process",
    description:
      "Local Purchase Order preparation, approval, issue and supplier acceptance. Required by Quotation.",
    triggerKey: WORKFLOW_TRIGGERS.LPO_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare LPO",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 2,
        taskDescription: "Approve/Sign LPO",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Issue LPO",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 4,
        taskDescription: "Confirm Supplier Acceptance",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    name: "Contract Process",
    description:
      "Contract preparation, signature, issue and supplier acceptance. Required by bidding methods.",
    triggerKey: WORKFLOW_TRIGGERS.CONTRACT_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare Contract",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 2,
        taskDescription: "Sign/Approve Contract",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Issue Contract",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 4,
        taskDescription: "Supplier Acceptance",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.INVOICE_PROCESS,
    name: "Invoice Process",
    description:
      "Receipt and verification of the supplier invoice. Required by Micro, Direct, Quotation and bidding methods.",
    triggerKey: WORKFLOW_TRIGGERS.INVOICE_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Receive/Record Invoice",
        roleName: "Finance/Budget Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 2,
        taskDescription: "Verify Invoice",
        roleName: "Contracts Officer",
        actionKey: "VERIFY",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
    name: "Payment Process",
    description:
      "Approval and recording of payment against a verified invoice. Required by Micro, Direct, Quotation and bidding methods.",
    triggerKey: WORKFLOW_TRIGGERS.PAYMENT_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve Payment",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 2,
        taskDescription: "Record Payment",
        roleName: "Finance/Budget Officer",
        actionKey: "COMPLETE",
      },
    ],
  },
];

/**
 * Full (unthrottled) catalogue sync — use from wipe/seed scripts.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function syncBaselineProcessTemplates(prisma) {
  const { ensureCoreProjectOrgRoles } = await import("@/lib/project-org-role");
  await ensureCoreProjectOrgRoles(prisma);

  const roles = await prisma.projectOrgRole.findMany({
    select: { id: true, name: true },
  });
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));

  for (const tpl of BASELINE_PROCESS_TEMPLATES) {
    const flow = await prisma.projectOrgProcessFlow.upsert({
      where: { code: tpl.code },
      create: {
        code: tpl.code,
        name: tpl.name,
        description: tpl.description,
        triggerKey: tpl.triggerKey,
      },
      update: {
        description: tpl.description,
        triggerKey: tpl.triggerKey,
      },
    });

    for (const step of tpl.steps) {
      const roleId = roleByName.get(step.roleName);
      if (!roleId) continue;
      await prisma.projectOrgProcessFlowItem.upsert({
        where: {
          processFlowId_stepNumber: {
            processFlowId: flow.id,
            stepNumber: step.stepNumber,
          },
        },
        create: {
          processFlowId: flow.id,
          stepNumber: step.stepNumber,
          taskDescription: step.taskDescription,
          projectOrgRoleId: roleId,
          actionKey: step.actionKey,
        },
        update: {
          taskDescription: step.taskDescription,
          projectOrgRoleId: roleId,
          actionKey: step.actionKey,
        },
      });
    }

    // Removed steps keep their numbers retired so in-flight instances never shift.
    await prisma.projectOrgProcessFlowItem.deleteMany({
      where: {
        processFlowId: flow.id,
        stepNumber: { notIn: tpl.steps.map((s) => s.stepNumber) },
      },
    });
  }

  // Ghost rows left when FK checks were off during wipe (CASCADE does not run).
  await prisma.$executeRaw`
    DELETE i FROM project_org_process_flow_item i
    WHERE NOT EXISTS (SELECT 1 FROM project_org_process_flow f WHERE f.id = i.process_flow_id)
       OR NOT EXISTS (SELECT 1 FROM project_org_role r WHERE r.id = i.project_org_role_id)
  `;
}

/**
 * Ensures baseline process templates exist with steps. Runs at most every 10 minutes per server
 * process (deploy seeding does the first full sync).
 * @type {(prisma: import("@prisma/client").PrismaClient) => Promise<void>}
 */
export const ensureBaselineProcessTemplates = throttleSync(10 * 60_000, syncBaselineProcessTemplates);

/**
 * Re-point organisation adoptions from legacy name-only catalogue rows to the
 * coded engine templates (`BUDGETING`, `PROCUREMENT_PLANNING`, …).
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {{ projectId?: string | null }} [opts]
 * @returns {Promise<{ migrated: number }>}
 */
export async function migrateLegacyProcessAdoptions(prisma, opts = {}) {
  await ensureBaselineProcessTemplates(prisma);

  const engineFlows = await prisma.projectOrgProcessFlow.findMany({
    where: { code: { in: Object.values(PROCESS_FLOW_CODES) } },
    select: { id: true, code: true },
  });
  const engineByCode = new Map(engineFlows.map((f) => [f.code, f]));

  const uncodedFlows = await prisma.projectOrgProcessFlow.findMany({
    where: { OR: [{ code: null }, { code: "" }] },
    select: { id: true, name: true },
  });

  let migrated = 0;

  for (const alias of LEGACY_PROCESS_ALIASES) {
    const engine = engineByCode.get(alias.code);
    if (!engine) continue;

    const legacyIds = uncodedFlows
      .filter((f) =>
        alias.legacyNames.includes(String(f.name || "").trim().toLowerCase()),
      )
      .map((f) => f.id);
    if (legacyIds.length === 0) continue;

    const adoptions = await prisma.projectOrgProcessFlowAdoption.findMany({
      where: {
        processFlowId: { in: legacyIds },
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
      },
      select: {
        id: true,
        projectId: true,
        isActive: true,
        activatedAt: true,
      },
    });

    for (const adoption of adoptions) {
      const existingEngine = await prisma.projectOrgProcessFlowAdoption.findUnique({
        where: {
          projectId_processFlowId: {
            projectId: adoption.projectId,
            processFlowId: engine.id,
          },
        },
        select: { id: true, isActive: true },
      });

      if (existingEngine) {
        if (adoption.isActive && !existingEngine.isActive) {
          await prisma.projectOrgProcessFlowAdoption.update({
            where: { id: existingEngine.id },
            data: {
              isActive: true,
              activatedAt: adoption.activatedAt || new Date(),
              deactivatedAt: null,
            },
          });
        }
        await prisma.projectOrgProcessFlowAdoption.delete({
          where: { id: adoption.id },
        });
        migrated += 1;
        continue;
      }

      await prisma.projectOrgProcessFlowAdoption.update({
        where: { id: adoption.id },
        data: { processFlowId: engine.id },
      });
      migrated += 1;
    }
  }

  return { migrated };
}
