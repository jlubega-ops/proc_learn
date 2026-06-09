import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import DashboardLayoutClient from "@/components/layout/dashboard-layout-client";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getReadableAppSession } from "@/lib/auth/session";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { buildSessionPayloadForOrgUserId } from "@/lib/auth/org-session-payload";
import { buildIronSessionOptions } from "@/lib/auth/session-options";

export default async function DashboardLayout({ children }) {
  if (!buildIronSessionOptions()) {
    redirect("/login");
  }

  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || "/");

  const session = await getReadableAppSession();
  if (!session?.userId && !session?.orgUserId) {
    redirect(`/login?next=${encodeURIComponent(pathname)}&reason=idle`);
  }

  if (session.orgUserId) {
    const payload = await buildSessionPayloadForOrgUserId(session.orgUserId);
    if (!payload.authenticated) {
      redirect(`/login?next=${encodeURIComponent(pathname)}`);
    }

    const projectBase = `/projects/${payload.projectId}`;
    if (!pathname.startsWith(projectBase)) {
      redirect(projectBase);
    }

    return (
      <AuthSessionProvider initialSession={payload}>
        <DashboardLayoutClient>{children}</DashboardLayoutClient>
      </AuthSessionProvider>
    );
  }

  const payload = await buildSessionPayloadForUserId(session.userId);
  if (!payload.authenticated) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  if (payload.mustChangePassword && pathname !== "/setup-password") {
    redirect("/setup-password");
  }

  return (
    <AuthSessionProvider initialSession={payload}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthSessionProvider>
  );
}
