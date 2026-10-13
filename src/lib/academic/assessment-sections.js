/**
 * Academic scoring sections: organisation setup plus every engine process, each broken
 * into the items a student performs (create, submit, each workflow step).
 *
 * Storage reuses `AssessmentProcess`: section rows use the section key as `processCode`,
 * item rows use `"<SECTION>:<ITEM>"`. Process sections keep their engine process code as
 * key, so `isAllowed` on that row still decides whether the attempt org may run it.
 *
 * Client-safe (no Prisma imports).
 */
import { BASELINE_PROCESS_TEMPLATES, PROCESS_FLOW_CODES } from "@/lib/projects/process-catalogue";
import { ASSESSMENT_PROCESS_CATALOGUE } from "@/lib/academic/assessment-process-catalogue";

const C = PROCESS_FLOW_CODES;

/** Evidence keys counted from organisation records. */
export const SCORING_COUNT_KEYS = {
  DEPARTMENTS: "departments",
  SUBUNITS: "subunits",
  USERS: "users",
  USERS_IN_DEPARTMENT: "usersInDepartment",
  COMMITTEES: "committees",
  COMMITTEE_MEMBERS: "committeeMembers",
  FINANCIAL_YEARS: "financialYears",
  PLANNING_PERIODS: "planningPeriods",
  PROVIDERS: "providers",
  BUDGETS: "budgets",
  PLANS: "plans",
  EMERGENCY_PLANS: "emergencyPlans",
  REQUISITIONS: "requisitions",
};

const K = SCORING_COUNT_KEYS;

/**
 * Method-workflow steps that belong to a phase process: `METHOD:step` → phase steps.
 * Each method step is scored once, under its phase section.
 * @type {Record<string, Array<[string, number]>>}
 */
const PHASE_STEP_MAP = {
  [`${C.QUOTATION_PROCESS}:10`]: [[C.EVALUATION_PROCESS, 1]],
  [`${C.QUOTATION_PROCESS}:11`]: [[C.EVALUATION_PROCESS, 2]],
  [`${C.QUOTATION_PROCESS}:12`]: [[C.EVALUATION_PROCESS, 3]],
  [`${C.QUOTATION_PROCESS}:13`]: [[C.EVALUATION_PROCESS, 4]],
  [`${C.QUOTATION_PROCESS}:14`]: [[C.EVALUATION_PROCESS, 5]],
  [`${C.QUOTATION_PROCESS}:19`]: [[C.LPO_PROCESS, 1]],
  [`${C.QUOTATION_PROCESS}:20`]: [[C.LPO_PROCESS, 2]],
  [`${C.QUOTATION_PROCESS}:21`]: [[C.LPO_PROCESS, 3]],
  [`${C.QUOTATION_PROCESS}:22`]: [[C.LPO_PROCESS, 4]],
  [`${C.QUOTATION_PROCESS}:26`]: [[C.INVOICE_PROCESS, 1]],
  [`${C.QUOTATION_PROCESS}:27`]: [[C.INVOICE_PROCESS, 2]],
  [`${C.QUOTATION_PROCESS}:28`]: [[C.PAYMENT_PROCESS, 1]],
  [`${C.QUOTATION_PROCESS}:29`]: [[C.PAYMENT_PROCESS, 2]],
  [`${C.TENDER_PROCESS}:11`]: [[C.EVALUATION_PROCESS, 1]],
  [`${C.TENDER_PROCESS}:12`]: [[C.EVALUATION_PROCESS, 2]],
  [`${C.TENDER_PROCESS}:13`]: [[C.EVALUATION_PROCESS, 3]],
  [`${C.TENDER_PROCESS}:14`]: [[C.EVALUATION_PROCESS, 4]],
  [`${C.TENDER_PROCESS}:15`]: [[C.POST_QUALIFICATION_PROCESS, 1]],
  [`${C.TENDER_PROCESS}:16`]: [
    [C.EVALUATION_PROCESS, 5],
    [C.POST_QUALIFICATION_PROCESS, 2],
  ],
  [`${C.TENDER_PROCESS}:20`]: [[C.CONTRACT_PROCESS, 1]],
  [`${C.TENDER_PROCESS}:21`]: [[C.CONTRACT_PROCESS, 2]],
  [`${C.TENDER_PROCESS}:22`]: [[C.CONTRACT_PROCESS, 3]],
  [`${C.TENDER_PROCESS}:23`]: [[C.CONTRACT_PROCESS, 4]],
  [`${C.TENDER_PROCESS}:26`]: [[C.INVOICE_PROCESS, 1]],
  [`${C.TENDER_PROCESS}:27`]: [[C.INVOICE_PROCESS, 2]],
  [`${C.TENDER_PROCESS}:28`]: [[C.PAYMENT_PROCESS, 1]],
  [`${C.TENDER_PROCESS}:29`]: [[C.PAYMENT_PROCESS, 2]],
  [`${C.MICRO_PROCUREMENT}:4`]: [
    [C.INVOICE_PROCESS, 1],
    [C.INVOICE_PROCESS, 2],
  ],
  [`${C.MICRO_PROCUREMENT}:5`]: [[C.PAYMENT_PROCESS, 1]],
  [`${C.MICRO_PROCUREMENT}:6`]: [[C.PAYMENT_PROCESS, 2]],
};

/** Record a process section starts with, scored before its workflow is submitted. */
const RECORD_CREATE_ITEMS = {
  [C.BUDGETING]: { label: "Create budget", count: K.BUDGETS },
  [C.PROCUREMENT_PLANNING]: { label: "Create procurement plan", count: K.PLANS },
  [C.EMERGENCY_PLANNING]: { label: "Create emergency plan", count: K.EMERGENCY_PLANS },
  [C.PROCUREMENT_REQUISITION]: { label: "Create requisition", count: K.REQUISITIONS },
};

/**
 * @typedef {{ key: string; label: string; count?: string; steps?: Array<[string, number]> }} ScoringItemDef
 * @typedef {{ key: string; name: string; group: string; processCode: string | null; items: ScoringItemDef[] }} ScoringSectionDef
 */

/** @type {ScoringSectionDef[]} */
const ORG_SECTIONS = [
  {
    key: "ORG_DEPARTMENTS",
    name: "Departments",
    group: "ORG",
    processCode: null,
    items: [
      { key: "DEPARTMENT", label: "Create department", count: K.DEPARTMENTS },
      { key: "SUBUNIT", label: "Create sub-unit", count: K.SUBUNITS },
    ],
  },
  {
    key: "ORG_USERS",
    name: "Users",
    group: "ORG",
    processCode: null,
    items: [
      { key: "USER", label: "Create user", count: K.USERS },
      { key: "USER_DEPARTMENT", label: "Assign user to department", count: K.USERS_IN_DEPARTMENT },
    ],
  },
  {
    key: "ORG_COMMITTEES",
    name: "Committees",
    group: "ORG",
    processCode: null,
    items: [
      { key: "COMMITTEE", label: "Create committee", count: K.COMMITTEES },
      { key: "MEMBER", label: "Add committee member", count: K.COMMITTEE_MEMBERS },
    ],
  },
  {
    key: "ORG_FINANCIAL_YEARS",
    name: "Financial years",
    group: "ORG",
    processCode: null,
    items: [
      { key: "FINANCIAL_YEAR", label: "Create financial year", count: K.FINANCIAL_YEARS },
      { key: "PLANNING_PERIOD", label: "Create planning period", count: K.PLANNING_PERIODS },
    ],
  },
  {
    key: "ORG_PROVIDERS",
    name: "Providers",
    group: "ORG",
    processCode: null,
    items: [{ key: "PROVIDER", label: "Register provider", count: K.PROVIDERS }],
  },
];

/**
 * @param {string} code
 * @returns {ScoringItemDef[]}
 */
function processItems(code) {
  const template = BASELINE_PROCESS_TEMPLATES.find((t) => t.code === code);
  /** @type {ScoringItemDef[]} */
  const items = [];
  const create = RECORD_CREATE_ITEMS[code];
  if (create) items.push({ key: "CREATE", label: create.label, count: create.count });

  /** Method steps mapped onto this phase (phase step → method steps). */
  /** @type {Map<number, Array<[string, number]>>} */
  const fromMethods = new Map();
  for (const [methodStep, targets] of Object.entries(PHASE_STEP_MAP)) {
    const [methodCode, stepText] = methodStep.split(":");
    for (const [phaseCode, phaseStep] of targets) {
      if (phaseCode !== code) continue;
      const list = fromMethods.get(phaseStep) || [];
      list.push([methodCode, Number(stepText)]);
      fromMethods.set(phaseStep, list);
    }
  }

  for (const step of template?.steps || []) {
    if (PHASE_STEP_MAP[`${code}:${step.stepNumber}`]) continue;
    const label = create && step.actionKey === "SUBMIT" ? "Submit for approval" : step.taskDescription;
    items.push({
      key: `S${step.stepNumber}`,
      label,
      steps: [[code, step.stepNumber], ...(fromMethods.get(step.stepNumber) || [])],
    });
  }
  return items;
}

/** @type {ScoringSectionDef[]} */
export const SCORING_SECTIONS = [
  ...ORG_SECTIONS,
  ...ASSESSMENT_PROCESS_CATALOGUE.map((p) => ({
    key: p.code,
    name: p.name,
    group: p.group || "CORE",
    processCode: p.code,
    items: processItems(p.code),
  })),
];

export const SCORING_GROUP_LABELS = {
  ORG: "Organisation setup",
  CORE: "Budget, planning & requisition",
  METHOD: "Procurement methods",
  AWARD: "Evaluation & award",
  PAY: "Invoice & payment",
};

const SECTION_BY_KEY = new Map(SCORING_SECTIONS.map((s) => [s.key, s]));

/** @param {string} key */
export function scoringSectionDef(key) {
  return SECTION_BY_KEY.get(key) || null;
}

/** @param {string} sectionKey @param {string} itemKey */
export function scoringItemRowKey(sectionKey, itemKey) {
  return `${sectionKey}:${itemKey}`;
}

/** Process codes the engine knows — used to tell process sections from org sections. */
export const PROCESS_SECTION_CODES = new Set(ASSESSMENT_PROCESS_CATALOGUE.map((p) => p.code));

/**
 * Unavailable processes cannot be scored: force their section rows off.
 * @template {{ processCode: string; isAllowed?: boolean }} T
 * @param {T[]} rows
 * @param {Iterable<string>} enabledCodes
 * @returns {T[]}
 */
export function applyProcessAvailability(rows, enabledCodes) {
  const enabled = new Set(enabledCodes);
  const known = new Set((rows || []).map((r) => r.processCode));
  const out = (rows || []).map((r) =>
    PROCESS_SECTION_CODES.has(r.processCode) && !enabled.has(r.processCode)
      ? { ...r, isAllowed: false, marksPinned: false }
      : r,
  );
  for (const code of PROCESS_SECTION_CODES) {
    if (!enabled.has(code) && !known.has(code)) {
      out.push(/** @type {T} */ ({ processCode: code, isAllowed: false, marks: 0, marksPinned: false }));
    }
  }
  return out;
}

/** @param {string} key */
function sectionDefaultEnabled(key) {
  const meta = ASSESSMENT_PROCESS_CATALOGUE.find((p) => p.code === key);
  return meta ? meta.defaultAllowed !== false : true;
}

/** @param {unknown} n */
function toCents(n) {
  return Math.max(0, Math.round((Number(n) || 0) * 100));
}

/** @param {number} cents */
function fromCents(cents) {
  return Math.round(cents) / 100;
}

/**
 * Share `total` across enabled entries; pinned entries keep their marks.
 * @param {Array<{ isAllowed: boolean; marksPinned: boolean; marks: number }>} entries mutated in place
 * @param {number} total
 * @returns {string | null} error
 */
function shareMarks(entries, total) {
  const totalCents = toCents(total);
  for (const e of entries) {
    if (!e.isAllowed) {
      e.marks = 0;
      e.marksPinned = false;
    }
  }
  const enabled = entries.filter((e) => e.isAllowed);
  const pinned = enabled.filter((e) => e.marksPinned);
  const free = enabled.filter((e) => !e.marksPinned);
  const pinnedCents = pinned.reduce((s, e) => s + toCents(e.marks), 0);
  for (const e of pinned) e.marks = fromCents(toCents(e.marks));
  if (pinnedCents > totalCents) {
    for (const e of free) e.marks = 0;
    return `Set marks (${fromCents(pinnedCents)}) exceed ${fromCents(totalCents)}.`;
  }
  const remaining = totalCents - pinnedCents;
  if (!free.length) {
    if (!enabled.length) return totalCents === 0 ? null : "Enable at least one.";
    return remaining === 0
      ? null
      : `Marks (${fromCents(pinnedCents)}) must add up to ${fromCents(totalCents)}.`;
  }
  const base = Math.floor(remaining / free.length);
  let extra = remaining - base * free.length;
  for (const e of free) {
    e.marks = fromCents(base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  return null;
}

/**
 * @typedef {{ key: string; label: string; isAllowed: boolean; marks: number; marksPinned: boolean }} ScoringItemState
 * @typedef {{
 *   key: string; name: string; group: string; processCode: string | null;
 *   isAllowed: boolean; marks: number; marksPinned: boolean; items: ScoringItemState[];
 *   error?: string | null;
 * }} ScoringSectionState
 */

/**
 * Normalise stored rows (or an incoming payload) into the full section tree and
 * recompute every unpinned mark. Unknown keys are ignored.
 *
 * @param {Array<{ processCode: string; isAllowed?: boolean; marks?: number; marksPinned?: boolean }>} rows
 * @param {number} totalMarks
 * @returns {{ sections: ScoringSectionState[]; ok: boolean; error: string | null; sectionErrors: Record<string, string> }}
 */
export function buildScoringTree(rows, totalMarks) {
  const stored = new Map((rows || []).map((r) => [String(r.processCode), r]));
  /** @type {ScoringSectionState[]} */
  const sections = SCORING_SECTIONS.map((def) => {
    const row = stored.get(def.key);
    return {
      key: def.key,
      name: def.name,
      group: def.group,
      processCode: def.processCode,
      isAllowed: row ? row.isAllowed !== false : sectionDefaultEnabled(def.key),
      marksPinned: row?.marksPinned === true,
      marks: Number(row?.marks) || 0,
      items: def.items.map((item) => {
        const itemRow = stored.get(scoringItemRowKey(def.key, item.key));
        return {
          key: item.key,
          label: item.label,
          isAllowed: itemRow ? itemRow.isAllowed !== false : true,
          marksPinned: itemRow?.marksPinned === true,
          marks: Number(itemRow?.marks) || 0,
        };
      }),
    };
  });

  const error = shareMarks(sections, totalMarks);
  /** @type {Record<string, string>} */
  const sectionErrors = {};
  for (const section of sections) {
    if (!section.isAllowed) {
      for (const item of section.items) {
        item.marks = 0;
        item.marksPinned = false;
      }
      continue;
    }
    if (section.marks > 0 && !section.items.some((i) => i.isAllowed)) {
      sectionErrors[section.key] = "Enable at least one item.";
      continue;
    }
    const itemError = shareMarks(section.items, section.marks);
    if (itemError) sectionErrors[section.key] = itemError;
  }
  for (const section of sections) section.error = sectionErrors[section.key] || null;
  return {
    sections,
    ok: !error && Object.keys(sectionErrors).length === 0,
    error,
    sectionErrors,
  };
}

/**
 * Flatten a section tree back into `AssessmentProcess` rows.
 * @param {ScoringSectionState[]} sections
 */
export function scoringTreeToRows(sections) {
  /** @type {Array<{ processCode: string; isAllowed: boolean; marks: number; marksPinned: boolean }>} */
  const rows = [];
  for (const section of sections) {
    rows.push({
      processCode: section.key,
      isAllowed: section.isAllowed,
      marks: section.marks,
      marksPinned: section.marksPinned,
    });
    for (const item of section.items) {
      rows.push({
        processCode: scoringItemRowKey(section.key, item.key),
        isAllowed: item.isAllowed,
        marks: item.marks,
        marksPinned: item.marksPinned,
      });
    }
  }
  return rows;
}

/**
 * @typedef {{ counts: Record<string, number>; steps: Record<string, number> }} ScoringEvidence
 * `steps` is keyed by `"<PROCESS_CODE>:<stepNumber>"` → positive workflow actions recorded.
 */

/**
 * @param {ScoringItemDef} def
 * @param {ScoringEvidence} evidence
 */
function itemEvidenceCount(def, evidence) {
  let n = 0;
  if (def.count) n += Number(evidence?.counts?.[def.count]) || 0;
  for (const [code, step] of def.steps || []) n += Number(evidence?.steps?.[`${code}:${step}`]) || 0;
  return n;
}

/**
 * Award each enabled item when any record reached it (e.g. one approved budget out of three).
 * @param {ScoringSectionState[]} sections
 * @param {ScoringEvidence} evidence
 */
export function evaluateScoringSections(sections, evidence) {
  return (sections || [])
    .filter((s) => s.isAllowed)
    .map((section) => {
      const def = SECTION_BY_KEY.get(section.key);
      const items = section.items
        .filter((i) => i.isAllowed)
        .map((item) => {
          const itemDef = def?.items.find((d) => d.key === item.key);
          const count = itemDef ? itemEvidenceCount(itemDef, evidence) : 0;
          const satisfied = count > 0;
          return {
            key: item.key,
            label: item.label,
            marks: item.marks,
            count,
            satisfied,
            awarded: satisfied ? item.marks : 0,
          };
        });
      const awarded = fromCents(items.reduce((s, i) => s + toCents(i.awarded), 0));
      const completedItems = items.filter((i) => i.satisfied).length;
      return {
        processCode: section.key,
        sectionKey: section.key,
        label: section.name,
        group: section.group,
        marks: section.marks,
        awarded,
        completedItems,
        totalItems: items.length,
        satisfied: items.length > 0 && completedItems === items.length,
        items,
      };
    });
}

/** @param {number} n */
export function formatMarks(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}
