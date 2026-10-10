import { differenceInCalendarDays } from "date-fns";

/**
 * Accepted goods priced per line (offer unit prices), falling back to the order value
 * scaled by the accepted share when lines are unpriced.
 *
 * @param {{ row: any; orderValue: number | null; pricedLines: any[] }} opts
 */
export function acceptedGoods({ row, orderValue, pricedLines }) {
  const items = row?.requisition?.items || [];
  const inspected = (row?.deliveries || []).filter((d) => d.inspection);
  const lines = items.map((it) => {
    const accepted = inspected
      .flatMap((d) => d.lines || [])
      .filter((l) => l.itemName === it.itemName)
      .reduce((sum, l) => sum + (Number(l.acceptedQuantity) || 0), 0);
    const priced = (pricedLines || []).find((p) => p.itemName === it.itemName) || null;
    const unitPrice = priced ? Number(priced.unitPrice) || 0 : null;
    return {
      itemName: it.itemName,
      unitOfMeasure: it.unitOfMeasure || null,
      ordered: Number(it.quantity) || 0,
      accepted,
      unitPrice,
      acceptedValue: unitPrice === null ? null : accepted * unitPrice,
    };
  });

  const ordered = lines.reduce((s, l) => s + l.ordered, 0);
  const acceptedQty = lines.reduce((s, l) => s + l.accepted, 0);
  const allPriced = lines.length > 0 && lines.every((l) => l.acceptedValue !== null);
  const acceptedValue = allPriced
    ? lines.reduce((s, l) => s + Number(l.acceptedValue), 0)
    : orderValue !== null && ordered > 0
      ? orderValue * Math.min(1, acceptedQty / ordered)
      : null;
  return { lines, acceptedValue };
}

/**
 * Three-way match for an invoice: what was ordered (LPO / contract), what was
 * accepted at inspection, and what the provider is billing.
 *
 * @param {{
 *   row: any;
 *   invoice: any;
 *   orderValue: number | null;
 *   pricedLines: any[];
 * }} opts
 */
export function invoiceThreeWayMatch({ row, invoice, orderValue, pricedLines }) {
  const { lines, acceptedValue } = acceptedGoods({ row, orderValue, pricedLines });

  const previouslyInvoiced = (row?.invoices || [])
    .filter((i) => i.id !== invoice?.id && i.status !== "REJECTED")
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const amount = Number(invoice?.amount) || 0;
  const due = acceptedValue === null ? null : Math.max(0, acceptedValue - previouslyInvoiced);

  /** @type {{ label: string; color: "success" | "warning" | "error" }} */
  const result =
    due === null
      ? { label: "Check manually", color: "warning" }
      : amount > due + 0.5
        ? { label: "Exceeds accepted goods", color: "error" }
        : amount < due - 0.5
          ? { label: "Below accepted goods", color: "warning" }
          : { label: "Matches accepted goods", color: "success" };

  return { lines, acceptedValue, previouslyInvoiced, amount, due, result };
}

/**
 * Latest positive workflow decision on a step whose title matches `re`.
 * @param {any[] | null | undefined} timeline
 * @param {RegExp} re
 * @returns {{ by: string | null; at: any } | null}
 */
export function latestStepSignOff(timeline, re) {
  const hit =
    [...(timeline || [])]
      .filter(
        (a) =>
          a.source === "workflow" &&
          a.decision &&
          !["RETURN", "REJECT"].includes(a.decision) &&
          re.test(String(a.taskTitle || "")),
      )
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
  return hit ? { by: hit.actor?.displayName || null, at: hit.createdAt } : null;
}

export const REVIEW_BID_DOCS_STEP_RE = /^review (rfq|tender) documents/i;
export const APPROVE_BID_DOCS_STEP_RE = /^approve (rfq|tender) documents/i;
export const OPEN_OFFERS_STEP_RE = /^open (quotations|bids)/i;
export const TECHNICAL_EVAL_STEP_RE = /^technical evaluation/i;
export const FINANCIAL_EVAL_STEP_RE = /^financial evaluation/i;
export const PREPARE_EVAL_REPORT_STEP_RE = /^prepare evaluation report/i;

/**
 * Calendar days between issue and closing of a solicitation.
 * @param {string | Date | null | undefined} issue
 * @param {string | Date | null | undefined} closing
 */
export function biddingPeriodDays(issue, closing) {
  if (!issue || !closing) return null;
  const a = new Date(issue);
  const b = new Date(closing);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return differenceInCalendarDays(b, a);
}

export const CERTIFY_DELIVERY_STEP_RE = /^(certify delivery|inspection\/acceptance|verify\/accept delivery)/i;
export const VERIFY_INVOICE_STEP_RE = /^(verify invoice|invoice verification|process invoice|certify and verify invoice)/i;
export const APPROVE_PAYMENT_SIGNOFF_RE = /^(approve payment|payment approval|approve and pay)/i;

/**
 * Delivery notes behind the accepted goods and the latest delivery certification.
 * @param {any} row
 */
export function goodsReceivedEvidence(row) {
  const notes = (row?.deliveries || [])
    .filter((d) => d.inspection && ["ACCEPTED", "PARTIAL"].includes(d.inspection.status))
    .map((d) => d.deliveryNote?.noteNumber)
    .filter(Boolean);
  const certified = latestStepSignOff(row?.timeline, CERTIFY_DELIVERY_STEP_RE);
  return { notes, certifiedBy: certified?.by || null, certifiedAt: certified?.at || null };
}

/**
 * Money position of a procurement: order, accepted goods, verified invoices and payments.
 * @param {{ row: any; orderValue: number | null; pricedLines: any[] }} opts
 */
export function procurementMoneySummary({ row, orderValue, pricedLines }) {
  const { acceptedValue } = acceptedGoods({ row, orderValue, pricedLines });
  const invoiced = (row?.invoices || [])
    .filter((i) => ["VERIFIED", "APPROVED_FOR_PAYMENT"].includes(i.status))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paid = (row?.payments || [])
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    orderValue,
    acceptedValue,
    invoiced,
    paid,
    unpaidOnOrder: orderValue === null ? null : Math.max(0, orderValue - paid),
  };
}
