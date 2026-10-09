import {
  OrgAwardStatus,
  OrgContractStatus,
  OrgLpoStatus,
  OrgProcurementMethod,
  OrgProcurementStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
} from "@prisma/client";
import { validatePurchaseInstructionResponse } from "@/lib/validation/purchase-instruction";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { notifyProvider } from "@/lib/projects/provider-notifications";
import { financialYearRefToken } from "@/lib/projects/org-reference";
import { serializeProviderSummary } from "@/lib/projects/providers";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";
import {
  normalizeDeliveryAddress,
  resolveDeliveryAddress,
  validateDeliveryAddressInput,
} from "@/lib/projects/delivery-address";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} triggerKey
 * @param {{ projectId: string; procurementId: string; entityTitle: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
async function bestEffortStartTracking(prisma, triggerKey, opts) {
  try {
    await startWorkflowFromTrigger(prisma, {
      projectId: opts.projectId,
      triggerKey,
      entityType: "procurement",
      entityId: opts.procurementId,
      procurementId: opts.procurementId,
      entityTitle: opts.entityTitle,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
  } catch {
    // Best-effort tracking workflow — the contract/LPO record is the source of truth.
  }
}

/**
 * Contracts are used for the TENDER path; LPOs (Local Purchase Orders) for QUOTATION.
 * Micro Procurement never reaches this stage — it is completed entirely by a
 * Purchase Instruction (see purchase-instructions.js).
 */

/** @param {any} row */
export function serializeContract(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    awardId: row.awardId || null,
    supplierId: row.supplierId,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    contractNumber: row.contractNumber,
    contractValue: row.contractValue?.toString?.() ?? String(row.contractValue ?? ""),
    status: row.status,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    deliveryAddress: row.deliveryAddress || null,
    issuedAt: row.issuedAt || null,
    acceptedAt: row.acceptedAt || null,
    acceptedByName: row.acceptedByName || null,
    declinedAt: row.declinedAt || null,
    declineReason: row.declineReason || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** @param {any} row */
export function serializeLpo(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementId: row.procurementId,
    awardId: row.awardId || null,
    supplierId: row.supplierId,
    supplier: row.supplier ? serializeProviderSummary(row.supplier) : null,
    lpoNumber: row.lpoNumber,
    lpoValue: row.lpoValue?.toString?.() ?? String(row.lpoValue ?? ""),
    deliveryAddress: row.deliveryAddress || null,
    status: row.status,
    issuedAt: row.issuedAt || null,
    acceptedAt: row.acceptedAt || null,
    acceptedByName: row.acceptedByName || null,
    declinedAt: row.declinedAt || null,
    declineReason: row.declineReason || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {"contract" | "lpo"} kind
 * @param {string} yearToken
 */
async function nextDocumentNumber(prisma, projectId, kind, yearToken) {
  const prefix = kind === "contract" ? `CN-${yearToken}-` : `LPO-${yearToken}-`;
  const rows =
    kind === "contract"
      ? await prisma.projectOrgContract.findMany({
          where: { projectId, contractNumber: { startsWith: prefix } },
          select: { contractNumber: true },
        })
      : await prisma.projectOrgLpo.findMany({
          where: { projectId, lpoNumber: { startsWith: prefix } },
          select: { lpoNumber: true },
        });
  let max = 0;
  for (const row of rows) {
    const value = kind === "contract" ? row.contractNumber : row.lpoNumber;
    const m = String(value || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function loadAcceptedAward(prisma, projectId, procurementId) {
  return prisma.projectOrgAward.findFirst({
    where: { projectId, procurementId, status: OrgAwardStatus.ACCEPTED },
    orderBy: { acceptedAt: "desc" },
  });
}

/**
 * Create a DRAFT contract for a TENDER procurement from its ACCEPTED award.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   startDate?: string | Date | null;
 *   endDate?: string | Date | null;
 *   deliveryAddress?: string | null;
 * }} opts
 */
export async function createContract(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: { financialYear: { select: { label: true } } },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  if (procurement.procurementMethod === OrgProcurementMethod.MICRO) {
    return {
      ok: false,
      error:
        "Micro Procurement does not use contracts or LPOs — it is completed by issuing a Purchase Instruction.",
      status: 400,
      code: "MICRO_USES_PI_ONLY",
    };
  }
  if (procurement.procurementMethod !== OrgProcurementMethod.TENDER) {
    return {
      ok: false,
      error: "Contracts are only issued for the Tender path. Quotation procurements use an LPO instead.",
      status: 400,
      code: "CONTRACT_REQUIRES_TENDER",
    };
  }

  const existing = await prisma.projectOrgContract.findFirst({
    where: { projectId: opts.projectId, procurementId: procurement.id, status: { not: OrgContractStatus.CANCELLED } },
  });
  if (existing) {
    return { ok: false, error: "A contract already exists for this procurement.", status: 400, code: "CONTRACT_EXISTS" };
  }

  const award = await loadAcceptedAward(prisma, opts.projectId, procurement.id);
  if (!award) {
    return {
      ok: false,
      error: "The award must be accepted by the supplier before a contract can be created.",
      status: 400,
      code: "AWARD_NOT_ACCEPTED",
    };
  }

  const yearToken = financialYearRefToken(procurement.financialYear?.label);
  const contractNumber = await nextDocumentNumber(prisma, opts.projectId, "contract", yearToken);

  const row = await prisma.projectOrgContract.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      awardId: award.id,
      supplierId: award.supplierId,
      contractNumber,
      contractValue: award.awardedAmount,
      deliveryAddress:
        normalizeDeliveryAddress(opts.deliveryAddress) ||
        (await resolveDeliveryAddress(prisma, { projectId: opts.projectId, procurementId: procurement.id })),
      status: OrgContractStatus.DRAFT,
      startDate: opts.startDate ? new Date(opts.startDate) : null,
      endDate: opts.endDate ? new Date(opts.endDate) : null,
    },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_CONTRACT_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      contractId: row.id,
      contractNumber,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  await bestEffortStartTracking(prisma, WORKFLOW_TRIGGERS.CONTRACT_STARTED, {
    projectId: opts.projectId,
    procurementId: procurement.id,
    entityTitle: `Contract: ${contractNumber}`,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
  });

  return { ok: true, contract: serializeContract(row) };
}

/**
 * DRAFT → APPROVED → SIGNED → ACTIVE (issued). Each call advances one step.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; contractId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function approveContract(prisma, opts) {
  const row = await prisma.projectOrgContract.findFirst({ where: { id: opts.contractId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Contract not found.", status: 404 };
  if (row.status !== OrgContractStatus.DRAFT) {
    return { ok: false, error: "Only a draft contract can be approved.", status: 400 };
  }
  const updated = await prisma.projectOrgContract.update({
    where: { id: row.id },
    data: { status: OrgContractStatus.APPROVED },
    include: { supplier: true },
  });
  return { ok: true, contract: serializeContract(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; contractId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function signContract(prisma, opts) {
  const row = await prisma.projectOrgContract.findFirst({ where: { id: opts.contractId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Contract not found.", status: 404 };
  if (row.status !== OrgContractStatus.APPROVED) {
    return { ok: false, error: "The contract must be approved before it can be signed.", status: 400 };
  }
  const updated = await prisma.projectOrgContract.update({
    where: { id: row.id },
    data: { status: OrgContractStatus.SIGNED },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_CONTRACT_SIGNED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, contractId: row.id },
  });

  return { ok: true, contract: serializeContract(updated) };
}

/**
 * Issue a SIGNED contract to the provider, who accepts it in the portal (that activates it).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; contractId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function issueContract(prisma, opts) {
  const row = await prisma.projectOrgContract.findFirst({ where: { id: opts.contractId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Contract not found.", status: 404 };
  if (row.status !== OrgContractStatus.SIGNED) {
    return { ok: false, error: "The contract must be signed before it can be issued.", status: 400 };
  }

  const updated = await prisma.projectOrgContract.update({
    where: { id: row.id },
    data: { status: OrgContractStatus.ISSUED, issuedAt: new Date() },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_CONTRACT_ISSUED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      contractId: row.id,
      supplierId: row.supplierId,
      actorOrgUserId: opts.actorOrgUserId || null,
      actorRoleName: opts.actorRoleName || null,
    },
  });

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    procurementId: row.procurementId,
    title: `Contract issued: ${row.contractNumber}`,
    body: "Accept or decline the contract in your portal.",
  });
  await autoAcceptOrder(prisma, { projectId: opts.projectId, procurementId: row.procurementId, supplier: updated.supplier });

  return { ok: true, contract: serializeContract(updated) };
}

/**
 * Auto-response providers accept an issued LPO / contract straight away.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; supplier: any }} opts
 */
async function autoAcceptOrder(prisma, opts) {
  if (!opts.supplier?.isGenerated) return;
  await respondToOrder(prisma, {
    projectId: opts.projectId,
    providerId: opts.supplier.id,
    procurementId: opts.procurementId,
    body: { decision: "ACCEPT", acceptedByName: opts.supplier.contactPerson || opts.supplier.name },
    auto: true,
  });
}

/**
 * Create a DRAFT LPO for a QUOTATION procurement from its ACCEPTED award.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; actorOrgUserId: string; actorRoleName: string; deliveryAddress?: string | null }} opts
 */
export async function createLpo(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: { financialYear: { select: { label: true } } },
  });
  if (!procurement) return { ok: false, error: "Procurement not found in this organisation.", status: 404 };

  if (procurement.procurementMethod === OrgProcurementMethod.MICRO) {
    return {
      ok: false,
      error:
        "Micro Procurement does not use contracts or LPOs — it is completed by issuing a Purchase Instruction.",
      status: 400,
      code: "MICRO_USES_PI_ONLY",
    };
  }
  if (procurement.procurementMethod !== OrgProcurementMethod.QUOTATION) {
    return {
      ok: false,
      error: "LPOs are only issued for the Quotation path. Tender procurements use a contract instead.",
      status: 400,
      code: "LPO_REQUIRES_QUOTATION",
    };
  }

  const existing = await prisma.projectOrgLpo.findFirst({
    where: { projectId: opts.projectId, procurementId: procurement.id, status: { not: OrgLpoStatus.CANCELLED } },
  });
  if (existing) {
    return { ok: false, error: "An LPO already exists for this procurement.", status: 400, code: "LPO_EXISTS" };
  }

  const award = await loadAcceptedAward(prisma, opts.projectId, procurement.id);
  if (!award) {
    return {
      ok: false,
      error: "The award must be accepted by the supplier before an LPO can be created.",
      status: 400,
      code: "AWARD_NOT_ACCEPTED",
    };
  }

  const yearToken = financialYearRefToken(procurement.financialYear?.label);
  const lpoNumber = await nextDocumentNumber(prisma, opts.projectId, "lpo", yearToken);

  const row = await prisma.projectOrgLpo.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      awardId: award.id,
      supplierId: award.supplierId,
      lpoNumber,
      lpoValue: award.awardedAmount,
      deliveryAddress:
        normalizeDeliveryAddress(opts.deliveryAddress) ||
        (await resolveDeliveryAddress(prisma, { projectId: opts.projectId, procurementId: procurement.id })),
      status: OrgLpoStatus.DRAFT,
    },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_LPO_CREATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      lpoId: row.id,
      lpoNumber,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  await bestEffortStartTracking(prisma, WORKFLOW_TRIGGERS.LPO_STARTED, {
    projectId: opts.projectId,
    procurementId: procurement.id,
    entityTitle: `LPO: ${lpoNumber}`,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
  });

  return { ok: true, lpo: serializeLpo(row) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; lpoId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function approveLpo(prisma, opts) {
  const row = await prisma.projectOrgLpo.findFirst({ where: { id: opts.lpoId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "LPO not found.", status: 404 };
  if (row.status !== OrgLpoStatus.DRAFT) {
    return { ok: false, error: "Only a draft LPO can be approved.", status: 400 };
  }
  const updated = await prisma.projectOrgLpo.update({
    where: { id: row.id },
    data: { status: OrgLpoStatus.APPROVED },
    include: { supplier: true },
  });
  return { ok: true, lpo: serializeLpo(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; lpoId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function issueLpo(prisma, opts) {
  const row = await prisma.projectOrgLpo.findFirst({ where: { id: opts.lpoId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "LPO not found.", status: 404 };
  if (row.status !== OrgLpoStatus.APPROVED) {
    return { ok: false, error: "The LPO must be approved before it can be issued.", status: 400 };
  }
  const updated = await prisma.projectOrgLpo.update({
    where: { id: row.id },
    data: { status: OrgLpoStatus.ISSUED, issuedAt: new Date() },
    include: { supplier: true },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_LPO_ISSUED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      lpoId: row.id,
      supplierId: row.supplierId,
      actorOrgUserId: opts.actorOrgUserId || null,
      actorRoleName: opts.actorRoleName || null,
    },
  });

  await notifyProvider(prisma, {
    projectId: opts.projectId,
    providerId: row.supplierId,
    procurementId: row.procurementId,
    title: `LPO issued: ${row.lpoNumber}`,
    body: "Accept or decline the local purchase order in your portal.",
  });
  await autoAcceptOrder(prisma, { projectId: opts.projectId, procurementId: row.procurementId, supplier: updated.supplier });

  return { ok: true, lpo: serializeLpo(updated) };
}

/**
 * The provider accepts or declines its ISSUED LPO / contract (portal, or auto-response).
 * Acceptance opens the order for delivery (CONTRACT_ACTIVE); a decline goes back to the PDU.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; providerId: string; procurementId: string; body: any; auto?: boolean }} opts
 */
export async function respondToOrder(prisma, opts) {
  const v = validatePurchaseInstructionResponse(opts.body || {});
  if (!v.ok) return { ok: false, status: 400, error: "Please fix the highlighted fields.", fieldErrors: v.errors };

  const where = { projectId: opts.projectId, procurementId: opts.procurementId, supplierId: opts.providerId };
  const [contract, lpo] = await Promise.all([
    prisma.projectOrgContract.findFirst({
      where: { ...where, status: { not: OrgContractStatus.CANCELLED } },
      orderBy: { createdAt: "desc" },
      include: { supplier: true },
    }),
    prisma.projectOrgLpo.findFirst({
      where: { ...where, status: { not: OrgLpoStatus.CANCELLED } },
      orderBy: { createdAt: "desc" },
      include: { supplier: true },
    }),
  ]);
  const isContract = Boolean(contract);
  const row = contract || lpo;
  if (!row) return { ok: false, status: 404, error: "Order not found." };
  const word = isContract ? "contract" : "LPO";
  const number = isContract ? contract.contractNumber : lpo.lpoNumber;
  if (row.status !== "ISSUED") {
    return { ok: false, status: 409, error: `This ${word} is not waiting for your response.` };
  }

  const accept = v.values.decision === "ACCEPT";
  const now = new Date();
  const data = accept
    ? { acceptedAt: now, acceptedByName: v.values.acceptedByName }
    : { declinedAt: now, declineReason: v.values.declineReason };
  const claimed = await prisma.$transaction(async (tx) => {
    const res = isContract
      ? await tx.projectOrgContract.updateMany({
          where: { id: row.id, status: OrgContractStatus.ISSUED },
          data: { ...data, status: accept ? OrgContractStatus.ACTIVE : OrgContractStatus.DECLINED },
        })
      : await tx.projectOrgLpo.updateMany({
          where: { id: row.id, status: OrgLpoStatus.ISSUED },
          data: { ...data, status: accept ? OrgLpoStatus.ACCEPTED : OrgLpoStatus.DECLINED },
        });
    if (res.count === 1 && accept) {
      await tx.projectOrgProcurement.update({
        where: { id: row.procurementId },
        data: { status: OrgProcurementStatus.CONTRACT_ACTIVE },
      });
    }
    return res.count;
  });
  if (claimed !== 1) return { ok: false, status: 409, error: `You have already responded to this ${word}.` };

  const providerLabel = `${row.supplier?.name || "Provider"}${opts.auto ? " (auto-response)" : ""}`;
  const eventType = isContract
    ? accept
      ? AuditEvent.PROJECT_ORG_CONTRACT_ACCEPTED
      : AuditEvent.PROJECT_ORG_CONTRACT_DECLINED
    : accept
      ? AuditEvent.PROJECT_ORG_LPO_ACCEPTED
      : AuditEvent.PROJECT_ORG_LPO_DECLINED;
  await writeAuditLog({
    eventType,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      ...(isContract ? { contractId: row.id } : { lpoId: row.id }),
      supplierId: opts.providerId,
      actorName: accept ? `${v.values.acceptedByName} — ${providerLabel}` : providerLabel,
      actorRoleName: "Provider",
      remarks: accept ? null : v.values.declineReason,
    },
  });

  const proc = await prisma.projectOrgProcurement.findUnique({
    where: { id: row.procurementId },
    select: {
      procurementNumber: true,
      officer: { select: { id: true, linkedUserId: true } },
      instances: {
        where: { status: { in: [OrgWorkflowInstanceStatus.ACTIVE, OrgWorkflowInstanceStatus.IN_PROGRESS] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  /** @type {{ id: string; linkedUserId: string | null }[]} */
  let recipients = proc?.officer ? [proc.officer] : [];
  const instanceId = proc?.instances[0]?.id || null;
  if (instanceId) {
    const holders = await prisma.projectOrgWorkflowTask.findMany({
      where: { instanceId, status: OrgWorkflowTaskStatus.PENDING, assigneeOrgUserId: { not: null } },
      select: { assignee: { select: { id: true, linkedUserId: true } } },
    });
    recipients = [...recipients, ...holders.map((t) => t.assignee).filter(Boolean)];
  }
  const unique = [...new Map(recipients.map((r) => [r.id, r])).values()];
  if (unique.length) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: unique,
      type: accept ? OrgNotificationType.WORKFLOW_APPROVED : OrgNotificationType.WORKFLOW_REJECTED,
      title: `${isContract ? "Contract" : "LPO"} ${accept ? "accepted" : "declined"}: ${number}`,
      body: accept
        ? `${providerLabel} accepted ${number}. Delivery follows.`
        : `${providerLabel} declined ${number}: ${v.values.declineReason}`,
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: isContract ? "contract" : "lpo",
      relatedEntityId: row.id,
    });
  }

  if (accept) {
    const { autoDispatchIfAutoResponse } = await import("@/lib/projects/delivery-notes");
    await autoDispatchIfAutoResponse(prisma, {
      projectId: opts.projectId,
      procurementId: row.procurementId,
      providerId: row.supplierId,
    });
  }

  return { ok: true, decision: v.values.decision };
}

/**
 * Effective order value for guarding invoices/payments — contract, LPO, or purchase
 * instruction, whichever applies to the procurement's method.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function getActiveOrderValue(prisma, projectId, procurementId) {
  const contract = await prisma.projectOrgContract.findFirst({
    where: { projectId, procurementId, status: { in: [OrgContractStatus.ACTIVE, OrgContractStatus.ISSUED, OrgContractStatus.SIGNED] } },
    orderBy: { createdAt: "desc" },
  });
  if (contract) {
    return {
      kind: "contract",
      id: contract.id,
      number: contract.contractNumber,
      value: Number(contract.contractValue),
      supplierId: contract.supplierId,
      deliveryAddress: contract.deliveryAddress || null,
      status: contract.status,
    };
  }

  const lpo = await prisma.projectOrgLpo.findFirst({
    where: { projectId, procurementId, status: { in: [OrgLpoStatus.ACCEPTED, OrgLpoStatus.ISSUED] } },
    orderBy: { createdAt: "desc" },
  });
  if (lpo) {
    return {
      kind: "lpo",
      id: lpo.id,
      number: lpo.lpoNumber,
      value: Number(lpo.lpoValue),
      supplierId: lpo.supplierId,
      deliveryAddress: lpo.deliveryAddress || null,
      status: lpo.status,
    };
  }

  const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: { projectId, procurementId, status: { in: ["ISSUED", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (pi) {
    return {
      kind: "purchase_instruction",
      id: pi.id,
      number: pi.instructionNumber,
      value: Number(pi.amount),
      supplierId: pi.supplierId,
      deliveryAddress: pi.deliveryAddress || null,
      status: pi.status,
    };
  }

  return null;
}

/**
 * Correct the delivery address on an LPO or contract before it is issued to the
 * provider. Deliveries and invoices recorded afterwards inherit the corrected value.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   kind: "lpo" | "contract";
 *   deliveryAddress: unknown;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 * }} opts
 */
export async function updateOrderDeliveryAddress(prisma, opts) {
  const error = validateDeliveryAddressInput(opts.deliveryAddress);
  if (error) return { ok: false, error, status: 400, fieldErrors: { deliveryAddress: error } };
  const deliveryAddress = normalizeDeliveryAddress(opts.deliveryAddress);

  if (opts.kind === "contract") {
    const row = await prisma.projectOrgContract.findFirst({
      where: {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        status: { in: [OrgContractStatus.DRAFT, OrgContractStatus.APPROVED] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) {
      return {
        ok: false,
        error: "The delivery address can only be changed while the contract is in draft or approved.",
        status: 400,
      };
    }
    const updated = await prisma.projectOrgContract.update({
      where: { id: row.id },
      data: { deliveryAddress },
      include: { supplier: true },
    });
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_DELIVERY_ADDRESS_UPDATED,
      actorUserId: null,
      meta: {
        projectId: opts.projectId,
        procurementId: opts.procurementId,
        contractId: row.id,
        previous: row.deliveryAddress || null,
        deliveryAddress,
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
      },
    });
    return { ok: true, contract: serializeContract(updated) };
  }

  const row = await prisma.projectOrgLpo.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      status: { in: [OrgLpoStatus.DRAFT, OrgLpoStatus.APPROVED] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    return {
      ok: false,
      error: "The delivery address can only be changed while the LPO is in draft or approved.",
      status: 400,
    };
  }
  const updated = await prisma.projectOrgLpo.update({
    where: { id: row.id },
    data: { deliveryAddress },
    include: { supplier: true },
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_DELIVERY_ADDRESS_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      lpoId: row.id,
      previous: row.deliveryAddress || null,
      deliveryAddress,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });
  return { ok: true, lpo: serializeLpo(updated) };
}
