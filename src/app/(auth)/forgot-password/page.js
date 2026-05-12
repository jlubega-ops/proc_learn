import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { APP_NAME, ORG_SHORT } from "@/lib/appConfig";

export const metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCardShell title="Forgot password" subtitle={`${APP_NAME} · ${ORG_SHORT}`}>
      <ForgotPasswordForm />
    </AuthCardShell>
  );
}
