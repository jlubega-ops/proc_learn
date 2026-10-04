export const DELIVERY_ADDRESS_MAX = 255;

/**
 * Normalise a user-entered delivery address. Returns `null` for blank input.
 * @param {unknown} value
 */
export function normalizeDeliveryAddress(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DELIVERY_ADDRESS_MAX);
}

/**
 * @param {unknown} value
 * @returns {string | null} error message, or null when valid
 */
export function validateDeliveryAddressInput(value) {
  if (typeof value !== "string" || !value.trim()) return "Enter the delivery address.";
  if (value.trim().length < 3) return "Delivery address is too short.";
  if (value.trim().length > DELIVERY_ADDRESS_MAX) {
    return `Delivery address must be ${DELIVERY_ADDRESS_MAX} characters or fewer.`;
  }
  return null;
}

/**
 * Suggested delivery location for a new requisition: the department's last used
 * location, else "<organisation> — <department>" (organisations have no address field).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; departmentId?: string | null; departmentName?: string | null }} opts
 */
export async function resolveDefaultDeliveryLocation(prisma, opts) {
  const [last, project] = await Promise.all([
    prisma.projectOrgRequisition.findFirst({
      where: {
        projectId: opts.projectId,
        ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
        deliveryLocation: { not: null },
        NOT: { deliveryLocation: "" },
      },
      orderBy: { createdAt: "desc" },
      select: { deliveryLocation: true },
    }),
    prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { name: true, organizationName: true },
    }),
  ]);
  const fromHistory = normalizeDeliveryAddress(last?.deliveryLocation);
  if (fromHistory) return fromHistory;
  const orgName = String(project?.organizationName || project?.name || "").trim();
  const dept = String(opts.departmentName || "").trim();
  if (orgName && dept) return `${orgName} — ${dept}`;
  if (orgName) return `${orgName} — main stores`;
  return dept || null;
}

/**
 * Delivery address for a procurement: the requisition's delivery location, falling
 * back to the organisation's main stores (organisations have no postal address field).
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string }} opts
 */
export async function resolveDeliveryAddress(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    select: {
      requisition: { select: { deliveryLocation: true } },
      project: { select: { name: true } },
    },
  });
  const fromRequisition = normalizeDeliveryAddress(procurement?.requisition?.deliveryLocation);
  if (fromRequisition) return fromRequisition;
  const orgName = String(procurement?.project?.name || "").trim();
  return orgName ? `${orgName} — main stores` : "Main stores";
}
