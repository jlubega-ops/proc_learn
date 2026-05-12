"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
 */

const AuthSessionContext = createContext({
  loading: true,
  /** @type {SessionPayload | null} */
  session: null,
  refresh: async () => {},
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
    try {
      const data = await fetchSessionPayload();
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      loading,
      session,
      refresh,
      isRoleSwitching: blocking.active,
      blockingMessage: blocking.active ? blocking.message : "",
      setRoleSwitching,
      setSessionBlocking,
    }),
    [loading, session, refresh, blocking.active, blocking.message, setRoleSwitching, setSessionBlocking],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}
