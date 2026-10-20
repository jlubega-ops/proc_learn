import { cookies, headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { MuiAppThemeProvider } from "@/components/providers/mui-app-theme-provider";
import { ConnectionBanner } from "@/components/connection/connection-banner";
import { ToastProvider } from "@/components/providers/toast-provider";
import { PostAuthToastConsumer } from "@/components/providers/post-auth-toast-consumer";
import { ConfirmProvider } from "@/components/providers/confirm-provider";
import { SwrProvider } from "@/components/providers/swr-provider";
import { SiteBrandingProvider } from "@/components/providers/site-branding-provider";
import { getSiteBranding } from "@/lib/site-branding";
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

export async function generateMetadata() {
  const { logoUrl } = await getSiteBranding();
  const icon = `/_next/image?url=${encodeURIComponent(logoUrl)}&w=64&q=75`;
  return {
    title: {
      template: `%s — ${APP_NAME}`,
      default: `${APP_NAME} — ${ORG_SHORT}`,
    },
    description: `${APP_NAME} — learning platform for students at Makerere University Business School.`,
    icons: { icon, shortcut: icon, apple: icon },
  };
}

export default async function RootLayout({ children }) {
  const [cookieStore, headerStore, branding] = await Promise.all([cookies(), headers(), getSiteBranding()]);
  const pathname = headerStore.get("x-pl-pathname") || "/";
  const themeClass = resolveHtmlThemeClass(pathname, cookieStore);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${themeClass ? ` ${themeClass}` : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <SiteBrandingProvider branding={branding}>
          <AuthSessionProvider>
            <ThemeProvider>
              <MuiAppThemeProvider>
                <ToastProvider>
                  <PostAuthToastConsumer />
                  <ConfirmProvider>
                    <SwrProvider>
                      <ConnectionBanner />
                      {children}
                    </SwrProvider>
                  </ConfirmProvider>
                </ToastProvider>
              </MuiAppThemeProvider>
            </ThemeProvider>
          </AuthSessionProvider>
        </SiteBrandingProvider>
      </body>
    </html>
  );
}
