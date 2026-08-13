import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { resolveStudentActiveOrganisation } from "@/lib/projects/student-active-org";

/**
 * Resolves the signed-in student's current organisation shell (personal or attempt workspace).
 * Redirects non-students away. Never sends an authenticated user to /login (that loops
 * with the login page bounce-back to /organisation).
 * @returns {Promise<{
 *   projectId: string;
 *   organizationName: string | null;
 *   name: string;
 *   projectCode: string | null;
 *   kind: string;
 *   locked: boolean;
 * }>}
 */
export async function requireStudentOrganisation() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/organisation");

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    redirect("/");
  }

  let resolved = null;
  try {
    resolved = await resolveStudentActiveOrganisation(prisma, user.id);
  } catch {
    resolved = null;
  }

  if (!resolved?.org?.id) {
    redirect("/");
  }

  const org = resolved.org;
  return {
    projectId: org.id,
    organizationName: org.organizationName || null,
    name: org.name,
    projectCode: org.projectCode || null,
    kind: resolved.kind,
    locked: Boolean(resolved.locked),
  };
}
