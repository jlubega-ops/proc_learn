import { SESSION_IDLE_MINUTES } from "@/lib/appConfig";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";

/** @returns {number} */
export function sessionIdleMs() {
  const minutes = Number(SESSION_IDLE_MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) return 30 * 60 * 1000;
  return minutes * 60 * 1000;
}

/**
 * Read-only idle check (safe in Server Components — no cookie writes).
 * @param {import("iron-session").IronSession<{
 *   userId?: string;
 *   orgUserId?: string;
 *   lastActivityAt?: number;
 * }>} session
 */
export function isSessionPastIdle(session) {
  if (!session.userId && !session.orgUserId) return false;
  const last = Number(session.lastActivityAt);
  if (!Number.isFinite(last) || last <= 0) return false;
  return Date.now() - last > sessionIdleMs();
}

/**
 * @param {import("iron-session").IronSession<{ lastActivityAt?: number }>} session
 */
export function touchSessionActivity(session) {
  session.lastActivityAt = Date.now();
}

/**
 * @param {import("iron-session").IronSession<{ lastActivityAt?: number }>} session
 */
export function initSessionActivity(session) {
  touchSessionActivity(session);
}

/**
 * Route Handlers only — may destroy session and requires `session.save()` afterward.
 * @param {import("iron-session").IronSession<{
 *   userId?: string;
 *   orgUserId?: string;
 *   lastActivityAt?: number;
 * }>} session
 * @param {{ ip?: string | null; userAgent?: string | null }} [audit]
 */
export async function expireSessionIfIdle(session, audit = {}) {
  if (!session.userId && !session.orgUserId) {
    return { expired: false, migrated: false };
  }

  const now = Date.now();
  const idleMs = sessionIdleMs();
  const last = Number(session.lastActivityAt);

  if (!Number.isFinite(last) || last <= 0) {
    session.lastActivityAt = now;
    return { expired: false, migrated: true };
  }

  if (now - last <= idleMs) {
    return { expired: false, migrated: false };
  }

  await writeAuditLog({
    eventType: AuditEvent.SESSION_IDLE_EXPIRED,
    actorUserId: session.userId || null,
    targetUserId: session.userId || null,
    ip: audit.ip ?? null,
    userAgent: audit.userAgent ?? null,
    meta: {
      orgUserId: session.orgUserId || null,
      idleMinutes: SESSION_IDLE_MINUTES,
      lastActivityAt: new Date(last).toISOString(),
    },
  });

  session.destroy();
  return { expired: true, migrated: false };
}
