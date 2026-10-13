/**
 * Isolated organisation shell for one student on one Academic Project (Practice/Assessment).
 * Same display name as the examiner specified; separate Project / staff / procurement tree.
 */
import { ProjectPurpose, ProjectStatus, ProjectVisibility, Role } from "@prisma/client";
import { generateUniqueProjectCode } from "@/lib/projects/project-identity";
import { ensureProjectOwnerOrgUser } from "@/lib/projects/org-users";
import { runInTx } from "@/lib/db-tx";

export const ATTEMPT_ORG_SELECT = {
  id: true,
  name: true,
  organizationName: true,
  projectCode: true,
  status: true,
  isPersonalOrg: true,
  isAttemptOrg: true,
  sourceAcademicProjectId: true,
  purpose: true,
};

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ studentUserId: string; academicProjectId: string }} p
 */
export async function findStudentAttemptOrg(db, { studentUserId, academicProjectId }) {
  if (!studentUserId || !academicProjectId) return null;
  return db.project.findFirst({
    where: {
      ownerUserId: studentUserId,
      isAttemptOrg: true,
      sourceAcademicProjectId: academicProjectId,
    },
    select: ATTEMPT_ORG_SELECT,
  });
}

/**
 * Create or reuse the student's empty organisation for this academic project.
 * Never copies data from My Organisation.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{
 *   studentUserId: string;
 *   academicProject: {
 *     id: string;
 *     name: string;
 *     organizationName?: string | null;
 *     purpose?: string;
 *     description?: string | null;
 *   };
 * }} p
 */
export async function ensureStudentAttemptOrganisation(db, { studentUserId, academicProject }) {
  const existing = await findStudentAttemptOrg(db, {
    studentUserId,
    academicProjectId: academicProject.id,
  });
  if (existing) {
    await ensureProjectOwnerOrgUser(db, existing.id, studentUserId);
    const orgName = (academicProject.organizationName || academicProject.name || "Organisation").slice(
      0,
      255,
    );
    if (existing.organizationName !== orgName || existing.name !== orgName) {
      return db.project.update({
        where: { id: existing.id },
        data: { name: orgName, organizationName: orgName },
        select: ATTEMPT_ORG_SELECT,
      });
    }
    return existing;
  }

  const orgName = (academicProject.organizationName || academicProject.name || "Organisation").slice(
    0,
    255,
  );
  const projectCode = await generateUniqueProjectCode(db);
  const purpose =
    academicProject.purpose === ProjectPurpose.ASSESSMENT
      ? ProjectPurpose.ASSESSMENT
      : ProjectPurpose.PRACTICE;

  return runInTx(db, async (tx) => {
    const created = await tx.project.create({
      data: {
        ownerUserId: studentUserId,
        creatorRole: Role.STUDENT,
        name: orgName,
        organizationName: orgName,
        description:
          academicProject.description ||
          "Isolated organisation workspace for this academic project. Staff and records start empty.",
        purpose,
        status: ProjectStatus.IN_PROGRESS,
        visibility: ProjectVisibility.PRIVATE,
        isPublished: true,
        requiresEnrollment: false,
        projectCode,
        isPersonalOrg: false,
        isAttemptOrg: true,
        sourceAcademicProjectId: academicProject.id,
      },
      select: ATTEMPT_ORG_SELECT,
    });
    await ensureProjectOwnerOrgUser(tx, created.id, studentUserId);
    return created;
  });
}

/**
 * Workspace Project id for an attempt (attempt org, else legacy personal org).
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   workspaceProjectId?: string | null;
 *   enrollment?: { projectId?: string | null } | null;
 * }} attempt
 * @param {string} studentUserId
 * @param {string | null} [personalOrgProjectId]
 */
export async function resolveAttemptWorkspaceProjectId(
  db,
  attempt,
  studentUserId,
  personalOrgProjectId = null,
) {
  if (attempt?.workspaceProjectId) return attempt.workspaceProjectId;
  const academicProjectId = attempt?.enrollment?.projectId || null;
  if (academicProjectId) {
    const org = await findStudentAttemptOrg(db, { studentUserId, academicProjectId });
    if (org?.id) return org.id;
  }
  return personalOrgProjectId || null;
}
