import { BrandedPublicShell } from "@/components/auth/branded-public-shell";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Login: full-viewport MUBS-branded backdrop, centered card, no page scroll.
 * @param {{ initialNext?: string; oauthError?: string; idleLogout?: boolean }} props
 */
export function LoginPageShell({
  initialNext = "/",
  oauthError = "",
  idleLogout = false,
}) {
  return (
    <BrandedPublicShell className="h-dvh">
      <LoginForm
        initialNext={initialNext}
        oauthError={oauthError}
        idleLogout={idleLogout}
      />
    </BrandedPublicShell>
  );
}
