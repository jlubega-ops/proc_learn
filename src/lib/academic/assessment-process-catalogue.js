/**
 * Academic Project scoring: allowed engine processes share a grading scale.
 * Dependencies follow the procurement path so a lecturer cannot allow a later
 * process while turning off what it needs.
 */
import { PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import { OrgProcurementStatus } from "@prisma/client";

export const ASSESSMENT_PASS_MARK_PRESETS = [30, 40, 50, 60, 70];
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

/**
 * Split totalMarks across allowed processes. Pinned marks stay; the rest share what remains.
 * @param {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} rows
 * @param {number} totalMarks
 */
export function redistributeProcessMarks(rows, totalMarks) {
  const total = Math.max(0, Math.round(Number(totalMarks) || 0));
  const next = (rows || []).map((row) => ({
    processCode: row.processCode,
    isAllowed: row.isAllowed !== false,
    marksPinned: row.marksPinned === true,
    marks: Math.max(0, Math.round(Number(row.marks) || 0)),
  }));

  for (const row of next) {
    if (!row.isAllowed) {
      row.marks = 0;
      row.marksPinned = false;
    }
  }

  const allowed = next.filter((r) => r.isAllowed);
  const pinned = allowed.filter((r) => r.marksPinned);
  const unpinned = allowed.filter((r) => !r.marksPinned);
  let pinnedSum = pinned.reduce((s, r) => s + r.marks, 0);
  if (pinnedSum > total) {
    return {
      rows: next,
      total,
      pinnedSum,
      remaining: 0,
      ok: false,
      error: `Pinned process marks (${pinnedSum}) exceed the total grade (${total}).`,
    };
  }
  const remaining = total - pinnedSum;
  const n = unpinned.length;
  if (n === 0) {
    const sum = allowed.reduce((s, r) => s + r.marks, 0);
    return {
      rows: next,
      total,
      pinnedSum,
      remaining: total - sum,
      ok: sum === total,
      error: sum === total ? null : `Allowed process marks (${sum}) must equal the total grade (${total}).`,
    };
  }
  const base = Math.floor(remaining / n);
  let extra = remaining % n;
  for (const row of next) {
    if (!row.isAllowed || row.marksPinned) continue;
    row.marks = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
  }
  return { rows: next, total, pinnedSum, remaining: 0, ok: true, error: null };
}

const PROC_RANK = {
  [OrgProcurementStatus.DRAFT]: 1,
  [OrgProcurementStatus.METHOD_SELECTED]: 2,
  [OrgProcurementStatus.IN_PROGRESS]: 3,
  [OrgProcurementStatus.SOLICITATION]: 4,
  [OrgProcurementStatus.EVALUATION]: 5,
  [OrgProcurementStatus.AWARD_PENDING]: 6,
  [OrgProcurementStatus.AWARDED]: 7,
  [OrgProcurementStatus.CONTRACTING]: 8,
  [OrgProcurementStatus.CONTRACT_ACTIVE]: 9,
  [OrgProcurementStatus.DELIVERY]: 10,
  [OrgProcurementStatus.INSPECTION]: 11,
  [OrgProcurementStatus.INVOICING]: 12,
  [OrgProcurementStatus.PAYMENT]: 13,
  [OrgProcurementStatus.READY_FOR_CLOSURE]: 14,
  [OrgProcurementStatus.CLOSED]: 15,
};

/**
 * @param {{ procurementMethod?: string | null; status?: string | null }[]} procurements
 * @param {string} method
 * @param {number} minRank
 */
function hasMethodAtLeast(procurements, method, minRank) {
  return (procurements || []).some((p) => {
    if (String(p.procurementMethod || "").toUpperCase() !== method) return false;
    return (PROC_RANK[p.status] || 0) >= minRank;
  });
}

/**
 * @param {any} progress
 * @param {string} key
 */
function stageDone(progress, key) {
  if (progress?.done && progress.done[key]) return true;
  const stage = (progress?.stages || []).find((s) => s.key === key);
  return stage?.state === "done";
}

/**
 * Whether an allowed process is complete in the live procurement domain.
 * @param {string} processCode
 * @param {{
 *   progress?: { done?: Record<string, boolean>; stages?: { key: string; state: string }[] } | null;
 *   procurements?: { procurementMethod?: string | null; status?: string | null }[];
 * }} ctx
 */
export function isAssessmentProcessComplete(processCode, ctx) {
  const progress = ctx?.progress || null;
  const procurements = ctx?.procurements || [];

  switch (processCode) {
    case PROCESS_FLOW_CODES.BUDGETING:
      return stageDone(progress, "BUDGET");
    case PROCESS_FLOW_CODES.PROCUREMENT_PLANNING:
      return stageDone(progress, "PROCUREMENT_PLANNING");
    case PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION:
      return stageDone(progress, "APPROVAL");
    case PROCESS_FLOW_CODES.MICRO_PROCUREMENT:
      return hasMethodAtLeast(procurements, "MICRO", PROC_RANK[OrgProcurementStatus.IN_PROGRESS]);
    case PROCESS_FLOW_CODES.QUOTATION_PROCESS:
      return hasMethodAtLeast(procurements, "QUOTATION", PROC_RANK[OrgProcurementStatus.SOLICITATION]);
    case PROCESS_FLOW_CODES.TENDER_PROCESS:
      return hasMethodAtLeast(procurements, "TENDER", PROC_RANK[OrgProcurementStatus.SOLICITATION]);
    case PROCESS_FLOW_CODES.EVALUATION_PROCESS:
      return stageDone(progress, "EVALUATION");
    case PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS:
      return (
        hasMethodAtLeast(procurements, "TENDER", PROC_RANK[OrgProcurementStatus.AWARDED]) ||
        hasMethodAtLeast(procurements, "QUOTATION", PROC_RANK[OrgProcurementStatus.AWARDED])
      );
    case PROCESS_FLOW_CODES.LPO_PROCESS:
      return hasMethodAtLeast(procurements, "QUOTATION", PROC_RANK[OrgProcurementStatus.CONTRACTING]);
    case PROCESS_FLOW_CODES.CONTRACT_PROCESS:
      return hasMethodAtLeast(procurements, "TENDER", PROC_RANK[OrgProcurementStatus.CONTRACTING]);
    case PROCESS_FLOW_CODES.INVOICE_PROCESS:
      return stageDone(progress, "DELIVERY") || stageDone(progress, "CLOSURE");
    case PROCESS_FLOW_CODES.PAYMENT_PROCESS:
      return stageDone(progress, "CLOSURE");
    default:
      return false;
  }
}

/**
 * @param {Array<{ processCode: string; isAllowed?: boolean; marks?: number; label?: string }>} processes
 * @param {{ progress?: any; procurements?: any[] }} ctx
 */
export function evaluateAllowedProcesses(processes, ctx) {
  const allowed = (processes || []).filter((p) => p.isAllowed !== false);
  return allowed.map((p) => {
    const meta = assessmentProcessMeta(p.processCode);
    const marks = Math.max(0, Number(p.marks) || 0);
    const satisfied = isAssessmentProcessComplete(p.processCode, ctx);
    return {
      processCode: p.processCode,
      label: p.label || meta?.name || p.processCode,
      marks,
      satisfied,
      awarded: satisfied ? marks : 0,
      detail: satisfied ? `${meta?.name || p.processCode} completed` : `${meta?.name || p.processCode} not completed`,
    };
  });
}
