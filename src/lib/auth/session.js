import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import {
  expireSessionIfIdle,
  isSessionPastIdle,
  touchSessionActivity,
} from "@/lib/auth/session-idle";

/**
 * @returns {Promise<import('iron-session').IronSession<{
 *   userId?: string;
 *   orgUserId?: string;
 *   providerId?: string;
 *   lastActivityAt?: number;
 * }> | null>}
 */
export async function getAppSession() {
  const opts = buildIronSessionOptions();
  if (!opts) return null;
  const cookieStore = await cookies();
  return getIronSession(cookieStore, opts);
}

/**
 * Read-only session for Server Components / layouts (never writes cookies).
 */
export async function getReadableAppSession() {
  const session = await getAppSession();
  if (!session) return null;
  if (!session.userId && !session.orgUserId) return null;
  if (isSessionPastIdle(session)) return null;
  return session;
}

/**
 * Route Handlers only — validates idle, may destroy or slide activity, writes cookies.
 * @param {{ touch?: boolean; ip?: string | null; userAgent?: string | null }} [options]
 */
export async function mutateActiveAppSession(options = {}) {
  const touch = options.touch !== false;
  const session = await getAppSession();
  if (!session) return null;
  if (!session.userId && !session.orgUserId) return null;

  const idle = await expireSessionIfIdle(session, {
    ip: options.ip,
    userAgent: options.userAgent,
  });
  if (idle.expired) {
    await session.save();
    return null;
  }

  if (touch) {
    touchSessionActivity(session);
    await session.save();
  } else if (idle.migrated) {
    await session.save();
  }

  return session;
}

/** @deprecated Use mutateActiveAppSession in Route Handlers or getReadableAppSession in RSC. */
export const getActiveAppSession = mutateActiveAppSession;

export { initSessionActivity, touchSessionActivity } from "@/lib/auth/session-idle";
