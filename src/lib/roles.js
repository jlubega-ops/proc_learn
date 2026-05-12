/** @typedef {'STUDENT'|'LECTURER'|'EXAMINER'|'SYSTEM_ADMIN'} RoleId */

export const ROLE = {
  STUDENT: "STUDENT",
  LECTURER: "LECTURER",
  EXAMINER: "EXAMINER",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
};

/** Highest precedence first (used for login default and fallbacks when stored role is invalid). */
export const ROLE_PRECEDENCE = [
  ROLE.SYSTEM_ADMIN,
  ROLE.EXAMINER,
  ROLE.LECTURER,
  ROLE.STUDENT,
];

/**
 * Highest-precedence role present in the DB grant list.
 * @param {string[]} granted
 */
export function pickHighestGrantedRole(granted) {
  const set = new Set(granted);
  for (const r of ROLE_PRECEDENCE) {
    if (set.has(r)) return r;
  }
  return ROLE.STUDENT;
}

export const ROLE_LABELS = {
  STUDENT: "Student",
  LECTURER: "Lecturer",
  EXAMINER: "Examiner",
  SYSTEM_ADMIN: "System admin",
};

/** @param {string} role */
export function formatRoleLabel(role) {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  return String(role).replace(/_/g, " ").toLowerCase();
}

/** Staff roles stored in `user_role` (students never have these rows). */
export function isStaffRole(role) {
  return (
    role === ROLE.LECTURER ||
    role === ROLE.EXAMINER ||
    role === ROLE.SYSTEM_ADMIN
  );
}

/**
 * Roles granted in DB (no virtual student row for staff).
 * @param {{ role: string }[]} userRoles
 * @returns {string[]}
 */
export function grantedRoles(userRoles) {
  if (!Array.isArray(userRoles)) return [];
  return userRoles.map((r) => r.role);
}

/**
 * Roles the user may activate in the UI (includes STUDENT view for staff).
 * @param {string[]} granted
 */
export function switchableRoles(granted) {
  const set = new Set(granted);
  const ordered = ROLE_PRECEDENCE.filter((r) => set.has(r));
  const extras = [...set].filter((r) => !ROLE_PRECEDENCE.includes(r));
  const base = [...ordered, ...extras];
  if ([...set].some(isStaffRole) && !set.has(ROLE.STUDENT)) {
    base.push(ROLE.STUDENT);
  }
  return base;
}

/**
 * @param {string[]} granted
 * @param {string} storedActive
 */
export function sanitizeActiveRole(granted, storedActive) {
  const allowed = switchableRoles(granted);
  const stored = String(storedActive || "").trim();
  if (stored && allowed.includes(stored)) return stored;
  return pickHighestGrantedRole(granted);
}

/**
 * Students may only hold STUDENT in DB. Staff may hold multiple staff roles.
 * (Use when assigning roles in admin APIs.)
 * @param {string[]} nextGranted
 */
export function validateGrantedRolesForSave(nextGranted) {
  const uniq = [...new Set(nextGranted)];
  if (uniq.length === 0) {
    return { ok: false, error: "At least one role is required." };
  }
  const hasStudent = uniq.includes(ROLE.STUDENT);
  const hasStaff = uniq.some(isStaffRole);
  if (hasStudent && hasStaff) {
    return {
      ok: false,
      error: "Student accounts cannot be combined with staff roles.",
    };
  }
  if (hasStudent && uniq.length > 1) {
    return { ok: false, error: "Student accounts can only have the student role." };
  }
  return { ok: true };
}

/**
 * @param {string[]} granted
 * @param {string} nextActive
 */
export function canActivateRole(granted, nextActive) {
  return switchableRoles(granted).includes(nextActive);
}
