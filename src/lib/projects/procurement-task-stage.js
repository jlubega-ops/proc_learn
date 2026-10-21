import { isRecommendationDecisionTask } from "@/lib/projects/procurement-recommendation-options";
import { procurementSectionSlug } from "@/lib/projects/procurement-stage-pages";
import {
  isBiddingMethod,
  isMicroStyleMethod,
  isQuotationMethod,
  normalizeProcurementMethod,
} from "@/lib/projects/procurement-methods";

/** Stage keys match `procurementSectionAccess` sections, plus `recommendation` and `task`. */
export const PROCUREMENT_STAGE_KEYS = [
  "sourcing",
  "evaluation",
  "award",
  "contract",
  "delivery",
  "invoice",
  "payment",
  "closure",
  "recommendation",
  "task",
];

const MICRO_STAGES = ["contract", "delivery", "invoice", "payment", "closure"];
const COMPETITIVE_STAGES = [
  "sourcing",
  "evaluation",
  "award",
  "contract",
  "delivery",
  "invoice",
  "payment",
  "closure",
];

/** @type {Record<string, string[]>} */
const METHOD_STAGES = {
  MICRO: MICRO_STAGES,
  DIRECT: MICRO_STAGES,
  QUOTATION: COMPETITIVE_STAGES,
  OPEN_DOMESTIC: COMPETITIVE_STAGES,
  OPEN_INTERNATIONAL: COMPETITIVE_STAGES,
  RESTRICTED_DOMESTIC: COMPETITIVE_STAGES,
  RESTRICTED_INTERNATIONAL: COMPETITIVE_STAGES,
};

/**
 * @param {string} stage
 * @param {string | null | undefined} method
 */
export function procurementStageLabel(stage, method) {
  const m = normalizeProcurementMethod(method);
  switch (stage) {
    case "sourcing":
      return isBiddingMethod(m) ? "Bidding" : "Request for quotations";
    case "evaluation":
      return "Evaluation";
    case "award":
      return "Award";
    case "contract":
      if (isMicroStyleMethod(m)) return "Purchase instruction";
      if (isBiddingMethod(m)) return "Contract";
      return "Local purchase order";
    case "delivery":
      return "Delivery & inspection";
    case "invoice":
      return "Invoice";
    case "payment":
      return "Payment";
    case "closure":
      return "Closure";
    case "recommendation":
      return "Contracts Committee decision";
    default:
      return "Task";
  }
}

/** @param {string | null | undefined} method */
export function procurementStagesForMethod(method) {
  const key = normalizeProcurementMethod(method);
  return METHOD_STAGES[key] || METHOD_STAGES.QUOTATION;
}

const TITLE_RULES = [
  { re: /^issue purchase instruction/i, stage: "contract" },
  {
    re: /rfq documents|^issue rfqs|^receive quotations|quotation submission|^open quotations|bidding documents|tender documents|^advertise tender|^invite shortlisted|^receive bids|^close bid|^close tender|^open bids|^forward bids/i,
    stage: "sourcing",
  },
  {
    re: /evaluation committee|technical evaluation|financial evaluation|evaluation report|post-qualification|evaluation\/recommendation/i,
    stage: "evaluation",
  },
  { re: /award/i, stage: "award" },
  { re: /\blpo\b|contract|supplier acceptance/i, stage: "contract" },
  { re: /deliver|inspection/i, stage: "delivery" },
  { re: /invoice/i, stage: "invoice" },
  { re: /payment/i, stage: "payment" },
  { re: /close procurement|procurement closure/i, stage: "closure" },
];

/**
 * User department confirms goods the provider dispatched ("Record Delivery/Receipt").
 * @param {string | null | undefined} title
 */
export function isReceiveGoodsStep(title) {
  return /^record delivery|^delivery$/i.test(String(title || "").split(":")[0].trim());
}

/**
 * Inspection / acceptance of received goods ("Verify/Accept Delivery", "Certify Delivery").
 * @param {string | null | undefined} title
 */
export function isAcceptGoodsStep(title) {
  return /^verify delivery|^verify\/accept delivery|^certify delivery|^inspection\/acceptance/i.test(
    String(title || "").split(":")[0].trim(),
  );
}

/**
 * Which stage page holds the action for a procurement workflow task.
 * @param {string | null | undefined} title
 */
export function procurementTaskStage(title) {
  const t = String(title || "").trim();
  if (!t) return "task";
  if (isRecommendationDecisionTask(t)) return "recommendation";
  const head = t.split(":")[0].trim();
  for (const rule of TITLE_RULES) {
    if (rule.re.test(head)) return rule.stage;
  }
  return "task";
}

/**
 * Section stages open under their sidebar page (`/procurements/{slug}/{id}`) so the link stays active.
 * @param {string} projectId
 * @param {string} procurementId
 * @param {string | null} [stage]
 * @param {string | null} [method]
 */
export function procurementStageHref(projectId, procurementId, stage = null, method = null) {
  const root = `/projects/${projectId}/procurements`;
  if (!stage) return `${root}/${procurementId}`;
  const slug = procurementSectionSlug(stage, method);
  return slug ? `${root}/${slug}/${procurementId}` : `${root}/${procurementId}/stage/${stage}`;
}

export { isBiddingMethod, isMicroStyleMethod, isQuotationMethod };
