/**
 * Priced quotation / bid lines against the requisition items. Shared by the server
 * (validation) and the quote forms (live totals).
 */

/** Offer statuses that are never opened, counted or evaluated. */
export const INACTIVE_OFFER_STATUSES = ["WITHDRAWN", "LATE"];

/** @param {unknown} v */
function toNumber(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/** @param {number} n */
function money(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {{ lineNumber: number; itemName: string; quantity: unknown; unitOfMeasure?: string | null }[]} items
 * @param {unknown} raw `[{ lineNumber, unitPrice }]`
 * @returns {{ ok: true; lines: any[]; total: number } | { ok: false; error: string; fieldErrors: Record<string, string> }}
 */
export function priceOfferLines(items, raw) {
  const byLine = new Map(
    (Array.isArray(raw) ? raw : []).map((r) => [Number(r?.lineNumber), r?.unitPrice]),
  );
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const lines = items.map((item) => {
    const qty = toNumber(item.quantity);
    const unitPrice = toNumber(byLine.get(Number(item.lineNumber)));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      fieldErrors[`line_${item.lineNumber}`] = "Enter a unit price.";
    }
    const safeUnit = Number.isFinite(unitPrice) && unitPrice > 0 ? money(unitPrice) : 0;
    return {
      lineNumber: Number(item.lineNumber),
      itemName: item.itemName,
      quantity: Number.isFinite(qty) ? qty : 0,
      unitOfMeasure: item.unitOfMeasure || null,
      unitPrice: safeUnit,
      total: money(safeUnit * (Number.isFinite(qty) ? qty : 0)),
    };
  });
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Enter a unit price for every item.", fieldErrors };
  }
  return { ok: true, lines, total: money(lines.reduce((s, l) => s + l.total, 0)) };
}

/**
 * Running total for a form while the user types (invalid lines count as zero).
 * @param {{ lineNumber: number; quantity: unknown }[]} items
 * @param {Record<string, string>} unitPrices keyed by lineNumber
 */
export function draftLinesTotal(items, unitPrices) {
  return money(
    items.reduce((sum, item) => {
      const unit = toNumber(unitPrices[String(item.lineNumber)]);
      const qty = toNumber(item.quantity);
      return sum + (Number.isFinite(unit) && Number.isFinite(qty) ? unit * qty : 0);
    }, 0),
  );
}
