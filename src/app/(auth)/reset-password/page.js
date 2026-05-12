import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";

export const metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <AuthCardShell
      title="Set a new password"
      subtitle={`${APP_NAME} · ${ORG_SHORT} — choose a strong password for your MUBS account.`}
    >
      <ResetPasswordForm />
    </AuthCardShell>
  );
}
