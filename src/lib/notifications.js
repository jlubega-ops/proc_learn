import { prisma } from "@/lib/prisma";

/**
 * @param {{
 *   userId: string;
 *   type: string;
 *   title: string;
 *   body: string;
 *   audienceRole?: import("@prisma/client").Role | null;
 * }} p audienceRole: only when this role is active; omit/null = visible in any active role.
 */
export async function createInAppNotification(p) {
  await prisma.notification.create({
    data: {
      userId: p.userId,
      type: p.type,
      title: p.title,
      body: p.body,
      audienceRole: p.audienceRole ?? null,
    },
  });
}
