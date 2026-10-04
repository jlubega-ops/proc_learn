import {
  OrgProcurementMethod,
  OrgProviderStatus,
  OrgPurchaseInstructionStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
} from "@prisma/client";
import { format } from "date-fns";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { financialYearRefToken } from "@/lib/projects/org-reference";
import { serializeProviderSummary } from "@/lib/projects/providers";
import { normalizeDeliveryAddress, resolveDeliveryAddress } from "@/lib/projects/delivery-address";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { autoDispatchIfAutoResponse } from "@/lib/projects/delivery-notes";
import {
  validatePurchaseInstructionResponse,
  validatePurchaseInstructionTerms,
} from "@/lib/validation/purchase-instruction";

/**
 * @param {any} row
 */
export function serializePurchaseInstruction(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    instructionNumber: row.instructionNumber,
    amount: row.amount?.toString?.() ?? String(row.amount ?? ""),
    status: row.status,
    issuedAt: row.issuedAt || null,
    remarks: row.remarks || null,
    deliveryAddress: row.deliveryAddress || null,
    requiredDeliveryDate: row.requiredDeliveryDate || null,
    paymentTerms: row.paymentTerms || null,
    specialInstructions: row.specialInstructions || null,
    acceptedAt: row.acceptedAt || null,
    acceptedByName: row.acceptedByName || null,
    declinedAt: row.declinedAt || null,
    declineReason: row.declineReason || null,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    issuedBy: row.issuedBy
      ? {
          id: row.issuedBy.id,
          displayName: `${row.issuedBy.firstName || ""} ${row.issuedBy.lastName || ""}`.trim(),
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} yearToken
 */
async function nextInstructionNumber(prisma, projectId, yearToken) {
  const prefix = `PI-${yearToken}-`;
  const existing = await prisma.projectOrgPurchaseInstruction.findMany({
    where: { projectId, instructionNumber: { startsWith: prefix } },
    select: { instructionNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const m = String(row.instructionNumber || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/**
 * Issue a Purchase Instruction for a MICRO procurement. The amount always
 * comes from the underlying requisition's estimated total value — never
 * from ad-hoc user input — so the instruction stays traceable to funding.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   supplierId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   remarks?: string | null;
 *   deliveryAddress?: string | null;
 *   requiredDeliveryDate?: unknown;
 *   paymentTerms?: unknown;
 *   specialInstructions?: unknown;
 * }} opts
 */
export async function issuePurchaseInstruction(prisma, opts) {
  const terms = validatePurchaseInstructionTerms(opts);
  if (!terms.ok) {
    return { ok: false, error: "Please fix the highlighted fields.", status: 400, fieldErrors: terms.errors };
  }

  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: {
      financialYear: { select: { label: true } },
      requisition: { select: { id: true, estimatedTotalValue: true } },
      purchaseInstructions: { select: { id: true, status: true } },
    },
  });
  if (!procurement) {
    return { ok: false, error: "Procurement not found in this organisation.", status: 404 };
  }
  if (procurement.procurementMethod !== OrgProcurementMethod.MICRO) {
    return {
      ok: false,
      error: "Purchase instructions can only be issued for Micro Procurement.",
      status: 400,
    };
  }
  const existing = (procurement.purchaseInstructions || [])[0] || null;
  if (existing && existing.status !== OrgPurchaseInstructionStatus.DECLINED) {
    return {
      ok: false,
      error: "A purchase instruction has already been issued for this procurement.",
      status: 400,
      code: "PURCHASE_INSTRUCTION_EXISTS",
    };
  }
  if (!procurement.requisition) {
    return {
      ok: false,
      error: "This procurement has no linked requisition to determine the instruction amount.",
      status: 400,
    };
  }

  const supplier = await prisma.projectOrgProvider.findFirst({
    where: { id: opts.supplierId, projectId: opts.projectId },
  });
  if (!supplier) {
    return {
      ok: false,
      error: "Choose a supplier registered in this organisation.",
      status: 400,
      fieldErrors: { supplierId: "Choose a valid supplier." },
    };
  }
  if (supplier.status !== OrgProviderStatus.ACTIVE) {
    return {
      ok: false,
      error: "This supplier is inactive. Choose an active supplier.",
      status: 400,
      fieldErrors: { supplierId: "Choose an active supplier." },
    };
  }

  const yearToken = financialYearRefToken(procurement.financialYear?.label);
  const instructionNumber = await nextInstructionNumber(prisma, opts.projectId, yearToken);
  const remarks = typeof opts.remarks === "string" ? opts.remarks.trim() || null : null;
  const deliveryAddress =
    normalizeDeliveryAddress(opts.deliveryAddress) ||
    (await resolveDeliveryAddress(prisma, { projectId: opts.projectId, procurementId: procurement.id }));

  const data = {
    supplierId: supplier.id,
    instructionNumber,
    amount: procurement.requisition.estimatedTotalValue,
    status: OrgPurchaseInstructionStatus.ISSUED,
    issuedAt: new Date(),
    issuedByOrgUserId: opts.actorOrgUserId,
    remarks,
    deliveryAddress,
    requiredDeliveryDate: terms.values.requiredDeliveryDate,
    paymentTerms: terms.values.paymentTerms,
    specialInstructions: terms.values.specialInstructions,
    acceptedAt: null,
    acceptedByName: null,
    declinedAt: null,
    declineReason: null,
  };
  const include = {
    supplier: true,
    issuedBy: { select: { id: true, firstName: true, lastName: true } },
  };
  // procurementId is unique: a re-issue after a provider declines replaces the declined instruction.
  const created = existing
    ? await prisma.projectOrgPurchaseInstruction.update({ where: { id: existing.id }, data, include })
    : await prisma.projectOrgPurchaseInstruction.create({
        data: { ...data, projectId: opts.projectId, procurementId: procurement.id },
        include,
      });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_PURCHASE_INSTRUCTION_ISSUED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      purchaseInstructionId: created.id,
      instructionNumber,
      supplierId: supplier.id,
      amount: created.amount?.toString?.() ?? String(created.amount),
      requiredDeliveryDate: terms.values.requiredDeliveryDate?.toISOString?.() ?? null,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, purchaseInstruction: serializePurchaseInstruction(created) };
}

/**
 * Everything needed to show / print a PI. Pass `providerId` to restrict to that provider's own PI.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; providerId?: string | null }} opts
 */
export async function loadPurchaseInstructionDoc(prisma, opts) {
  const row = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      ...(opts.providerId ? { supplierId: opts.providerId } : {}),
    },
    include: {
      supplier: true,
      issuedBy: {
        select: { id: true, firstName: true, lastName: true, projectOrgRole: { select: { name: true } } },
      },
      procurement: {
        select: {
          procurementNumber: true,
          title: true,
          department: { select: { name: true } },
          financialYear: { select: { label: true } },
          requisition: {
            select: {
              category: true,
              items: {
                orderBy: { lineNumber: "asc" },
                select: {
                  lineNumber: true,
                  itemName: true,
                  description: true,
                  quantity: true,
                  unitOfMeasure: true,
                  estimatedUnitPrice: true,
                  estimatedTotal: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { name: true, organizationName: true, projectCode: true },
  });
  const pi = serializePurchaseInstruction(row);
  if (pi?.issuedBy) pi.issuedBy.roleName = row.issuedBy?.projectOrgRole?.name || null;
  if (pi?.supplier) {
    pi.supplier.tin = row.supplier?.tin || null;
    pi.supplier.contactPerson = row.supplier?.contactPerson || null;
  }
  const proc = row.procurement;
  return {
    pi,
    procurement: {
      procurementNumber: proc.procurementNumber,
      title: proc.title,
      category: proc.requisition?.category || null,
      department: proc.department?.name || null,
      financialYear: proc.financialYear?.label || null,
    },
    items: (proc.requisition?.items || []).map((i) => ({
      lineNumber: i.lineNumber,
      itemName: i.itemName,
      description: i.description || null,
      quantity: i.quantity?.toString?.() ?? String(i.quantity ?? ""),
      unitOfMeasure: i.unitOfMeasure || null,
      unitPrice: i.estimatedUnitPrice?.toString?.() ?? null,
      total: i.estimatedTotal?.toString?.() ?? null,
    })),
    organisation: {
      name: project?.organizationName || project?.name || "",
      code: project?.projectCode || null,
    },
  };
}

/** @deprecated use issuePurchaseInstruction */
export const issuePurchaseInstructionForProcurement = issuePurchaseInstruction;

const PI_ISSUER_ROLE = "Procurement Officer";
export const PI_REISSUE_TASK_PREFIX = "Issue purchase instruction (provider declined)";

/**
 * Tell the provider about a newly issued PI; auto-response providers accept straight away.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; purchaseInstruction: any }} opts
 */
export async function afterPurchaseInstructionIssued(prisma, opts) {
  const pi = opts.purchaseInstruction;
  const supplier = await prisma.projectOrgProvider.findFirst({
    where: { id: pi.supplier?.id || "", projectId: opts.projectId },
    select: { id: true, name: true, contactPerson: true, isGenerated: true },
  });
  if (!supplier) return;
  const proc = await prisma.projectOrgProcurement.findUnique({
    where: { id: opts.procurementId },
    select: { procurementNumber: true, title: true },
  });
  const due = pi.requiredDeliveryDate ? ` Deliver by ${format(new Date(pi.requiredDeliveryDate), "MMM d, yyyy")}.` : "";
  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: supplier.id,
    procurementId: opts.procurementId,
    title: `Purchase instruction issued: ${pi.instructionNumber}`,
    body: `Review and accept ${pi.instructionNumber} for ${proc?.procurementNumber || "the procurement"}${
      proc?.title ? ` (${proc.title})` : ""
    }.${due}`,
    relatedEntityType: "purchase_instruction",
    relatedEntityId: pi.id,
  });
  if (!supplier.isGenerated) return;
  const accepted = await respondToPurchaseInstruction(prisma, {
    projectId: opts.projectId,
    providerId: supplier.id,
    procurementId: opts.procurementId,
    body: { decision: "ACCEPT", acceptedByName: supplier.contactPerson || supplier.name },
    auto: true,
  });
  if (!accepted.ok) return;
  await autoDispatchIfAutoResponse(prisma, {
    projectId: opts.projectId,
    procurementId: opts.procurementId,
    providerId: supplier.id,
  });
}

/**
 * Provider accepts or declines a PI (PPDA Contracts Regs 2023, reg 10: the contract is formed on acceptance).
 * Decline hands the case back to the Procurement Officer to re-issue or recommend a change to the Contracts Committee.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; procurementId: string; body: any; auto?: boolean }} opts
 */
export async function respondToPurchaseInstruction(prisma, opts) {
  const v = validatePurchaseInstructionResponse(opts.body || {});
  if (!v.ok) return { ok: false, status: 400, error: "Please fix the highlighted fields.", fieldErrors: v.errors };

  const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: { projectId: opts.projectId, procurementId: opts.procurementId, supplierId: opts.providerId },
    include: {
      supplier: { select: { id: true, name: true } },
      procurement: {
        select: {
          id: true,
          procurementNumber: true,
          title: true,
          officerOrgUserId: true,
          instances: {
            where: { status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!pi) return { ok: false, status: 404, error: "Purchase instruction not found." };
  if (pi.status !== OrgPurchaseInstructionStatus.ISSUED) {
    return { ok: false, status: 409, error: "You have already responded to this purchase instruction." };
  }

  const accept = v.values.decision === "ACCEPT";
  const now = new Date();
  const claimed = await prisma.projectOrgPurchaseInstruction.updateMany({
    where: { id: pi.id, status: OrgPurchaseInstructionStatus.ISSUED },
    data: accept
      ? { status: OrgPurchaseInstructionStatus.ACCEPTED, acceptedAt: now, acceptedByName: v.values.acceptedByName }
      : { status: OrgPurchaseInstructionStatus.DECLINED, declinedAt: now, declineReason: v.values.declineReason },
  });
  if (claimed.count !== 1) {
    return { ok: false, status: 409, error: "You have already responded to this purchase instruction." };
  }

  const proc = pi.procurement;
  const providerLabel = `${pi.supplier?.name || "Provider"}${opts.auto ? " (auto-response)" : ""}`;
  await writeAuditLog({
    eventType: accept
      ? AuditEvent.PROJECT_ORG_PURCHASE_INSTRUCTION_ACCEPTED
      : AuditEvent.PROJECT_ORG_PURCHASE_INSTRUCTION_DECLINED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: proc.id,
      purchaseInstructionId: pi.id,
      instructionNumber: pi.instructionNumber,
      supplierId: opts.providerId,
      actorName: accept ? `${v.values.acceptedByName} — ${providerLabel}` : providerLabel,
      actorRoleName: "Provider",
      newStatus: accept ? OrgPurchaseInstructionStatus.ACCEPTED : OrgPurchaseInstructionStatus.DECLINED,
      remarks: accept ? null : v.values.declineReason,
    },
  });

  const officerId = proc.officerOrgUserId || pi.issuedByOrgUserId || null;
  const instanceId = proc.instances[0]?.id || null;

  if (!accept && officerId && instanceId) {
    await prisma.projectOrgWorkflowTask.create({
      data: {
        projectId: opts.projectId,
        instanceId,
        processFlowItemId: null,
        stepNumber: 0,
        title: `${PI_REISSUE_TASK_PREFIX}: ${proc.procurementNumber}: ${proc.title}`.slice(0, 255),
        requiredRoleName: PI_ISSUER_ROLE,
        assigneeOrgUserId: officerId,
        status: OrgWorkflowTaskStatus.PENDING,
      },
    });
  }

  /** @type {{ id: string; linkedUserId: string | null }[]} */
  let recipients = [];
  if (officerId) {
    const officer = await prisma.projectOrgUser.findUnique({
      where: { id: officerId },
      select: { id: true, linkedUserId: true },
    });
    if (officer) recipients.push(officer);
  }
  if (accept && instanceId) {
    const receivers = await prisma.projectOrgWorkflowTask.findMany({
      where: { instanceId, status: OrgWorkflowTaskStatus.PENDING, assigneeOrgUserId: { not: null } },
      select: { assignee: { select: { id: true, linkedUserId: true } } },
    });
    recipients = [...recipients, ...receivers.map((t) => t.assignee).filter(Boolean)];
  }
  try {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients,
      type: accept ? OrgNotificationType.WORKFLOW_APPROVED : OrgNotificationType.WORKFLOW_REJECTED,
      title: accept ? "Purchase instruction accepted" : "Purchase instruction declined",
      body: accept
        ? `${providerLabel} accepted ${pi.instructionNumber} for ${proc.procurementNumber}.`
        : `${providerLabel} declined ${pi.instructionNumber} for ${proc.procurementNumber}: ${v.values.declineReason} Re-issue it or recommend a change of provider to the Contracts Committee.`,
      linkUrl: `/projects/${opts.projectId}/procurements/${proc.id}`,
      relatedEntityType: "procurement",
      relatedEntityId: proc.id,
    });
  } catch {
    // Best-effort.
  }

  if (opts.auto && accept) {
    await notifyProvider(prisma, {
      projectId: opts.projectId,
      providerId: opts.providerId,
      procurementId: proc.id,
      title: `Purchase instruction accepted: ${pi.instructionNumber}`,
      body: "Accepted automatically. Deliver by the required date.",
      relatedEntityType: "purchase_instruction",
      relatedEntityId: pi.id,
    });
  }

  return { ok: true, status: accept ? OrgPurchaseInstructionStatus.ACCEPTED : OrgPurchaseInstructionStatus.DECLINED };
}
