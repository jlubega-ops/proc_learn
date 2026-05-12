/**
 * Notifications visible for the given active role: either global (no audience) or matching role.
 * @param {Role | null | undefined} activeRole
 */
export function notificationAudienceWhere(activeRole) {
  const role = activeRole ?? null;
  return {
    OR: [{ audienceRole: null }, ...(role ? [{ audienceRole: role }] : [])],
  };
}
