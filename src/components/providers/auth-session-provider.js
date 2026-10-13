"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { SessionIdleGuard } from "@/components/providers/session-idle-guard";
import { clearApiCache } from "@/lib/api-client-cache";
import { RoleSwitchOverlay } from "@/components/layout/role-switch-overlay";
import {
  queuePostAuthToast,
  setClientSigningOutFlag,
} from "@/lib/auth/client-sign-out";

/** Overlay must never outlive a hung fetch or a same-path navigation. */
const SESSION_BLOCKING_MAX_MS = 10000;

/**
 * @typedef {Object} SessionPayload
 * @property {boolean} authenticated
 * @property {string} [userId]
 * @property {string} [email]
 * @property {string} [displayName] trimmed full name when set
 * @property {string} [imageUrl] https profile image URL when set
 * @property {'light'|'dark'} [theme]
 * @property {string[]} [grantedRoles]
 * @property {string[]} [switchableRoles]
 * @property {string} [permanentRole]
 * @property {string} [activeRole]
 * @property {string} [effectiveRole]
 * @property {string | null} [participationType]
 * @property {boolean} [isStudentMode]
 * @property {string | null} [returnRoleLabel]
 * @property {string | null} [returnRole]
 * @property {null | { programmeId: string; programmeName: string | null; programmeShortName: string | null; campus: string | null; campusLabel: string }} [studentView]
 * @property {number} [sessionIdleMinutes]
 * @property {string} [reason]
 */

const AuthSessionContext = createContext({
  loading: true,
  /** @type {SessionPayload | null} */
  session: null,
  refresh: async () => {},
  signOut: async () => {},
  isSigningOut: false,
  /** Full-screen blocking overlay (logout, role switch, etc.) */
  isRoleSwitching: false,
  /** Message shown on the blocking overlay while `isRoleSwitching` is true */
  blockingMessage: "",
  setRoleSwitching: (_v) => {},
  /**
   * @param {boolean} active
   * @param {string} [message] shown when active (default: "Please wait…")
   */
  setSessionBlocking: (_active, _message) => {},
});

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

async function fetchSessionPayload() {
  const res = await fetch("/api/auth/session", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return { authenticated: false };
  return res.json();
}

/**
 * @param {{ children: import('react').ReactNode; initialSession?: SessionPayload | null }} props
 */
export function AuthSessionProvider({ children, initialSession = null }) {
  const hasInitial =
    Boolean(initialSession) &&
    typeof initialSession === "object" &&
    initialSession.authenticated === true;
  const [loading, setLoading] = useState(!hasInitial);
  /** @type {[SessionPayload | null, import('react').Dispatch<import('react').SetStateAction<SessionPayload | null>>]} */
  const [session, setSession] = useState(
    hasInitial ? initialSession : null,
  );
  const [blocking, setBlocking] = useState({ active: false, message: "" });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const blockTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const pathname = usePathname();

  const clearBlockTimer = useCallback(() => {
    if (blockTimerRef.current) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, []);

  const setSessionBlocking = useCallback(
    (active, message) => {
      clearBlockTimer();
      if (!active) {
        setBlocking({ active: false, message: "" });
        return;
      }
      if (signingOutRef.current) return;
      const m =
        typeof message === "string" && message.trim()
          ? message.trim()
          : "Please wait…";
      setBlocking({ active: true, message: m });
      blockTimerRef.current = setTimeout(() => {
        blockTimerRef.current = null;
        if (signingOutRef.current) return;
        setBlocking({ active: false, message: "" });
      }, SESSION_BLOCKING_MAX_MS);
    },
    [clearBlockTimer],
  );

  const setRoleSwitching = useCallback(
    (v) => {
      if (v) {
        setSessionBlocking(true, "Updating your session…");
      } else {
        setSessionBlocking(false);
      }
    },
    [setSessionBlocking],
  );

  const refresh = useCallback(async () => {
    if (signingOutRef.current) return;
    try {
      const data = await fetchSessionPayload();
      if (signingOutRef.current) return;
      setSession(data);
    } catch {
      if (!signingOutRef.current) {
        setSession({ authenticated: false });
      }
    } finally {
      if (!signingOutRef.current) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * @param {{ redirectTo?: string; message?: string; toast?: { message: string; severity?: 'success' | 'error'; duration?: number } }} [opts]
   */
  const signOut = useCallback(async (opts = {}) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setIsSigningOut(true);
    setClientSigningOutFlag(true);
    clearBlockTimer();

    const redirectTo =
      typeof opts.redirectTo === "string" && opts.redirectTo.trim()
        ? opts.redirectTo
        : "/login";
    const message =
      typeof opts.message === "string" && opts.message.trim()
        ? opts.message.trim()
        : "Signing you out…";

    setBlocking({ active: true, message });

    if (opts.toast?.message) {
      queuePostAuthToast(opts.toast);
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch {
      /* still leave the signed-in shell */
    }

    window.location.replace(redirectTo);
  }, [clearBlockTimer]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cached API data belongs to one identity; a role, org or student-view switch must not show the old one.
  const identity = session?.authenticated
    ? [
        session.userId,
        session.orgUserId,
        session.activeRole,
        session.activeOrgProjectId,
        session.activeAttempt?.attemptId,
        session.studentView?.programmeId,
        session.studentView?.campus,
      ].join("|")
    : "";
  const identityRef = useRef(identity);
  useEffect(() => {
    if (identityRef.current === identity) return;
    const hadIdentity = Boolean(identityRef.current);
    identityRef.current = identity;
    if (hadIdentity) void clearApiCache();
  }, [identity]);

  useEffect(() => {
    if (signingOutRef.current) return;
    setBlocking({ active: false, message: "" });
    if (blockTimerRef.current) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (blockTimerRef.current) {
        clearTimeout(blockTimerRef.current);
        blockTimerRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      loading,
      session,
      refresh,
      signOut,
      isSigningOut,
      isRoleSwitching: blocking.active,
      blockingMessage: blocking.active ? blocking.message : "",
      setRoleSwitching,
      setSessionBlocking,
    }),
    [
      loading,
      session,
      refresh,
      signOut,
      isSigningOut,
      blocking.active,
      blocking.message,
      setRoleSwitching,
      setSessionBlocking,
    ],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      <SessionIdleGuard />
      <RoleSwitchOverlay active={blocking.active} message={blocking.message} />
      {children}
    </AuthSessionContext.Provider>
  );
}
