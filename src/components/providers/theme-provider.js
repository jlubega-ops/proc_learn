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
import { isAuthLightRoutePath } from "@/lib/auth-light-routes";
import {
  applyThemeClassToDocument,
  readStoredTheme,
  writeStoredTheme,
} from "@/lib/theme-storage";
import { useAuthSession } from "@/components/providers/auth-session-provider";

const ThemeContext = createContext({
  mode: "light",
  setMode: () => {},
  toggleMode: () => {},
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

function getLocalInitialMode() {
  if (typeof window === "undefined") return "light";
  const stored = readStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

async function patchThemeOnServer(mode) {
  await fetch("/api/user/settings/theme", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: mode }),
  });
}

export function ThemeProvider({ children }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const auth = useAuthSession();
  const authRef = useRef(auth.session);
  const [mode, setModeState] = useState("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    authRef.current = auth.session;
  }, [auth.session]);

  const isAuthLight = isAuthLightRoutePath(pathname);

  useEffect(() => {
    if (isAuthLight) {
      applyThemeClassToDocument("light");
      setReady(true);
      return;
    }
    if (auth.loading) return;

    const data = auth.session;
    let initialMode = getLocalInitialMode();
    if (data?.authenticated && (data.theme === "light" || data.theme === "dark")) {
      initialMode = data.theme;
    }
    setModeState(initialMode);
    applyThemeClassToDocument(initialMode);
    writeStoredTheme(initialMode);
    setReady(true);
  }, [auth.loading, auth.session, isAuthLight]);

  const persistServerIfNeeded = useCallback(async (m) => {
    if (!authRef.current?.authenticated) return;
    try {
      await patchThemeOnServer(m);
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = useCallback(
    (next) => {
      const m = next === "dark" ? "dark" : "light";
      setModeState(m);
      writeStoredTheme(m);
      if (!isAuthLightRoutePath(pathnameRef.current)) {
        applyThemeClassToDocument(m);
      }
      void persistServerIfNeeded(m);
    },
    [persistServerIfNeeded],
  );

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const m = prev === "dark" ? "light" : "dark";
      writeStoredTheme(m);
      if (!isAuthLightRoutePath(pathnameRef.current)) {
        applyThemeClassToDocument(m);
      }
      void persistServerIfNeeded(m);
      return m;
    });
  }, [persistServerIfNeeded]);

  useEffect(() => {
    if (!ready) return;
    if (isAuthLight) {
      applyThemeClassToDocument("light");
      return;
    }
    applyThemeClassToDocument(mode);
  }, [mode, ready, isAuthLight]);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
