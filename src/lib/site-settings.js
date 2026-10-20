import { randomBytes, timingSafeEqual } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MAINTENANCE_BYPASS_COOKIE = "pl_maintenance_bypass";
export const MAINTENANCE_BYPASS_MAX_AGE_SECONDS = 12 * 60 * 60;
export const MAINTENANCE_BYPASS_PATH_PREFIX = "/maintenance/admin/";
export const MAINTENANCE_API_MESSAGE =
  "Proc Learn is under maintenance. Please try again later.";
export const MAINTENANCE_LOGIN_MESSAGE =
  "Proc Learn is under maintenance. Only system admins can sign in right now.";

const SETTINGS_KEY = "default";
/** Slightly longer cache — maintenance flag rarely flips; cuts proxy Prisma on every nav. */
const SETTINGS_CACHE_MS = 30_000;
const ACCESS_CACHE_MS = 30_000;

const DEFAULT_SETTINGS = Object.freeze({
  maintenanceEnabled: false,
  maintenanceStartedAt: null,
  maintenanceBypassToken: null,
  updatedByUserId: null,
  updatedAt: null,
});

/** @type {{ value: typeof DEFAULT_SETTINGS; expiresAt: number } | null} */
let settingsCache = null;
/** @type {Map<string, { value: boolean; expiresAt: number }>} */
const accessCache = new Map();

function generateBypassToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * Cached read. Fails open (maintenance off) if the table is missing or the DB is unreachable,
 * so a schema/DB problem never locks everyone out.
 * @param {{ fresh?: boolean }} [opts]
 */
export async function readSiteSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.value;
  }
  let value = settingsCache?.value ?? DEFAULT_SETTINGS;
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTINGS_KEY } });
    value = row ?? DEFAULT_SETTINGS;
  } catch {
    // keep last known value
  }
  settingsCache = { value, expiresAt: Date.now() + SETTINGS_CACHE_MS };
  return value;
}

export async function isMaintenanceEnabled() {
  return Boolean((await readSiteSettings()).maintenanceEnabled);
}

/**
 * @param {{ maintenanceEnabled?: boolean; regenerateBypassToken?: boolean; actorUserId: string }} input
 */
export async function updateSiteSettings({ maintenanceEnabled, regenerateBypassToken, actorUserId }) {
  const current = await prisma.siteSetting.findUnique({ where: { key: SETTINGS_KEY } });
  /** @type {Record<string, unknown>} */
  const data = { updatedByUserId: actorUserId };

  if (typeof maintenanceEnabled === "boolean") {
    data.maintenanceEnabled = maintenanceEnabled;
    if (maintenanceEnabled && !current?.maintenanceEnabled) data.maintenanceStartedAt = new Date();
    if (!maintenanceEnabled) data.maintenanceStartedAt = null;
  }
  if (regenerateBypassToken || !current?.maintenanceBypassToken) {
    data.maintenanceBypassToken = generateBypassToken();
  }

  const row = await prisma.siteSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, ...data },
    update: data,
  });
  settingsCache = { value: row, expiresAt: Date.now() + SETTINGS_CACHE_MS };
  return row;
}

/** Ensures a bypass token exists so the admin can copy the link before switching maintenance on. */
export async function ensureSiteSettings(actorUserId) {
  const row = await readSiteSettings({ fresh: true });
  if (row.maintenanceBypassToken) return row;
  return updateSiteSettings({ actorUserId });
}

/**
 * @param {{ maintenanceBypassToken?: string | null }} settings
 * @param {unknown} candidate
 */
export function bypassTokenMatches(settings, candidate) {
  const expected = settings?.maintenanceBypassToken;
  if (!expected || typeof candidate !== "string" || !candidate) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @param {string | null | undefined} token */
export function maintenanceBypassPath(token) {
  return token ? `${MAINTENANCE_BYPASS_PATH_PREFIX}${encodeURIComponent(token)}` : "";
}

/** @param {{ maintenanceEnabled: boolean; maintenanceStartedAt: Date | null; maintenanceBypassToken: string | null; updatedAt: Date | null }} row */
export function serializeSiteSettings(row) {
  return {
    maintenanceEnabled: Boolean(row.maintenanceEnabled),
    maintenanceStartedAt: row.maintenanceStartedAt ? new Date(row.maintenanceStartedAt).toISOString() : null,
    bypassPath: maintenanceBypassPath(row.maintenanceBypassToken),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** @param {string} cacheKey @param {() => Promise<boolean>} load */
async function cachedAccess(cacheKey, load) {
  const hit = accessCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  let value = false;
  try {
    value = await load();
  } catch {
    value = false;
  }
  accessCache.set(cacheKey, { value, expiresAt: Date.now() + ACCESS_CACHE_MS });
  return value;
}

/** @param {string} userId */
export function isSystemAdminUser(userId) {
  if (!userId) return Promise.resolve(false);
  return cachedAccess(`u:${userId}`, async () => {
    const row = await prisma.userRole.findFirst({
      where: { userId, role: Role.SYSTEM_ADMIN },
      select: { userId: true },
    });
    return Boolean(row);
  });
}

/** Org workspaces and provider portals owned by a system admin stay usable for end-to-end testing. */
export function isProjectOwnedBySystemAdmin(projectId) {
  if (!projectId) return Promise.resolve(false);
  return cachedAccess(`p:${projectId}`, async () => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerUserId: true },
    });
    return project ? isSystemAdminUser(project.ownerUserId) : false;
  });
}

/**
 * Whether a decoded app session may use the site while maintenance is on.
 * @param {{ userId?: string; orgUserId?: string; providerId?: string } | null | undefined} session
 */
export async function sessionHasMaintenanceAccess(session) {
  if (!session) return false;
  if (session.userId) return isSystemAdminUser(session.userId);
  if (session.orgUserId) {
    return cachedAccess(`o:${session.orgUserId}`, async () => {
      const orgUser = await prisma.projectOrgUser.findUnique({
        where: { id: session.orgUserId },
        select: { projectId: true },
      });
      return orgUser ? isProjectOwnedBySystemAdmin(orgUser.projectId) : false;
    });
  }
  if (session.providerId) {
    return cachedAccess(`v:${session.providerId}`, async () => {
      const provider = await prisma.projectOrgProvider.findUnique({
        where: { id: session.providerId },
        select: { projectId: true },
      });
      return provider ? isProjectOwnedBySystemAdmin(provider.projectId) : false;
    });
  }
  return false;
}
