import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import DashboardLayoutClient from "@/components/layout/dashboard-layout-client";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getAppSession } from "@/lib/auth/session";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { buildIronSessionOptions } from "@/lib/auth/session-options";

export default async function DashboardLayout({ children }) {
  if (!buildIronSessionOptions()) {
    redirect("/login");
  }

  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || "/");

  const session = await getAppSession();
  if (!session?.userId) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  const payload = await buildSessionPayloadForUserId(session.userId);
  if (!payload.authenticated) {
    session.destroy();
    await session.save();
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <AuthSessionProvider initialSession={payload}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthSessionProvider>
  );
}
