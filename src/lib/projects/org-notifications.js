import { prisma } from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications";

/**
 * Create an organisation-user in-app notification (bell in org session).
 * Also mirrors to platform User bell when the org user has linkedUserId.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} [db]
 * @param {{
 *   projectId: string;
 *   recipientOrgUserId: string;
 *   type: string;
 *   title: string;
 *   body: string;
 *   linkUrl?: string | null;
 *   relatedEntityType?: string | null;
 *   relatedEntityId?: string | null;
 *   linkedUserId?: string | null;
 * }} p
 */
export async function createOrgUserNotification(db, p) {
  const client = db || prisma;
  await client.projectOrgNotification.create({
    data: {
      projectId: p.projectId,
      recipientOrgUserId: p.recipientOrgUserId,
      type: p.type,
      title: p.title,
      body: p.body,
      linkUrl: p.linkUrl || null,
      relatedEntityType: p.relatedEntityType || null,
      relatedEntityId: p.relatedEntityId || null,
    },
  });

  if (p.linkedUserId) {
    try {
      await createInAppNotification({
        userId: p.linkedUserId,
        type: p.type,
        title: p.title,
        body: p.body,
      });
    } catch {
      // Non-fatal: org inbox remains source of truth for simulated users.
    }
  }
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   recipients: { id: string; linkedUserId?: string | null }[];
 *   type: string;
 *   title: string;
 *   body: string;
 *   linkUrl?: string | null;
 *   relatedEntityType?: string | null;
 *   relatedEntityId?: string | null;
 * }} p
 */
export async function notifyOrgUsers(db, p) {
  const seen = new Set();
  for (const recipient of p.recipients || []) {
    if (!recipient?.id || seen.has(recipient.id)) continue;
    seen.add(recipient.id);
    await createOrgUserNotification(db, {
      projectId: p.projectId,
      recipientOrgUserId: recipient.id,
      linkedUserId: recipient.linkedUserId || null,
      type: p.type,
      title: p.title,
      body: p.body,
      linkUrl: p.linkUrl || null,
      relatedEntityType: p.relatedEntityType || null,
      relatedEntityId: p.relatedEntityId || null,
    });
  }
}

export const OrgNotificationType = {
  WORKFLOW_TASK: "ORG_WORKFLOW_TASK",
  WORKFLOW_RETURNED: "ORG_WORKFLOW_RETURNED",
  WORKFLOW_REJECTED: "ORG_WORKFLOW_REJECTED",
  WORKFLOW_APPROVED: "ORG_WORKFLOW_APPROVED",
  WORKFLOW_DECISION: "ORG_WORKFLOW_DECISION",
};
