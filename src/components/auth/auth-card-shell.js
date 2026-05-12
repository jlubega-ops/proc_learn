import { AuthSurfaceMuiProvider } from "@/components/auth/auth-surface-mui-provider";
import { BrandedAuthCard, BrandedPublicShell } from "@/components/auth/branded-public-shell";

/**
 * Branded full-page shell for activate / forgot / reset flows.
 * @param {{ title: string; subtitle?: string; children: import("react").ReactNode }} props
 */
export function AuthCardShell({ title, subtitle, children }) {
  return (
    <BrandedPublicShell>
      <BrandedAuthCard title={title} subtitle={subtitle}>
        <AuthSurfaceMuiProvider>{children}</AuthSurfaceMuiProvider>
      </BrandedAuthCard>
    </BrandedPublicShell>
  );
}
