import { redirect } from "next/navigation";
import { LoginPageShell } from "@/components/auth/login-page-shell";
import { APP_NAME } from "@/lib/appConfig";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getAppSession } from "@/lib/auth/session";
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
    const session = await getAppSession();
    if (session?.userId) {
      const payload = await buildSessionPayloadForUserId(session.userId);
      if (payload.authenticated) {
        redirect(nextDest);
      }
    }
  }

  const oauthError =
    typeof sp?.error === "string" && sp.error ? sp.error : "";

  return (
    <LoginPageShell initialNext={nextDest} oauthError={oauthError} />
  );
}
