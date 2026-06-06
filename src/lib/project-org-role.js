/** Default organisation role assigned when a student enters their project workspace. */
export const PROJECT_ORG_ENTRY_ROLE_NAME = "Admin";

/**
 * @param {unknown} name
 */
export function isProjectOrgAdminRole(name) {
  return String(name || "").trim().toLowerCase() === PROJECT_ORG_ENTRY_ROLE_NAME.toLowerCase();
}

/**
 * Guarantees the required Admin project role exists and stays active.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function ensureProjectOrgAdminRole(prisma) {
  return prisma.projectOrgRole.upsert({
    where: { name: PROJECT_ORG_ENTRY_ROLE_NAME },
    create: {
      name: PROJECT_ORG_ENTRY_ROLE_NAME,
      description:
        "Organisation administrator. Students enter the project workspace with this role.",
      sortOrder: 0,
      isActive: true,
    },
    update: {
      isActive: true,
    },
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getProjectOrgAdminRole(prisma) {
  await ensureProjectOrgAdminRole(prisma);
  return prisma.projectOrgRole.findUnique({
    where: { name: PROJECT_ORG_ENTRY_ROLE_NAME },
  });
}

/**
 * @param {{ name: string; isActive?: boolean; fieldErrors?: Record<string, string> }}
 */
export function projectOrgAdminRoleGuardError({ name, isActive, fieldErrors = {} }) {
  if (!isProjectOrgAdminRole(name)) return null;

  if (isActive === false) {
    return {
      error: "The Admin role is required. Students enter every project with this role, so it cannot be deactivated.",
      fieldErrors: { ...fieldErrors, isActive: "Admin must stay active." },
    };
  }

  return {
    error: "The Admin role is required and cannot be removed or renamed.",
    fieldErrors,
  };
}
