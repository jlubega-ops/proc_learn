/**
 * Single active session per platform user: `User.sessionVersion` is bumped on every sign-in,
 * suspension and password change; the cookie stores the version it was issued with (`sv`).
 * A cookie with an older version is treated as signed out on its next request.
 */

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} userId
 * @returns {Promise<number>} the new version
 */
export async function bumpSessionVersion(db, userId) {
  const row = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return row.sessionVersion;
}

/**
 * @param {{ sv?: unknown } | null | undefined} session
 * @param {{ sessionVersion?: number | null } | null | undefined} user
 */
export function isSessionVersionCurrent(session, user) {
  return Number(session?.sv ?? 0) === Number(user?.sessionVersion ?? 0);
}
