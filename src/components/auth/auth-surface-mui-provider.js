"use client";

import { ThemeProvider } from "@mui/material/styles";
import { procLearnAuthMuiTheme } from "@/lib/mui-app-theme";

/**
 * MUI theme for public auth surfaces. Lives in a Client Component so the theme
 * object (with breakpoint functions) is never serialized from a Server Component.
 */
export function AuthSurfaceMuiProvider({ children }) {
  return <ThemeProvider theme={procLearnAuthMuiTheme}>{children}</ThemeProvider>;
}
