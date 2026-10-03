import {
  LIFECYCLE_ACTION_ROLES,
  committeeMayPerformLifecycleAction,
} from "@/lib/projects/procurement-lifecycle-roles";
import { PROJECT_ORG_ENTRY_ROLE_NAME } from "@/lib/project-org-role";

/** Lifecycle actions that each procurement-page section exposes. */
export const PROCUREMENT_SECTION_ACTIONS = {
  sourcing: [],
  evaluation: ["decide_post_qualification"],
  award: ["create_award", "communicate_award", "accept_award", "cancel_award"],
  contract: [
    "update_delivery_address",
    "create_lpo",
    "approve_lpo",
    "issue_lpo",
    "accept_lpo",
    "create_contract",
    "approve_contract",
    "sign_contract",
    "issue_contract",
  ],
  delivery: ["record_delivery", "record_inspection"],
  invoice: ["create_invoice", "certify_invoice", "verify_invoice", "reject_invoice"],
  payment: ["create_payment", "approve_payment", "mark_payment_paid", "reject_payment"],
  closure: ["close_procurement"],
};

const PDU_ROLES = ["Procurement Officer", "Head PDU", "Contracts Officer", "Accounting Officer"];

/** Oversight roles see every stage of the case (read-only where they cannot act). */
const OVERSIGHT_ROLES = ["Head PDU", "Accounting Officer"];

/** Sections a committee seat may look at (always read-only outside its own evaluation work). */
const COMMITTEE_SECTIONS = {
  CONTRACTS: ["sourcing", "evaluation", "award", "contract"],
  EVALUATION: ["sourcing", "evaluation"],
  NEGOTIATION: ["sourcing", "evaluation", "award", "contract"],
  INSPECTION_ACCEPTANCE: ["delivery"],
};

/**
 * @param {{ roleName?: string | null; committeeType?: string | null }} viewer
 * @returns {Record<string, { view: boolean; act: boolean; reason: string }>}
 */
export function procurementSectionAccess(viewer) {
  const role = String(viewer?.roleName || "").trim();
  const committeeType = viewer?.committeeType || null;
  const isOrgAdmin = !role || role === PROJECT_ORG_ENTRY_ROLE_NAME || role === "Admin";

  /** @type {Record<string, { view: boolean; act: boolean; reason: string }>} */
  const out = {};
  for (const [section, actions] of Object.entries(PROCUREMENT_SECTION_ACTIONS)) {
    if (committeeType) {
      const allowed = (COMMITTEE_SECTIONS[committeeType] || []).includes(section);
      const act =
        allowed &&
        ((committeeType === "EVALUATION" && section === "evaluation") ||
          actions.some((a) => committeeMayPerformLifecycleAction(a, committeeType)));
      out[section] = {
        view: allowed,
        act,
        reason: act
          ? ""
          : "This committee can view this stage; switch back to your organisation role to act here.",
      };
      continue;
    }
    if (isOrgAdmin) {
      out[section] = {
        view: true,
        act: false,
        reason: "The Organization Administrator can view but not perform procurement actions.",
      };
      continue;
    }
    const act =
      (section === "sourcing" && PDU_ROLES.includes(role)) ||
      actions.some((a) => (LIFECYCLE_ACTION_ROLES[a] || []).includes(role));
    const view =
      act ||
      OVERSIGHT_ROLES.includes(role) ||
      (section === "sourcing" && PDU_ROLES.includes(role)) ||
      (section === "evaluation" && PDU_ROLES.includes(role));
    out[section] = {
      view,
      act,
      reason: act ? "" : `${role} can view this stage but does not act on it.`,
    };
  }
  return out;
}
