"use client";

import { useLayoutEffect } from "react";

/**
 * Auth routes (`/login`, `/forgot-password`, `/reset-password`, `/activate`) stay light.
 * Backs up ThemeProvider + `layout.js` script if `dark` was applied earlier in the session.
 */
export function ForceAuthLightHtml() {
  useLayoutEffect(() => {
    try {
      document.documentElement.classList.remove("dark");
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
