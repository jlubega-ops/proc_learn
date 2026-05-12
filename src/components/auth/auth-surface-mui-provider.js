"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";

const authSurfaceTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#008bd0" },
    error: { main: "#ed1c24" },
  },
});

/**
 * MUI theme for public auth surfaces. Lives in a Client Component so the theme
 * object (with breakpoint functions) is never serialized from a Server Component.
 */
export function AuthSurfaceMuiProvider({ children }) {
  return <ThemeProvider theme={authSurfaceTheme}>{children}</ThemeProvider>;
}
