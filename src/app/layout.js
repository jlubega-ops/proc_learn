import { cookies, headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { MuiAppThemeProvider } from "@/components/providers/mui-app-theme-provider";
import { ConnectionBanner } from "@/components/connection/connection-banner";
import { ToastProvider } from "@/components/providers/toast-provider";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";
import { resolveHtmlThemeClass } from "@/lib/resolve-html-theme-class";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    template: `%s — ${APP_NAME}`,
    default: `${APP_NAME} — ${ORG_SHORT}`,
  },
  description: `${APP_NAME} — learning platform for students at Makerere University Business School.`,
};

export default async function RootLayout({ children }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const pathname = headerStore.get("x-pl-pathname") || "/";
  const themeClass = resolveHtmlThemeClass(pathname, cookieStore);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${themeClass ? ` ${themeClass}` : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <AuthSessionProvider>
          <ThemeProvider>
            <MuiAppThemeProvider>
              <ToastProvider>
                <ConnectionBanner />
                {children}
              </ToastProvider>
            </MuiAppThemeProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
