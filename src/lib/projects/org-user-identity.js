import { buildOrgUserLoginEmail, orgUserNameKey } from "@/lib/projects/org-login-identity";

/** Fixed password for simulated organisation users in learning projects. */
export const PROJECT_ORG_LEARN_PASSWORD = "password123";

export const ORG_USER_EXISTS_ERROR = "User already exists.";
export const ORG_USER_EXISTS_FIELD_ERRORS = {
  firstName: "A user with this name already exists.",
  lastName: "A user with this name already exists.",
};

/**
 * Another member of the organisation with the same first + last name (compared as the login slug,
 * so the generated `firstname.lastname` login stays unique).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; firstName: string; lastName: string; excludeOrgUserId?: string | null }} p
 */
export async function findDuplicateOrgUserName(prisma, p) {
  const key = orgUserNameKey(p);
  if (!key) return null;
  const candidates = await prisma.projectOrgUser.findMany({
    where: {
      projectId: p.projectId,
      ...(p.excludeOrgUserId ? { id: { not: p.excludeOrgUserId } } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  return candidates.find((row) => orgUserNameKey(row) === key) || null;
}

/**
 * Login email for a new or renamed org user. Null when the name is taken in this organisation.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; projectCode: string; firstName: string; lastName: string; excludeOrgUserId?: string | null }} p
 */
export async function allocateOrgUserLoginEmail(prisma, p) {
  if (await findDuplicateOrgUserName(prisma, p)) return null;
  const email = buildOrgUserLoginEmail(p);
  const clash = await prisma.projectOrgUser.findFirst({
    where: {
      projectId: p.projectId,
      email,
      ...(p.excludeOrgUserId ? { id: { not: p.excludeOrgUserId } } : {}),
    },
    select: { id: true },
  });
  return clash ? null : email;
}
