import { redirect } from "next/navigation";
import { LoginPageShell } from "@/components/auth/login-page-shell";
import { APP_NAME } from "@/lib/appConfig";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getReadableAppSession } from "@/lib/auth/session";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { buildIronSessionOptions } from "@/lib/auth/session-options";

export const metadata = {
  title: "Sign in",
  description: `Sign in to ${APP_NAME}.`,
};

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const nextDest = safeNextPath(
    typeof sp?.next === "string" ? sp.next : undefined,
  );

  if (buildIronSessionOptions()) {
    const session = await getReadableAppSession();
    if (session?.userId) {
      const payload = await buildSessionPayloadForUserId(session.userId);
      if (payload.authenticated) {
        // Prefer session defaultPath for students (/organisation) when next is home or unset.
        // Always honour an explicit safe next path otherwise.
        const dest =
          typeof payload.defaultPath === "string" &&
          payload.defaultPath.startsWith("/") &&
          (nextDest === "/" || !sp?.next)
            ? payload.defaultPath
            : nextDest;
        // Avoid login ↔ organisation bounce if next points at organisation but
        // provisioning failed (defaultPath stays "/").
        if (
          dest.startsWith("/organisation") &&
          typeof payload.defaultPath === "string" &&
          payload.defaultPath === "/"
        ) {
          redirect("/");
        }
        redirect(dest);
      }
    }
  }

  const oauthError =
    typeof sp?.error === "string" && sp.error ? sp.error : "";
  const idleLogout = sp?.reason === "idle";

  return (
    <LoginPageShell
      initialNext={nextDest}
      oauthError={oauthError}
      idleLogout={idleLogout}
    />
  );
}
