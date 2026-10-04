import { ProjectPurpose, ProjectStatus, ProjectVisibility, Role } from "@prisma/client";
import { formatUserDisplayName } from "@/lib/user-display";
import { APP_BRAND_LABEL } from "@/lib/appConfig";
import { generateUniqueProjectCode } from "@/lib/projects/project-identity";
import { ensureProjectOwnerOrgUser } from "@/lib/projects/org-users";
import { buildOrgDisplayName } from "@/lib/validation/org-display-name";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} userId
 */
export async function findStudentPersonalOrg(prisma, userId) {
  return prisma.project.findFirst({
    where: {
      ownerUserId: userId,
      creatorRole: Role.STUDENT,
      isPersonalOrg: true,
    },
    select: {
      id: true,
      name: true,
      organizationName: true,
      projectCode: true,
      status: true,
      isPersonalOrg: true,
    },
  });
}

/**
 * Default organisation labels: "{Student Name} Organisation". `name` always keeps this default;
 * `organizationName` is the display name the student may customise.
 * @param {{ firstName?: string | null; middleName?: string | null; lastName?: string | null }} user
 * @param {string} [_projectCode]
 */
export function buildPersonalOrgLabels(user, _projectCode) {
  const organizationName = buildOrgDisplayName(formatUserDisplayName(user) || "Student");
  return {
    name: organizationName,
    organizationName,
  };
}

/**
 * Ensures the signed-in user has exactly one personal organisation workspace and is Admin inside it.
 * Students and staff (who may activate student view without a STUDENT role row) are eligible.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} userId
 */
export async function ensureStudentPersonalOrg(prisma, userId) {
  const existing = await findStudentPersonalOrg(prisma, userId);
  if (existing) {
    await ensureProjectOwnerOrgUser(prisma, existing.id, userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, middleName: true, lastName: true },
    });
    const labels = user ? buildPersonalOrgLabels(user, existing.projectCode) : null;
    /** @type {Record<string, unknown>} */
    const patch = {};
    if (existing.status === ProjectStatus.NOT_STARTED) {
      patch.status = ProjectStatus.IN_PROGRESS;
    }
    if (labels) {
      const display = String(existing.organizationName || "").trim();
      const usesDefault = !display || display === existing.name;
      if (existing.name !== labels.name) patch.name = labels.name;
      if (usesDefault && display !== labels.organizationName) {
        patch.organizationName = labels.organizationName;
      }
    }
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.project.update({
        where: { id: existing.id },
        data: patch,
        select: {
          id: true,
          name: true,
          organizationName: true,
          projectCode: true,
          status: true,
          isPersonalOrg: true,
        },
      });
      try {
        const { ensureCurrentOrgSlateForOwner } = await import(
          "@/lib/academic/org-academic-slate"
        );
        await ensureCurrentOrgSlateForOwner(prisma, userId);
      } catch {
        /* slate ensure is non-blocking */
      }
      return updated;
    }
    try {
      const { ensureCurrentOrgSlateForOwner } = await import(
        "@/lib/academic/org-academic-slate"
      );
      await ensureCurrentOrgSlateForOwner(prisma, userId);
    } catch {
      /* slate ensure is non-blocking */
    }
    return existing;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      userRoles: { select: { role: true } },
      studentProfile: { select: { studentNumber: true } },
    },
  });
  if (!user) return null;

  const roles = user.userRoles.map((r) => r.role);
  const canHavePersonalOrg =
    roles.includes(Role.STUDENT) ||
    roles.includes(Role.SYSTEM_ADMIN) ||
    roles.includes(Role.EXAMINER);
  if (!canHavePersonalOrg) return null;

  const projectCode = await generateUniqueProjectCode(prisma);
  const labels = buildPersonalOrgLabels(user, projectCode);
  const studentNumber = user.studentProfile?.studentNumber || null;

  const created = await prisma.project.create({
    data: {
      ownerUserId: userId,
      creatorRole: Role.STUDENT,
      name: labels.name,
      organizationName: labels.organizationName,
      description: studentNumber
        ? `${APP_BRAND_LABEL} organisation for student ${studentNumber}.`
        : `${APP_BRAND_LABEL} organisation.`,
      purpose: ProjectPurpose.PRACTICE,
      status: ProjectStatus.IN_PROGRESS,
      visibility: ProjectVisibility.PRIVATE,
      isPublished: true,
      requiresEnrollment: false,
      projectCode,
      isPersonalOrg: true,
    },
    select: {
      id: true,
      name: true,
      organizationName: true,
      projectCode: true,
      status: true,
      isPersonalOrg: true,
    },
  });

  await ensureProjectOwnerOrgUser(prisma, created.id, userId);
  try {
    const { ensureCurrentOrgSlateForOwner } = await import(
      "@/lib/academic/org-academic-slate"
    );
    await ensureCurrentOrgSlateForOwner(prisma, userId);
  } catch {
    /* slate ensure is non-blocking */
  }
  return created;
}

/**
 * Default signed-in path for a platform user after auth / role switch.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} userId
 * @param {import("@prisma/client").Role | string} activeRole
 */
export async function resolveStudentDefaultPath(prisma, userId, activeRole) {
  if (activeRole !== Role.STUDENT) return null;
  const org = await ensureStudentPersonalOrg(prisma, userId);
  if (!org?.id) return null;
  return `/`;
}
