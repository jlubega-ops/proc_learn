import { redirect } from "next/navigation";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { SetupPasswordForm } from "@/components/auth/setup-password-form";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";
import { getReadableAppSession } from "@/lib/auth/session";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { buildIronSessionOptions } from "@/lib/auth/session-options";

export const metadata = {
  title: "Set your password",
};

export default async function SetupPasswordPage() {
  if (!buildIronSessionOptions()) redirect("/login");

  const session = await getReadableAppSession();
  if (!session?.userId) redirect("/login?reason=idle");

  const payload = await buildSessionPayloadForUserId(session.userId);
  if (!payload.authenticated) redirect("/login");
  if (!payload.mustChangePassword) redirect("/");

  return (
    <AuthCardShell
      title="Set your password"
      subtitle={`${APP_NAME} · ${ORG_SHORT} — choose a personal password before continuing.`}
    >
      <SetupPasswordForm />
    </AuthCardShell>
  );
}
