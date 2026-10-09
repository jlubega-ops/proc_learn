import { format } from "date-fns";
import { formatMoneyUGX } from "@/lib/money";
import { presentPurchaseInstructionStatus } from "@/lib/projects/purchase-instruction-presentation";

/** @typedef {{ label: string; color: "success" | "warning" | "error" | "info" | "primary"; outlined?: boolean }} StageStatus */

/** @type {StageStatus} */
const NOT_STARTED = { label: "Not started", color: "warning", outlined: true };

/** @param {unknown} value */
function day(value) {
  if (!value) return "";
  const d = new Date(/** @type {any} */ (value));
  return Number.isNaN(d.getTime()) ? "" : format(d, "MMM d, yyyy");
}

/**
 * Status of one stage of a procurement, from its records only. Accepts the serialized
 * procurement (`award`, `lpo`, `contract`, `purchaseInstruction`) or raw rows with the
 * plural relations ordered newest first.
 * @param {string} key
 * @param {any} row
 * @returns {{ status: StageStatus; summary: string[] }}
 */
export function describeProcurementStage(key, row) {
  const sol = row.solicitations?.[0] || null;
  const report = row.evaluationReports?.[0] || null;
  const award = row.award || row.awards?.[0] || null;
  const pi = row.purchaseInstruction || row.purchaseInstructions?.[0] || null;
  const contract = row.contract || row.contracts?.[0] || null;
  const lpo = row.lpo || row.lpos?.[0] || null;
  const deliveries = row.deliveries || [];
  const pendingNote = (row.deliveryNotes || []).find((n) => n.status === "SUBMITTED") || null;
  const invoices = row.invoices || [];
  const payments = row.payments || [];

  switch (key) {
    case "sourcing": {
      if (!sol) return { status: NOT_STARTED, summary: [] };
      const offers = (row.offers || []).filter((o) => !["WITHDRAWN", "LATE"].includes(o.status)).length;
      const summary = [`${offers} offer${offers === 1 ? "" : "s"} received`];
      if (sol.closingDate) summary.push(`Closes ${day(sol.closingDate)}`);
      if (report || award || sol.status === "CLOSED") return { status: { label: "Completed", color: "success" }, summary };
      if (["DRAFT", "REVIEW", "APPROVED"].includes(sol.status)) {
        return { status: { label: "Documents in preparation", color: "info" }, summary: [] };
      }
      return { status: { label: "Open for offers", color: "info" }, summary };
    }
    case "evaluation": {
      if (award) return { status: { label: "Completed", color: "success" }, summary: [] };
      if (!report) {
        return sol?.status === "CLOSED"
          ? { status: { label: "Pending", color: "warning" }, summary: [] }
          : { status: NOT_STARTED, summary: [] };
      }
      /** @type {Record<string, StageStatus>} */
      const map = {
        DRAFT: { label: "In progress", color: "info" },
        SUBMITTED: { label: "Awaiting approval", color: "warning" },
        RETURNED: { label: "Returned", color: "warning" },
        APPROVED: { label: "Approved", color: "success" },
        REJECTED: { label: "Rejected", color: "error" },
      };
      return {
        status: map[report.status] || { label: report.status, color: "info" },
        summary: [report.recommendedSupplier?.name].filter(Boolean),
      };
    }
    case "award": {
      if (!award) return { status: NOT_STARTED, summary: [] };
      /** @type {Record<string, StageStatus>} */
      const map = {
        DRAFT: { label: "Draft", color: "info" },
        APPROVED: { label: "Approved", color: "info" },
        COMMUNICATED: { label: "Awaiting provider acceptance", color: "warning" },
        ACCEPTED: { label: "Accepted", color: "success" },
        DECLINED: { label: "Declined by provider", color: "error" },
        CANCELLED: { label: "Cancelled", color: "error" },
      };
      return {
        status: map[award.status] || { label: award.status, color: "info" },
        summary: [award.supplier?.name, formatMoneyUGX(award.awardedAmount)].filter(Boolean),
      };
    }
    case "contract": {
      if (row.procurementMethod === "MICRO") {
        if (!pi) return { status: NOT_STARTED, summary: [] };
        return {
          status: presentPurchaseInstructionStatus(pi.status),
          summary: [pi.instructionNumber, pi.supplier?.name, formatMoneyUGX(pi.amount)].filter(Boolean),
        };
      }
      const doc = contract || lpo;
      if (!doc) return { status: NOT_STARTED, summary: [] };
      /** @type {Record<string, StageStatus>} */
      const map = {
        DRAFT: { label: "In preparation", color: "info" },
        UNDER_REVIEW: { label: "Under review", color: "info" },
        APPROVED: { label: "Approved", color: "info" },
        SIGNED: { label: "Signed", color: "info" },
        ISSUED: contract
          ? { label: "Issued", color: "success" }
          : { label: "Awaiting provider acceptance", color: "warning" },
        ACCEPTED: { label: "Accepted by provider", color: "success" },
        ACTIVE: { label: "Active", color: "success" },
        CANCELLED: { label: "Cancelled", color: "error" },
      };
      return {
        status: map[doc.status] || { label: doc.status, color: "info" },
        summary: [
          contract ? contract.contractNumber : lpo.lpoNumber,
          doc.supplier?.name,
          formatMoneyUGX(contract ? contract.contractValue : lpo.lpoValue),
        ].filter(Boolean),
      };
    }
    case "delivery": {
      const summary = deliveries.length ? [`${deliveries.length} receipt${deliveries.length === 1 ? "" : "s"}`] : [];
      if (pendingNote) summary.push(`${pendingNote.noteNumber} dispatched ${day(pendingNote.dispatchedAt)}`);
      if (!deliveries.length) {
        return pendingNote
          ? { status: { label: "Dispatched — awaiting receipt", color: "warning" }, summary }
          : { status: NOT_STARTED, summary };
      }
      if (deliveries.some((d) => !d.inspection || d.inspection.status === "PENDING")) {
        return { status: { label: "Awaiting inspection", color: "warning" }, summary };
      }
      if (pendingNote) return { status: { label: "More goods dispatched", color: "warning" }, summary };
      const statuses = deliveries.map((d) => d.inspection.status);
      if (statuses.every((s) => s === "REJECTED")) return { status: { label: "Rejected", color: "error" }, summary };
      if (statuses.includes("PARTIAL") || statuses.includes("REJECTED")) {
        return { status: { label: "Partly accepted", color: "info" }, summary };
      }
      return { status: { label: "Accepted", color: "success" }, summary };
    }
    case "invoice": {
      if (!invoices.length) return { status: NOT_STARTED, summary: [] };
      const live = invoices.filter((i) => i.status !== "REJECTED");
      const total = live.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const summary = [`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`, formatMoneyUGX(total)];
      if (!live.length) return { status: { label: "Rejected", color: "error" }, summary };
      if (live.some((i) => ["RECEIVED", "CERTIFIED", "DRAFT"].includes(i.status))) {
        return { status: { label: "Under review", color: "warning" }, summary };
      }
      return { status: { label: "Verified", color: "success" }, summary };
    }
    case "payment": {
      if (!payments.length) return { status: NOT_STARTED, summary: [] };
      const paid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const summary = paid ? [`${formatMoneyUGX(paid)} paid`] : [];
      if (payments.some((p) => p.status === "PENDING")) {
        return { status: { label: "Awaiting approval", color: "warning" }, summary };
      }
      if (payments.some((p) => p.status === "APPROVED")) return { status: { label: "Approved", color: "info" }, summary };
      if (paid && ["READY_FOR_CLOSURE", "CLOSED"].includes(row.status)) {
        return { status: { label: "Paid", color: "success" }, summary };
      }
      if (paid) return { status: { label: "Part paid", color: "info" }, summary };
      return { status: { label: "Rejected", color: "error" }, summary };
    }
    case "closure": {
      if (row.status === "CLOSED") {
        return { status: { label: "Closed", color: "success" }, summary: row.closedAt ? [day(row.closedAt)] : [] };
      }
      if (row.status === "CANCELLED" || row.status === "REJECTED") {
        return { status: { label: "Cancelled", color: "error" }, summary: [] };
      }
      if (row.status === "READY_FOR_CLOSURE") return { status: { label: "Ready to close", color: "warning" }, summary: [] };
      return { status: NOT_STARTED, summary: [] };
    }
    default:
      return { status: NOT_STARTED, summary: [] };
  }
}
