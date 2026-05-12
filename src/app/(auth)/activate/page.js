import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ActivateAccountForm } from "@/components/auth/activate-account-form";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";

export const metadata = {
  title: "Activate account",
};

export default function ActivatePage() {
  return (
    <AuthCardShell
      title="Activate your account"
      subtitle={`${APP_NAME} · ${ORG_SHORT} — complete setup with a secure password.`}
    >
      <ActivateAccountForm />
    </AuthCardShell>
  );
}
