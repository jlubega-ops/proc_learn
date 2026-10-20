"use client";

import { useEffect, useRef } from "react";
import { useAuthSession } from "@/components/providers/auth-session-provider";

/**
 * Pushes a server-built session into the root AuthSessionProvider so dashboard
 * does not nest a second provider or re-fetch /api/auth/session on every entry.
 *
 * @param {{ session: Record<string, unknown> | null | undefined }} props
 */
export function AuthSessionHydrate({ session }) {
  const { hydrateSession } = useAuthSession();
  const lastKey = useRef("");

  useEffect(() => {
    if (!session || session.authenticated !== true) return;
    const key = [
      String(session.userId || ""),
      String(session.orgUserId || ""),
      String(session.activeRole || session.orgRoleName || ""),
      String(session.activeOrgProjectId || session.projectId || ""),
      String(session.effectiveRole || ""),
    ].join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;
    hydrateSession(/** @type {any} */ (session));
  }, [session, hydrateSession]);

  return null;
}
