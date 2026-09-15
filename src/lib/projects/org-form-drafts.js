/**
 * Server-backed organisation form drafts (cross-device resume).
 * Designed for high concurrency: upsert by unique key, capped payload, no audit spam.
 */

export const FORM_DRAFT_MAX_BYTES = 128 * 1024;
export const FORM_DRAFT_KEY_MAX = 160;

/**
 * @param {unknown} formKey
 */
export function normalizeFormDraftKey(formKey) {
  const raw = String(formKey || "").trim();
  if (!raw || raw.length > FORM_DRAFT_KEY_MAX) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,159}$/.test(raw)) return null;
  return raw;
}

/**
 * @param {{ orgUserId?: string | null; platformUserId?: string | null }} p
 */
export function formDraftActorScope(p) {
  const orgId = typeof p.orgUserId === "string" ? p.orgUserId.trim() : "";
  if (orgId) return { actorScope: `org:${orgId}`, orgUserId: orgId, platformUserId: null };
  const userId = typeof p.platformUserId === "string" ? p.platformUserId.trim() : "";
  if (userId) return { actorScope: `user:${userId}`, orgUserId: null, platformUserId: userId };
  return null;
}

/**
 * @param {unknown} payload
 */
export function measureFormDraftPayload(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorScope: string;
 *   orgUserId?: string | null;
 *   platformUserId?: string | null;
 *   formKey: string;
 * }} opts
 */
export async function getFormDraft(prisma, opts) {
  const row = await prisma.projectOrgFormDraft.findUnique({
    where: {
      projectId_actorScope_formKey: {
        projectId: opts.projectId,
        actorScope: opts.actorScope,
        formKey: opts.formKey,
      },
    },
    select: {
      id: true,
      formKey: true,
      payload: true,
      payloadBytes: true,
      updatedAt: true,
    },
  });
  return row;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorScope: string;
 *   orgUserId?: string | null;
 *   platformUserId?: string | null;
 *   formKey: string;
 *   payload: unknown;
 * }} opts
 */
export async function upsertFormDraft(prisma, opts) {
  const bytes = measureFormDraftPayload(opts.payload);
  if (!Number.isFinite(bytes) || bytes > FORM_DRAFT_MAX_BYTES) {
    return {
      ok: false,
      error: "Draft is too large to save. Remove unused lines and try again.",
      status: 413,
    };
  }

  const row = await prisma.projectOrgFormDraft.upsert({
    where: {
      projectId_actorScope_formKey: {
        projectId: opts.projectId,
        actorScope: opts.actorScope,
        formKey: opts.formKey,
      },
    },
    create: {
      projectId: opts.projectId,
      actorScope: opts.actorScope,
      orgUserId: opts.orgUserId || null,
      platformUserId: opts.platformUserId || null,
      formKey: opts.formKey,
      payload: /** @type {import("@prisma/client").Prisma.InputJsonValue} */ (opts.payload),
      payloadBytes: bytes,
    },
    update: {
      payload: /** @type {import("@prisma/client").Prisma.InputJsonValue} */ (opts.payload),
      payloadBytes: bytes,
      orgUserId: opts.orgUserId || null,
      platformUserId: opts.platformUserId || null,
    },
    select: {
      id: true,
      formKey: true,
      payloadBytes: true,
      updatedAt: true,
    },
  });

  return { ok: true, draft: row };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; actorScope: string; formKey: string }} opts
 */
export async function deleteFormDraft(prisma, opts) {
  await prisma.projectOrgFormDraft.deleteMany({
    where: {
      projectId: opts.projectId,
      actorScope: opts.actorScope,
      formKey: opts.formKey,
    },
  });
  return { ok: true };
}
