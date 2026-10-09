import { OrgRequisitionStatus } from "@prisma/client";

const DEAD_ORDER_STATUSES = new Set(["CANCELLED", "DECLINED", "REJECTED"]);
const COUNTED_INVOICE_STATUSES = new Set(["RECEIVED", "CERTIFIED", "VERIFIED", "APPROVED_FOR_PAYMENT"]);

/** @param {any} v */
const num = (v) => Number(v ?? 0) || 0;

/**
 * Live order value of a procurement: contract → LPO → purchase instruction (ignoring cancelled ones).
 * @param {any} p
 */
function orderOf(p) {
  const contract = (p.contracts || []).find((c) => !DEAD_ORDER_STATUSES.has(c.status));
  if (contract) return { kind: "Contract", number: contract.contractNumber, value: num(contract.contractValue) };
  const lpo = (p.lpos || []).find((l) => !DEAD_ORDER_STATUSES.has(l.status));
  if (lpo) return { kind: "LPO", number: lpo.lpoNumber, value: num(lpo.lpoValue) };
  const pi = (p.purchaseInstructions || []).find((i) => !DEAD_ORDER_STATUSES.has(i.status));
  if (pi) return { kind: "PI", number: pi.instructionNumber, value: num(pi.amount) };
  return null;
}

/**
 * Budget execution for one budget: approved vs committed vs spent per line, plus the
 * requisitions/procurements charged to it (paginated, newest first).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; budgetId: string; page: number; pageSize: number; lineId?: string | null }} opts
 */
export async function loadBudgetUtilisation(prisma, opts) {
  const lines = await prisma.projectOrgBudgetLine.findMany({
    where: { projectId: opts.projectId, budgetId: opts.budgetId },
    orderBy: [{ code: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, name: true, approvedAmount: true, committedAmount: true },
  });
  const lineIds = lines.map((l) => l.id);
  const lineById = Object.fromEntries(lines.map((l) => [l.id, l]));

  const requisitions = lineIds.length
    ? await prisma.projectOrgRequisition.findMany({
        where: {
          projectId: opts.projectId,
          budgetLineId: { in: lineIds },
          status: { not: OrgRequisitionStatus.DRAFT },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          requisitionReference: true,
          title: true,
          status: true,
          estimatedTotalValue: true,
          budgetLineId: true,
          createdAt: true,
          approvedAt: true,
          department: { select: { name: true } },
          procurements: {
            select: {
              id: true,
              procurementNumber: true,
              status: true,
              purchaseInstructions: {
                orderBy: { createdAt: "desc" },
                select: { instructionNumber: true, amount: true, status: true },
              },
              lpos: { orderBy: { createdAt: "desc" }, select: { lpoNumber: true, lpoValue: true, status: true } },
              contracts: {
                orderBy: { createdAt: "desc" },
                select: { contractNumber: true, contractValue: true, status: true },
              },
              invoices: { select: { amount: true, status: true } },
              payments: { select: { amount: true, status: true } },
            },
          },
        },
      })
    : [];

  /** @type {Record<string, { spent: number; invoiced: number; ordered: number; pending: number; count: number }>} */
  const perLine = Object.fromEntries(
    lineIds.map((id) => [id, { spent: 0, invoiced: 0, ordered: 0, pending: 0, count: 0 }]),
  );

  const activity = requisitions.map((r) => {
    const p = r.procurements[0] || null;
    const order = p ? orderOf(p) : null;
    const invoiced = p
      ? p.invoices.filter((i) => COUNTED_INVOICE_STATUSES.has(i.status)).reduce((s, i) => s + num(i.amount), 0)
      : 0;
    const paid = p ? p.payments.filter((x) => x.status === "PAID").reduce((s, x) => s + num(x.amount), 0) : 0;
    const estimate = num(r.estimatedTotalValue);
    const agg = r.budgetLineId ? perLine[r.budgetLineId] : null;
    if (agg) {
      agg.count += 1;
      agg.spent += paid;
      agg.invoiced += invoiced;
      agg.ordered += order?.value || 0;
      if (["SUBMITTED", "UNDER_REVIEW", "RETURNED"].includes(r.status)) agg.pending += estimate;
    }
    const line = r.budgetLineId ? lineById[r.budgetLineId] : null;
    return {
      id: r.id,
      requisitionReference: r.requisitionReference || null,
      title: r.title,
      department: r.department?.name || null,
      budgetLine: line ? { id: line.id, code: line.code, name: line.name } : null,
      requisitionStatus: r.status,
      date: r.approvedAt || r.createdAt,
      estimate: estimate.toFixed(2),
      procurement: p ? { id: p.id, procurementNumber: p.procurementNumber, status: p.status } : null,
      order: order ? { kind: order.kind, number: order.number, value: order.value.toFixed(2) } : null,
      invoiced: invoiced.toFixed(2),
      paid: paid.toFixed(2),
    };
  });

  const lineRows = lines.map((l) => {
    const approved = num(l.approvedAmount);
    const committed = num(l.committedAmount);
    const agg = perLine[l.id];
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      approved: approved.toFixed(2),
      committed: committed.toFixed(2),
      pending: agg.pending.toFixed(2),
      ordered: agg.ordered.toFixed(2),
      invoiced: agg.invoiced.toFixed(2),
      spent: agg.spent.toFixed(2),
      available: (approved - committed).toFixed(2),
      requisitionCount: agg.count,
    };
  });

  const sum = (/** @type {keyof typeof lineRows[number]} */ k) =>
    lineRows.reduce((s, l) => s + num(l[k]), 0).toFixed(2);

  const filtered = opts.lineId ? activity.filter((a) => a.budgetLine?.id === opts.lineId) : activity;
  const skip = (opts.page - 1) * opts.pageSize;

  return {
    totals: {
      approved: sum("approved"),
      committed: sum("committed"),
      pending: sum("pending"),
      ordered: sum("ordered"),
      invoiced: sum("invoiced"),
      spent: sum("spent"),
      available: sum("available"),
    },
    lines: lineRows,
    activity: {
      total: filtered.length,
      page: opts.page,
      pageSize: opts.pageSize,
      items: filtered.slice(skip, skip + opts.pageSize),
    },
  };
}
