import { getSessionOrgUser } from "@/lib/api/get-session-org-user";
import { getSessionUser } from "@/lib/api/get-session-user";

/**
 * @returns {Promise<
 *   | { type: "org"; orgUser: NonNullable<Awaited<ReturnType<typeof getSessionOrgUser>>> }
 *   | { type: "platform"; user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }
 *   | null
 * >}
 */
export async function getSessionActor() {
  const orgUser = await getSessionOrgUser();
  if (orgUser) return { type: "org", orgUser };

  const user = await getSessionUser();
  if (user) return { type: "platform", user };

  return null;
}
