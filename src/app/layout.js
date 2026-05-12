import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConnectionBanner } from "@/components/connection/connection-banner";
import { ToastProvider } from "@/components/providers/toast-provider";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";
import { THEME_STORAGE_KEY } from "@/lib/theme-storage";

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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=(typeof location!=="undefined"&&location.pathname)||"";function authLight(x){return x==="/login"||x.indexOf("/login/")===0||x==="/forgot-password"||x.indexOf("/forgot-password/")===0||x==="/reset-password"||x.indexOf("/reset-password/")===0||x==="/activate"||x.indexOf("/activate/")===0;}if(authLight(p)){document.documentElement.classList.remove("dark");}else{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"){document.documentElement.classList.add("dark");}else if(t==="light"){document.documentElement.classList.remove("dark");}}}catch(e){}`,
          }}
        />
        <AuthSessionProvider>
          <ThemeProvider>
            <ToastProvider>
              <ConnectionBanner />
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
