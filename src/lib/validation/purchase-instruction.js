import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

export const DEFAULT_PI_PAYMENT_TERMS =
  "Payment within 30 days after goods are received, inspected and accepted, against a valid invoice.";

const MAX_TERMS = 2000;
const MAX_INSTRUCTIONS = 4000;
const MAX_DECLINE_REASON = 2000;

/**
 * Purchase instruction terms (PPDA Contracts Regs 2023, reg 9: delivery and payment terms).
 * @param {{ requiredDeliveryDate?: unknown; paymentTerms?: unknown; specialInstructions?: unknown }} input
 * @param {{ today?: Date }} [opts]
 */
export function validatePurchaseInstructionTerms(input, opts = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const rawDate = String(input?.requiredDeliveryDate ?? "").trim();
  const requiredDeliveryDate = parseDateInputValue(rawDate);
  if (!rawDate) errors.requiredDeliveryDate = "Enter a delivery date.";
  else if (!requiredDeliveryDate) errors.requiredDeliveryDate = "Enter a valid date.";
  else if (toDateInputValue(requiredDeliveryDate) < toDateInputValue(opts.today || new Date())) {
    errors.requiredDeliveryDate = "Date cannot be in the past.";
  }

  const paymentTerms = String(input?.paymentTerms ?? "").trim();
  if (!paymentTerms) errors.paymentTerms = "Enter payment terms.";
  else if (paymentTerms.length > MAX_TERMS) errors.paymentTerms = `Max ${MAX_TERMS} characters.`;

  const specialInstructions = String(input?.specialInstructions ?? "").trim();
  if (specialInstructions.length > MAX_INSTRUCTIONS) {
    errors.specialInstructions = `Max ${MAX_INSTRUCTIONS} characters.`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: {
      requiredDeliveryDate,
      paymentTerms,
      specialInstructions: specialInstructions || null,
    },
  };
}

/**
 * @param {{ decision?: unknown; acceptedByName?: unknown; declineReason?: unknown }} input
 */
export function validatePurchaseInstructionResponse(input) {
  /** @type {Record<string, string>} */
  const errors = {};
  const decision = String(input?.decision ?? "").trim().toUpperCase();
  if (decision !== "ACCEPT" && decision !== "DECLINE") errors.decision = "Choose accept or decline.";
  const acceptedByName = String(input?.acceptedByName ?? "").trim();
  const declineReason = String(input?.declineReason ?? "").trim();
  if (decision === "ACCEPT") {
    if (!acceptedByName) errors.acceptedByName = "Enter your name.";
    else if (acceptedByName.length > 160) errors.acceptedByName = "Max 160 characters.";
  }
  if (decision === "DECLINE") {
    if (!declineReason) errors.declineReason = "Enter a reason.";
    else if (declineReason.length > MAX_DECLINE_REASON) {
      errors.declineReason = `Max ${MAX_DECLINE_REASON} characters.`;
    }
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: { decision, acceptedByName, declineReason },
  };
}
