"use client";

import { useMemo } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useAppTheme } from "@/components/providers/theme-provider";
import { createProcLearnMuiTheme } from "@/lib/mui-app-theme";
import { isAuthLightRoutePath } from "@/lib/auth-light-routes";
import { usePathname } from "next/navigation";

/**
 * Applies Proc Learn MUI palette (blue / yellow / red) for signed-in surfaces.
 * Auth routes keep light styling via parent layout; mode follows `ThemeProvider`.
 */
export function MuiAppThemeProvider({ children }) {
  const { mode } = useAppTheme();
  const pathname = usePathname();
  const effectiveMode = isAuthLightRoutePath(pathname) ? "light" : mode;

  const theme = useMemo(
    () => createProcLearnMuiTheme(effectiveMode === "dark" ? "dark" : "light"),
    [effectiveMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
