import { checkActingModeForTask } from "@/lib/projects/committee-context";
import { orgOpsSlateListWhere, resolveCurrentOrgSlateId } from "@/lib/academic/org-academic-slate";
import { PROCUREMENT_STAGE_PAGES } from "@/lib/projects/procurement-stage-pages";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import { isReceiveGoodsStep, procurementTaskStage } from "@/lib/projects/procurement-task-stage";

const DEPARTMENT_SCOPED_ROLES = new Set([
  "User Department Officer",
  "User Department",
  "Head User Department",
  "Head of User Department",
]);

const latest = { orderBy: { createdAt: /** @type {const} */ ("desc") }, take: 1 };
const supplierName = { select: { name: true } };
const personName = { select: { firstName: true, lastName: true } };

/** @param {{ firstName?: string; lastName?: string } | null | undefined} p */
function fullName(p) {
  return p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : "";
}

/** @param {unknown} v */
function money(v) {
  return v == null ? null : Number(v);
}

/**
 * Status of one section only: "Pending {step} by {role}" while that section's workflow step
 * is open, otherwise derived from the section's records.
 * @param {string | null} stageKey
 * @param {any} r
 * @param {any} inst
 * @param {any} head
 * @returns {{ label: string; color: string; outlined?: boolean } | null}
 */
function sectionStatus(stageKey, r, inst, head) {
  if (!stageKey) return null;
  if (
    stageKey === "delivery" &&
    !r.deliveries?.length &&
    (r.purchaseInstructions?.[0]?.status === "ISSUED" || r.lpos?.[0]?.status === "ISSUED")
  ) {
    return { label: "Awaiting provider acceptance", color: "warning" };
  }
  if (
    stageKey === "delivery" &&
    head &&
    isReceiveGoodsStep(head.title) &&
    Array.isArray(r.deliveryNotes) &&
    !r.deliveryNotes.length
  ) {
    return { label: "Awaiting delivery", color: "warning" };
  }
  const active = inst && ["ACTIVE", "IN_PROGRESS"].includes(inst.status);
  if (active && head && procurementTaskStage(head.title) === stageKey) {
    const step = String(head.title).split(":")[0].trim();
    const action = step ? step.charAt(0).toLowerCase() + step.slice(1) : "action";
    return {
      label: `Pending ${action}${head.requiredRoleName ? ` by ${head.requiredRoleName}` : ""}`,
      color: "warning",
    };
  }
  return describeProcurementStage(stageKey, r).status;
}

/**
 * Per stage: which procurements belong on the page, what "recorded" means, the
 * relation to load and how to summarise the stage record for the row.
 * @type {Record<string, { where?: object; recorded: object; include: object; record: (row: any) => any }>}
 */
const STAGE_QUERIES = {
  solicitations: {
    where: { procurementMethod: { not: "MICRO" } },
    recorded: { solicitations: { some: { status: { notIn: ["DRAFT", "REVIEW", "APPROVED"] } } } },
    include: {
      solicitations: { ...latest, select: { title: true, status: true, closingDate: true, createdAt: true } },
      offers: { select: { status: true } },
      evaluationReports: { ...latest, select: { status: true } },
      awards: { ...latest, select: { status: true } },
    },
    record: (r) => {
      const s = r.solicitations?.[0];
      if (!s) return null;
      const offers = (r.offers || []).filter((o) => !["WITHDRAWN", "LATE"].includes(o.status)).length;
      return {
        reference: `${s.title} · ${offers} offer${offers === 1 ? "" : "s"}`,
        status: s.status,
        date: s.closingDate || s.createdAt,
      };
    },
  },
  evaluations: {
    where: { procurementMethod: { not: "MICRO" } },
    recorded: { evaluationReports: { some: {} } },
    include: {
      solicitations: { ...latest, select: { status: true } },
      evaluationReports: {
        ...latest,
        select: {
          status: true,
          evaluatedAmount: true,
          approvedAt: true,
          createdAt: true,
          recommendedSupplier: supplierName,
        },
      },
      awards: { ...latest, select: { status: true } },
    },
    record: (r) => {
      const e = r.evaluationReports?.[0];
      return e
        ? {
            reference: e.recommendedSupplier?.name || "No recommendation",
            amount: money(e.evaluatedAmount),
            status: e.status,
            date: e.approvedAt || e.createdAt,
          }
        : null;
    },
  },
  awards: {
    where: { procurementMethod: { not: "MICRO" } },
    recorded: { awards: { some: {} } },
    include: { awards: { ...latest, include: { supplier: supplierName } } },
    record: (r) => {
      const a = r.awards?.[0];
      return a
        ? {
            reference: a.supplier?.name || "—",
            amount: money(a.awardedAmount),
            status: a.status,
            date: a.awardDate || a.createdAt,
          }
        : null;
    },
  },
  "purchase-instructions": {
    where: { procurementMethod: "MICRO" },
    recorded: { purchaseInstructions: { some: {} } },
    include: { purchaseInstructions: { ...latest, include: { supplier: supplierName } } },
    record: (r) => {
      const pi = r.purchaseInstructions?.[0];
      return pi
        ? {
            reference: `${pi.instructionNumber} · ${pi.supplier?.name || "—"}`,
            amount: money(pi.amount),
            status: pi.status,
            date: pi.issuedAt || pi.createdAt,
          }
        : null;
    },
  },
  contracts: {
    where: { procurementMethod: { not: "MICRO" } },
    recorded: { OR: [{ lpos: { some: {} } }, { contracts: { some: {} } }] },
    include: {
      lpos: { ...latest, include: { supplier: supplierName } },
      contracts: { ...latest, include: { supplier: supplierName } },
    },
    record: (r) => {
      const c = r.contracts?.[0];
      if (c) {
        return {
          kind: "Contract",
          reference: `${c.contractNumber} · ${c.supplier?.name || "—"}`,
          amount: money(c.contractValue),
          status: c.status,
          date: c.issuedAt || c.createdAt,
        };
      }
      const l = r.lpos?.[0];
      if (l) {
        return {
          kind: "LPO",
          reference: `${l.lpoNumber} · ${l.supplier?.name || "—"}`,
          amount: money(l.lpoValue),
          status: l.status,
          date: l.issuedAt || l.createdAt,
        };
      }
      return null;
    },
  },
  deliveries: {
    recorded: { deliveries: { some: {} } },
    include: {
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { inspection: { select: { status: true } }, recordedBy: personName },
      },
      deliveryNotes: {
        where: { status: "SUBMITTED" },
        ...latest,
        select: { status: true, noteNumber: true, dispatchedAt: true },
      },
      purchaseInstructions: { ...latest, select: { status: true } },
      lpos: { ...latest, select: { status: true } },
    },
    record: (r) => {
      const d = r.deliveries?.[0];
      return d
        ? {
            reference: d.recordedBy ? `Recorded by ${fullName(d.recordedBy)}` : "Delivery recorded",
            status: d.status,
            secondaryStatus: d.inspection ? `Inspection ${d.inspection.status}` : "Awaiting inspection",
            date: d.deliveryDate || d.createdAt,
          }
        : null;
    },
  },
  invoices: {
    recorded: { invoices: { some: {} } },
    include: {
      invoices: { orderBy: { createdAt: "desc" }, take: 20, include: { supplier: supplierName } },
    },
    record: (r) => {
      const i = r.invoices?.[0];
      return i
        ? {
            reference: `${i.invoiceNumber} · ${i.supplier?.name || "—"}`,
            amount: money(i.amount),
            status: i.status,
            date: i.invoiceDate || i.createdAt,
          }
        : null;
    },
  },
  payments: {
    recorded: { payments: { some: {} } },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 20, include: { approvedBy: personName } },
    },
    record: (r) => {
      const p = r.payments?.[0];
      return p
        ? {
            reference: p.paymentReference || (p.approvedBy ? `Approved by ${fullName(p.approvedBy)}` : "—"),
            amount: money(p.amount),
            status: p.status,
            date: p.paymentDate || p.createdAt,
          }
        : null;
    },
  },
  closures: {
    recorded: { status: "CLOSED" },
    include: { closedBy: personName },
    record: (r) =>
      r.status === "CLOSED"
        ? {
            reference: r.closedBy ? `Closed by ${fullName(r.closedBy)}` : "Closed",
            status: "CLOSED",
            secondaryStatus: r.closureRemarks || null,
            date: r.closedAt,
          }
        : null,
  },
};

/**
 * Paginated procurement rows for one Procurements sub-page, with the stage record,
 * the current workflow step and whether it is the viewer's turn.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   stage: string;
 *   orgUser: any | null;
 *   activeCommittee: any | null;
 *   page: number;
 *   pageSize: number;
 *   filter: "all" | "recorded" | "pending" | "mine";
 *   search: string;
 * }} opts
 */
export async function listProcurementStage(prisma, opts) {
  const q = STAGE_QUERIES[opts.stage];
  if (!q || !PROCUREMENT_STAGE_PAGES[opts.stage]) {
    return { ok: false, status: 404, error: "Not found." };
  }

  /** @type {any[]} */
  const and = [orgOpsSlateListWhere(await resolveCurrentOrgSlateId(prisma, opts.projectId))];
  if (q.where) and.push(q.where);
  const role = opts.orgUser?.projectOrgRole?.name || "";
  if (opts.orgUser && DEPARTMENT_SCOPED_ROLES.has(role) && opts.orgUser.departmentId) {
    and.push({ departmentId: opts.orgUser.departmentId });
  }
  if (opts.search) {
    and.push({
      OR: [{ procurementNumber: { contains: opts.search } }, { title: { contains: opts.search } }],
    });
  }

  const openTask = { status: { in: ["PENDING", "IN_PROGRESS"] } };
  if (opts.filter === "mine" && opts.orgUser) {
    and.push({ instances: { some: { tasks: { some: { ...openTask, assigneeOrgUserId: opts.orgUser.id } } } } });
  } else if (opts.filter === "recorded") {
    and.push(q.recorded);
  } else if (opts.filter === "pending") {
    and.push({ NOT: q.recorded });
  }

  const stageKey = PROCUREMENT_STAGE_PAGES[opts.stage].stage;
  const where = { projectId: opts.projectId, AND: and };
  const [total, rows] = await Promise.all([
    prisma.projectOrgProcurement.count({ where }),
    prisma.projectOrgProcurement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        department: { select: { name: true } },
        ...q.include,
        instances: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            status: true,
            currentStepNumber: true,
            processFlow: { select: { name: true, _count: { select: { items: true } } } },
            tasks: {
              where: openTask,
              select: {
                id: true,
                title: true,
                stepNumber: true,
                requiredRoleName: true,
                assigneeOrgUserId: true,
                assignee: personName,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    ok: true,
    total,
    rows: rows.map((r) => {
      const inst = r.instances?.[0] || null;
      const tasks = (inst?.tasks || []).filter((t) => t.stepNumber === inst?.currentStepNumber);
      const mine = opts.orgUser ? tasks.find((t) => t.assigneeOrgUserId === opts.orgUser.id) : null;
      let turn = "WAITING";
      /** @type {string | null} */
      let turnMessage = null;
      if (inst?.status === "COMPLETED") turn = "DONE";
      else if (mine) {
        const mode = checkActingModeForTask(mine, opts.activeCommittee);
        turn = mode.ok ? "YOURS" : "OTHER_MODE";
        turnMessage = mode.ok ? null : mode.error;
      }
      const head = tasks[0];
      return {
        sectionStatus: sectionStatus(stageKey, r, inst, head),
        id: r.id,
        procurementNumber: r.procurementNumber,
        title: r.title,
        procurementMethod: r.procurementMethod,
        status: r.status,
        department: r.department?.name || null,
        record: q.record(r),
        workflow: inst
          ? {
              processName: inst.processFlow?.name || null,
              status: inst.status,
              currentStepNumber: inst.currentStepNumber,
              totalSteps: inst.processFlow?._count?.items || 0,
              currentStepLabel: head ? String(head.title).split(":")[0].trim() : null,
              waitingOnRole: head?.requiredRoleName || null,
              waitingOnPeople: tasks.map((t) => fullName(t.assignee)).filter(Boolean),
            }
          : null,
        turn,
        turnMessage,
      };
    }),
  };
}
