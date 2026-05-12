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
  await prisma.auditLog.create({
    data: {
      eventType: p.eventType,
      actorUserId: p.actorUserId ?? null,
      targetUserId: p.targetUserId ?? null,
      ip: p.ip ?? null,
      userAgent: p.userAgent ?? null,
      meta: p.meta ?? undefined,
    },
  });
}
