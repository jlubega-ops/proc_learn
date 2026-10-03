import { redirect } from "next/navigation";
import { OrgProviderStatus } from "@prisma/client";
import { ForceAuthLightHtml } from "@/components/auth/force-auth-light-html";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { prisma } from "@/lib/prisma";
import { getReadableProviderSessionId } from "@/lib/projects/provider-portal";

export const metadata = {
  title: "Provider portal",
};

export default async function ProviderPortalLayout({ children }) {
  if (!buildIronSessionOptions()) redirect("/login");

  const providerId = await getReadableProviderSessionId();
  // No `next` param: a staff/student session must not bounce between /login and the portal.
  if (!providerId) redirect("/login");

  const provider = await prisma.projectOrgProvider.findUnique({
    where: { id: providerId },
    select: { status: true, project: { select: { isPublished: true } } },
  });
  if (!provider || provider.status !== OrgProviderStatus.ACTIVE || !provider.project?.isPublished) {
    redirect("/api/provider-portal/logout");
  }

  return (
    <>
      <ForceAuthLightHtml />
      <div className="min-h-dvh bg-zinc-50">{children}</div>
    </>
  );
}
