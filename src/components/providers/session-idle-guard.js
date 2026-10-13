"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuthSession } from "@/components/providers/auth-session-provider";
import { startVisibleInterval } from "@/lib/visible-interval";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "pointerdown"];
const PING_DEBOUNCE_MS = 45_000;
const SESSION_POLL_MS = 60_000;

/** @param {Response} res */
async function leaveIfMaintenance(res) {
  if (res.status !== 503) return false;
  const data = await res.clone().json().catch(() => ({}));
  if (data.code !== "maintenance") return false;
  window.location.replace("/maintenance");
  return true;
}

/**
 * Tracks user interaction, pings the server to slide idle expiry, and signs out when idle.
 */
export function SessionIdleGuard() {
  const pathname = usePathname();
  const { session, signOut, isSigningOut } = useAuthSession();
  const lastInteractionRef = useRef(0);
  const lastPingRef = useRef(0);
  const signingOutRef = useRef(false);

  const idleMinutes = Number(session?.sessionIdleMinutes) > 0 ? Number(session.sessionIdleMinutes) : 30;
  const idleMs = idleMinutes * 60 * 1000;

  const signOutIdle = useCallback(async () => {
    if (signingOutRef.current || isSigningOut) return;
    signingOutRef.current = true;
    const next = encodeURIComponent(pathname || "/");
    await signOut({
      message: "Signing you out due to inactivity…",
      redirectTo: `/login?next=${next}&reason=idle`,
    });
  }, [isSigningOut, pathname, signOut]);

  const pingIfActive = useCallback(async () => {
    if (!session?.authenticated) return;
    const now = Date.now();
    if (now - lastInteractionRef.current > idleMs) {
      await signOutIdle();
      return;
    }
    if (now - lastPingRef.current < PING_DEBOUNCE_MS) return;
    lastPingRef.current = now;
    try {
      const res = await fetch("/api/auth/ping", {
        method: "POST",
        credentials: "include",
      });
      if (await leaveIfMaintenance(res)) return;
      if (res.status === 401) {
        await signOutIdle();
      }
    } catch {
      /* offline — connection banner handles awareness */
    }
  }, [idleMs, session?.authenticated, signOutIdle]);

  useEffect(() => {
    if (!session?.authenticated || isSigningOut) return undefined;
    if (!lastInteractionRef.current) lastInteractionRef.current = Date.now();

    const onActivity = () => {
      lastInteractionRef.current = Date.now();
      void pingIfActive();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }

    const stopPoll = startVisibleInterval(() => {
      void (async () => {
        if (Date.now() - lastInteractionRef.current > idleMs) {
          await signOutIdle();
          return;
        }
        try {
          const res = await fetch("/api/auth/session?check=1", {
            credentials: "include",
            cache: "no-store",
          });
          if (await leaveIfMaintenance(res)) return;
          const data = await res.json().catch(() => ({}));
          if (!data.authenticated && data.reason === "idle_expired") {
            await signOutIdle();
          }
        } catch {
          /* ignore */
        }
      })();
    }, SESSION_POLL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      stopPoll();
    };
  }, [idleMs, isSigningOut, pingIfActive, session?.authenticated, signOutIdle]);

  return null;
}
