import { formatMoneyUGX } from "@/lib/money";
import { formatUserDisplayName } from "@/lib/user-display";
import { humanizeDomainEvent, humanizeWorkflowDecision } from "@/lib/projects/procurement-timeline";
import { describeProcurementStage } from "@/lib/projects/procurement-stage-status";
import {
  procurementStageLabel,
  procurementStagesForMethod,
  procurementTaskStage,
} from "@/lib/projects/procurement-task-stage";
import { procurementInclude } from "@/lib/projects/procurements";
import { domainEventSection } from "@/lib/projects/procurement-section-data";
import {
  BASELINE_PROCESS_TEMPLATES,
  METHOD_PROCESS_BY_ENUM,
  TRIGGER_TO_PROCESS_CODE,
} from "@/lib/projects/process-catalogue";
import { EXPLORER_SECTION_KEYS } from "@/lib/academic/examiner-org-explorer-sections";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";

/** Audit events never shown in item histories (duplicates or noise). */
const EXCLUDED_EVENTS = new Set([
  "PROJECT_ORG_WORKFLOW_TASK_COMPLETED",
  "PROJECT_ORG_USER_LOGIN_FAILURE",
  "PROJECT_ORG_PROVIDER_PORTAL_LOGOUT",
]);

/** Audit meta keys that point at the record an event belongs to. */
const ENTITY_KEYS = [
  "entityId",
  "financialYearId",
  "planningPeriodId",
  "budgetId",
  "procurementPlanId",
  "planId",
  "requisitionId",
  "procurementId",
  "solicitationId",
  "offerId",
  "evaluationReportId",
  "postQualificationReportId",
  "awardId",
  "contractId",
  "lpoId",
  "purchaseInstructionId",
  "deliveryId",
  "deliveryNoteId",
  "invoiceId",
  "paymentId",
  "providerId",
  "supplierId",
  "committeeId",
  "departmentId",
  "projectOrgUserId",
  "orgUserId",
  "adoptionId",
  "processFlowId",
  "recommendationId",
];

const EVENT_LABELS = {
  PROJECT_ORG_USER_LOGIN_SUCCESS: "Signed in",
  PROJECT_ORG_PROVIDER_PORTAL_LOGIN: "Signed in to provider portal",
  PROJECT_ORG_PROCESS_FLOW_ADOPTED: "Adopted process",
  PROJECT_ORG_PROCUREMENT_CREATED: "Created procurement",
  PROJECT_ORG_PROCUREMENT_METHOD_SELECTED: "Selected procurement method",
  PROJECT_ORG_PROCUREMENT_CLOSED: "Closed procurement",
};

const PAGE_SIZE_MAX = 50;

/**
 * The observed student's personal organisation, or null when the id is not a student / demo
 * participant or they have no organisation yet.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} studentUserId
 * @returns {Promise<{ id: string; ownerUserId: string } | null>}
 */
export async function resolveObservedStudentOrg(db, studentUserId) {
  const user = await db.user.findUnique({
    where: { id: studentUserId },
    select: {
      id: true,
      studentProfile: { select: { studentNumber: true } },
      academicEnrollments: { select: { participationType: true } },
    },
  });
  if (!user) return null;
  const isDemo = user.academicEnrollments.some((e) =>
    ["EXAMINER_DEMO", "SYSTEM_ADMIN_DEMO"].includes(e.participationType),
  );
  if (!user.studentProfile && !isDemo) return null;
  const org = await findStudentPersonalOrg(db, user.id);
  return org ? { id: org.id, ownerUserId: user.id } : null;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** @param {any} u */
function personName(u) {
  if (!u) return null;
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || null;
}

/** @param {unknown} s */
function humanEnum(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** @param {unknown} v */
function money(v) {
  if (v == null || v === "") return null;
  return formatMoneyUGX(v?.toString?.() ?? v);
}

/** @param {unknown} v */
function qty(v) {
  if (v == null || v === "") return "";
  const n = Number(v?.toString?.() ?? v);
  return Number.isFinite(n) ? String(n) : String(v);
}

/** @param {string} title */
function taskHead(title) {
  return String(title || "").split(":")[0].trim();
}

/**
 * Semantic tone for a status or event (blue info, yellow pending, red error, green success).
 * @param {unknown} value
 * @returns {"success" | "error" | "warning" | "info"}
 */
export function toneFor(value) {
  const t = String(value || "").toUpperCase();
  if (/REJECT|DECLIN|CANCEL|DELET|SUSPEND|WITHDR|LATE|FAIL|BLACKLIST/.test(t)) return "error";
  if (/RETURN|DRAFT|PENDING|SUBMITTED|UPCOMING|NOT_STARTED|NO_RESPONSE|UNDER_REVIEW|RECEIVED|INACTIVE/.test(t)) {
    return "warning";
  }
  if (/APPROV|ACCEPT|PAID|VERIF|CLOSED|COMPLET|ACTIVE/.test(t)) return "success";
  return "info";
}

/** @param {unknown} status */
function statusOf(status) {
  if (!status) return null;
  return { label: humanEnum(status), tone: toneFor(status) };
}

/**
 * Drop empty facts so cards stay compact.
 * @param {Array<{ label: string; value: any; kind?: string } | null | false>} list
 */
function facts(list) {
  return list.filter(
    (f) => f && f.value != null && f.value !== "" && !(Array.isArray(f.value) && !f.value.length),
  );
}

/** @param {any[]} rows @param {string} q */
function matchesQuery(rows, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => String(r.search || "").toLowerCase().includes(needle));
}

/* ------------------------------------------------------------------ */
/* History index                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 */
async function loadProjectAudits(db, projectId) {
  const select = { id: true, eventType: true, actorUserId: true, meta: true, createdAt: true };
  return db.auditLog.findMany({
    where: { projectId, eventType: { startsWith: "PROJECT_ORG_" } },
    orderBy: { createdAt: "asc" },
    take: 8000,
    select,
  });
}

/**
 * Every recorded action in one organisation, indexed by the records it touched, so each item
 * can show its own "who did what, in which role, when".
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ id: string; ownerUserId?: string | null }} org
 */
export async function loadOrgHistory(db, org) {
  const projectId = org.id;
  const [audits, actions, openTasks, orgUsers, providers] = await Promise.all([
    loadProjectAudits(db, projectId),
    db.projectOrgWorkflowAction.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: 8000,
      select: {
        id: true,
        decision: true,
        comment: true,
        actorOrgUserId: true,
        actorRoleName: true,
        committeeRole: true,
        previousStatus: true,
        newStatus: true,
        createdAt: true,
        metadata: true,
        task: { select: { title: true } },
        instance: {
          select: {
            entityId: true,
            budgetId: true,
            procurementPlanId: true,
            requisitionId: true,
            procurementId: true,
            triggerKey: true,
            processFlow: { select: { name: true } },
          },
        },
      },
    }),
    db.projectOrgWorkflowTask.findMany({
      where: { projectId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        createdAt: true,
        assignee: { select: { firstName: true, lastName: true } },
        instance: {
          select: {
            entityId: true,
            budgetId: true,
            procurementPlanId: true,
            requisitionId: true,
            procurementId: true,
          },
        },
      },
    }),
    db.projectOrgUser.findMany({
      where: { projectId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isProjectAdmin: true,
        projectOrgRole: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
    db.projectOrgProvider.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);

  /** @type {Map<string, { name: string; role: string | null; department: string | null }>} */
  const people = new Map(
    orgUsers.map((u) => [
      u.id,
      {
        name: personName(u) || "—",
        role: u.isProjectAdmin ? "Admin" : u.projectOrgRole?.name || null,
        department: u.department?.name || null,
      },
    ]),
  );
  /** @type {Map<string, string>} */
  const providerNames = new Map(providers.map((p) => [p.id, p.name]));

  const platformUserIds = [...new Set(audits.map((a) => a.actorUserId).filter(Boolean))];
  const platformUsers = platformUserIds.length
    ? await db.user.findMany({
        where: { id: { in: /** @type {string[]} */ (platformUserIds) } },
        select: { id: true, firstName: true, middleName: true, lastName: true, email: true },
      })
    : [];
  const platformNames = new Map(platformUsers.map((u) => [u.id, formatUserDisplayName(u)]));

  /** @type {Map<string, any[]>} */
  const byId = new Map();
  /** @type {Map<string, number>} */
  const actionsByActor = new Map();
  /** @type {Map<string, { count: number; last: Date | null }>} */
  const logins = new Map();

  /** @param {string | null | undefined} id @param {any} entry */
  const index = (id, entry) => {
    if (!id) return;
    let list = byId.get(id);
    if (!list) {
      list = [];
      byId.set(id, list);
    }
    list.push(entry);
  };

  for (const a of audits) {
    if (EXCLUDED_EVENTS.has(a.eventType)) continue;
    const meta = a.meta && typeof a.meta === "object" && !Array.isArray(a.meta) ? /** @type {any} */ (a.meta) : {};

    if (a.eventType === "PROJECT_ORG_USER_LOGIN_SUCCESS" && typeof meta.projectOrgUserId === "string") {
      const prev = logins.get(meta.projectOrgUserId) || { count: 0, last: null };
      logins.set(meta.projectOrgUserId, { count: prev.count + 1, last: a.createdAt });
    }

    /** @type {{ name: string | null; role: string | null }} */
    let actor = { name: null, role: null };
    const orgActorId =
      typeof meta.actorOrgUserId === "string"
        ? meta.actorOrgUserId
        : a.eventType === "PROJECT_ORG_USER_LOGIN_SUCCESS" && typeof meta.projectOrgUserId === "string"
          ? meta.projectOrgUserId
          : null;
    if (orgActorId && people.has(orgActorId)) {
      const p = people.get(orgActorId);
      actor = { name: p?.name || null, role: meta.actorRoleName || meta.roleName || p?.role || null };
      actionsByActor.set(orgActorId, (actionsByActor.get(orgActorId) || 0) + 1);
    } else if (typeof meta.actorName === "string" && meta.actorName.trim()) {
      actor = { name: meta.actorName.trim(), role: meta.actorRoleName || "Provider" };
    } else if (a.eventType === "PROJECT_ORG_PROVIDER_PORTAL_LOGIN" && typeof meta.providerId === "string") {
      actor = { name: providerNames.get(meta.providerId) || "Provider", role: "Provider" };
    } else if (a.actorUserId) {
      actor = {
        name: platformNames.get(a.actorUserId) || null,
        role: a.actorUserId === org.ownerUserId ? "Admin" : meta.actorRoleName || null,
      };
    } else if (typeof meta.actorRoleName === "string") {
      const provider =
        /^provider/i.test(meta.actorRoleName) && typeof meta.supplierId === "string"
          ? providerNames.get(meta.supplierId) || null
          : null;
      actor = { name: provider, role: meta.actorRoleName };
    }

    const amount = meta.amount ?? meta.awardedAmount ?? meta.contractValue ?? meta.lpoValue ?? null;
    const prevStatus = meta.previousStatus || null;
    const nextStatus = meta.newStatus || null;
    const supplierName = typeof meta.supplierId === "string" ? providerNames.get(meta.supplierId) : null;
    const details = [
      prevStatus && nextStatus ? `${humanEnum(prevStatus)} → ${humanEnum(nextStatus)}` : null,
      nextStatus && !prevStatus ? humanEnum(nextStatus) : null,
      supplierName && !/^Provider/i.test(actor.role || "") ? supplierName : null,
      amount != null && String(amount).trim() !== "" ? money(amount) : null,
      typeof meta.procurementMethod === "string" ? METHOD_PROCESS_BY_ENUM[meta.procurementMethod]?.label || humanEnum(meta.procurementMethod) : null,
      typeof meta.committeeRole === "string" ? humanEnum(meta.committeeRole) : null,
      typeof meta.inspectionStatus === "string" ? humanEnum(meta.inspectionStatus) : null,
    ].filter(Boolean);

    let action = EVENT_LABELS[a.eventType] || humanizeDomainEvent(a.eventType);
    if (a.eventType === "PROJECT_ORG_WORKFLOW_STARTED") {
      action = `Started ${meta.processName || "workflow"}`;
    } else if (a.eventType === "PROJECT_ORG_PROCESS_FLOW_ADOPTED" && meta.processName) {
      action = `Adopted ${meta.processName}`;
    }

    const refs = new Set();
    for (const key of ENTITY_KEYS) {
      if (typeof meta[key] === "string" && meta[key]) refs.add(meta[key]);
    }
    if (Array.isArray(meta.providerIds)) {
      for (const id of meta.providerIds) if (typeof id === "string") refs.add(id);
    }

    const entry = {
      id: `a:${a.id}`,
      source: "audit",
      at: a.createdAt,
      action,
      actor: actor.name,
      role: actor.role,
      committeeRole: null,
      comment: typeof meta.comment === "string" ? meta.comment : typeof meta.remarks === "string" ? meta.remarks : null,
      detail: details.join(" · ") || null,
      tone: toneFor(a.eventType.replace(/^PROJECT_ORG_/, "")),
      eventType: a.eventType,
      triggerKey: typeof meta.triggerKey === "string" ? meta.triggerKey : null,
      taskTitle: null,
      decision: typeof meta.decision === "string" ? meta.decision : null,
      instanceRef: null,
      refs: [...refs],
    };
    for (const id of refs) index(/** @type {string} */ (id), entry);
  }

  for (const w of actions) {
    // Submission is recorded by the richer *_SUBMITTED audit event.
    if (w.decision === "SUBMIT" && !w.task) continue;
    const meta = w.metadata && typeof w.metadata === "object" ? /** @type {any} */ (w.metadata) : {};
    const title = w.task?.title || (typeof meta.taskTitle === "string" ? meta.taskTitle : "");
    const person = w.actorOrgUserId ? people.get(w.actorOrgUserId) : null;
    if (w.actorOrgUserId) actionsByActor.set(w.actorOrgUserId, (actionsByActor.get(w.actorOrgUserId) || 0) + 1);
    const inst = w.instance;
    const refs = [
      ...new Set([inst?.entityId, inst?.budgetId, inst?.procurementPlanId, inst?.requisitionId, inst?.procurementId].filter(Boolean)),
    ];
    const entry = {
      id: `w:${w.id}`,
      source: "workflow",
      at: w.createdAt,
      action: taskHead(title) || humanizeWorkflowDecision(w.decision),
      actor: person?.name || null,
      role: w.actorRoleName || person?.role || null,
      committeeRole: w.committeeRole ? humanEnum(w.committeeRole) : null,
      comment: w.comment || null,
      detail:
        [
          w.decision === "COMPLETE" ? null : humanizeWorkflowDecision(w.decision),
          w.previousStatus && w.newStatus && w.previousStatus !== w.newStatus
            ? `${humanEnum(w.previousStatus)} → ${humanEnum(w.newStatus)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      tone: toneFor(w.decision),
      eventType: null,
      triggerKey: inst?.triggerKey || null,
      taskTitle: title || null,
      decision: w.decision,
      instanceRef: inst?.procurementId ? "procurement" : inst?.requisitionId ? "requisition" : "other",
      processName: inst?.processFlow?.name || null,
      refs,
    };
    for (const id of refs) index(/** @type {string} */ (id), entry);
  }

  /** @type {Map<string, any[]>} */
  const pendingById = new Map();
  for (const t of openTasks) {
    const item = {
      title: taskHead(t.title),
      role: t.requiredRoleName || null,
      assignee: personName(t.assignee),
      since: t.createdAt,
    };
    const inst = t.instance;
    for (const id of new Set([inst?.entityId, inst?.budgetId, inst?.procurementPlanId, inst?.requisitionId, inst?.procurementId])) {
      if (!id) continue;
      const list = pendingById.get(id) || [];
      list.push(item);
      pendingById.set(id, list);
    }
  }

  /**
   * Chronological history for one or more record ids.
   * @param {Array<string | null | undefined>} ids
   * @param {{ types?: RegExp; limit?: number; filter?: (e: any) => boolean }} [opts]
   */
  const history = (ids, opts = {}) => {
    /** @type {Map<string, any>} */
    const seen = new Map();
    for (const id of ids) {
      if (!id) continue;
      for (const e of byId.get(id) || []) {
        if (opts.types && !(e.eventType && opts.types.test(e.eventType))) continue;
        if (opts.filter && !opts.filter(e)) continue;
        seen.set(e.id, e);
      }
    }
    const list = [...seen.values()].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    return opts.limit && list.length > opts.limit ? list.slice(-opts.limit) : list;
  };

  /** @param {Array<string | null | undefined>} ids */
  const pending = (ids) => {
    const out = [];
    const seen = new Set();
    for (const id of ids) {
      for (const p of (id && pendingById.get(id)) || []) {
        const key = `${p.title}|${p.role}|${p.assignee}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    }
    return out;
  };

  /** @param {string | null | undefined} id */
  const person = (id) => {
    const p = id ? people.get(id) : null;
    return p ? { name: p.name, role: p.role } : null;
  };

  return {
    history,
    pending,
    person,
    providerName: (/** @type {string | null | undefined} */ id) => (id ? providerNames.get(id) || null : null),
    actionsByActor,
    logins,
  };
}

/** Strip index-only fields before sending to the client. @param {any} e */
function publicEntry(e) {
  return {
    id: e.id,
    at: e.at,
    action: e.action,
    actor: e.actor,
    role: e.role,
    committeeRole: e.committeeRole,
    comment: e.comment,
    detail: e.detail,
    tone: e.tone,
    ...(e.recordLabel ? { recordLabel: e.recordLabel } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Procurement stage classification                                     */
/* ------------------------------------------------------------------ */

/** @param {string | null | undefined} triggerKey */
function stageForTrigger(triggerKey) {
  const t = String(triggerKey || "");
  if (t.startsWith("REQUISITION_")) return "requisition";
  if (/^(MICRO_PROCUREMENT|QUOTATION|TENDER)_STARTED$|^PROCUREMENT_METHOD_SELECTED$/.test(t)) return "method";
  if (/^(EVALUATION|POST_QUALIFICATION)_STARTED$/.test(t)) return "evaluation";
  if (/^(LPO|CONTRACT)_STARTED$/.test(t)) return "contract";
  if (t === "INVOICE_STARTED") return "invoice";
  if (t === "PAYMENT_STARTED") return "payment";
  return "other";
}

/**
 * Which procurement stage an entry belongs to.
 * @param {any} e
 */
export function stageOfEntry(e) {
  if (e.source === "workflow") {
    const title = String(e.taskTitle || "");
    if (e.decision === "SELECT_METHOD") return "method";
    if (e.instanceRef === "requisition") return /method/i.test(title) ? "method" : "requisition";
    const stage = procurementTaskStage(title);
    if (stage !== "task") return stage;
    if (/purchase instruction/i.test(title)) return "contract";
    if (/method/i.test(title)) return "method";
    if (/requisition/i.test(title)) return "requisition";
    return "other";
  }
  const t = String(e.eventType || "");
  if (t.startsWith("PROJECT_ORG_REQUISITION_")) return "requisition";
  if (t === "PROJECT_ORG_PROCUREMENT_CREATED" || t === "PROJECT_ORG_PROCUREMENT_METHOD_SELECTED") return "method";
  if (t.includes("RECOMMENDATION")) return "recommendation";
  if (t === "PROJECT_ORG_WORKFLOW_STARTED") return stageForTrigger(e.triggerKey);
  return domainEventSection(t) || "other";
}

/* ------------------------------------------------------------------ */
/* Item builders                                                        */
/* ------------------------------------------------------------------ */

/** @param {any} p */
function procRef(p) {
  return p
    ? { procurementId: p.id, procurementNumber: p.procurementNumber || null, procurementTitle: p.title || null }
    : {};
}

/**
 * Workflow steps of a procurement stage that are not tied to one record id.
 * @param {any} h
 * @param {string | null | undefined} procurementId
 * @param {string} stage
 */
function stageSteps(h, procurementId, stage) {
  if (!procurementId) return [];
  return h.history([procurementId], { filter: (e) => e.source === "workflow" && stageOfEntry(e) === stage });
}

/** @param {any[]} ...lists */
function mergeHistory(...lists) {
  /** @type {Map<string, any>} */
  const seen = new Map();
  for (const list of lists) for (const e of list) seen.set(e.id, e);
  return [...seen.values()].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
}

const builders = {
  /** @param {any} s @param {any[]} offers @param {any} h @param {any} proc */
  solicitation(s, offers, h, proc) {
    const live = offers.filter((o) => !["WITHDRAWN", "LATE"].includes(o.status));
    return {
      id: s.id,
      kind: s.solicitationType === "RFQ" ? "RFQ" : "Tender",
      title: s.title,
      reference: null,
      status: statusOf(s.status),
      createdAt: s.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Issued", value: s.issueDate, kind: "date" },
        { label: "Closing", value: s.closingDate, kind: "datetime" },
        { label: "Opened", value: s.openedAt, kind: "datetime" },
        { label: "Invited providers", value: s.invites?.length ? String(s.invites.length) : null },
        { label: "Offers received", value: String(live.length) },
      ]),
      table: offers.length
        ? {
            columns: ["Provider", "Amount", "Source", "Status"],
            rows: offers.map((o) => [o.supplier?.name || "—", money(o.amount) || "—", humanEnum(o.source), humanEnum(o.status)]),
          }
        : null,
      history: mergeHistory(h.history([s.id, ...offers.map((o) => o.id)]), stageSteps(h, proc?.id, "sourcing")),
      search: [s.title, proc?.procurementNumber, proc?.title].join(" "),
    };
  },

  /** @param {any} r @param {any} h @param {any} proc */
  evaluation(r, h, proc) {
    return {
      id: r.id,
      kind: "Evaluation report",
      title: `Evaluation report${proc?.procurementNumber ? ` · ${proc.procurementNumber}` : ""}`,
      reference: r.committee?.name || null,
      status: statusOf(r.status),
      createdAt: r.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Recommended provider", value: r.recommendedSupplier?.name || null },
        { label: "Evaluated amount", value: money(r.evaluatedAmount) },
        { label: "Committee", value: r.committee?.name || null },
        { label: "Approved", value: r.approvedAt, kind: "datetime" },
        { label: "Recommendation", value: r.recommendation || null, wide: true },
        { label: "Comments", value: r.comments || null, wide: true },
      ]),
      table: r.committee?.members?.length
        ? {
            columns: ["Committee member", "Role"],
            rows: r.committee.members.map((m) => [personName(m.orgUser) || "—", humanEnum(m.committeeRole)]),
          }
        : null,
      history: mergeHistory(h.history([r.id]), stageSteps(h, proc?.id, "evaluation")),
      search: [proc?.procurementNumber, proc?.title, r.recommendedSupplier?.name].join(" "),
    };
  },

  /** @param {any} r @param {any} h @param {any} proc */
  postQualification(r, h, proc) {
    return {
      id: r.id,
      kind: "Post-qualification",
      title: `Post-qualification${proc?.procurementNumber ? ` · ${proc.procurementNumber}` : ""}`,
      reference: null,
      status: statusOf(r.status),
      createdAt: r.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Provider", value: h.providerName(r.supplierId) },
        { label: "Approved", value: r.approvedAt, kind: "datetime" },
        { label: "Comments", value: r.comments || null, wide: true },
      ]),
      table: null,
      history: h.history([r.id]),
      search: [proc?.procurementNumber, proc?.title].join(" "),
    };
  },

  /** @param {any} a @param {any} h @param {any} proc */
  award(a, h, proc) {
    return {
      id: a.id,
      kind: "Award",
      title: `${a.supplier?.name || "Provider"} — ${money(a.awardedAmount) || ""}`,
      reference: a.approvalReference || null,
      status: statusOf(a.status),
      createdAt: a.createdAt,
      ...procRef(proc),
      approvedBy: a.approvedBy ? { name: personName(a.approvedBy), at: a.awardDate || null } : null,
      facts: facts([
        { label: "Provider", value: a.supplier?.name || null },
        { label: "Amount", value: money(a.awardedAmount) },
        { label: "Award date", value: a.awardDate, kind: "date" },
        { label: "Communicated", value: a.communicatedAt, kind: "datetime" },
        { label: "Accepted", value: a.acceptedAt, kind: "datetime" },
        { label: "Accepted by", value: a.acceptedByName || null },
        { label: "Declined", value: a.declinedAt, kind: "datetime" },
        { label: "Decline reason", value: a.declineReason || null, wide: true },
      ]),
      table: null,
      history: mergeHistory(h.history([a.id]), stageSteps(h, proc?.id, "award")),
      search: [proc?.procurementNumber, proc?.title, a.supplier?.name].join(" "),
    };
  },

  /** @param {any} pi @param {any} h @param {any} proc */
  purchaseInstruction(pi, h, proc) {
    return {
      id: pi.id,
      kind: "Purchase instruction",
      title: `${pi.supplier?.name || "Provider"} — ${money(pi.amount) || ""}`,
      reference: pi.instructionNumber,
      status: statusOf(pi.status),
      createdAt: pi.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Provider", value: pi.supplier?.name || null },
        { label: "Amount", value: money(pi.amount) },
        { label: "Issued", value: pi.issuedAt, kind: "datetime" },
        { label: "Issued by", value: personName(pi.issuedBy) },
        { label: "Deliver by", value: pi.requiredDeliveryDate, kind: "date" },
        { label: "Delivery address", value: pi.deliveryAddress || null },
        { label: "Accepted", value: pi.acceptedAt, kind: "datetime" },
        { label: "Accepted by", value: pi.acceptedByName || null },
        { label: "Decline reason", value: pi.declineReason || null, wide: true },
      ]),
      table: null,
      history: mergeHistory(h.history([pi.id]), stageSteps(h, proc?.id, "contract")),
      search: [pi.instructionNumber, proc?.procurementNumber, proc?.title, pi.supplier?.name].join(" "),
    };
  },

  /** @param {any} c @param {"contract" | "lpo"} type @param {any} h @param {any} proc */
  order(c, type, h, proc) {
    const number = type === "contract" ? c.contractNumber : c.lpoNumber;
    const value = type === "contract" ? c.contractValue : c.lpoValue;
    return {
      id: c.id,
      kind: type === "contract" ? "Contract" : "LPO",
      title: `${c.supplier?.name || "Provider"} — ${money(value) || ""}`,
      reference: number,
      status: statusOf(c.status),
      createdAt: c.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Provider", value: c.supplier?.name || null },
        { label: "Value", value: money(value) },
        { label: "Start", value: c.startDate, kind: "date" },
        { label: "End", value: c.endDate, kind: "date" },
        { label: "Issued", value: c.issuedAt, kind: "datetime" },
        { label: "Accepted", value: c.acceptedAt, kind: "datetime" },
        { label: "Accepted by", value: c.acceptedByName || null },
        { label: "Delivery address", value: c.deliveryAddress || null },
        { label: "Decline reason", value: c.declineReason || null, wide: true },
      ]),
      table: null,
      history: mergeHistory(h.history([c.id]), stageSteps(h, proc?.id, "contract")),
      search: [number, proc?.procurementNumber, proc?.title, c.supplier?.name].join(" "),
    };
  },

  /** @param {any} d @param {any} h @param {any} proc */
  delivery(d, h, proc) {
    const insp = d.inspection;
    return {
      id: d.id,
      kind: "Delivery",
      title: `Receipt${d.deliveryNote?.noteNumber ? ` · ${d.deliveryNote.noteNumber}` : ""}`,
      reference: d.deliveryNote?.noteNumber || null,
      status: insp ? statusOf(insp.status === "PENDING" ? "PENDING_INSPECTION" : insp.status) : statusOf(d.status),
      createdAt: d.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Delivered", value: d.deliveryDate, kind: "date" },
        { label: "Recorded by", value: personName(d.recordedBy) },
        { label: "Dispatched", value: d.deliveryNote?.dispatchedAt, kind: "datetime" },
        { label: "Delivered by", value: d.deliveryNote?.deliveredBy || null },
        { label: "Inspected", value: insp?.inspectedAt, kind: "datetime" },
        { label: "Inspected by", value: personName(insp?.inspectedBy) },
        { label: "Inspection notes", value: insp?.resultNotes || null, wide: true },
        { label: "Remarks", value: d.remarks || null, wide: true },
      ]),
      table: d.lines?.length
        ? {
            columns: ["Item", "Ordered", "Received", "Accepted", "Rejected"],
            rows: d.lines.map((l) => [
              l.itemName,
              qty(l.orderedQuantity),
              qty(l.receivedQuantity),
              qty(l.acceptedQuantity),
              qty(l.rejectedQuantity),
            ]),
          }
        : null,
      history: mergeHistory(h.history([d.id, d.deliveryNote?.id]), stageSteps(h, proc?.id, "delivery")),
      search: [d.deliveryNote?.noteNumber, proc?.procurementNumber, proc?.title].join(" "),
    };
  },

  /** @param {any} n @param {any} h @param {any} proc */
  deliveryNote(n, h, proc) {
    const lines = Array.isArray(n.lines) ? n.lines : [];
    return {
      id: n.id,
      kind: "Delivery note",
      title: `Delivery note · ${n.noteNumber}`,
      reference: n.noteNumber,
      status: { label: "Dispatched — awaiting receipt", tone: "warning" },
      createdAt: n.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Provider", value: n.supplier?.name || h.providerName(n.supplierId) },
        { label: "Dispatched", value: n.dispatchedAt, kind: "datetime" },
        { label: "Delivered by", value: n.deliveredBy || null },
        { label: "Vehicle", value: n.vehicleNumber || null },
        { label: "Remarks", value: n.remarks || null, wide: true },
      ]),
      table: lines.length
        ? { columns: ["Item", "Quantity"], rows: lines.map((l) => [l?.itemName || "—", `${qty(l?.quantity)} ${l?.unitOfMeasure || ""}`.trim()]) }
        : null,
      history: h.history([n.id]),
      search: [n.noteNumber, proc?.procurementNumber, proc?.title].join(" "),
    };
  },

  /** @param {any} i @param {any} h @param {any} proc */
  invoice(i, h, proc) {
    return {
      id: i.id,
      kind: "Invoice",
      title: `${i.supplier?.name || "Provider"} — ${money(i.amount) || ""}`,
      reference: i.invoiceNumber,
      status: statusOf(i.status),
      createdAt: i.createdAt,
      ...procRef(proc),
      createdBy: i.createdBy ? { name: personName(i.createdBy), role: null } : null,
      facts: facts([
        { label: "Provider", value: i.supplier?.name || null },
        { label: "Amount", value: money(i.amount) },
        { label: "Provider reference", value: i.supplierReference || null },
        { label: "Invoice date", value: i.invoiceDate, kind: "date" },
        { label: "Source", value: i.source === "OFFICER" ? "Recorded by officer" : i.source === "PORTAL" ? "Provider portal" : "Auto-response provider" },
        { label: "Certified", value: i.certifiedAt, kind: "datetime" },
        { label: "Verified", value: i.verifiedAt, kind: "datetime" },
        { label: "Rejection reason", value: i.rejectionReason || null, wide: true },
      ]),
      table: null,
      history: mergeHistory(h.history([i.id]), stageSteps(h, proc?.id, "invoice")),
      search: [i.invoiceNumber, proc?.procurementNumber, proc?.title, i.supplier?.name].join(" "),
    };
  },

  /** @param {any} p @param {any} invoice @param {any} h @param {any} proc */
  payment(p, invoice, h, proc) {
    return {
      id: p.id,
      kind: "Payment",
      title: `${invoice?.supplier?.name || "Payment"} — ${money(p.amount) || ""}`,
      reference: p.paymentReference || null,
      status: statusOf(p.status),
      createdAt: p.createdAt,
      ...procRef(proc),
      facts: facts([
        { label: "Amount", value: money(p.amount) },
        { label: "Invoice", value: invoice?.invoiceNumber || null },
        { label: "Provider", value: invoice?.supplier?.name || null },
        { label: "Reference", value: p.paymentReference || null },
        { label: "Paid on", value: p.paymentDate, kind: "date" },
        { label: "Approved by", value: personName(p.approvedBy) },
      ]),
      table: null,
      history: mergeHistory(h.history([p.id]), stageSteps(h, proc?.id, "payment")),
      search: [p.paymentReference, invoice?.invoiceNumber, proc?.procurementNumber, proc?.title].join(" "),
    };
  },
};

const procSelect = { select: { id: true, procurementNumber: true, title: true, procurementMethod: true } };

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

/**
 * One page of a sidebar section. Every item carries its own history.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ id: string; ownerUserId?: string | null }} org
 * @param {string} section
 * @param {{ page?: number; pageSize?: number; q?: string }} [opts]
 */
export async function loadExplorerSection(db, org, section, opts = {}) {
  if (!EXPLORER_SECTION_KEYS.includes(section) || section === "overview") {
    const err = new Error("Unknown section.");
    // @ts-ignore
    err.code = "BAD_SECTION";
    throw err;
  }
  const projectId = org.id;
  const h = await loadOrgHistory(db, org);
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(5, Number(opts.pageSize) || 10));

  if (section === "structure") {
    const units = await db.projectOrgDepartment.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        unitType: true,
        isActive: true,
        parentId: true,
        orgUsersAsDepartment: {
          select: { firstName: true, lastName: true, isProjectAdmin: true, projectOrgRole: { select: { name: true } } },
        },
      },
    });
    return {
      section,
      tree: units.map((u) => ({
        id: u.id,
        name: u.name,
        code: u.code || null,
        unitType: humanEnum(u.unitType),
        isActive: u.isActive,
        parentId: u.parentId || null,
        users: u.orgUsersAsDepartment.map((x) => ({
          name: personName(x) || "—",
          role: x.isProjectAdmin ? "Admin" : x.projectOrgRole?.name || null,
        })),
      })),
    };
  }

  /** Builds items lazily so history is only computed for the visible page. */
  /** @type {Array<{ search: string; build: () => any }>} */
  let rows = [];

  switch (section) {
    case "financial-years": {
      const list = await db.projectOrgFinancialYear.findMany({
        where: { projectId },
        orderBy: { startDate: "desc" },
        include: {
          planningPeriods: { orderBy: { startDate: "asc" }, select: { id: true, label: true, startDate: true, endDate: true, status: true } },
          _count: { select: { budgets: true, procurementPlans: true, requisitions: true, procurements: true } },
        },
      });
      rows = list.map((fy) => ({
        search: `${fy.label} ${fy.description || ""}`,
        build: () => {
          const hist = h.history([fy.id], { types: /FINANCIAL_YEAR/ });
          return {
            id: fy.id,
            kind: "Financial year",
            title: fy.label,
            reference: null,
            status: fy.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "warning" },
            createdAt: fy.createdAt,
            createdBy: hist[0] ? { name: hist[0].actor, role: hist[0].role } : null,
            facts: facts([
              { label: "Starts", value: fy.startDate, kind: "date" },
              { label: "Ends", value: fy.endDate, kind: "date" },
              { label: "Budgets", value: String(fy._count.budgets) },
              { label: "Procurement plans", value: String(fy._count.procurementPlans) },
              { label: "Requisitions", value: String(fy._count.requisitions) },
              { label: "Procurements", value: String(fy._count.procurements) },
              { label: "Description", value: fy.description || null, wide: true },
            ]),
            table: fy.planningPeriods.length
              ? {
                  columns: ["Planning period", "From", "To", "Status"],
                  rows: fy.planningPeriods.map((p) => [p.label || "—", { date: p.startDate }, { date: p.endDate }, humanEnum(p.status)]),
                }
              : null,
            history: hist,
          };
        },
      }));
      break;
    }
    case "planning-periods": {
      const list = await db.projectOrgPlanningPeriod.findMany({
        where: { projectId },
        orderBy: { startDate: "desc" },
        include: { financialYear: { select: { label: true } }, _count: { select: { procurementPlans: true } } },
      });
      rows = list.map((p) => ({
        search: `${p.label || ""} ${p.financialYear?.label || ""}`,
        build: () => {
          const hist = h.history([p.id]);
          return {
            id: p.id,
            kind: "Planning period",
            title: p.label || `Planning period · ${p.financialYear?.label || ""}`,
            reference: p.financialYear?.label || null,
            status: statusOf(p.status),
            createdAt: p.createdAt,
            createdBy: hist[0] ? { name: hist[0].actor, role: hist[0].role } : null,
            facts: facts([
              { label: "Financial year", value: p.financialYear?.label || null },
              { label: "From", value: p.startDate, kind: "date" },
              { label: "To", value: p.endDate, kind: "date" },
              { label: "Procurement plans", value: String(p._count.procurementPlans) },
            ]),
            table: null,
            history: hist,
          };
        },
      }));
      break;
    }
    case "budgets": {
      const list = await db.projectOrgBudget.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          financialYear: { select: { label: true } },
          department: { select: { name: true } },
          lines: { orderBy: { code: "asc" }, select: { code: true, name: true, approvedAmount: true, committedAmount: true, isActive: true } },
        },
      });
      rows = list.map((b) => ({
        search: `${b.title} ${b.budgetReference || ""} ${b.department?.name || ""}`,
        build: () => {
          const total = b.lines.reduce((s, l) => s + (Number(l.approvedAmount) || 0), 0);
          return {
            id: b.id,
            kind: "Budget",
            title: b.title,
            reference: b.budgetReference || null,
            status: statusOf(b.status),
            createdAt: b.createdAt,
            createdBy: h.person(b.createdByOrgUserId),
            approvedBy: b.approvedByOrgUserId ? { ...h.person(b.approvedByOrgUserId), at: b.approvedAt } : null,
            pending: h.pending([b.id]),
            facts: facts([
              { label: "Financial year", value: b.financialYear?.label || null },
              { label: "Department", value: b.department?.name || null },
              { label: "Total", value: money(total) },
              { label: "Submitted", value: b.submittedAt, kind: "datetime" },
              { label: "Approved", value: b.approvedAt, kind: "datetime" },
              { label: "Description", value: b.description || null, wide: true },
            ]),
            table: b.lines.length
              ? {
                  columns: ["Code", "Line", "Approved", "Committed"],
                  rows: b.lines.map((l) => [l.code, l.name, money(l.approvedAmount), money(l.committedAmount)]),
                }
              : null,
            history: h.history([b.id]),
          };
        },
      }));
      break;
    }
    case "plans": {
      const list = await db.projectOrgProcurementPlan.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          financialYear: { select: { label: true } },
          department: { select: { name: true } },
          planningPeriod: { select: { label: true } },
          items: {
            orderBy: { itemNumber: "asc" },
            select: { itemNumber: true, title: true, quantity: true, unitOfMeasure: true, estimatedTotal: true },
          },
        },
      });
      rows = list.map((p) => ({
        search: `${p.title} ${p.planReference || ""} ${p.department?.name || ""}`,
        build: () => {
          const total = p.items.reduce((s, i) => s + (Number(i.estimatedTotal) || 0), 0);
          return {
            id: p.id,
            kind: p.isEmergency ? "Emergency plan" : "Procurement plan",
            title: p.title,
            reference: p.planReference || null,
            status: statusOf(p.status),
            tags: [p.isEmergency ? "Emergency" : "Annual", p.isConsolidated ? "Consolidated" : null].filter(Boolean),
            createdAt: p.createdAt,
            createdBy: h.person(p.createdByOrgUserId),
            approvedBy: p.approvedByOrgUserId ? { ...h.person(p.approvedByOrgUserId), at: p.approvedAt } : null,
            pending: h.pending([p.id]),
            facts: facts([
              { label: "Financial year", value: p.financialYear?.label || null },
              { label: "Planning period", value: p.planningPeriod?.label || null },
              { label: "Department", value: p.department?.name || null },
              { label: "Estimated total", value: money(total) },
              { label: "Submitted", value: p.submittedAt, kind: "datetime" },
              { label: "Approved", value: p.approvedAt, kind: "datetime" },
              { label: "Emergency justification", value: p.emergencyJustification || null, wide: true },
            ]),
            table: p.items.length
              ? {
                  columns: ["#", "Item", "Quantity", "Estimated total"],
                  rows: p.items.map((i) => [String(i.itemNumber), i.title, `${qty(i.quantity)} ${i.unitOfMeasure || ""}`.trim(), money(i.estimatedTotal)]),
                }
              : null,
            history: h.history([p.id]),
          };
        },
      }));
      break;
    }
    case "users": {
      const list = await db.projectOrgUser.findMany({
        where: { projectId },
        orderBy: [{ isProjectAdmin: "desc" }, { createdAt: "asc" }],
        include: {
          projectOrgRole: { select: { name: true } },
          department: { select: { name: true } },
          subunit: { select: { name: true } },
          committeeMemberships: {
            include: { committee: { select: { name: true, committeeType: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      rows = list.map((u) => ({
        search: `${u.firstName} ${u.lastName} ${u.email} ${u.projectOrgRole?.name || ""} ${u.department?.name || ""}`,
        build: () => {
          const login = h.logins.get(u.id);
          return {
            id: u.id,
            kind: "User",
            title: personName(u) || u.email,
            reference: u.email,
            status: u.isProjectAdmin ? { label: "Admin", tone: "info" } : { label: u.projectOrgRole?.name || "User", tone: "info" },
            createdAt: u.createdAt,
            facts: facts([
              { label: "Role", value: u.isProjectAdmin ? "Admin" : u.projectOrgRole?.name || null },
              { label: "Department", value: u.department?.name || null },
              { label: "Sub-unit", value: u.subunit?.name || null },
              { label: "Last sign-in", value: u.lastLoginAt || login?.last || null, kind: "datetime" },
              { label: "Sign-ins", value: String(login?.count || 0) },
              { label: "Actions taken", value: String(h.actionsByActor.get(u.id) || 0) },
            ]),
            table: u.committeeMemberships.length
              ? {
                  columns: ["Committee", "Role", "Status"],
                  rows: u.committeeMemberships.map((m) => [m.committee?.name || "—", humanEnum(m.committeeRole), humanEnum(m.status)]),
                }
              : null,
            history: h.history([u.id], { types: /USER_|COMMITTEE_MEMBER/, limit: 40 }),
          };
        },
      }));
      break;
    }
    case "committees": {
      const list = await db.projectOrgCommittee.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: {
          members: {
            orderBy: { createdAt: "asc" },
            include: { orgUser: { select: { firstName: true, lastName: true, projectOrgRole: { select: { name: true } } } } },
          },
          _count: { select: { evaluationReports: true } },
        },
      });
      rows = list.map((c) => ({
        search: `${c.name} ${c.committeeType}`,
        build: () => {
          const hist = h.history([c.id], { types: /COMMITTEE/ });
          return {
            id: c.id,
            kind: "Committee",
            title: c.name,
            reference: humanEnum(c.committeeType),
            status: c.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "warning" },
            createdAt: c.createdAt,
            createdBy: hist[0] ? { name: hist[0].actor, role: hist[0].role } : null,
            facts: facts([
              { label: "Type", value: humanEnum(c.committeeType) },
              { label: "Members", value: String(c.members.filter((m) => m.status === "ACTIVE").length) },
              { label: "Evaluation reports", value: c._count.evaluationReports ? String(c._count.evaluationReports) : null },
              { label: "Description", value: c.description || null, wide: true },
            ]),
            table: c.members.length
              ? {
                  columns: ["Member", "Org role", "Committee role", "From", "Status"],
                  rows: c.members.map((m) => [
                    personName(m.orgUser) || "—",
                    m.orgUser?.projectOrgRole?.name || "—",
                    humanEnum(m.committeeRole),
                    { date: m.startDate },
                    humanEnum(m.status),
                  ]),
                }
              : null,
            history: hist,
          };
        },
      }));
      break;
    }
    case "departments": {
      const list = await db.projectOrgDepartment.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          parent: { select: { name: true } },
          _count: { select: { orgUsersAsDepartment: true, budgets: true, procurementPlans: true, requisitions: true, procurements: true } },
        },
      });
      rows = list.map((d) => ({
        search: `${d.name} ${d.code || ""}`,
        build: () => {
          const hist = h.history([d.id], { types: /DEPARTMENT/ });
          return {
            id: d.id,
            kind: humanEnum(d.unitType),
            title: d.name,
            reference: d.code || null,
            status: d.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "warning" },
            createdAt: d.createdAt,
            createdBy: hist[0] ? { name: hist[0].actor, role: hist[0].role } : null,
            facts: facts([
              { label: "Type", value: humanEnum(d.unitType) },
              { label: "Parent", value: d.parent?.name || null },
              { label: "Users", value: String(d._count.orgUsersAsDepartment) },
              { label: "Budgets", value: String(d._count.budgets) },
              { label: "Plans", value: String(d._count.procurementPlans) },
              { label: "Requisitions", value: String(d._count.requisitions) },
              { label: "Procurements", value: String(d._count.procurements) },
              { label: "Description", value: d.description || null, wide: true },
            ]),
            table: null,
            history: hist,
          };
        },
      }));
      break;
    }
    case "processes": {
      const adoptions = await db.projectOrgProcessFlowAdoption.findMany({
        where: { projectId },
        include: { processFlow: { select: { id: true, code: true, triggerKey: true, name: true } } },
      });
      /** @type {Map<string, any>} */
      const byCode = new Map();
      for (const a of adoptions) {
        const code = a.processFlow?.code || TRIGGER_TO_PROCESS_CODE[a.processFlow?.triggerKey || ""] || null;
        if (code) byCode.set(code, a);
      }
      rows = BASELINE_PROCESS_TEMPLATES.map((tpl) => {
        const a = byCode.get(tpl.code) || null;
        const name = a?.processFlow?.name || tpl.name;
        return {
          search: `${name} ${tpl.code}`,
          build: () => ({
            id: a?.id || tpl.code,
            kind: "Process",
            title: name,
            reference: null,
            status: !a
              ? { label: "Not adopted", tone: "warning" }
              : a.isActive
                ? { label: "Enabled", tone: "success" }
                : { label: "Disabled", tone: "error" },
            createdAt: a?.createdAt || null,
            facts: facts([
              { label: "Steps", value: String(tpl.steps?.length || 0) },
              { label: "Adopted", value: a?.createdAt || null, kind: "datetime" },
              { label: "Enabled", value: a?.activatedAt || null, kind: "datetime" },
              { label: "Disabled", value: a && !a.isActive ? a.deactivatedAt : null, kind: "datetime" },
              { label: "Description", value: tpl.description || null, wide: true },
            ]),
            table: tpl.steps?.length
              ? {
                  columns: ["Step", "Task", "Role"],
                  rows: tpl.steps.map((s) => [String(s.stepNumber), s.taskDescription, s.roleName || "—"]),
                }
              : null,
            history: a ? h.history([a.id, a.processFlowId], { types: /PROCESS_FLOW/ }) : [],
          }),
        };
      });
      break;
    }
    case "providers": {
      const list = await db.projectOrgProvider.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true } },
          _count: { select: { offers: true, awards: true, invoices: true } },
        },
      });
      rows = list.map((p) => ({
        search: `${p.name} ${p.email || ""} ${p.tin || ""}`,
        build: () => ({
          id: p.id,
          kind: "Provider",
          title: p.name,
          reference: p.registrationRef || null,
          status: statusOf(p.status),
          tags: [p.isGenerated ? "Auto-response provider" : null, p.ppdaSuspended ? "PPDA suspended" : null].filter(Boolean),
          createdAt: p.createdAt,
          createdBy: h.person(p.createdByOrgUserId),
          facts: facts([
            { label: "Contact", value: p.contactPerson || null },
            { label: "Email", value: p.email || null },
            { label: "Phone", value: p.phone || null },
            { label: "TIN", value: p.tin || null },
            { label: "Offers", value: String(p._count.offers) },
            { label: "Awards", value: String(p._count.awards) },
            { label: "Invoices", value: String(p._count.invoices) },
            { label: "Portal last sign-in", value: p.portalLastLoginAt, kind: "datetime" },
            { label: "Lines of business", value: p.linesOfBusiness || null, wide: true },
            { label: "Status reason", value: p.statusReason || null, wide: true },
          ]),
          table: null,
          history: h.history([p.id], { limit: 60 }),
        }),
      }));
      break;
    }
    case "procurements":
    case "closures": {
      const list = await db.projectOrgProcurement.findMany({
        where: section === "closures" ? { projectId, OR: [{ status: "CLOSED" }, { closedAt: { not: null } }] } : { projectId },
        orderBy: section === "closures" ? { closedAt: "desc" } : { createdAt: "desc" },
        include: {
          financialYear: { select: { label: true } },
          department: { select: { name: true } },
          requisition: { select: { id: true, requisitionReference: true, estimatedTotalValue: true } },
        },
      });
      rows = list.map((p) => ({
        search: `${p.procurementNumber} ${p.title} ${p.department?.name || ""} ${p.procurementMethod}`,
        build: () => {
          const closure = section === "closures";
          return {
            id: p.id,
            kind: closure ? "Closure" : "Procurement",
            title: p.title,
            reference: p.procurementNumber,
            status: statusOf(p.status),
            tags: [METHOD_PROCESS_BY_ENUM[p.procurementMethod]?.label || humanEnum(p.procurementMethod)],
            createdAt: p.createdAt,
            procurementId: p.id,
            procurementNumber: p.procurementNumber,
            procurementTitle: p.title,
            pending: closure ? [] : h.pending([p.id]),
            facts: facts([
              { label: "Method", value: METHOD_PROCESS_BY_ENUM[p.procurementMethod]?.label || humanEnum(p.procurementMethod) },
              { label: "Department", value: p.department?.name || null },
              { label: "Financial year", value: p.financialYear?.label || null },
              { label: "Requisition", value: p.requisition?.requisitionReference || null },
              { label: "Estimated value", value: money(p.requisition?.estimatedTotalValue) },
              { label: "Officer", value: h.person(p.officerOrgUserId)?.name || null },
              { label: "Method selected", value: p.methodSelectedAt, kind: "datetime" },
              { label: "Closed", value: p.closedAt, kind: "datetime" },
              { label: "Closed by", value: h.person(p.closedByOrgUserId)?.name || null },
              { label: "Closure remarks", value: p.closureRemarks || null, wide: true },
            ]),
            table: null,
            history: closure
              ? h.history([p.id], { filter: (e) => stageOfEntry(e) === "closure" })
              : h.history([p.id], { limit: 8 }),
            historyIsRecent: !closure,
          };
        },
      }));
      break;
    }
    case "requisitions": {
      const list = await db.projectOrgRequisition.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          financialYear: { select: { label: true } },
          department: { select: { name: true } },
          procurementPlan: { select: { planReference: true, title: true } },
          budgetLine: { select: { code: true, name: true } },
          items: {
            orderBy: { lineNumber: "asc" },
            select: { lineNumber: true, itemName: true, quantity: true, unitOfMeasure: true, estimatedTotal: true },
          },
          procurements: { select: { id: true, procurementNumber: true, title: true } },
        },
      });
      rows = list.map((r) => ({
        search: `${r.title} ${r.requisitionReference || ""} ${r.department?.name || ""}`,
        build: () => {
          const proc = r.procurements[0] || null;
          return {
            id: r.id,
            kind: "Requisition",
            title: r.title,
            reference: r.requisitionReference || null,
            status: statusOf(r.status),
            tags: r.procurementMethod ? [METHOD_PROCESS_BY_ENUM[r.procurementMethod]?.label || humanEnum(r.procurementMethod)] : [],
            createdAt: r.createdAt,
            createdBy: h.person(r.requesterOrgUserId),
            approvedBy: r.approvedByOrgUserId ? { ...h.person(r.approvedByOrgUserId), at: r.approvedAt } : null,
            pending: h.pending([r.id]),
            ...procRef(proc),
            facts: facts([
              { label: "Department", value: r.department?.name || null },
              { label: "Financial year", value: r.financialYear?.label || null },
              { label: "Estimated value", value: money(r.estimatedTotalValue) },
              { label: "Category", value: r.category || null },
              { label: "Plan", value: r.procurementPlan ? r.procurementPlan.planReference || r.procurementPlan.title : null },
              { label: "Budget line", value: r.budgetLine ? `${r.budgetLine.code} · ${r.budgetLine.name}` : null },
              { label: "Required by", value: r.requiredByDate, kind: "date" },
              { label: "Delivery location", value: r.deliveryLocation || null },
              { label: "Submitted", value: r.submittedAt, kind: "datetime" },
              { label: "Approved", value: r.approvedAt, kind: "datetime" },
              { label: "Need", value: r.needDescription || null, wide: true },
              { label: "Justification", value: r.justification || null, wide: true },
            ]),
            table: r.items.length
              ? {
                  columns: ["#", "Item", "Quantity", "Estimated total"],
                  rows: r.items.map((i) => [String(i.lineNumber), i.itemName, `${qty(i.quantity)} ${i.unitOfMeasure || ""}`.trim(), money(i.estimatedTotal)]),
                }
              : null,
            history: h.history([r.id]),
          };
        },
      }));
      break;
    }
    case "sourcing": {
      const list = await db.projectOrgSolicitation.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          procurement: procSelect,
          invites: { select: { id: true } },
          offers: { orderBy: { submittedAt: "asc" }, include: { supplier: { select: { name: true } } } },
        },
      });
      rows = list.map((s) => ({
        search: `${s.title} ${s.procurement?.procurementNumber || ""} ${s.procurement?.title || ""}`,
        build: () => builders.solicitation(s, s.offers, h, s.procurement),
      }));
      break;
    }
    case "evaluations": {
      const [reports, postQuals] = await Promise.all([
        db.projectOrgEvaluationReport.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: {
            procurement: procSelect,
            recommendedSupplier: { select: { name: true } },
            committee: {
              select: {
                name: true,
                members: {
                  where: { status: "ACTIVE" },
                  select: { committeeRole: true, orgUser: { select: { firstName: true, lastName: true } } },
                },
              },
            },
          },
        }),
        db.projectOrgPostQualificationReport.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: { procurement: procSelect },
        }),
      ]);
      rows = [
        ...reports.map((r) => ({
          at: r.createdAt,
          search: `${r.procurement?.procurementNumber || ""} ${r.procurement?.title || ""} ${r.recommendedSupplier?.name || ""}`,
          build: () => builders.evaluation(r, h, r.procurement),
        })),
        ...postQuals.map((r) => ({
          at: r.createdAt,
          search: `${r.procurement?.procurementNumber || ""} ${r.procurement?.title || ""} post-qualification`,
          build: () => builders.postQualification(r, h, r.procurement),
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      break;
    }
    case "awards": {
      const list = await db.projectOrgAward.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: { procurement: procSelect, supplier: { select: { name: true } }, approvedBy: { select: { firstName: true, lastName: true } } },
      });
      rows = list.map((a) => ({
        search: `${a.supplier?.name || ""} ${a.procurement?.procurementNumber || ""} ${a.procurement?.title || ""}`,
        build: () => builders.award(a, h, a.procurement),
      }));
      break;
    }
    case "purchase-instructions": {
      const list = await db.projectOrgPurchaseInstruction.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: { procurement: procSelect, supplier: { select: { name: true } }, issuedBy: { select: { firstName: true, lastName: true } } },
      });
      rows = list.map((pi) => ({
        search: `${pi.instructionNumber} ${pi.supplier?.name || ""} ${pi.procurement?.procurementNumber || ""}`,
        build: () => builders.purchaseInstruction(pi, h, pi.procurement),
      }));
      break;
    }
    case "orders": {
      const [contracts, lpos] = await Promise.all([
        db.projectOrgContract.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: { procurement: procSelect, supplier: { select: { name: true } } },
        }),
        db.projectOrgLpo.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: { procurement: procSelect, supplier: { select: { name: true } } },
        }),
      ]);
      rows = [
        ...contracts.map((c) => ({
          at: c.createdAt,
          search: `${c.contractNumber} contract ${c.supplier?.name || ""} ${c.procurement?.procurementNumber || ""}`,
          build: () => builders.order(c, "contract", h, c.procurement),
        })),
        ...lpos.map((c) => ({
          at: c.createdAt,
          search: `${c.lpoNumber} lpo ${c.supplier?.name || ""} ${c.procurement?.procurementNumber || ""}`,
          build: () => builders.order(c, "lpo", h, c.procurement),
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      break;
    }
    case "deliveries": {
      const [deliveries, notes] = await Promise.all([
        db.projectOrgDelivery.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: {
            procurement: procSelect,
            recordedBy: { select: { firstName: true, lastName: true } },
            deliveryNote: { select: { id: true, noteNumber: true, dispatchedAt: true, deliveredBy: true } },
            lines: true,
            inspection: { include: { inspectedBy: { select: { firstName: true, lastName: true } } } },
          },
        }),
        db.projectOrgDeliveryNote.findMany({
          where: { projectId, deliveryId: null, status: "SUBMITTED" },
          orderBy: { createdAt: "desc" },
          include: { procurement: procSelect, supplier: { select: { name: true } } },
        }),
      ]);
      rows = [
        ...notes.map((n) => ({
          at: n.createdAt,
          search: `${n.noteNumber} ${n.procurement?.procurementNumber || ""} ${n.procurement?.title || ""}`,
          build: () => builders.deliveryNote(n, h, n.procurement),
        })),
        ...deliveries.map((d) => ({
          at: d.createdAt,
          search: `${d.deliveryNote?.noteNumber || ""} ${d.procurement?.procurementNumber || ""} ${d.procurement?.title || ""}`,
          build: () => builders.delivery(d, h, d.procurement),
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      break;
    }
    case "invoices": {
      const list = await db.projectOrgInvoice.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: { procurement: procSelect, supplier: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
      });
      rows = list.map((i) => ({
        search: `${i.invoiceNumber} ${i.supplier?.name || ""} ${i.procurement?.procurementNumber || ""}`,
        build: () => builders.invoice(i, h, i.procurement),
      }));
      break;
    }
    case "payments": {
      const list = await db.projectOrgPayment.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          procurement: procSelect,
          approvedBy: { select: { firstName: true, lastName: true } },
          invoice: { select: { invoiceNumber: true, supplier: { select: { name: true } } } },
        },
      });
      rows = list.map((p) => ({
        search: `${p.paymentReference || ""} ${p.invoice?.invoiceNumber || ""} ${p.procurement?.procurementNumber || ""}`,
        build: () => builders.payment(p, p.invoice, h, p.procurement),
      }));
      break;
    }
    default:
      rows = [];
  }

  const filtered = matchesQuery(rows, opts.q || "");
  const total = filtered.length;
  const items = filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => {
    const item = r.build();
    return { ...item, history: (item.history || []).map(publicEntry), search: undefined };
  });
  return { section, page, pageSize, total, items };
}

/**
 * Record counts per sidebar section.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 */
export async function countExplorerSections(db, projectId) {
  const where = { projectId };
  const [
    fys,
    periods,
    budgets,
    plans,
    users,
    committees,
    departments,
    providers,
    procurements,
    requisitions,
    solicitations,
    evaluations,
    postQuals,
    awards,
    pis,
    contracts,
    lpos,
    deliveries,
    notes,
    invoices,
    payments,
    closures,
    adoptions,
  ] = await Promise.all([
    db.projectOrgFinancialYear.count({ where }),
    db.projectOrgPlanningPeriod.count({ where }),
    db.projectOrgBudget.count({ where }),
    db.projectOrgProcurementPlan.count({ where }),
    db.projectOrgUser.count({ where }),
    db.projectOrgCommittee.count({ where }),
    db.projectOrgDepartment.count({ where }),
    db.projectOrgProvider.count({ where }),
    db.projectOrgProcurement.count({ where }),
    db.projectOrgRequisition.count({ where }),
    db.projectOrgSolicitation.count({ where }),
    db.projectOrgEvaluationReport.count({ where }),
    db.projectOrgPostQualificationReport.count({ where }),
    db.projectOrgAward.count({ where }),
    db.projectOrgPurchaseInstruction.count({ where }),
    db.projectOrgContract.count({ where }),
    db.projectOrgLpo.count({ where }),
    db.projectOrgDelivery.count({ where }),
    db.projectOrgDeliveryNote.count({ where: { projectId, deliveryId: null, status: "SUBMITTED" } }),
    db.projectOrgInvoice.count({ where }),
    db.projectOrgPayment.count({ where }),
    db.projectOrgProcurement.count({ where: { projectId, OR: [{ status: "CLOSED" }, { closedAt: { not: null } }] } }),
    db.projectOrgProcessFlowAdoption.count({ where: { projectId, isActive: true } }),
  ]);
  return {
    "financial-years": fys,
    "planning-periods": periods,
    budgets,
    plans,
    users,
    committees,
    departments,
    structure: departments,
    processes: adoptions,
    providers,
    procurements,
    requisitions,
    sourcing: solicitations,
    evaluations: evaluations + postQuals,
    awards,
    "purchase-instructions": pis,
    orders: contracts + lpos,
    deliveries: deliveries + notes,
    invoices,
    payments,
    closures,
  };
}

/* ------------------------------------------------------------------ */
/* One procurement, A to Z                                              */
/* ------------------------------------------------------------------ */

const STAGE_LABELS = {
  requisition: "Requisition",
  method: "Method & approval",
  recommendation: "Contracts Committee decision",
  other: "Other steps",
};

/**
 * Every stage of one procurement with its records and the actions taken in it.
 *
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ id: string; ownerUserId?: string | null }} org
 * @param {string} procurementId
 */
export async function loadExplorerProcurement(db, org, procurementId) {
  const row = await db.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId: org.id },
    include: {
      ...procurementInclude,
      instances: false,
      requisition: {
        include: {
          department: { select: { name: true } },
          items: {
            orderBy: { lineNumber: "asc" },
            select: { lineNumber: true, itemName: true, quantity: true, unitOfMeasure: true, estimatedTotal: true },
          },
        },
      },
      postQualificationReports: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) return null;

  const h = await loadOrgHistory(db, org);
  const proc = { id: row.id, procurementNumber: row.procurementNumber, title: row.title };
  const method = row.procurementMethod;
  const req = row.requisition;

  /** @type {Record<string, any[]>} */
  const records = { requisition: [], method: [], sourcing: [], evaluation: [], award: [], contract: [], delivery: [], invoice: [], payment: [], closure: [] };

  if (req) {
    records.requisition.push({
      id: req.id,
      kind: "Requisition",
      title: req.title,
      reference: req.requisitionReference || null,
      status: statusOf(req.status),
      createdBy: h.person(req.requesterOrgUserId),
      approvedBy: req.approvedByOrgUserId ? { ...h.person(req.approvedByOrgUserId), at: req.approvedAt } : null,
      facts: facts([
        { label: "Department", value: req.department?.name || null },
        { label: "Estimated value", value: money(req.estimatedTotalValue) },
        { label: "Category", value: req.category || null },
        { label: "Submitted", value: req.submittedAt, kind: "datetime" },
        { label: "Approved", value: req.approvedAt, kind: "datetime" },
        { label: "Need", value: req.needDescription || null, wide: true },
      ]),
      table: req.items?.length
        ? {
            columns: ["#", "Item", "Quantity", "Estimated total"],
            rows: req.items.map((i) => [String(i.lineNumber), i.itemName, `${qty(i.quantity)} ${i.unitOfMeasure || ""}`.trim(), money(i.estimatedTotal)]),
          }
        : null,
    });
  }

  records.method.push({
    id: `${row.id}:method`,
    kind: "Method",
    title: METHOD_PROCESS_BY_ENUM[method]?.label || humanEnum(method),
    reference: row.procurementNumber,
    status: row.methodSelectedAt ? { label: "Selected", tone: "success" } : { label: "Pending", tone: "warning" },
    facts: facts([
      { label: "Method", value: METHOD_PROCESS_BY_ENUM[method]?.label || humanEnum(method) },
      { label: "Selected", value: row.methodSelectedAt, kind: "datetime" },
      { label: "Officer", value: h.person(row.officerOrgUserId)?.name || null },
      { label: "Plan item", value: row.procurementPlanItem?.title || null },
      { label: "Budget line", value: row.budgetLine ? `${row.budgetLine.code} · ${row.budgetLine.name}` : null },
      { label: "Emergency", value: row.procurementPlanItem?.procurementPlan?.isEmergency ? "Yes" : null },
    ]),
    table: null,
  });

  for (const s of row.solicitations || []) {
    records.sourcing.push(builders.solicitation(s, (row.offers || []).filter((o) => o.solicitationId === s.id), h, proc));
  }
  for (const r of row.evaluationReports || []) records.evaluation.push(builders.evaluation(r, h, proc));
  for (const r of row.postQualificationReports || []) records.evaluation.push(builders.postQualification(r, h, proc));
  for (const a of row.awards || []) records.award.push(builders.award(a, h, proc));
  for (const pi of row.purchaseInstructions || []) records.contract.push(builders.purchaseInstruction(pi, h, proc));
  for (const c of row.contracts || []) records.contract.push(builders.order(c, "contract", h, proc));
  for (const c of row.lpos || []) records.contract.push(builders.order(c, "lpo", h, proc));
  for (const n of (row.deliveryNotes || []).filter((x) => x.status === "SUBMITTED" && !x.deliveryId)) {
    records.delivery.push(builders.deliveryNote(n, h, proc));
  }
  for (const d of row.deliveries || []) records.delivery.push(builders.delivery(d, h, proc));
  for (const i of row.invoices || []) records.invoice.push(builders.invoice(i, h, proc));
  for (const p of row.payments || []) {
    records.payment.push(builders.payment(p, (row.invoices || []).find((i) => i.id === p.invoiceId) || null, h, proc));
  }
  if (row.closedAt || row.status === "CLOSED") {
    records.closure.push({
      id: `${row.id}:closure`,
      kind: "Closure",
      title: "Procurement closed",
      reference: null,
      status: { label: "Closed", tone: "success" },
      facts: facts([
        { label: "Closed", value: row.closedAt, kind: "datetime" },
        { label: "Closed by", value: personName(row.closedBy) },
        { label: "Remarks", value: row.closureRemarks || null, wide: true },
      ]),
      table: null,
    });
  }

  /** Record label for events tied to a specific record, preferring records of the event's stage. */
  /** @type {Map<string, { label: string; stage: string }>} */
  const labelById = new Map();
  for (const [stage, list] of Object.entries(records)) {
    for (const r of list) {
      if (r.kind === "Method" || r.kind === "Closure") continue;
      labelById.set(r.id, { label: r.reference ? `${r.kind} ${r.reference}` : r.kind, stage });
    }
  }

  const all = h.history([row.id, req?.id]);
  /** @type {Record<string, any[]>} */
  const eventsByStage = {};
  for (const e of all) {
    const stage = stageOfEntry(e);
    const hits = (e.refs || []).map((/** @type {string} */ id) => labelById.get(id)).filter(Boolean);
    const label = (hits.find((x) => x.stage === stage) || hits[0])?.label || null;
    (eventsByStage[stage] ||= []).push({ ...publicEntry(e), ...(label ? { recordLabel: label } : {}) });
  }

  const keys = ["requisition", "method", ...procurementStagesForMethod(method)];
  if (eventsByStage.recommendation?.length) keys.splice(keys.indexOf("award") + 1 || keys.length, 0, "recommendation");
  if (eventsByStage.other?.length) keys.push("other");

  const stages = keys.map((key) => {
    /** @type {{ label: string; tone: string } | null} */
    let status = null;
    /** @type {string[]} */
    let summary = [];
    if (key === "requisition") {
      status = statusOf(req?.status);
    } else if (key === "method") {
      status = row.methodSelectedAt ? { label: "Completed", tone: "success" } : { label: "Pending", tone: "warning" };
    } else if (key === "recommendation" || key === "other") {
      status = null;
    } else {
      const d = describeProcurementStage(key, row);
      status = { label: d.status.label, tone: d.status.color === "primary" ? "info" : d.status.color };
      summary = d.summary;
    }
    const events = eventsByStage[key] || [];
    return {
      key,
      label: STAGE_LABELS[key] || procurementStageLabel(key, method),
      status,
      summary,
      records: (records[key] || []).map((r) => ({ ...r, history: undefined, search: undefined })),
      events,
      startedAt: events[0]?.at || null,
      endedAt: events.length ? events[events.length - 1].at : null,
    };
  });

  return {
    procurement: {
      id: row.id,
      procurementNumber: row.procurementNumber,
      title: row.title,
      method: METHOD_PROCESS_BY_ENUM[method]?.label || humanEnum(method),
      status: statusOf(row.status),
      department: row.department?.name || null,
      financialYear: row.financialYear?.label || null,
      officer: h.person(row.officerOrgUserId)?.name || null,
      estimatedValue: money(req?.estimatedTotalValue),
      createdAt: row.createdAt,
      closedAt: row.closedAt || null,
      isEmergency: Boolean(row.procurementPlanItem?.procurementPlan?.isEmergency),
    },
    pending: h.pending([row.id, req?.id]),
    stages,
  };
}
