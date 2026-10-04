import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/validation/email";
import { parseOrgLoginIdentifier } from "@/lib/projects/org-login-identity";
import { hashOrgUserPassword, verifyOrgUserPassword } from "@/lib/projects/org-user-password";

/**
 * @param {{ identifier: string; password: string }} p
 */
export async function authenticateProjectOrgUserLogin({ identifier, password }) {
  const parsed = parseOrgLoginIdentifier(identifier);
  if (parsed?.kind !== "org") return { ok: false, code: "invalid_format" };

  const project = await prisma.project.findFirst({
    where: { projectCode: parsed.projectCode, isPublished: true },
    select: { id: true, name: true, isPublished: true, projectCode: true },
  });
  if (!project) {
    return { ok: false, code: "project_unavailable" };
  }

  const candidates = await prisma.projectOrgUser.findMany({
    where: {
      projectId: project.id,
      email: normalizeEmail(parsed.email),
      isProjectAdmin: false,
      linkedUserId: null,
    },
    include: {
      projectOrgRole: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (candidates.length === 0) {
    return { ok: false, code: "invalid_credentials" };
  }

  /** @type {typeof candidates} */
  const matches = [];
  for (const row of candidates) {
    if (!row.projectOrgRole?.isActive) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await verifyOrgUserPassword(row, password)) matches.push(row);
  }

  if (matches.length === 0) return { ok: false, code: "invalid_credentials" };
  if (matches.length > 1) {
    return { ok: false, code: "ambiguous_account" };
  }

  const orgUser = matches[0];
  if (!orgUser.passwordHash) {
    await prisma.projectOrgUser.update({
      where: { id: orgUser.id },
      data: { passwordHash: await hashOrgUserPassword(password) },
    });
  }

  await prisma.projectOrgUser.update({
    where: { id: orgUser.id },
    data: { lastLoginAt: new Date() },
  });

  return { ok: true, orgUser, project };
}
