/**
 * Academic Project scoring: allowed engine processes share a grading scale.
 * Dependencies follow the procurement path so a lecturer cannot allow a later
 * process while turning off what it needs.
 */
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";

export const DEFAULT_ASSESSMENT_TOTAL_MARKS = 100;
export const DEFAULT_ASSESSMENT_PASS_MARK = 50;

/**
 * Educational A–Z order for examiner scoring (engine process codes).
 * @type {Array<{
 *   code: string;
 *   name: string;
 *   summary: string;
 *   dependsOn: string[];
 *   dependsOnAny?: string[];
 *   group?: 'CORE' | 'METHOD' | 'AWARD' | 'PAY';
 *   defaultAllowed?: boolean;
 * }>}
 */
export const ASSESSMENT_PROCESS_CATALOGUE = [
  {
    code: PROCESS_FLOW_CODES.BUDGETING,
    name: "Budgeting",
    summary: "Prepare and approve the department budget.",
    dependsOn: [],
    group: "CORE",
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_PLANNING,
    name: "Procurement planning",
    summary: "Prepare and approve the procurement plan.",
    dependsOn: [PROCESS_FLOW_CODES.BUDGETING],
    group: "CORE",
  },
  {
    code: PROCESS_FLOW_CODES.EMERGENCY_PLANNING,
    name: "Emergency planning",
    summary: "Prepare and approve an emergency procurement plan.",
    dependsOn: [PROCESS_FLOW_CODES.PROCUREMENT_PLANNING],
    group: "CORE",
    defaultAllowed: false,
  },
  {
    code: PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION,
    name: "Requisition",
    summary: "Raise, verify, and approve a procurement requisition.",
    dependsOn: [PROCESS_FLOW_CODES.BUDGETING, PROCESS_FLOW_CODES.PROCUREMENT_PLANNING],
    group: "CORE",
  },
  {
    code: PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
    name: "Micro procurement",
    summary: "Run a micro procurement after requisition approval.",
    dependsOn: [PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION],
    group: "METHOD",
  },
  {
    code: PROCESS_FLOW_CODES.QUOTATION_PROCESS,
    name: "Quotation",
    summary: "Run a quotation process after requisition approval.",
    dependsOn: [PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION],
    group: "METHOD",
  },
  {
    code: PROCESS_FLOW_CODES.TENDER_PROCESS,
    name: "Tender",
    summary: "Run a tender process after requisition approval.",
    dependsOn: [PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION],
    group: "METHOD",
  },
  {
    code: PROCESS_FLOW_CODES.EVALUATION_PROCESS,
    name: "Evaluation",
    summary: "Evaluate bids or quotations.",
    dependsOn: [],
    dependsOnAny: [PROCESS_FLOW_CODES.QUOTATION_PROCESS, PROCESS_FLOW_CODES.TENDER_PROCESS],
    group: "AWARD",
  },
  {
    code: PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS,
    name: "Post-qualification",
    summary: "Confirm the recommended bidder after evaluation.",
    dependsOn: [PROCESS_FLOW_CODES.EVALUATION_PROCESS],
    group: "AWARD",
  },
  {
    code: PROCESS_FLOW_CODES.LPO_PROCESS,
    name: "Local purchase order",
    summary: "Issue an LPO after a quotation award.",
    dependsOn: [PROCESS_FLOW_CODES.QUOTATION_PROCESS],
    group: "AWARD",
  },
  {
    code: PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    name: "Contract",
    summary: "Draft a contract after a tender award.",
    dependsOn: [PROCESS_FLOW_CODES.TENDER_PROCESS],
    group: "AWARD",
  },
  {
    code: PROCESS_FLOW_CODES.INVOICE_PROCESS,
    name: "Invoice",
    summary: "Record a supplier invoice after delivery.",
    dependsOn: [],
    dependsOnAny: [
      PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
      PROCESS_FLOW_CODES.LPO_PROCESS,
      PROCESS_FLOW_CODES.CONTRACT_PROCESS,
    ],
    group: "PAY",
  },
  {
    code: PROCESS_FLOW_CODES.PAYMENT_PROCESS,
    name: "Payment",
    summary: "Pay a verified invoice and close the case.",
    dependsOn: [PROCESS_FLOW_CODES.INVOICE_PROCESS],
    group: "PAY",
  },
];

const METHOD_CODES = new Set([
  PROCESS_FLOW_CODES.MICRO_PROCUREMENT,
  PROCESS_FLOW_CODES.QUOTATION_PROCESS,
  PROCESS_FLOW_CODES.TENDER_PROCESS,
]);

/**
 * @param {string} code
 */
export function assessmentProcessMeta(code) {
  return ASSESSMENT_PROCESS_CATALOGUE.find((p) => p.code === code) || null;
}

/**
 * @param {Iterable<string>} allowedCodes
 * @returns {Set<string>}
 */
export function allowedProcessSet(allowedCodes) {
  return new Set(Array.from(allowedCodes || []).filter(Boolean));
}

/**
 * Why this process cannot be turned off while others stay on.
 * @param {string} code
 * @param {Iterable<string>} allowedCodes
 * @returns {string[]}
 */
export function processDisableBlockers(code, allowedCodes) {
  const allowed = allowedProcessSet(allowedCodes);
  if (!allowed.has(code)) return [];
  const blockers = [];
  for (const item of ASSESSMENT_PROCESS_CATALOGUE) {
    if (!allowed.has(item.code) || item.code === code) continue;
    if ((item.dependsOn || []).includes(code)) {
      blockers.push(`${item.name} needs ${assessmentProcessMeta(code)?.name || code}.`);
      continue;
    }
    if ((item.dependsOnAny || []).includes(code)) {
      const others = (item.dependsOnAny || []).filter((c) => c !== code && allowed.has(c));
      if (others.length === 0) {
        blockers.push(`${item.name} needs at least one of: ${(item.dependsOnAny || []).map((c) => assessmentProcessMeta(c)?.name || c).join(", ")}.`);
      }
    }
  }
  if (METHOD_CODES.has(code) && allowed.has(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION)) {
    const otherMethods = [...METHOD_CODES].filter((c) => c !== code && allowed.has(c));
    if (otherMethods.length === 0) {
      blockers.push("Keep at least one method (Micro, Quotation, or Tender) while Requisition is allowed.");
    }
  }
  return blockers;
}

/**
 * Prerequisites that must also be allowed when turning a process on.
 * @param {string} code
 * @returns {string[]}
 */
export function requiredPrerequisiteCodes(code) {
  const item = assessmentProcessMeta(code);
  if (!item) return [];
  return [...(item.dependsOn || [])];
}

/**
 * @param {Iterable<string>} allowedCodes
 * @returns {string[]}
 */
export function validateAllowedProcessSet(allowedCodes) {
  const allowed = allowedProcessSet(allowedCodes);
  const errors = [];
  if (allowed.size === 0) {
    errors.push("Allow at least one process for this project.");
    return errors;
  }
  for (const item of ASSESSMENT_PROCESS_CATALOGUE) {
    if (!allowed.has(item.code)) continue;
    for (const dep of item.dependsOn || []) {
      if (!allowed.has(dep)) {
        errors.push(
          `${item.name} cannot be allowed without ${assessmentProcessMeta(dep)?.name || dep}.`,
        );
      }
    }
    if (item.dependsOnAny?.length) {
      const anyOn = item.dependsOnAny.some((c) => allowed.has(c));
      if (!anyOn) {
        errors.push(
          `${item.name} needs at least one of: ${item.dependsOnAny.map((c) => assessmentProcessMeta(c)?.name || c).join(", ")}.`,
        );
      }
    }
  }
  if (allowed.has(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION)) {
    const methodOn = [...METHOD_CODES].some((c) => allowed.has(c));
    if (!methodOn) {
      errors.push("Requisition needs at least one procurement method (Micro, Quotation, or Tender).");
    }
  }
  return errors;
}
