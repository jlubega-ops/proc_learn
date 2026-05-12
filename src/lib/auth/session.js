import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";

/**
 * @returns {Promise<import('iron-session').IronSession<{ userId?: string }> | null>}
 */
export async function getAppSession() {
  const opts = buildIronSessionOptions();
  if (!opts) return null;
  const cookieStore = await cookies();
  return getIronSession(cookieStore, opts);
}
