import { BrandedPublicShell } from "@/components/auth/branded-public-shell";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Login: full-viewport MUBS-branded backdrop, centered card, no page scroll.
 * @param {{ initialNext?: string; oauthError?: string }} props
 */
export function LoginPageShell({
  initialNext = "/",
  oauthError = "",
}) {
  return (
    <BrandedPublicShell className="h-dvh">
      <LoginForm initialNext={initialNext} oauthError={oauthError} />
    </BrandedPublicShell>
  );
}
