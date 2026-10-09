const SEAT_LABELS = { CHAIRPERSON: "Chairperson", SECRETARY: "Secretary", MEMBER: "Member" };

/** @param {unknown} role */
export function committeeSeatLabel(role) {
  const key = String(role || "").trim().toUpperCase();
  return SEAT_LABELS[key] || (key ? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ") : "");
}

/**
 * Who acted, as printed beside their name: "Chairperson, MUBS Contracts Committee" when a
 * committee seat decided, otherwise the organisation role.
 * @param {{ actorRoleName?: string | null; committeeId?: string | null; committeeRole?: string | null; committeeName?: string | null; stepRoleName?: string | null } | null | undefined} entry
 */
export function actingRoleLabel(entry) {
  if (!entry) return null;
  const onCommittee = Boolean(entry.committeeId || entry.committeeRole || entry.committeeName);
  if (!onCommittee) return entry.actorRoleName || null;
  const committee = entry.committeeName || entry.stepRoleName || "Committee";
  const seat = committeeSeatLabel(entry.committeeRole);
  return seat ? `${seat}, ${committee}` : committee;
}

/**
 * Whether a history / timeline entry was decided from a committee seat.
 * @param {{ committeeId?: string | null; committeeRole?: string | null; committeeName?: string | null } | null | undefined} entry
 */
export function isCommitteeAction(entry) {
  return Boolean(entry && (entry.committeeId || entry.committeeRole || entry.committeeName));
}

/**
 * Latest APPROVE entry in a workflow history.
 * @template {{ decision?: string | null; createdAt?: string | Date | null }} T
 * @param {T[] | null | undefined} history
 * @returns {T | null}
 */
export function finalApprovalEntry(history) {
  return (
    [...(history || [])]
      .filter((h) => h.decision === "APPROVE")
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      .pop() || null
  );
}

/**
 * Role printed for the final approver: committee seat when a committee approved.
 * @param {any[] | null | undefined} history
 * @param {string | null | undefined} fallback
 */
export function finalApproverRoleLabel(history, fallback) {
  return actingRoleLabel(finalApprovalEntry(history)) || fallback || null;
}
