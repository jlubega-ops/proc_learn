import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { prisma } from "@/lib/prisma";

/** System admin and examiner may open project-settings routes. */
export default async function ProjectSettingsLayout({ children }) {
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

  const activeRole = user?.settings?.activeRole;
  if (activeRole !== Role.SYSTEM_ADMIN && activeRole !== Role.EXAMINER) {
    redirect("/");
  }

  return children;
}
