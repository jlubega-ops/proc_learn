/**
 * Procurement-path dependencies between organisation processes (client + server).
 * A process cannot be activated before what it needs, and cannot be deactivated while an
 * active process still needs it. Same graph the examiner uses for allowed processes.
 */
import { PROCESS_FLOW_CODES, TRIGGER_TO_PROCESS_CODE } from "@/lib/projects/process-catalogue";
import {
  ASSESSMENT_PROCESS_CATALOGUE,
  assessmentProcessMeta,
} from "@/lib/academic/assessment-process-catalogue";
import { METHOD_PROCESS_CODES } from "@/lib/projects/procurement-methods";

const METHOD_CODES = [...METHOD_PROCESS_CODES];

/** Procurement-path order for listing processes. */
export const PROCESS_PATH_ORDER = ASSESSMENT_PROCESS_CATALOGUE.map((p) => p.code);

/**
 * Engine code for a catalogue process flow (by code, or by its bound trigger).
 * @param {{ code?: string | null; triggerKey?: string | null } | null | undefined} flow
 * @returns {string | null}
 */
export function processCodeOfFlow(flow) {
  return flow?.code || TRIGGER_TO_PROCESS_CODE[flow?.triggerKey || ""] || null;
}

/**
 * @param {string} code
 * @param {Record<string, string>} [names]
 */
function nameOf(code, names) {
  return names?.[code] || assessmentProcessMeta(code)?.name || code;
}

/** @param {string[]} list */
function joinAnd(list) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** @param {string[]} list */
function joinOr(list) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

/**
 * Processes that must be active before `code` can be activated.
 * @param {string} code
 * @param {Iterable<string>} activeCodes
 * @param {Record<string, string>} [names]
 * @returns {string[]} messages; empty when activation is allowed
 */
export function processActivationBlockers(code, activeCodes, names) {
  const meta = assessmentProcessMeta(code);
  if (!meta) return [];
  const active = new Set(activeCodes);
  const out = [];
  const missing = (meta.dependsOn || []).filter((c) => !active.has(c));
  if (missing.length) {
    out.push(`Activate ${joinAnd(missing.map((c) => nameOf(c, names)))} first.`);
  }
  const any = meta.dependsOnAny || [];
  if (any.length && !any.some((c) => active.has(c))) {
    out.push(`Activate ${joinOr(any.map((c) => nameOf(c, names)))} first.`);
  }
  return out;
}

/**
 * Active processes that still need `code`, so it cannot be deactivated.
 * @param {string} code
 * @param {Iterable<string>} activeCodes
 * @param {Record<string, string>} [names]
 * @returns {string[]} messages; empty when deactivation is allowed
 */
export function processDeactivationBlockers(code, activeCodes, names) {
  const active = new Set(activeCodes);
  if (!active.has(code)) return [];
  const dependents = [];
  for (const item of ASSESSMENT_PROCESS_CATALOGUE) {
    if (item.code === code || !active.has(item.code)) continue;
    if ((item.dependsOn || []).includes(code)) {
      dependents.push(item.code);
      continue;
    }
    const any = item.dependsOnAny || [];
    if (any.includes(code) && !any.some((c) => c !== code && active.has(c))) {
      dependents.push(item.code);
    }
  }
  const out = [];
  if (dependents.length) {
    out.push(`Deactivate ${joinAnd(dependents.map((c) => nameOf(c, names)))} first.`);
  }
  if (
    METHOD_CODES.includes(code) &&
    active.has(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION) &&
    !METHOD_CODES.some((c) => c !== code && active.has(c))
  ) {
    out.push(
      `Keep one procurement method active while ${nameOf(PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION, names)} is active.`,
    );
  }
  return out;
}

/**
 * @param {Set<string>} set
 * @param {{ code: string; dependsOn?: string[]; dependsOnAny?: string[] }} item
 */
function depsSatisfied(set, item) {
  if ((item.dependsOn || []).some((c) => !set.has(c))) return false;
  const any = item.dependsOnAny || [];
  if (any.length && !any.some((c) => set.has(c))) return false;
  if (item.code === PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION && !METHOD_CODES.some((c) => set.has(c))) {
    return false;
  }
  return true;
}

/**
 * Turning `code` off: it plus every process left without what it needs.
 * @param {string} code
 * @param {Iterable<string>} enabledCodes
 * @returns {string[]} codes to disable, in path order
 */
export function disableCascadeCodes(code, enabledCodes) {
  const set = new Set(enabledCodes);
  if (!set.has(code)) return [];
  set.delete(code);
  const removed = new Set([code]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of ASSESSMENT_PROCESS_CATALOGUE) {
      if (set.has(item.code) && !depsSatisfied(set, item)) {
        set.delete(item.code);
        removed.add(item.code);
        changed = true;
      }
    }
  }
  return PROCESS_PATH_ORDER.filter((c) => removed.has(c));
}

/**
 * Turning `code` on: it plus the prerequisites it needs (first option for "any of").
 * @param {string} code
 * @param {Iterable<string>} enabledCodes
 * @returns {string[]} codes to enable, in path order
 */
export function enableCascadeCodes(code, enabledCodes) {
  const set = new Set(enabledCodes);
  if (set.has(code) || !assessmentProcessMeta(code)) return [];
  const added = new Set();
  /** @param {string} c */
  const add = (c) => {
    if (set.has(c)) return;
    const meta = assessmentProcessMeta(c);
    if (!meta) return;
    set.add(c);
    added.add(c);
    for (const dep of meta.dependsOn || []) add(dep);
    const any = meta.dependsOnAny || [];
    if (any.length && !any.some((x) => set.has(x))) add(any[0]);
    if (c === PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION && !METHOD_CODES.some((x) => set.has(x))) {
      add(METHOD_CODES[0]);
    }
  };
  add(code);
  return PROCESS_PATH_ORDER.filter((c) => added.has(c));
}

/**
 * Names of the processes `code` needs (for a short "Needs …" hint).
 * @param {string} code
 * @param {Record<string, string>} [names]
 */
export function processNeedsLabel(code, names) {
  const meta = assessmentProcessMeta(code);
  if (!meta) return "";
  const parts = [];
  if (meta.dependsOn?.length) parts.push(joinAnd(meta.dependsOn.map((c) => nameOf(c, names))));
  if (meta.dependsOnAny?.length) parts.push(joinOr(meta.dependsOnAny.map((c) => nameOf(c, names))));
  return parts.join("; ");
}
