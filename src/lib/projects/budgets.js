import {
  OrgBudgetStatus,
  OrgWorkflowInstanceStatus,
  OrgWorkflowTaskStatus,
  Prisma,
} from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { PROCESS_FLOW_CODES, WORKFLOW_TRIGGERS } from "@/lib/projects/process-catalogue";
import { assertProcessActive } from "@/lib/projects/process-activation";
import { resolveSelectableFinancialYear } from "@/lib/projects/org-financial-years";
import {
  computeBudgetAvailability,
  completeWorkflowTask,
  prepareWorkflowTriggers,
  startWorkflowFromTrigger,
} from "@/lib/projects/workflow-engine";
import { TxAbort, runInTx, withTxAbort } from "@/lib/db-tx";
import { ORG_REF_DOC, nextOrgDocumentReference } from "@/lib/projects/org-reference";
import { validateLineText } from "@/lib/projects/line-item-options";
import {
  resolveCurrentOrgSlate,
  resolveSlateIdForOrgCreate,
  withAcademicAuditMeta,
} from "@/lib/academic/org-academic-slate";
import { presentOrgWorkflowStatus } from "@/lib/projects/workflow-status-presentation";

/**
 * @param {unknown} value
 */
function toDecimal(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/\s/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

/**
 * Server-side line total: prefer explicit total; else qty × unitCost.
 * @param {any} raw
 */
function resolveLineAmounts(raw) {
  const qty = raw?.quantity != null && raw.quantity !== "" ? toDecimal(raw.quantity) : null;
  const unitCost =
    raw?.unitCost != null && String(raw.unitCost).replace(/,/g, "") !== ""
      ? toDecimal(String(raw.unitCost).replace(/,/g, ""))
      : null;
  let approvedAmount =
    raw?.approvedAmount != null && String(raw.approvedAmount).replace(/,/g, "") !== ""
      ? toDecimal(String(raw.approvedAmount).replace(/,/g, ""))
      : null;
  if (approvedAmount == null && qty && unitCost) {
    approvedAmount = new Prisma.Decimal((Number(qty) * Number(unitCost)).toFixed(2));
  }
  return {
    quantity: qty,
    unitCost,
    approvedAmount,
    unitOfMeasure:
      typeof raw?.unitOfMeasure === "string" ? raw.unitOfMeasure.trim() || null : null,
    fundingSource:
      typeof raw?.fundingSource === "string" ? raw.fundingSource.trim() || null : null,
  };
}

/**
 * Build budget line name/code from category / description fields.
 * @param {any} raw
 * @param {number} idx
 */
function resolveLineIdentity(raw, idx) {
  const category = typeof raw?.category === "string" ? raw.category.trim() : "";
  const name =
    (typeof raw?.name === "string" && raw.name.trim()) ||
    category ||
    (typeof raw?.description === "string" && raw.description.trim().slice(0, 80)) ||
    "";
  let code = typeof raw?.code === "string" ? raw.code.trim() : "";
  if (!code && category) {
    const slug = category
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24);
    code = `${slug || "LINE"}-${idx + 1}`;
  }
  return { code, name, category: category || null };
}

export const budgetInclude = {
  financialYear: { select: { id: true, label: true } },
  department: { select: { id: true, name: true, code: true } },
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      projectOrgRole: { select: { name: true } },
    },
  },
  approvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      projectOrgRole: { select: { name: true } },
    },
  },
  lines: { orderBy: [{ code: "asc" }, { createdAt: "asc" }] },
};

/**
 * @param {any} line
 */
export function serializeBudgetLine(line) {
  const funding = computeBudgetAvailability(line, 0);
  return {
    id: line.id,
    budgetId: line.budgetId || null,
    code: line.code,
    name: line.name,
    description: line.description || null,
    category: line.category || null,
    quantity: line.quantity != null ? Number(line.quantity).toFixed(2) : null,
    unitOfMeasure: line.unitOfMeasure || null,
    unitCost: line.unitCost != null ? Number(line.unitCost).toFixed(2) : null,
    fundingSource: line.fundingSource || null,
    approvedAmount: funding.approvedAmount.toFixed(2),
    committedAmount: funding.committedAmount.toFixed(2),
    availableBalance: funding.availableBalance.toFixed(2),
    isActive: line.isActive !== false,
    financialYearId: line.financialYearId,
    departmentId: line.departmentId || null,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function orgUserBrief(u) {
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    roleName: u.projectOrgRole?.name || null,
  };
}

/**
 * @param {any} row
 */
export function serializeBudget(row) {
  const lines = Array.isArray(row.lines) ? row.lines.map(serializeBudgetLine) : [];
  const totalApproved = lines.reduce((sum, l) => sum + Number(l.approvedAmount || 0), 0);
  const totalCommitted = lines.reduce((sum, l) => sum + Number(l.committedAmount || 0), 0);
  const workflowStage = row.workflowStage || null;
  const presentation = presentBudgetStatus(row.status, workflowStage, {
    viewerHasPendingAction: Boolean(row.viewerHasPendingAction),
    lastDecision: row.lastDecision || null,
  });
  const neutral = presentBudgetStatus(row.status, workflowStage, {
    lastDecision: row.lastDecision || null,
  });
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    budgetReference: row.budgetReference || null,
    currency: row.currency || "UGX",
    status: row.status,
    statusLabel: presentation.label,
    statusColor: presentation.color,
    stageLabel: neutral.label,
    workflowStage,
    viewerHasPendingAction: Boolean(row.viewerHasPendingAction),
    submittedAt: row.submittedAt || null,
    approvedAt: row.approvedAt,
    createdByOrgUserId: row.createdByOrgUserId || null,
    createdBy: orgUserBrief(row.createdBy),
    approvedByOrgUserId: row.approvedByOrgUserId || null,
    approvedBy: orgUserBrief(row.approvedBy),
    financialYear: row.financialYear
      ? { id: row.financialYear.id, label: row.financialYear.label }
      : null,
    department: row.department
      ? {
          id: row.department.id,
          name: row.department.name,
          code: row.department.code || null,
        }
      : null,
    financialYearId: row.financialYearId,
    departmentId: row.departmentId || null,
    lines,
    totals: {
      approvedAmount: totalApproved.toFixed(2),
      committedAmount: totalCommitted.toFixed(2),
      remainingAmount: (totalApproved - totalCommitted).toFixed(2),
      lineCount: lines.length,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Human-readable budget status for chips / banners.
 * @param {string | null | undefined} status
 * @param {{ requiredRoleName?: string | null; title?: string | null } | null} [workflowStage]
 * @param {{
 *   viewerHasPendingAction?: boolean;
 *   lastDecision?: { decision?: string | null; actorRoleName?: string | null } | null;
 * }} [viewer]
 */
export function presentBudgetStatus(status, workflowStage = null, viewer = {}) {
  return presentOrgWorkflowStatus({
    status,
    workflowStage,
    viewerHasPendingAction: viewer.viewerHasPendingAction,
    lastDecision: viewer.lastDecision,
  });
}

/**
 * Current open workflow step for a budget (any assignee) — for stage status labels.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; budgetId: string }} opts
 */
export async function getBudgetWorkflowStage(prisma, opts) {
  const task = await prisma.projectOrgWorkflowTask.findFirst({
    where: {
      projectId: opts.projectId,
      status: { in: [OrgWorkflowTaskStatus.PENDING, OrgWorkflowTaskStatus.IN_PROGRESS] },
      instance: {
        budgetId: opts.budgetId,
        status: {
          in: [
            OrgWorkflowInstanceStatus.ACTIVE,
            OrgWorkflowInstanceStatus.IN_PROGRESS,
            OrgWorkflowInstanceStatus.SUSPENDED,
          ],
        },
      },
    },
    orderBy: [{ stepNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      requiredRoleName: true,
      stepNumber: true,
      status: true,
    },
  });
  if (!task) return null;
  return {
    taskId: task.id,
    title: task.title,
    requiredRoleName: task.requiredRoleName || null,
    stepNumber: task.stepNumber,
    status: task.status,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; budgetIds: string[]; viewerOrgUserId?: string | null }} opts
 */
export async function mapBudgetWorkflowStages(prisma, opts) {
  const { mapEntityWorkflowContexts } = await import(
    "@/lib/projects/workflow-status-presentation"
  );
  return mapEntityWorkflowContexts(prisma, {
    projectId: opts.projectId,
    entityField: "budgetId",
    entityIds: opts.budgetIds || [],
    viewerOrgUserId: opts.viewerOrgUserId || null,
  });
}

/**
 * Budget lines usable for plans/requisitions: active + parent APPROVED.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   financialYearId?: string | null;
 *   departmentId?: string | null;
 * }} opts
 */
export async function listSelectableBudgetLines(prisma, opts) {
  const where = {
    projectId: opts.projectId,
    isActive: true,
    budget: { status: OrgBudgetStatus.APPROVED },
    ...(opts.financialYearId ? { financialYearId: opts.financialYearId } : {}),
    ...(opts.departmentId
      ? { OR: [{ departmentId: opts.departmentId }, { departmentId: null }] }
      : {}),
  };

  const rows = await prisma.projectOrgBudgetLine.findMany({
    where,
    orderBy: [{ code: "asc" }],
    include: {
      budget: { select: { id: true, title: true, status: true } },
      financialYear: { select: { id: true, label: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  return rows.map((r) => ({
    ...serializeBudgetLine(r),
    budget: r.budget
      ? { id: r.budget.id, title: r.budget.title, status: r.budget.status }
      : null,
    financialYear: r.financialYear
      ? { id: r.financialYear.id, label: r.financialYear.label }
      : null,
    department: r.department
      ? { id: r.department.id, name: r.department.name, code: r.department.code }
      : null,
  }));
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   actorUserId?: string | null;
 *   actorOrgUserId?: string | null;
 *   body: any;
 * }} opts
 */
export async function createBudgetWithLines(prisma, opts) {
  const inactive = await assertProcessActive(prisma, opts.projectId, PROCESS_FLOW_CODES.BUDGETING);
  if (inactive) return inactive;

  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};

  const title = typeof b.title === "string" ? b.title.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() || null : null;
  let budgetReference =
    typeof b.budgetReference === "string" ? b.budgetReference.trim() || null : null;
  const currency =
    typeof b.currency === "string" && b.currency.trim() ? b.currency.trim().toUpperCase() : "UGX";
  const financialYearId = typeof b.financialYearId === "string" ? b.financialYearId.trim() : "";
  const departmentId =
    typeof b.departmentId === "string" ? b.departmentId.trim() || null : null;
  const linesIn = Array.isArray(b.lines) ? b.lines : [];

  if (!title) fieldErrors.title = "Enter a budget title.";
  if (!financialYearId) fieldErrors.financialYearId = "Choose a financial year.";
  if (linesIn.length === 0) fieldErrors.lines = "Add at least one budget line.";

  const fy = financialYearId
    ? await resolveSelectableFinancialYear(prisma, opts.projectId, financialYearId)
    : null;
  if (financialYearId && !fy) {
    fieldErrors.financialYearId =
      "Choose an active financial year that covers today's date. Ask the Organization Administrator if none appear.";
  }

  /** @type {{ id: string; name: string; code: string | null } | null} */
  let dept = null;
  if (departmentId) {
    dept = await prisma.projectOrgDepartment.findFirst({
      where: { id: departmentId, projectId: opts.projectId, isActive: true },
      select: { id: true, name: true, code: true },
    });
    if (!dept) fieldErrors.departmentId = "Choose a valid department.";
  }

  if (!budgetReference && fy && !fieldErrors.financialYearId) {
    const existing = await prisma.projectOrgBudget.findMany({
      where: { projectId: opts.projectId, budgetReference: { not: null } },
      select: { budgetReference: true },
    });
    budgetReference = nextOrgDocumentReference(
      existing.map((r) => r.budgetReference).filter(Boolean),
      {
        deptCode: dept?.code,
        deptName: dept?.name,
        docType: ORG_REF_DOC.BUDGET,
        fyLabel: fy.label,
      },
    );
  }

  if (budgetReference) {
    const clash = await prisma.projectOrgBudget.findFirst({
      where: { projectId: opts.projectId, budgetReference },
      select: { id: true },
    });
    if (clash) fieldErrors.budgetReference = "This budget reference is already in use.";
  }

  /** @type {any[]} */
  const lineRows = [];
  const codes = new Set();
  linesIn.forEach((raw, idx) => {
    const identity = resolveLineIdentity(raw, idx);
    const amounts = resolveLineAmounts(raw);
    const lineDescription =
      typeof raw?.description === "string" ? raw.description.trim() || null : null;
    const categoryErr = validateLineText(identity.category, "Category");
    if (categoryErr) {
      fieldErrors[`lines.${idx}.category`] = categoryErr;
    }
    if (!amounts.quantity || Number(amounts.quantity) <= 0) {
      fieldErrors[`lines.${idx}.quantity`] = "Enter a quantity greater than zero.";
    }
    if (!amounts.unitOfMeasure) {
      fieldErrors[`lines.${idx}.unitOfMeasure`] = "Enter a unit.";
    }
    if (!amounts.unitCost || Number(amounts.unitCost) <= 0) {
      fieldErrors[`lines.${idx}.unitCost`] = "Enter a unit cost greater than zero.";
    }
    if (!amounts.approvedAmount || Number(amounts.approvedAmount) <= 0) {
      fieldErrors[`lines.${idx}.approvedAmount`] = "Enter or compute a total amount greater than zero.";
    }
    const fundingErr = validateLineText(amounts.fundingSource, "Source of funding");
    if (fundingErr) {
      fieldErrors[`lines.${idx}.fundingSource`] = fundingErr;
    }
    if (!identity.code || !identity.name || !amounts.approvedAmount) {
      fieldErrors[`lines.${idx}`] =
        fieldErrors[`lines.${idx}`] ||
        "Each line needs category, quantity, unit, unit cost, and total.";
      return;
    }
    const codeKey = identity.code.toUpperCase();
    if (codes.has(codeKey)) {
      fieldErrors[`lines.${idx}.code`] = "Duplicate line code in this budget.";
      return;
    }
    codes.add(codeKey);
    lineRows.push({
      projectId: opts.projectId,
      financialYearId,
      departmentId,
      code: identity.code,
      name: identity.name,
      description: lineDescription,
      category: identity.category,
      quantity: amounts.quantity,
      unitOfMeasure: amounts.unitOfMeasure,
      unitCost: amounts.unitCost,
      fundingSource: amounts.fundingSource,
      approvedAmount: amounts.approvedAmount,
      committedAmount: new Prisma.Decimal("0.00"),
      isActive: true,
    });
  });

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }

  for (const line of lineRows) {
    const clash = await prisma.projectOrgBudgetLine.findFirst({
      where: {
        projectId: opts.projectId,
        financialYearId,
        code: line.code,
      },
      select: { id: true },
    });
    if (clash) {
      return {
        ok: false,
        error: `Budget line code "${line.code}" already exists for this financial year.`,
        fieldErrors: { lines: `Code ${line.code} is already used.` },
      };
    }
  }

  const row = await prisma.projectOrgBudget.create({
    data: {
      projectId: opts.projectId,
      financialYearId,
      departmentId,
      title,
      description,
      budgetReference,
      currency,
      status: OrgBudgetStatus.DRAFT,
      createdByOrgUserId: opts.actorOrgUserId || null,
      orgAcademicSlateId: await resolveSlateIdForOrgCreate(prisma, opts.projectId),
      lines: { create: lineRows },
    },
    include: budgetInclude,
  });

  const slate = row.orgAcademicSlateId
    ? await resolveCurrentOrgSlate(prisma, opts.projectId)
    : null;

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_CREATED,
    actorUserId: opts.actorUserId || null,
    meta: withAcademicAuditMeta(
      {
        projectId: opts.projectId,
        budgetId: row.id,
        financialYearId,
        departmentId,
        status: row.status,
        lineCount: lineRows.length,
        actorOrgUserId: opts.actorOrgUserId || null,
      },
      slate,
    ),
  });

  return { ok: true, budget: serializeBudget(row) };
}

/**
 * Replace draft (or returned) budget header + lines before / after return for correction.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   budgetId: string;
 *   actorOrgUserId: string;
 *   body: any;
 * }} opts
 */
export async function updateDraftBudget(prisma, opts) {
  const existing = await prisma.projectOrgBudget.findFirst({
    where: { id: opts.budgetId, projectId: opts.projectId },
    include: { lines: true },
  });
  if (!existing) return { ok: false, error: "Budget not found.", status: 404 };
  if (!actsAsBudgetCreator(existing, opts)) {
    return { ok: false, error: "Only the budget creator can edit this draft.", status: 403 };
  }
  if (![OrgBudgetStatus.DRAFT, OrgBudgetStatus.RETURNED].includes(existing.status)) {
    return {
      ok: false,
      error: "Only draft or returned budgets can be edited.",
      status: 400,
    };
  }

  const b = opts.body || {};
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() || null : null;
  const linesIn = Array.isArray(b.lines) ? b.lines : [];

  if (!title) fieldErrors.title = "Enter a budget title.";
  if (linesIn.length === 0) fieldErrors.lines = "Add at least one budget line.";

  /** @type {any[]} */
  const lineRows = [];
  const codes = new Set();
  linesIn.forEach((raw, idx) => {
    const identity = resolveLineIdentity(raw, idx);
    const amounts = resolveLineAmounts(raw);
    const lineDescription =
      typeof raw?.description === "string" ? raw.description.trim() || null : null;
    const categoryErr = validateLineText(identity.category, "Category");
    if (categoryErr) {
      fieldErrors[`lines.${idx}.category`] = categoryErr;
    }
    if (!amounts.quantity || Number(amounts.quantity) <= 0) {
      fieldErrors[`lines.${idx}.quantity`] = "Enter a quantity greater than zero.";
    }
    if (!amounts.unitOfMeasure) {
      fieldErrors[`lines.${idx}.unitOfMeasure`] = "Enter a unit.";
    }
    if (!amounts.unitCost || Number(amounts.unitCost) <= 0) {
      fieldErrors[`lines.${idx}.unitCost`] = "Enter a unit cost greater than zero.";
    }
    if (!amounts.approvedAmount || Number(amounts.approvedAmount) <= 0) {
      fieldErrors[`lines.${idx}.approvedAmount`] =
        "Enter or compute a total amount greater than zero.";
    }
    const fundingErr = validateLineText(amounts.fundingSource, "Source of funding");
    if (fundingErr) {
      fieldErrors[`lines.${idx}.fundingSource`] = fundingErr;
    }
    if (!identity.code || !identity.name || !amounts.approvedAmount) {
      fieldErrors[`lines.${idx}`] =
        fieldErrors[`lines.${idx}`] ||
        "Each line needs category, quantity, unit, unit cost, and total.";
      return;
    }
    const codeKey = identity.code.toUpperCase();
    if (codes.has(codeKey)) {
      fieldErrors[`lines.${idx}.code`] = "Duplicate line code in this budget.";
      return;
    }
    codes.add(codeKey);
    lineRows.push({
      projectId: opts.projectId,
      budgetId: existing.id,
      financialYearId: existing.financialYearId,
      departmentId: existing.departmentId,
      code: identity.code,
      name: identity.name,
      description: lineDescription,
      category: identity.category,
      quantity: amounts.quantity,
      unitOfMeasure: amounts.unitOfMeasure,
      unitCost: amounts.unitCost,
      fundingSource: amounts.fundingSource,
      approvedAmount: amounts.approvedAmount,
      committedAmount: new Prisma.Decimal("0.00"),
      isActive: true,
    });
  });

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields.", status: 400 };
  }

  for (const line of lineRows) {
    const clash = await prisma.projectOrgBudgetLine.findFirst({
      where: {
        projectId: opts.projectId,
        financialYearId: existing.financialYearId,
        code: line.code,
        NOT: { budgetId: existing.id },
      },
      select: { id: true },
    });
    if (clash) {
      return {
        ok: false,
        error: `Budget line code "${line.code}" already exists for this financial year.`,
        fieldErrors: { lines: `Code ${line.code} is already used.` },
        status: 400,
      };
    }
  }

  const updated = await runInTx(prisma, async (tx) => {
    await tx.projectOrgBudgetLine.deleteMany({ where: { budgetId: existing.id } });
    return tx.projectOrgBudget.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        lines: { create: lineRows },
      },
      include: budgetInclude,
    });
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      budgetId: existing.id,
      actorOrgUserId: opts.actorOrgUserId,
      status: existing.status,
      lineCount: lineRows.length,
    },
  });

  return { ok: true, budget: serializeBudget(updated) };
}

/**
 * Delete a draft budget that has never been submitted.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   budgetId: string;
 *   actorOrgUserId: string;
 * }} opts
 */
export async function deleteDraftBudget(prisma, opts) {
  const existing = await prisma.projectOrgBudget.findFirst({
    where: { id: opts.budgetId, projectId: opts.projectId },
    select: {
      id: true,
      status: true,
      title: true,
      createdByOrgUserId: true,
      departmentId: true,
    },
  });
  if (!existing) return { ok: false, error: "Budget not found.", status: 404 };
  if (!actsAsBudgetCreator(existing, opts)) {
    return { ok: false, error: "Only the budget creator can delete this draft.", status: 403 };
  }
  if (existing.status !== OrgBudgetStatus.DRAFT) {
    return {
      ok: false,
      error: "Only draft budgets that have not been submitted can be deleted.",
      status: 400,
    };
  }

  await prisma.$transaction([
    prisma.projectOrgWorkflowInstance.deleteMany({
      where: { projectId: opts.projectId, budgetId: existing.id },
    }),
    prisma.projectOrgBudget.delete({ where: { id: existing.id } }),
  ]);

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_DELETED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      budgetId: existing.id,
      title: existing.title,
      actorOrgUserId: opts.actorOrgUserId,
    },
  });

  return { ok: true };
}

/**
 * Direct status changes — configuration only (CLOSE). APPROVED must come from workflow.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   budgetId: string;
 *   actorUserId?: string | null;
 *   status: import("@prisma/client").OrgBudgetStatus;
 *   allowDirectApprove?: boolean;
 * }} opts
 */
export async function setBudgetStatus(prisma, opts) {
  const row = await prisma.projectOrgBudget.findFirst({
    where: { id: opts.budgetId, projectId: opts.projectId },
    include: { lines: true },
  });
  if (!row) return { ok: false, error: "Budget not found.", status: 404 };

  const next = opts.status;
  const allowed = new Set(Object.values(OrgBudgetStatus));
  if (!allowed.has(next)) {
    return { ok: false, error: "Invalid budget status.", status: 400 };
  }

  if (next === OrgBudgetStatus.APPROVED && !opts.allowDirectApprove) {
    return {
      ok: false,
      error:
        "Budgets are approved through the budgeting workflow by the Accounting Officer — not by direct status change.",
      status: 403,
      code: "BUDGET_APPROVE_VIA_WORKFLOW",
    };
  }

  if (row.status === OrgBudgetStatus.APPROVED && next !== OrgBudgetStatus.CLOSED) {
    return {
      ok: false,
      error: "Approved budgets cannot be edited. Close the budget instead.",
      status: 400,
    };
  }
  if (row.status === OrgBudgetStatus.CLOSED && next !== OrgBudgetStatus.CLOSED) {
    return { ok: false, error: "Closed budgets cannot change status.", status: 400 };
  }
  if (next === OrgBudgetStatus.APPROVED && (!row.lines || row.lines.length === 0)) {
    return { ok: false, error: "Add budget lines before approving.", status: 400 };
  }

  const updated = await prisma.projectOrgBudget.update({
    where: { id: row.id },
    data: {
      status: next,
      approvedAt: next === OrgBudgetStatus.APPROVED ? new Date() : row.approvedAt,
    },
    include: budgetInclude,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_STATUS_CHANGED,
    actorUserId: opts.actorUserId || null,
    meta: {
      projectId: opts.projectId,
      budgetId: row.id,
      previousStatus: row.status,
      newStatus: next,
      departmentId: row.departmentId,
      financialYearId: row.financialYearId,
    },
  });

  return { ok: true, budget: serializeBudget(updated) };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   budgetId: string;
 *   actorUserId?: string | null;
 *   lines: any[];
 * }} opts
 */
/**
 * Creator check for draft mutations. Drafts without a recorded creator (seeded / legacy)
 * fall back to a preparer from the same department.
 * @param {{ createdByOrgUserId?: string | null; departmentId?: string | null }} row
 * @param {{ actorOrgUserId?: string | null; actorDepartmentId?: string | null }} opts
 */
function actsAsBudgetCreator(row, opts) {
  if (!opts.actorOrgUserId) return false;
  if (row.createdByOrgUserId) return row.createdByOrgUserId === opts.actorOrgUserId;
  return Boolean(opts.actorDepartmentId && row.departmentId === opts.actorDepartmentId);
}

export async function addBudgetLines(prisma, opts) {
  const row = await prisma.projectOrgBudget.findFirst({
    where: { id: opts.budgetId, projectId: opts.projectId },
  });
  if (!row) return { ok: false, error: "Budget not found.", status: 404 };
  if (!actsAsBudgetCreator(row, opts)) {
    return { ok: false, error: "Only the budget creator can add lines.", status: 403 };
  }
  if (![OrgBudgetStatus.DRAFT, OrgBudgetStatus.RETURNED].includes(row.status)) {
    return {
      ok: false,
      error: "Only draft or returned budgets can gain new lines.",
      status: 400,
    };
  }

  const rows = [];
  const seenCodes = new Set();
  for (const raw of opts.lines || []) {
    const code = typeof raw?.code === "string" ? raw.code.trim() : "";
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const amounts = resolveLineAmounts(raw);
    if (!code || !name || !amounts.approvedAmount) {
      return {
        ok: false,
        error: "Each line needs code, name, and amount (or quantity × unit cost).",
        status: 400,
      };
    }
    if (seenCodes.has(code)) {
      return { ok: false, error: `Code "${code}" is used twice.`, status: 400 };
    }
    seenCodes.add(code);
    const clash = await prisma.projectOrgBudgetLine.findFirst({
      where: {
        projectId: opts.projectId,
        financialYearId: row.financialYearId,
        code,
      },
    });
    if (clash) {
      return {
        ok: false,
        error: `Code "${code}" already exists for this financial year.`,
        status: 400,
      };
    }
    rows.push({
      projectId: opts.projectId,
      budgetId: row.id,
      financialYearId: row.financialYearId,
      departmentId: row.departmentId,
      code,
      name,
      description:
        typeof raw?.description === "string" ? raw.description.trim() || null : null,
      category: typeof raw?.category === "string" ? raw.category.trim() || null : null,
      quantity: amounts.quantity,
      unitOfMeasure: amounts.unitOfMeasure,
      unitCost: amounts.unitCost,
      fundingSource: amounts.fundingSource,
      approvedAmount: amounts.approvedAmount,
    });
  }
  const lines = await prisma.$transaction(
    rows.map((data) => prisma.projectOrgBudgetLine.create({ data })),
  );
  const created = lines.map(serializeBudgetLine);

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_LINES_ADDED,
    actorUserId: opts.actorUserId || null,
    meta: {
      projectId: opts.projectId,
      budgetId: row.id,
      lineCount: created.length,
    },
  });

  const full = await prisma.projectOrgBudget.findUnique({
    where: { id: row.id },
    include: budgetInclude,
  });
  return { ok: true, budget: serializeBudget(full), lines: created };
}

/**
 * Submit draft/returned budget into the budgeting workflow.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   budgetId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 * }} opts
 */
export async function submitBudget(prisma, opts) {
  const row = await prisma.projectOrgBudget.findFirst({
    where: { id: opts.budgetId, projectId: opts.projectId },
    include: { lines: true },
  });
  if (!row) return { ok: false, error: "Budget not found.", status: 404 };
  if (!actsAsBudgetCreator(row, opts)) {
    return { ok: false, error: "Only the budget creator can submit this draft.", status: 403 };
  }
  if (![OrgBudgetStatus.DRAFT, OrgBudgetStatus.RETURNED].includes(row.status)) {
    return { ok: false, error: "This budget cannot be submitted.", status: 400 };
  }
  if (!row.lines?.length) {
    return { ok: false, error: "Add budget lines before submitting.", status: 400 };
  }
  const inactive = await assertProcessActive(prisma, opts.projectId, PROCESS_FLOW_CODES.BUDGETING);
  if (inactive) return inactive;

  await prepareWorkflowTriggers(prisma, opts.projectId);
  const outcome = await withTxAbort(() =>
    runInTx(prisma, async (db) => {
      await db.projectOrgWorkflowInstance.updateMany({
        where: {
          budgetId: row.id,
          status: {
            in: [OrgWorkflowInstanceStatus.SUSPENDED, OrgWorkflowInstanceStatus.IN_PROGRESS],
          },
        },
        data: {
          status: OrgWorkflowInstanceStatus.CANCELLED,
          completedAt: new Date(),
        },
      });
      await db.projectOrgWorkflowTask.updateMany({
        where: {
          projectId: opts.projectId,
          status: OrgWorkflowTaskStatus.PENDING,
          instance: { budgetId: row.id },
        },
        data: { status: OrgWorkflowTaskStatus.CANCELLED },
      });

      const started = await startWorkflowFromTrigger(db, {
        projectId: opts.projectId,
        triggerKey: WORKFLOW_TRIGGERS.BUDGET_SUBMITTED,
        entityType: "budget",
        entityId: row.id,
        budgetId: row.id,
        departmentId: row.departmentId,
        entityTitle: row.title,
        actorOrgUserId: opts.actorOrgUserId,
        actorRoleName: opts.actorRoleName,
        actorDepartmentId: opts.actorDepartmentId || row.departmentId,
      });
      if (!started.ok) {
        throw new TxAbort({
          ok: false,
          error: started.error,
          code: started.code,
          status: started.code === "NO_ELIGIBLE_ASSIGNEES" ? 400 : 409,
        });
      }

      const updated = await db.projectOrgBudget.update({
        where: { id: row.id },
        data: {
          status: OrgBudgetStatus.SUBMITTED,
          submittedAt: new Date(),
        },
        include: budgetInclude,
      });
      return { ok: true, started, updated };
    }),
  );
  if (!outcome.ok) return outcome;
  const { started, updated } = outcome;

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_BUDGET_SUBMITTED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      budgetId: row.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      departmentId: row.departmentId,
      instanceId: started.instance.id,
      previousStatus: row.status,
      newStatus: OrgBudgetStatus.SUBMITTED,
    },
  });

  return {
    ok: true,
    budget: serializeBudget(updated),
    workflow: {
      instanceId: started.instance.id,
      processName: started.processName,
      tasksCreated: started.tasks?.length || 0,
    },
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   taskId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   actorDepartmentId?: string | null;
 *   decision: import("@prisma/client").OrgWorkflowDecision;
 *   comment?: string;
 * }} opts
 */
export async function actOnBudgetTask(prisma, opts) {
  return completeWorkflowTask(prisma, {
    taskId: opts.taskId,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    actorDepartmentId: opts.actorDepartmentId || null,
    decision: opts.decision,
    comment: opts.comment,
  });
}
