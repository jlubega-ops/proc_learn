/**
 * Teaching-oriented PPDA committee seat rules (Uganda Cap. 205 + Evaluation Regulations).
 * Enforced when assigning seats on existing organisation users.
 *
 * Key statute / regulation points we model:
 * - Contracts Committee: Head PDU and Head of Finance are not eligible (s.29(3)).
 * - Evaluation Committee: must include a user-department representative and a PDU
 *   member among its members; Contracts Committee members may not sit on Evaluation
 *   (Evaluation Regulations 2023, reg. 2).
 * - Chair of Evaluation is chosen from members; for teaching we also block the
 *   Procurement Officer from chairing Evaluation or Inspection (independence of the
 *   officer who ran the solicitation).
 */

/** @typedef {"CONTRACTS" | "EVALUATION" | "NEGOTIATION" | "INSPECTION_ACCEPTANCE"} CommitteeType */

const PDU_ORG_ROLES = new Set(["Head PDU", "Procurement Officer", "Contracts Officer"]);

const USER_DEPARTMENT_ORG_ROLES = new Set([
  "User Department Officer",
  "User Department",
  "Head User Department",
  "Head of User Department",
]);

/** Cap. 205 s.29(3) — not eligible for Contracts Committee. */
const CONTRACTS_COMMITTEE_INELIGIBLE_ORG_ROLES = new Set([
  "Head PDU",
  "Finance/Budget Officer",
]);

/**
 * @param {unknown} roleName
 */
export function normalizeOrgRoleName(roleName) {
  return String(roleName || "").trim();
}

/**
 * @param {unknown} roleName
 */
export function isPduOrgRole(roleName) {
  return PDU_ORG_ROLES.has(normalizeOrgRoleName(roleName));
}

/**
 * @param {unknown} roleName
 */
export function isUserDepartmentOrgRole(roleName) {
  return USER_DEPARTMENT_ORG_ROLES.has(normalizeOrgRoleName(roleName));
}

/**
 * Human label for committee type.
 * @param {unknown} committeeType
 */
export function committeeTypeLabel(committeeType) {
  const t = String(committeeType || "");
  if (t === "CONTRACTS") return "Contracts Committee";
  if (t === "EVALUATION") return "Evaluation Committee";
  if (t === "NEGOTIATION") return "Negotiation Committee";
  if (t === "INSPECTION_ACCEPTANCE") return "Inspection/Acceptance Committee";
  return t || "committee";
}

/**
 * Validate whether an org user may take a seat on a committee.
 *
 * @param {{
 *   committeeType: string;
 *   committeeRole: string;
 *   orgRoleName: string;
 *   activeContractsSeat?: boolean;
 *   activeEvaluationSeat?: boolean;
 * }} opts
 * @returns {{ ok: true } | { ok: false; error: string; field?: string }}
 */
export function validateCommitteeSeatEligibility(opts) {
  const committeeType = String(opts.committeeType || "").trim();
  const committeeRole = String(opts.committeeRole || "").trim().toUpperCase();
  const orgRole = normalizeOrgRoleName(opts.orgRoleName);
  const typeName = committeeTypeLabel(committeeType);

  if (!orgRole) {
    return { ok: false, error: "Organisation user has no role.", field: "orgUserId" };
  }

  // --- Contracts Committee (Cap. 205 s.29(3)) ---
  if (committeeType === "CONTRACTS") {
    if (CONTRACTS_COMMITTEE_INELIGIBLE_ORG_ROLES.has(orgRole)) {
      return {
        ok: false,
        error: `${orgRole} is not eligible for the Contracts Committee under PPDA rules (Head PDU and Head of Finance cannot sit on Contracts Committee).`,
        field: "orgUserId",
      };
    }
    if (opts.activeEvaluationSeat) {
      return {
        ok: false,
        error:
          "A member of the Evaluation Committee cannot also sit on the Contracts Committee for the same organisation.",
        field: "orgUserId",
      };
    }
  }

  // --- Evaluation / Negotiation ---
  if (committeeType === "EVALUATION" || committeeType === "NEGOTIATION") {
    if (opts.activeContractsSeat) {
      return {
        ok: false,
        error: `A Contracts Committee member cannot sit on the ${typeName} (PPDA Evaluation Regulations).`,
        field: "orgUserId",
      };
    }
    // Procurement Officer may be the PDU member, but should not chair.
    if (
      committeeRole === "CHAIRPERSON" &&
      (orgRole === "Procurement Officer" || orgRole === "Contracts Officer")
    ) {
      return {
        ok: false,
        error: `${orgRole} may sit on the ${typeName} as a PDU member, but cannot be Chairperson. Choose a chair from the user department (or another eligible member).`,
        field: "committeeRole",
      };
    }
  }

  // --- Inspection / Acceptance ---
  if (committeeType === "INSPECTION_ACCEPTANCE") {
    if (committeeRole === "CHAIRPERSON" && orgRole === "Procurement Officer") {
      return {
        ok: false,
        error:
          "The Procurement Officer cannot chair the Inspection/Acceptance Committee. Chair should be from the user department.",
        field: "committeeRole",
      };
    }
    if (committeeRole === "CHAIRPERSON" && orgRole === "Head PDU") {
      return {
        ok: false,
        error:
          "Head PDU should not chair Inspection/Acceptance. Prefer Head User Department or another user-department officer.",
        field: "committeeRole",
      };
    }
  }

  return { ok: true };
}

/**
 * Soft guidance shown in the UI (not blocking by itself).
 * @param {string} committeeType
 */
export function committeeEligibilityHelpText(committeeType) {
  const t = String(committeeType || "");
  if (t === "CONTRACTS") {
    return "PPDA: Head PDU and Head of Finance cannot sit on Contracts Committee. Do not also put the same people on Evaluation.";
  }
  if (t === "EVALUATION" || t === "NEGOTIATION") {
    return "PPDA: include a user-department member and a PDU member; Contracts Committee members cannot sit here. Procurement Officer / Contracts Officer cannot be Chairperson.";
  }
  if (t === "INSPECTION_ACCEPTANCE") {
    return "Prefer user-department leadership. Procurement Officer and Head PDU cannot chair Inspection/Acceptance.";
  }
  return "Assign seats to existing organisation users. One person keeps their org role and switches committee context when needed.";
}

/**
 * Whether an org role is allowed as a selectable candidate for this committee
 * (before cross-committee checks). Used to filter dropdowns.
 * @param {string} committeeType
 * @param {string} orgRoleName
 */
export function orgRoleMayAppearOnCommittee(committeeType, orgRoleName) {
  const t = String(committeeType || "");
  const role = normalizeOrgRoleName(orgRoleName);
  if (t === "CONTRACTS" && CONTRACTS_COMMITTEE_INELIGIBLE_ORG_ROLES.has(role)) {
    return false;
  }
  return true;
}

export {
  PDU_ORG_ROLES,
  USER_DEPARTMENT_ORG_ROLES,
  CONTRACTS_COMMITTEE_INELIGIBLE_ORG_ROLES,
};
