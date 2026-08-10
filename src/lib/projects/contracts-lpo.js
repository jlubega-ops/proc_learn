import {
  OrgAwardStatus,
  OrgContractStatus,
  OrgLpoStatus,
  OrgProcurementMethod,
  OrgProcurementStatus,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { financialYearRefToken } from "@/lib/projects/org-reference";
import { serializeSupplier } from "@/lib/projects/suppliers";
import { WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { startWorkflowFromTrigger } from "@/lib/projects/workflow-engine";

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
    supplier: row.supplier ? serializeSupplier(row.supplier) : null,
    contractNumber: row.contractNumber,
    contractValue: row.contractValue?.toString?.() ?? String(row.contractValue ?? ""),
    status: row.status,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    issuedAt: row.issuedAt || null,
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
    supplier: row.supplier ? serializeSupplier(row.supplier) : null,
    lpoNumber: row.lpoNumber,
    lpoValue: row.lpoValue?.toString?.() ?? String(row.lpoValue ?? ""),
    status: row.status,
    issuedAt: row.issuedAt || null,
    acceptedAt: row.acceptedAt || null,
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
 * Issue a SIGNED contract — puts the procurement into CONTRACT_ACTIVE (ready for delivery).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; contractId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function issueContract(prisma, opts) {
  const row = await prisma.projectOrgContract.findFirst({ where: { id: opts.contractId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "Contract not found.", status: 404 };
  if (row.status !== OrgContractStatus.SIGNED) {
    return { ok: false, error: "The contract must be signed before it can be issued.", status: 400 };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.projectOrgContract.update({
      where: { id: row.id },
      data: { status: OrgContractStatus.ACTIVE, issuedAt: new Date() },
      include: { supplier: true },
    });
    await tx.projectOrgProcurement.update({
      where: { id: row.procurementId },
      data: { status: OrgProcurementStatus.CONTRACT_ACTIVE },
    });
    return c;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_CONTRACT_ISSUED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, contractId: row.id },
  });

  return { ok: true, contract: serializeContract(updated) };
}

/**
 * Create a DRAFT LPO for a QUOTATION procurement from its ACCEPTED award.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; actorOrgUserId: string; actorRoleName: string }} opts
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
    meta: { projectId: opts.projectId, procurementId: row.procurementId, lpoId: row.id },
  });

  return { ok: true, lpo: serializeLpo(updated) };
}

/**
 * Supplier accepts the ISSUED LPO — puts the procurement into CONTRACT_ACTIVE (ready for delivery).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; lpoId: string; actorOrgUserId: string; actorRoleName: string }} opts
 */
export async function acceptLpo(prisma, opts) {
  const row = await prisma.projectOrgLpo.findFirst({ where: { id: opts.lpoId, projectId: opts.projectId } });
  if (!row) return { ok: false, error: "LPO not found.", status: 404 };
  if (row.status !== OrgLpoStatus.ISSUED) {
    return { ok: false, error: "The LPO must be issued before it can be accepted.", status: 400 };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const l = await tx.projectOrgLpo.update({
      where: { id: row.id },
      data: { status: OrgLpoStatus.ACCEPTED, acceptedAt: new Date() },
      include: { supplier: true },
    });
    await tx.projectOrgProcurement.update({
      where: { id: row.procurementId },
      data: { status: OrgProcurementStatus.CONTRACT_ACTIVE },
    });
    return l;
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_LPO_ACCEPTED,
    actorUserId: null,
    meta: { projectId: opts.projectId, procurementId: row.procurementId, lpoId: row.id },
  });

  const officer = await prisma.projectOrgProcurement.findUnique({
    where: { id: row.procurementId },
    select: { officer: { select: { id: true, linkedUserId: true } } },
  });
  if (officer?.officer) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: [officer.officer],
      type: OrgNotificationType.WORKFLOW_APPROVED,
      title: "LPO accepted",
      body: "The supplier accepted the LPO. You may now record delivery.",
      linkUrl: `/projects/${opts.projectId}/procurements/${row.procurementId}`,
      relatedEntityType: "lpo",
      relatedEntityId: row.id,
    });
  }

  return { ok: true, lpo: serializeLpo(updated) };
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
  if (contract) return { kind: "contract", id: contract.id, value: Number(contract.contractValue) };

  const lpo = await prisma.projectOrgLpo.findFirst({
    where: { projectId, procurementId, status: { in: [OrgLpoStatus.ACCEPTED, OrgLpoStatus.ISSUED] } },
    orderBy: { createdAt: "desc" },
  });
  if (lpo) return { kind: "lpo", id: lpo.id, value: Number(lpo.lpoValue) };

  const pi = await prisma.projectOrgPurchaseInstruction.findFirst({
    where: { projectId, procurementId, status: "ISSUED" },
    orderBy: { createdAt: "desc" },
  });
  if (pi) return { kind: "purchase_instruction", id: pi.id, value: Number(pi.amount) };

  return null;
}
