/**
 * In-portal notifications for providers. Best-effort: callers never fail a
 * business action because a notification could not be written.
 */

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   providerId: string | null | undefined;
 *   title: string;
 *   body: string;
 *   procurementId?: string | null;
 *   linkUrl?: string | null;
 *   relatedEntityType?: string | null;
 *   relatedEntityId?: string | null;
 * }} p
 */
export async function notifyProvider(db, p) {
  if (!p.providerId) return;
  try {
    await db.projectOrgProviderNotification.create({
      data: {
        projectId: p.projectId,
        providerId: p.providerId,
        title: p.title.slice(0, 255),
        body: p.body,
        linkUrl:
          p.linkUrl ||
          (p.procurementId ? `/provider-portal/assignments/${p.procurementId}` : null),
        relatedEntityType: p.relatedEntityType || (p.procurementId ? "procurement" : null),
        relatedEntityId: p.relatedEntityId || p.procurementId || null,
      },
    });
  } catch {
    // Best-effort.
  }
}

/** @param {any} row */
export function serializeProviderNotification(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl || null,
    readAt: row.readAt || null,
    createdAt: row.createdAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ providerId: string; page: number; pageSize: number; skip: number; filter?: string | null }} opts
 */
export async function listProviderNotifications(prisma, opts) {
  const where = {
    providerId: opts.providerId,
    ...(opts.filter === "unread" ? { readAt: null } : opts.filter === "read" ? { readAt: { not: null } } : {}),
  };
  const [total, unread, rows] = await Promise.all([
    prisma.projectOrgProviderNotification.count({ where }),
    prisma.projectOrgProviderNotification.count({ where: { providerId: opts.providerId, readAt: null } }),
    prisma.projectOrgProviderNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.pageSize,
    }),
  ]);
  return {
    total,
    unread,
    page: opts.page,
    pageSize: opts.pageSize,
    items: rows.map(serializeProviderNotification),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ providerId: string; ids?: string[] | null; all?: boolean }} opts
 */
export async function markProviderNotificationsRead(prisma, opts) {
  const ids = Array.isArray(opts.ids) ? opts.ids.filter((x) => typeof x === "string").slice(0, 100) : [];
  if (!opts.all && !ids.length) return 0;
  const res = await prisma.projectOrgProviderNotification.updateMany({
    where: {
      providerId: opts.providerId,
      readAt: null,
      ...(opts.all ? {} : { id: { in: ids } }),
    },
    data: { readAt: new Date() },
  });
  return res.count;
}
