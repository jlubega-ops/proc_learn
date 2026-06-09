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
import { SessionIdleGuard } from "@/components/providers/session-idle-guard";
import {
  queuePostAuthToast,
  setClientSigningOutFlag,
} from "@/lib/auth/client-sign-out";

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
 * @property {string} [activeRole]
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

  const setSessionBlocking = useCallback((active, message) => {
    if (!active) {
      setBlocking({ active: false, message: "" });
      return;
    }
    const m =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "Please wait…";
    setBlocking({ active: true, message: m });
  }, []);

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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      {children}
    </AuthSessionContext.Provider>
  );
}
