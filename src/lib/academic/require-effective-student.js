import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

/**
 * Require effective Student role for academic work routes.
 * @param {string} [nextPath]
 */
export async function requireEffectiveStudent(nextPath = "/") {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (activeRole !== Role.STUDENT) {
    redirect("/");
  }
  return user;
}
