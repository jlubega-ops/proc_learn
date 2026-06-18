import { createTheme } from "@mui/material/styles";
import {
  BRAND_BLUE,
  BRAND_BLUE_DARK,
  BRAND_RED,
  BRAND_YELLOW,
  BRAND_YELLOW_DARK_MODE,
  BRAND_YELLOW_ON_LIGHT,
  SEMANTIC,
} from "@/lib/brand-colors";

/**
 * @param {"light" | "dark"} mode
 */
export function createProcLearnMuiTheme(mode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: BRAND_BLUE,
        light: "#33a3db",
        dark: BRAND_BLUE_DARK,
        contrastText: "#ffffff",
      },
      secondary: {
        main: BRAND_YELLOW,
        dark: "#e6da00",
        contrastText: "#18181b",
      },
      error: {
        main: BRAND_RED,
        light: "#f04a50",
        dark: "#c41820",
        contrastText: "#ffffff",
      },
      warning: {
        main: isDark ? BRAND_YELLOW_DARK_MODE : BRAND_YELLOW,
        contrastText: "#18181b",
      },
      info: {
        main: BRAND_BLUE,
        contrastText: "#ffffff",
      },
      success: {
        main: SEMANTIC.success,
        light: SEMANTIC.successDark,
        contrastText: "#ffffff",
      },
      background: {
        default: isDark ? "#09090b" : "#fafafa",
        paper: isDark ? "#18181b" : "#ffffff",
      },
      text: {
        primary: isDark ? "#fafafa" : "#18181b",
        secondary: isDark ? "#a1a1aa" : "#52525b",
      },
      divider: isDark ? "rgba(250,250,250,0.12)" : "rgba(24,24,27,0.12)",
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: "var(--font-geist-sans), Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600 },
          contained: {
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          colorWarning: {
            backgroundColor: isDark
              ? "color-mix(in oklab, #fff200 30%, #18181b)"
              : "color-mix(in oklab, #fff200 58%, white)",
            color: "#18181b",
            fontWeight: 600,
          },
          colorInfo: {
            backgroundColor: isDark
              ? "color-mix(in oklab, #008bd0 28%, #18181b)"
              : "color-mix(in oklab, #008bd0 16%, white)",
            color: isDark ? "#7dd3fc" : BRAND_BLUE_DARK,
            fontWeight: 600,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: isDark
            ? {}
            : {
                "&.MuiIconButton-colorWarning": {
                  color: BRAND_YELLOW_ON_LIGHT,
                  "&:hover": {
                    backgroundColor: "color-mix(in oklab, #b89400 14%, transparent)",
                  },
                },
                "&.MuiIconButton-colorSecondary": {
                  color: BRAND_YELLOW_ON_LIGHT,
                  "&:hover": {
                    backgroundColor: "color-mix(in oklab, #b89400 14%, transparent)",
                  },
                },
              },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: BRAND_BLUE, height: 3, borderRadius: "3px 3px 0 0" },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            "&.Mui-checked": { color: BRAND_BLUE },
          },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: {
            "&.Mui-checked": { color: BRAND_BLUE },
          },
        },
      },
      MuiCircularProgress: {
        styleOverrides: {
          root: { color: BRAND_BLUE },
        },
      },
    },
  });
}

/** Auth / public surfaces are always light mode. */
export const procLearnAuthMuiTheme = createProcLearnMuiTheme("light");
