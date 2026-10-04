import { Role } from "@prisma/client";
import { getProjectOrgAdminRole, isProjectOrgAdminRole, isWorkflowOnlyOrgRole } from "@/lib/project-org-role";
import { PROJECT_ORG_LEARN_PASSWORD } from "@/lib/projects/org-user-identity";

import { canManageProjectOrgWorkspace } from "@/lib/projects/access";

/**
 * Student project owner managing their organisation user accounts.
 * @param {{ userId: string; activeRole: import("@prisma/client").Role; project: any }} p
 */
export function canManageProjectOrgUsers(params) {
  return canManageProjectOrgWorkspace(params);
}

const deptBrief = { select: { id: true, name: true, isActive: true } };

const orgUserInclude = {
  projectOrgRole: {
    select: { id: true, name: true, isActive: true },
  },
  department: deptBrief,
  subunit: deptBrief,
};

/**
 * @param {any} row
 * @param {string | null | undefined} studentNumber
 */
export function serializeProjectOrgUser(row, studentNumber = null) {
  const loginEmail = row.isProjectAdmin ? null : row.email;

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    loginEmail,
    password: !row.isProjectAdmin ? PROJECT_ORG_LEARN_PASSWORD : null,
    isProjectAdmin: row.isProjectAdmin,
    linkedUserId: row.linkedUserId,
    studentNumber: studentNumber || null,
    role: row.projectOrgRole
      ? {
          id: row.projectOrgRole.id,
          name: row.projectOrgRole.name,
          isActive: row.projectOrgRole.isActive,
        }
      : null,
    department: row.department
      ? { id: row.department.id, name: row.department.name, isActive: row.department.isActive }
      : null,
    subunit: row.subunit
      ? { id: row.subunit.id, name: row.subunit.name, isActive: row.subunit.isActive }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Creates or refreshes the project owner's Admin org user row.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} ownerUserId
 */
export async function ensureProjectOwnerOrgUser(prisma, projectId, ownerUserId) {
  const adminRole = await getProjectOrgAdminRole(prisma);
  if (!adminRole) {
    throw new Error("Required Admin project role is missing.");
  }

  const user = await prisma.user.findUnique({
    where: { id: ownerUserId },
    include: { studentProfile: { select: { studentNumber: true } } },
  });
  if (!user) return null;

  const existing = await prisma.projectOrgUser.findFirst({
    where: { projectId, linkedUserId: ownerUserId },
    include: orgUserInclude,
  });

  const profile = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    projectOrgRoleId: adminRole.id,
    isProjectAdmin: true,
  };

  let row;
  if (existing) {
    row = await prisma.projectOrgUser.update({
      where: { id: existing.id },
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        projectOrgRoleId: profile.projectOrgRoleId,
        isProjectAdmin: true,
      },
      include: orgUserInclude,
    });
  } else {
    row = await prisma.projectOrgUser.create({
      data: {
        projectId,
        linkedUserId: ownerUserId,
        ...profile,
      },
      include: orgUserInclude,
    });
  }

  return {
    row,
    studentNumber: user.studentProfile?.studentNumber || null,
  };
}

/**
 * Active assignable roles for org users (excludes Admin).
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function listAssignableProjectOrgRoles(prisma) {
  const rows = await prisma.projectOrgRole.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return rows.filter(
    (row) => !isProjectOrgAdminRole(row.name) && !isWorkflowOnlyOrgRole(row.name),
  );
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} roleId
 */
export async function getAssignableProjectOrgRole(prisma, roleId) {
  const row = await prisma.projectOrgRole.findFirst({
    where: { id: roleId, isActive: true },
    select: { id: true, name: true },
  });
  if (!row || isProjectOrgAdminRole(row.name) || isWorkflowOnlyOrgRole(row.name)) return null;
  return row;
}

export { orgUserInclude };
