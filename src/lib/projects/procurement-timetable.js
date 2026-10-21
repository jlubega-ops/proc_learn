/**
 * Sample procurement timetable rules (facilitator guide) + PPDA bidding minima.
 * Working days = Mon–Fri, optionally skipping Uganda public holidays (Nager.Date).
 * If holiday data is unavailable, weekends-only (same as before).
 *
 * Chain (non-consultancy / goods / works):
 *   Bid invitation → closing/opening (method minimum WD)
 *   → evaluation report (15 WD works / 10 WD supplies & non-consultancy)
 *   → award decision (+5 WD) → BEB / award notice (+5 WD)
 *   → contract signing (standstill 10 calendar days + 3 WD for open/restricted tender;
 *      micro / direct / quotation: 3 WD after BEB — standstill exempt)
 */

import {
  methodMinimumBiddingWorkingDays,
  normalizeProcurementMethod,
} from "@/lib/projects/procurement-methods";
import { planMethodToEnum } from "@/lib/projects/procurement-thresholds";
import { normalizeCircularSheet, normalizePlanMethod } from "@/lib/projects/ppda-forms";

/**
 * @param {string | Date | null | undefined} value
 * @returns {Date | null} local calendar date at noon (avoids DST edge issues)
 */
export function parsePlanDate(value) {
  const t = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function formatPlanDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** @param {Date} date */
export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * @param {Date} date
 * @param {Set<string> | null | undefined} holidays YYYY-MM-DD
 */
export function isPublicHoliday(date, holidays) {
  if (!holidays || holidays.size === 0) return false;
  return holidays.has(formatPlanDate(date));
}

/**
 * Weekend or public holiday (when holiday set is provided).
 * @param {Date} date
 * @param {Set<string> | null | undefined} holidays
 */
export function isNonWorkingDay(date, holidays) {
  return isWeekend(date) || isPublicHoliday(date, holidays);
}

/**
 * Move forward by `n` calendar days.
 * @param {Date} date
 * @param {number} n
 */
export function addCalendarDays(date, n) {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + Number(n || 0));
  return out;
}

/**
 * First working day strictly after `date`.
 * @param {Date} date
 * @param {Set<string> | null | undefined} [holidays]
 */
export function nextWorkingDayAfter(date, holidays) {
  let out = addCalendarDays(date, 1);
  while (isNonWorkingDay(out, holidays)) out = addCalendarDays(out, 1);
  return out;
}

/**
 * Add `n` working days after `date` (the start day is not counted).
 * @param {Date} date
 * @param {number} n
 * @param {Set<string> | null | undefined} [holidays]
 */
export function addWorkingDays(date, n, holidays) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  let out = new Date(date.getTime());
  let left = count;
  while (left > 0) {
    out = addCalendarDays(out, 1);
    if (!isNonWorkingDay(out, holidays)) left -= 1;
  }
  return out;
}

/**
 * Minimum bidding / quotation period in working days.
 * Direct / Micro: no prescribed minimum (0).
 *
 * @param {string | null | undefined} methodLabelOrEnum
 * @param {{ directProcurement?: boolean }} [opts]
 * @returns {number}
 */
export function minimumBiddingWorkingDays(methodLabelOrEnum, opts = {}) {
  const method = normalizeProcurementMethod(methodLabelOrEnum, {
    directProcurement: opts.directProcurement,
  });
  if (!method) return 0;
  return methodMinimumBiddingWorkingDays(method);
}

/**
 * Evaluation report working days after bid opening.
 * Works: 15; supplies / non-consultancy (and default): 10.
 *
 * @param {string | null | undefined} categoryOrCircular
 */
export function evaluationWorkingDays(categoryOrCircular) {
  const t = normalizeCircularSheet(categoryOrCircular) || String(categoryOrCircular || "");
  if (/^works$/i.test(t) || (/\bworks\b/i.test(t) && !/\bgoods\b/i.test(t))) return 15;
  return 10;
}

/**
 * Standstill exempt for micro, direct, quotation (3 WD after BEB).
 * @param {string | null | undefined} methodLabelOrEnum
 * @param {{ directProcurement?: boolean }} [opts]
 */
export function isStandstillExempt(methodLabelOrEnum, opts = {}) {
  if (opts.directProcurement) return true;
  const method = normalizeProcurementMethod(methodLabelOrEnum, {
    directProcurement: opts.directProcurement,
  });
  return method === "MICRO" || method === "QUOTATION" || method === "DIRECT";
}

/**
 * Build planned dates from bid invitation (or suggest invitation = next WD after anchor).
 *
 * @param {{
 *   bidInvitationDate?: string | null;
 *   plannedProcurementMethod?: string | null;
 *   category?: string | null;
 *   directProcurement?: boolean;
 *   anchorDate?: string | Date | null;
 *   holidays?: Set<string> | null;
 *   holidaySource?: "api" | "fallback" | "mixed" | null;
 * }} input
 * @returns {{
 *   bidInvitationDate: string;
 *   bidClosingOpeningDate: string;
 *   evaluationReportApprovalDate: string;
 *   awardDecisionDate: string;
 *   awardNotificationDate: string;
 *   contractSigningDate: string;
 *   meta: {
 *     biddingWorkingDays: number;
 *     evaluationWorkingDays: number;
 *     standstillExempt: boolean;
 *     holidaysApplied: boolean;
 *     notes: string[];
 *   };
 * } | null}
 */
export function buildGoodsWorksTimetable(input) {
  const method =
    normalizePlanMethod(input.plannedProcurementMethod) ||
    planMethodToEnum(input.plannedProcurementMethod);
  if (!method && !planMethodToEnum(input.plannedProcurementMethod)) {
    // still allow if enum-like
  }
  const methodKey =
    planMethodToEnum(input.plannedProcurementMethod) ||
    planMethodToEnum(method) ||
    "";
  if (!methodKey) return null;

  const holidays = input.holidays || null;
  const holidaysApplied = Boolean(holidays && holidays.size > 0);

  let invitation = parsePlanDate(input.bidInvitationDate);
  if (!invitation) {
    const anchor =
      parsePlanDate(input.anchorDate) ||
      (input.anchorDate instanceof Date && !Number.isNaN(input.anchorDate.getTime())
        ? input.anchorDate
        : new Date());
    // One day after plan approval (conservative: next working day after anchor)
    invitation = nextWorkingDayAfter(anchor, holidays);
  }

  const biddingWd = minimumBiddingWorkingDays(methodKey, {
    directProcurement: Boolean(input.directProcurement),
  });
  const closing =
    biddingWd > 0
      ? addWorkingDays(invitation, biddingWd, holidays)
      : nextWorkingDayAfter(invitation, holidays);

  const evalWd = evaluationWorkingDays(input.category);
  const evalReport = addWorkingDays(closing, evalWd, holidays);
  const awardDecision = addWorkingDays(evalReport, 5, holidays);
  const bebNotice = addWorkingDays(awardDecision, 5, holidays);

  const standstillExempt = isStandstillExempt(methodKey, {
    directProcurement: Boolean(input.directProcurement),
  });
  let signing;
  /** @type {string[]} */
  const notes = [];
  if (standstillExempt) {
    signing = addWorkingDays(bebNotice, 3, holidays);
    notes.push("Standstill exempt (micro / direct / quotation): signing 3 working days after BEB notice.");
  } else {
    const afterStandstill = addCalendarDays(bebNotice, 10);
    signing = addWorkingDays(afterStandstill, 3, holidays);
    notes.push("Standstill 10 calendar days after BEB, then 3 working days to signing.");
  }
  if (biddingWd > 0) {
    notes.push(`Minimum bidding period: ${biddingWd} working days after invitation.`);
  } else {
    notes.push("No prescribed minimum bidding period (micro / direct).");
  }
  notes.push(
    `Evaluation report: ${evalWd} working days after opening (${
      evalWd === 15 ? "works" : "supplies / non-consultancy"
    }).`,
  );
  if (holidaysApplied) {
    notes.push("Working days exclude weekends and Uganda public holidays.");
  } else {
    notes.push("Working days exclude weekends only (holiday calendar unavailable).");
  }

  return {
    bidInvitationDate: formatPlanDate(invitation),
    bidClosingOpeningDate: formatPlanDate(closing),
    evaluationReportApprovalDate: formatPlanDate(evalReport),
    awardDecisionDate: formatPlanDate(awardDecision),
    awardNotificationDate: formatPlanDate(bebNotice),
    contractSigningDate: formatPlanDate(signing),
    meta: {
      biddingWorkingDays: biddingWd,
      evaluationWorkingDays: evalWd,
      standstillExempt,
      holidaysApplied,
      notes,
    },
  };
}

/**
 * Count working days strictly after `from` up to and including `to`.
 * @param {Date} from
 * @param {Date} to
 * @param {Set<string> | null | undefined} [holidays]
 */
export function workingDaysBetween(from, to, holidays) {
  if (to < from) return -1;
  let n = 0;
  let cur = new Date(from.getTime());
  while (cur < to) {
    cur = addCalendarDays(cur, 1);
    if (!isNonWorkingDay(cur, holidays) && cur <= to) n += 1;
  }
  return n;
}

/**
 * Validate planned dates against minimum gaps. Soft chronological order is separate.
 *
 * @param {Record<string, unknown>} item
 * @param {string} prefix e.g. items.0
 * @param {Set<string> | null | undefined} [holidays]
 * @returns {Record<string, string>}
 */
export function validateGoodsWorksTimetableMinimums(item, prefix, holidays) {
  /** @type {Record<string, string>} */
  const errors = {};
  const methodKey = planMethodToEnum(
    /** @type {any} */ (item).plannedProcurementMethod || item.method,
  );
  if (!methodKey) return errors;

  const invitation = parsePlanDate(item.bidInvitationDate);
  const closing = parsePlanDate(item.bidClosingOpeningDate);
  const evalReport = parsePlanDate(item.evaluationReportApprovalDate);
  const awardDecision = parsePlanDate(item.awardDecisionDate);
  const beb = parsePlanDate(item.awardNotificationDate);
  const signing = parsePlanDate(item.contractSigningDate);

  const direct = Boolean(item.directProcurement);
  const minBid = minimumBiddingWorkingDays(methodKey, {
    directProcurement: direct,
  });
  if (invitation && closing && minBid > 0) {
    const gap = workingDaysBetween(invitation, closing, holidays);
    if (gap < minBid) {
      errors[`${prefix}.bidClosingOpeningDate`] =
        `At least ${minBid} working days after invitation for this method.`;
    }
  }

  const evalWd = evaluationWorkingDays(
    /** @type {any} */ (item).category || item.circularSheet,
  );
  if (closing && evalReport) {
    const gap = workingDaysBetween(closing, evalReport, holidays);
    if (gap < evalWd) {
      errors[`${prefix}.evaluationReportApprovalDate`] =
        `At least ${evalWd} working days after bid opening.`;
    }
  }

  if (evalReport && awardDecision) {
    const gap = workingDaysBetween(evalReport, awardDecision, holidays);
    if (gap < 5) {
      errors[`${prefix}.awardDecisionDate`] =
        "At least 5 working days after the evaluation report.";
    }
  }

  if (awardDecision && beb) {
    const gap = workingDaysBetween(awardDecision, beb, holidays);
    if (gap < 5) {
      errors[`${prefix}.awardNotificationDate`] =
        "BEB notice: at least 5 working days after the award decision.";
    }
  } else if (evalReport && beb && !awardDecision) {
    // Combined path: award decision + BEB = 10 WD after eval
    const gap = workingDaysBetween(evalReport, beb, holidays);
    if (gap < 10) {
      errors[`${prefix}.awardNotificationDate`] =
        "At least 10 working days after evaluation (award decision + BEB).";
    }
  }

  if (beb && signing) {
    if (isStandstillExempt(methodKey, { directProcurement: direct })) {
      const gap = workingDaysBetween(beb, signing, holidays);
      if (gap < 3) {
        errors[`${prefix}.contractSigningDate`] =
          "At least 3 working days after BEB notice (standstill exempt).";
      }
    } else {
      const earliestStandstillEnd = addCalendarDays(beb, 10);
      const earliestSign = addWorkingDays(earliestStandstillEnd, 3, holidays);
      if (formatPlanDate(signing) < formatPlanDate(earliestSign)) {
        errors[`${prefix}.contractSigningDate`] =
          "After 10-day standstill from BEB, plus 3 working days.";
      }
    }
  }

  return errors;
}

/**
 * Apply autofilled timetable onto a plan item (does not overwrite completionDate).
 * @param {Record<string, any>} item
 * @param {{ force?: boolean; anchorDate?: string | null; holidays?: Set<string> | null }} [opts]
 *   force=true always overwrite derived dates; otherwise only fill empty fields.
 */
export function applyTimetableToPlanItem(item, opts = {}) {
  const method = normalizePlanMethod(item.plannedProcurementMethod);
  const methodKey = planMethodToEnum(method);
  if (!methodKey) return item;

  const built = buildGoodsWorksTimetable({
    bidInvitationDate: item.bidInvitationDate,
    plannedProcurementMethod: method,
    category: item.category || item.circularSheet,
    directProcurement: Boolean(item.directProcurement),
    anchorDate: opts.anchorDate || null,
    holidays: opts.holidays || null,
  });
  if (!built) return item;

  const force = Boolean(opts.force);
  /** @param {string} key @param {string} value */
  const set = (key, value) => {
    if (force || !String(item[key] || "").trim()) {
      item[key] = value;
    }
  };

  // Invitation: fill if empty
  if (force || !String(item.bidInvitationDate || "").trim()) {
    item.bidInvitationDate = built.bidInvitationDate;
  }
  // Always refresh derived chain when invitation / method / category / subtype drive autofill
  if (force) {
    item.bidClosingOpeningDate = built.bidClosingOpeningDate;
    item.evaluationReportApprovalDate = built.evaluationReportApprovalDate;
    item.awardDecisionDate = built.awardDecisionDate;
    item.awardNotificationDate = built.awardNotificationDate;
    item.contractSigningDate = built.contractSigningDate;
  } else {
    set("bidClosingOpeningDate", built.bidClosingOpeningDate);
    set("evaluationReportApprovalDate", built.evaluationReportApprovalDate);
    set("awardDecisionDate", built.awardDecisionDate);
    set("awardNotificationDate", built.awardNotificationDate);
    set("contractSigningDate", built.contractSigningDate);
  }
  item._timetableNotes = built.meta.notes;
  return item;
}
