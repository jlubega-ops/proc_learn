import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { ensureStudentPersonalOrg } from "@/lib/projects/student-personal-org";

/**
 * Resolves the signed-in student's personal organisation project id (creates if needed).
 * Redirects non-students away. Never sends an authenticated user to /login (that loops
 * with the login page bounce-back to /organisation).
 * @returns {Promise<{ projectId: string; organizationName: string | null; name: string; projectCode: string | null }>}
 */
export async function requireStudentOrganisation() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/organisation");

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    redirect("/");
  }

  let org = null;
  try {
    org = await ensureStudentPersonalOrg(prisma, user.id);
  } catch {
    org = null;
  }

  if (!org?.id) {
    // Signed-in but organisation could not be provisioned — avoid /login bounce loop.
    redirect("/");
  }

  return {
    projectId: org.id,
    organizationName: org.organizationName || null,
    name: org.name,
    projectCode: org.projectCode || null,
  };
}
