import { OrgProcurementMethod, OrgPurchaseInstructionStatus, OrgSupplierStatus } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { financialYearRefToken } from "@/lib/projects/org-reference";
import { serializeSupplier } from "@/lib/projects/suppliers";

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
    supplier: row.supplier ? serializeSupplier(row.supplier) : null,
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
 * }} opts
 */
export async function issuePurchaseInstruction(prisma, opts) {
  const procurement = await prisma.projectOrgProcurement.findFirst({
    where: { id: opts.procurementId, projectId: opts.projectId },
    include: {
      financialYear: { select: { label: true } },
      requisition: { select: { id: true, estimatedTotalValue: true } },
      purchaseInstructions: { select: { id: true } },
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
  if ((procurement.purchaseInstructions || []).length > 0) {
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

  const supplier = await prisma.projectOrgSupplier.findFirst({
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
  if (supplier.status !== OrgSupplierStatus.ACTIVE) {
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

  const created = await prisma.projectOrgPurchaseInstruction.create({
    data: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      supplierId: supplier.id,
      instructionNumber,
      amount: procurement.requisition.estimatedTotalValue,
      status: OrgPurchaseInstructionStatus.ISSUED,
      issuedAt: new Date(),
      issuedByOrgUserId: opts.actorOrgUserId,
      remarks,
    },
    include: {
      supplier: true,
      issuedBy: { select: { id: true, firstName: true, lastName: true } },
    },
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
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  return { ok: true, purchaseInstruction: serializePurchaseInstruction(created) };
}

/** @deprecated use issuePurchaseInstruction */
export const issuePurchaseInstructionForProcurement = issuePurchaseInstruction;
