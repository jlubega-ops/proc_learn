import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { requireStudentOrganisation } from "@/lib/projects/require-student-organisation";

export default async function StudentOrganisationAdminLayout({ children }) {
  const org = await requireStudentOrganisation();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || "/organisation");

  await getProjectWorkspacePageContext(org.projectId, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  return children;
}
