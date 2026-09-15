/**
 * Stable process catalogue codes and triggers for the simulation engine.
 */

export const PROCESS_FLOW_CODES = {
  BUDGETING: "BUDGETING",
  PROCUREMENT_PLANNING: "PROCUREMENT_PLANNING",
  EMERGENCY_PLANNING: "EMERGENCY_PLANNING",
  PROCUREMENT_REQUISITION: "PROCUREMENT_REQUISITION",
  MICRO_PROCUREMENT: "MICRO_PROCUREMENT",
  QUOTATION_PROCESS: "QUOTATION_PROCESS",
  TENDER_PROCESS: "TENDER_PROCESS",
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
  MICRO_PROCUREMENT_STARTED: "MICRO_PROCUREMENT_STARTED",
  QUOTATION_STARTED: "QUOTATION_STARTED",
  TENDER_STARTED: "TENDER_STARTED",
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
  [WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED]: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
  [WORKFLOW_TRIGGERS.QUOTATION_STARTED]: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
  [WORKFLOW_TRIGGERS.TENDER_STARTED]: PROCESS_FLOW_CODES.TENDER_PROCESS,
  [WORKFLOW_TRIGGERS.EVALUATION_STARTED]: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
  [WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED]: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
  [WORKFLOW_TRIGGERS.LPO_STARTED]: PROCESS_FLOW_CODES.LPO_PROCESS,
  [WORKFLOW_TRIGGERS.CONTRACT_STARTED]: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
  [WORKFLOW_TRIGGERS.INVOICE_STARTED]: PROCESS_FLOW_CODES.INVOICE_PROCESS,
  [WORKFLOW_TRIGGERS.PAYMENT_STARTED]: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
};

/**
 * Map OrgProcurementMethod → process code / trigger for method-start.
 * @type {Record<string, { code: string; triggerKey: string; label: string }>}
 */
export const METHOD_PROCESS_BY_ENUM = {
  MICRO: {
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    triggerKey: WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED,
    label: "Micro Procurement",
  },
  QUOTATION: {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.QUOTATION_STARTED,
    label: "Quotation",
  },
  TENDER: {
    code: PROCESS_FLOW_CODES.TENDER_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.TENDER_STARTED,
    label: "Tender",
  },
};

/**
 * Fixed app events the simulation engine currently listens for.
 * System Admin binds a catalogue process to one of these — rename never changes the trigger.
 * New stages (tender, quotation, …) are added here when the app wires that submit action.
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
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    triggerKey: WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED,
    label: "Micro procurement started",
    description: "Starts when MICRO is selected after requisition approval.",
  },
  {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.QUOTATION_STARTED,
    label: "Quotation process started",
    description: "Starts when QUOTATION is selected after requisition approval.",
  },
  {
    code: PROCESS_FLOW_CODES.TENDER_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.TENDER_STARTED,
    label: "Tender process started",
    description: "Starts when TENDER is selected after requisition approval.",
  },
  {
    code: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.EVALUATION_STARTED,
    label: "Evaluation started",
    description: "Starts when a committee opens an evaluation report for a procurement.",
  },
  {
    code: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED,
    label: "Post-qualification started",
    description: "Starts when a post-qualification checklist is opened after an approved evaluation.",
  },
  {
    code: PROCESS_FLOW_CODES.LPO_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.LPO_STARTED,
    label: "LPO started",
    description: "Starts when a Local Purchase Order is drafted for a Quotation procurement.",
  },
  {
    code: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.CONTRACT_STARTED,
    label: "Contract started",
    description: "Starts when a contract is drafted for a Tender procurement.",
  },
  {
    code: PROCESS_FLOW_CODES.INVOICE_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.INVOICE_STARTED,
    label: "Invoice started",
    description: "Starts when a supplier invoice is logged against a procurement.",
  },
  {
    code: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
    triggerKey: WORKFLOW_TRIGGERS.PAYMENT_STARTED,
    label: "Payment started",
    description: "Starts when a payment is raised against a verified invoice.",
  },
];

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
      "Create and approve a procurement requisition with plan and funding verification.",
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
        stepNumber: 4,
        taskDescription: "Verify Funding Availability",
        roleName: "Head PDU",
        actionKey: "VERIFY",
      },
      {
        stepNumber: 5,
        taskDescription: "Approve Requisition",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 6,
        taskDescription: "Select Procurement Method",
        roleName: "Procurement Officer",
        actionKey: "SELECT_METHOD",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    name: "Micro Procurement Process",
    description:
      "Raise, verify, confirm budget, approve, issue a purchase instruction, then delivery, invoice, payment and closure for micro procurement.",
    triggerKey: WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Raise Micro Procurement Request",
        roleName: "User Department Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Verify Requirement",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Confirm Budget",
        roleName: "Procurement Officer",
        actionKey: "VERIFY",
      },
      {
        stepNumber: 4,
        taskDescription: "Approve Micro Procurement",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 5,
        taskDescription: "Issue Purchase Instruction",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 6,
        taskDescription: "Confirm Supplier",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 7,
        taskDescription: "Record Delivery/Receipt",
        roleName: "User Department Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 8,
        taskDescription: "Verify/Accept Delivery",
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 9,
        taskDescription: "Process Invoice",
        roleName: "Contracts Officer",
        actionKey: "VERIFY",
      },
      {
        stepNumber: 10,
        taskDescription: "Approve Payment",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 11,
        taskDescription: "Record Payment",
        roleName: "Finance/Budget Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 12,
        taskDescription: "Close Procurement",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    name: "Quotation Process",
    description:
      "RFQ preparation through award, LPO, delivery, invoice, payment and closure for the quotation route.",
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
        roleName: "Contracts Officer",
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
        stepNumber: 8,
        taskDescription: "Nominate Evaluation Committee",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 9,
        taskDescription: "Approve Evaluation Committee",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 10,
        taskDescription: "Technical Evaluation",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 11,
        taskDescription: "Financial Evaluation",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 12,
        taskDescription: "Prepare Evaluation Report",
        roleName: "Contracts Officer",
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
        roleName: "Contracts Officer",
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
        roleName: "Accounting Officer",
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
        roleName: "User Department Officer",
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
    code: PROCESS_FLOW_CODES.TENDER_PROCESS,
    name: "Tender Process",
    description:
      "Tender documentation through evaluation, award, contract, delivery, invoice, payment and closure.",
    triggerKey: WORKFLOW_TRIGGERS.TENDER_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Prepare Tender Documents",
        roleName: "Procurement Officer",
        actionKey: "SUBMIT",
      },
      {
        stepNumber: 2,
        taskDescription: "Review Tender Documents",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 3,
        taskDescription: "Approve Tender Documents",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 4,
        taskDescription: "Advertise Tender",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 5,
        taskDescription: "Receive Bids",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 6,
        taskDescription: "Close Tender Submission",
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
        stepNumber: 9,
        taskDescription: "Nominate Evaluation Committee",
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 10,
        taskDescription: "Approve Evaluation Committee",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 11,
        taskDescription: "Technical Evaluation",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 12,
        taskDescription: "Financial Evaluation",
        roleName: "Contracts Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 13,
        taskDescription: "Prepare Evaluation Report",
        roleName: "Contracts Officer",
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
        roleName: "Procurement Officer",
        actionKey: "COMPLETE",
      },
      {
        stepNumber: 16,
        taskDescription: "Approve Evaluation/Recommendation",
        roleName: "Contracts Officer",
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
        roleName: "Accounting Officer",
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
        roleName: "Head User Department",
        actionKey: "APPROVE",
      },
      {
        stepNumber: 26,
        taskDescription: "Invoice",
        roleName: "User Department Officer",
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
    ],
  },
  {
    code: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    name: "Evaluation Process",
    description:
      "Tracks committee evaluation of offers/bids through to approval of the evaluation report.",
    triggerKey: WORKFLOW_TRIGGERS.EVALUATION_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve Evaluation Report",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
    name: "Post-Qualification Process",
    description:
      "Tracks verification of the recommended supplier's registration, tax compliance, and experience before award.",
    triggerKey: WORKFLOW_TRIGGERS.POST_QUALIFICATION_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve Post-Qualification Checklist",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.LPO_PROCESS,
    name: "LPO Process",
    description: "Tracks Local Purchase Order approval and issuance for the Quotation path.",
    triggerKey: WORKFLOW_TRIGGERS.LPO_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve and Issue LPO",
        roleName: "Head PDU",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    name: "Contract Process",
    description: "Tracks contract approval, signature, and issuance for the Tender path.",
    triggerKey: WORKFLOW_TRIGGERS.CONTRACT_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve and Issue Contract",
        roleName: "Contracts Officer",
        actionKey: "APPROVE",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.INVOICE_PROCESS,
    name: "Invoice Process",
    description: "Tracks certification and verification of a supplier invoice.",
    triggerKey: WORKFLOW_TRIGGERS.INVOICE_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Certify and Verify Invoice",
        roleName: "Finance/Budget Officer",
        actionKey: "VERIFY",
      },
    ],
  },
  {
    code: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
    name: "Payment Process",
    description: "Tracks approval and settlement of a payment against a verified invoice.",
    triggerKey: WORKFLOW_TRIGGERS.PAYMENT_STARTED,
    steps: [
      {
        stepNumber: 1,
        taskDescription: "Approve and Pay",
        roleName: "Accounting Officer",
        actionKey: "APPROVE",
      },
    ],
  },
];

/**
 * Ensures baseline process templates exist with steps.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function ensureBaselineProcessTemplates(prisma) {
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
        name: tpl.name,
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

    const maxStep = Math.max(...tpl.steps.map((s) => s.stepNumber));
    await prisma.projectOrgProcessFlowItem.deleteMany({
      where: {
        processFlowId: flow.id,
        stepNumber: { gt: maxStep },
      },
    });
  }
}

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
