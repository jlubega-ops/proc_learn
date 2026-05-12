import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { prisma } from "@/lib/prisma";

/**
 * URL guard: only users whose **active** role is system admin may open /admin routes.
 */
export default async function AdminLayout({ children }) {
  if (!buildIronSessionOptions()) {
    redirect("/login");
  }

  const session = await getAppSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  });

  if (!user?.settings || user.settings.activeRole !== "SYSTEM_ADMIN") {
    redirect("/");
  }

  return children;
}
