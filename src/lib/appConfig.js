/** Public app strings (override via .env — see .env.example). */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Proc Learn";

export const ORG_SHORT =
  process.env.NEXT_PUBLIC_ORG_SHORT?.trim() || "MUBS";

export const ORG_NAME =
  process.env.NEXT_PUBLIC_ORG_NAME?.trim() ||
  "Makerere University Business School";

export const COPYRIGHT_YEAR =
  process.env.NEXT_PUBLIC_COPYRIGHT_YEAR?.trim() ||
  String(new Date().getFullYear());

/** After sign-in or role switch (client + server redirects). */
export const DEFAULT_POST_AUTH_PATH =
  process.env.NEXT_PUBLIC_DEFAULT_POST_AUTH_PATH?.trim() || "/";

/**
 * Absolute app URL for emails and OAuth (activation links, etc.).
 * Use `APP_URL` in `.env`; if missing, fall back to `NEXTAUTH_URL`.
 */
export const APP_BASE_URL =
  process.env.APP_URL?.trim() ||
  process.env.NEXTAUTH_URL?.trim() ||
  "http://localhost:3000";

/** Idle logout window in minutes (server-enforced when implemented). */
const idleRaw = process.env.SESSION_IDLE_MINUTES?.trim();
export const SESSION_IDLE_MINUTES =
  idleRaw && !Number.isNaN(Number(idleRaw)) ? Number(idleRaw) : 30;

