/** Cookie name for encrypted session (see iron-session). */
export const SESSION_COOKIE_NAME = "proc_learn_session";

/**
 * Iron-session encryption secret (min 32 chars). Prefer `SESSION_SECRET`; if unset, use `NEXTAUTH_SECRET` (same secret many projects already have in `.env`).
 * @returns {string}
 */
export function getSessionEncryptionSecret() {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    ""
  );
}

/**
 * @returns {{ cookieName: string; password: string; cookieOptions: Record<string, unknown> } | null}
 */
export function buildIronSessionOptions() {
  const password = getSessionEncryptionSecret();
  if (!password || password.length < 32) return null;
  return {
    cookieName: SESSION_COOKIE_NAME,
    password,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}
