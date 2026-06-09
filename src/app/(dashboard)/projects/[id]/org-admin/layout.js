import { headers } from "next/headers";
import { getProjectWorkspacePageContext } from "@/lib/projects/project-page-context";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export default async function ProjectOrgAdminLayout({ children, params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  const h = await headers();
  const pathname = safeNextPath(h.get("x-pl-pathname") || `/projects/${id}`);

  await getProjectWorkspacePageContext(id, {
    pathname,
    requirePlatformOrgAdmin: true,
  });

  return children;
}
