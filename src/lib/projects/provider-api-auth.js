import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION, orgUserHasPermission } from "@/lib/projects/org-role-permissions";

const ORG_ADMIN_ROLE_NAMES = new Set(["Organization Administrator", "Admin"]);

/**
 * Read access to the provider register: org members with VIEW_PROVIDERS, or the
 * platform project owner (Organisation Administrator, read-only).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function authorizeProviderRead(prisma, projectId) {
  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROVIDERS,
  });
  if (auth.ok) {
    if (auth.type !== "org") {
      return { ...auth, canManage: false, canSeeCredentials: Boolean(auth.canManageOrgAdmin) };
    }
    const roleName = auth.orgUser?.projectOrgRole?.name || "";
    const canManage = orgUserHasPermission(roleName, ORG_PERMISSION.MANAGE_PROVIDERS);
    return {
      ...auth,
      canManage,
      canSeeCredentials: canManage || ORG_ADMIN_ROLE_NAMES.has(roleName),
    };
  }
  const adminAuth = await authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
  if (!adminAuth.ok) return { ok: false, status: auth.status === 401 ? 401 : 404 };
  return { ...adminAuth, canManage: false, canSeeCredentials: true };
}

/**
 * Write access: only Procurement Officer and Head PDU (MANAGE_PROVIDERS).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function authorizeProviderManage(prisma, projectId) {
  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.MANAGE_PROVIDERS,
  });
  if (!auth.ok || auth.type !== "org") {
    return {
      ok: false,
      status: 403,
      error: "Only the Procurement Officer or Head PDU can manage the provider register.",
    };
  }
  return {
    ok: true,
    orgUserId: auth.orgUser.id,
    roleName: auth.orgUser.projectOrgRole?.name || "",
  };
}
