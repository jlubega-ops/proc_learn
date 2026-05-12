import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications";

/**
 * In-app notification to every user who has the SYSTEM_ADMIN role in the database.
 * Each row is scoped to the SYSTEM_ADMIN active role so it only appears when that user is using system admin.
 * @param {{ title: string; body: string; type: string }} p
 */
export async function notifyAllSystemAdmins(p) {
  const rows = await prisma.userRole.findMany({
    where: { role: Role.SYSTEM_ADMIN },
    select: { userId: true },
  });
  const ids = [...new Set(rows.map((r) => r.userId))];
  await Promise.all(
    ids.map((userId) =>
      createInAppNotification({
        userId,
        type: p.type,
        title: p.title,
        body: p.body,
        audienceRole: Role.SYSTEM_ADMIN,
      }),
    ),
  );
}
