import { prisma } from "@/lib/prisma";

export { AuditEvent } from "@/lib/audit-events";

/**
 * @param {{
 *   eventType: string;
 *   actorUserId?: string | null;
 *   targetUserId?: string | null;
 *   ip?: string | null;
 *   userAgent?: string | null;
 *   meta?: import("@prisma/client").Prisma.InputJsonValue | null;
 * }} p
 */
export async function writeAuditLog(p) {
  const metaProjectId =
    p.meta && typeof p.meta === "object" && !Array.isArray(p.meta) ? /** @type {any} */ (p.meta).projectId : null;
  await prisma.auditLog.create({
    data: {
      eventType: p.eventType,
      projectId: typeof metaProjectId === "string" && metaProjectId ? metaProjectId.slice(0, 36) : null,
      actorUserId: p.actorUserId ?? null,
      targetUserId: p.targetUserId ?? null,
      ip: p.ip ?? null,
      userAgent: p.userAgent ?? null,
      meta: p.meta ?? undefined,
    },
  });
}
