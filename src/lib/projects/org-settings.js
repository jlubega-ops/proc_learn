import { buildPersonalOrgLabels } from "@/lib/projects/student-personal-org";

export const ORG_SETTINGS_SELECT = {
  id: true,
  name: true,
  organizationName: true,
  voteCode: true,
  projectCode: true,
  isPersonalOrg: true,
  isAttemptOrg: true,
  owner: { select: { firstName: true, middleName: true, lastName: true } },
};

/** @param {any} row */
export function serializeOrgSettings(row) {
  return {
    organizationName: row.organizationName || row.name,
    defaultName: buildPersonalOrgLabels(row.owner || {}).organizationName,
    voteCode: row.voteCode || "",
    projectCode: row.projectCode || null,
    canEditName: Boolean(row.isPersonalOrg && !row.isAttemptOrg),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function loadOrgSettings(prisma, projectId) {
  const row = await prisma.project.findUnique({ where: { id: projectId }, select: ORG_SETTINGS_SELECT });
  return row ? serializeOrgSettings(row) : null;
}
