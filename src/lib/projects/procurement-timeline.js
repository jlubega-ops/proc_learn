/**
 * Educational timeline helpers for procurement workflow + domain audit events.
 * Prefer human “who — role / action / status” lines over raw enums alone.
 */

import { formatMoneyUGX } from "@/lib/money";

const DECISION_ACTION_PHRASES = {
  SUBMIT: "Submitted for approval",
  APPROVE: "Approved",
  COMPLETE: "Completed step",
  VERIFY: "Verified",
  RETURN: "Returned for correction",
  REJECT: "Rejected",
  SELECT_METHOD: "Selected procurement method",
  FLAG_EXCEPTION: "Flagged an exception",
};

/** Domain AuditLog.eventType → student-facing action label */
export const DOMAIN_TIMELINE_EVENT_LABELS = {
  PROJECT_ORG_AWARD_CREATED: "Created award recommendation",
  PROJECT_ORG_AWARD_APPROVED: "Approved award",
  PROJECT_ORG_AWARD_COMMUNICATED: "Communicated award decision",
  PROJECT_ORG_AWARD_ACCEPTED: "Recorded supplier award acceptance",
  PROJECT_ORG_AWARD_CANCELLED: "Cancelled award",
  PROJECT_ORG_CONTRACT_CREATED: "Prepared contract",
  PROJECT_ORG_CONTRACT_APPROVED: "Approved contract",
  PROJECT_ORG_CONTRACT_SIGNED: "Signed contract",
  PROJECT_ORG_CONTRACT_ISSUED: "Issued contract",
  PROJECT_ORG_LPO_CREATED: "Prepared LPO",
  PROJECT_ORG_LPO_ISSUED: "Issued LPO",
  PROJECT_ORG_LPO_ACCEPTED: "Recorded LPO acceptance",
  PROJECT_ORG_PURCHASE_INSTRUCTION_ISSUED: "Issued purchase instruction",
  PROJECT_ORG_DELIVERY_RECORDED: "Recorded delivery",
  PROJECT_ORG_DELIVERY_INSPECTED: "Recorded inspection / acceptance",
  PROJECT_ORG_INVOICE_CREATED: "Received invoice",
  PROJECT_ORG_INVOICE_CERTIFIED: "Certified invoice",
  PROJECT_ORG_INVOICE_VERIFIED: "Verified invoice",
  PROJECT_ORG_INVOICE_REJECTED: "Rejected invoice",
  PROJECT_ORG_PAYMENT_RECORDED: "Raised payment",
  PROJECT_ORG_PAYMENT_APPROVED: "Approved payment",
  PROJECT_ORG_PAYMENT_PAID: "Recorded payment as paid",
  PROJECT_ORG_PAYMENT_REJECTED: "Rejected payment",
  PROJECT_ORG_PROCUREMENT_CLOSED: "Closed procurement",
  PROJECT_ORG_EVALUATION_SUBMITTED: "Submitted evaluation report",
  PROJECT_ORG_EVALUATION_APPROVED: "Approved evaluation report",
  PROJECT_ORG_EVALUATION_RETURNED: "Returned evaluation report",
  PROJECT_ORG_POST_QUALIFICATION_SUBMITTED: "Submitted post-qualification",
  PROJECT_ORG_POST_QUALIFICATION_APPROVED: "Approved post-qualification",
  PROJECT_ORG_PROCUREMENT_CREATED: "Created procurement case",
  PROJECT_ORG_METHOD_SELECTED: "Selected procurement method",
};

/**
 * @param {string | null | undefined} decision
 */
export function humanizeWorkflowDecision(decision) {
  const key = String(decision || "").trim().toUpperCase();
  if (!key) return "Recorded action";
  return (
    DECISION_ACTION_PHRASES[key] ||
    key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
  );
}

/**
 * Prefer the task title captured at action time; otherwise a decision phrase.
 * @param {{ decision?: string | null; metadata?: any; processName?: string | null }} entry
 */
export function timelineActionText(entry) {
  const meta = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const taskTitle = typeof meta.taskTitle === "string" ? meta.taskTitle.trim() : "";
  if (taskTitle) return taskTitle;
  const phrase = humanizeWorkflowDecision(entry?.decision);
  if (entry?.processName) return `${phrase} (${entry.processName})`;
  return phrase;
}

/**
 * @param {string | null | undefined} status
 */
export function formatTimelineStatus(status) {
  const s = String(status || "").trim();
  return s || null;
}

/**
 * @param {string | null | undefined} eventType
 */
export function humanizeDomainEvent(eventType) {
  const key = String(eventType || "").trim();
  if (DOMAIN_TIMELINE_EVENT_LABELS[key]) return DOMAIN_TIMELINE_EVENT_LABELS[key];
  if (!key) return "Recorded procurement action";
  return key
    .replace(/^PROJECT_ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Build a stable display payload for one workflow action on a procurement timeline.
 * @param {any} action — ProjectOrgWorkflowAction (serialized fields)
 * @param {{ processName?: string | null; procurementNumber?: string | null }} ctx
 */
export function serializeTimelineAction(action, ctx = {}) {
  const meta =
    action?.metadata && typeof action.metadata === "object" && !Array.isArray(action.metadata)
      ? action.metadata
      : {};
  const actorName = action?.actor
    ? `${action.actor.firstName || ""} ${action.actor.lastName || ""}`.trim() ||
      action.actor.displayName ||
      null
    : null;
  const previousStatus = formatTimelineStatus(action.previousStatus);
  const newStatus = formatTimelineStatus(action.newStatus);
  const processName = ctx.processName || null;
  const decision = action.decision || null;

  return {
    id: `wf:${action.id}`,
    source: "workflow",
    eventType: null,
    decision,
    comment: action.comment || null,
    actorRoleName: action.actorRoleName || null,
    committeeId: action.committeeId || null,
    committeeRole: action.committeeRole || null,
    previousStatus,
    newStatus,
    createdAt: action.createdAt,
    processName,
    procurementNumber: ctx.procurementNumber || null,
    departmentId: typeof meta.departmentId === "string" ? meta.departmentId : null,
    departmentName: null,
    taskTitle: typeof meta.taskTitle === "string" ? meta.taskTitle : null,
    stepNumber: meta.stepNumber ?? null,
    amountLabel: null,
    actionText: timelineActionText({
      decision,
      metadata: meta,
      processName,
    }),
    actor: action.actor
      ? {
          id: action.actor.id,
          displayName:
            actorName ||
            (action.actor.displayName ? String(action.actor.displayName) : null) ||
            "—",
        }
      : null,
    statusTransition:
      previousStatus || newStatus
        ? {
            from: previousStatus,
            to: newStatus,
            label:
              previousStatus && newStatus
                ? `Status: ${previousStatus} → ${newStatus}`
                : newStatus
                  ? `Status: ${newStatus}`
                  : `Status: ${previousStatus}`,
          }
        : null,
  };
}

/**
 * @param {any} auditRow — AuditLog row
 * @param {{
 *   procurementNumber?: string | null;
 *   actorById?: Record<string, { id: string; displayName: string; departmentName?: string | null }>;
 * }} ctx
 */
export function serializeDomainAuditTimelineEntry(auditRow, ctx = {}) {
  const meta =
    auditRow?.meta && typeof auditRow.meta === "object" && !Array.isArray(auditRow.meta)
      ? auditRow.meta
      : {};
  const actorOrgUserId =
    typeof meta.actorOrgUserId === "string" ? meta.actorOrgUserId : null;
  const actorRoleName =
    typeof meta.actorRoleName === "string" ? meta.actorRoleName : null;
  const orgActor = actorOrgUserId && ctx.actorById ? ctx.actorById[actorOrgUserId] : null;
  const amountRaw =
    meta.amount != null
      ? meta.amount
      : meta.awardedAmount != null
        ? meta.awardedAmount
        : meta.contractValue != null
          ? meta.contractValue
          : meta.lpoValue != null
            ? meta.lpoValue
            : null;
  const amountLabel =
    amountRaw != null && String(amountRaw).trim() !== ""
      ? formatMoneyUGX(amountRaw)
      : null;
  const previousStatus = formatTimelineStatus(meta.previousStatus);
  const newStatus = formatTimelineStatus(meta.newStatus || meta.status);
  const remarks =
    typeof meta.remarks === "string"
      ? meta.remarks
      : typeof meta.comment === "string"
        ? meta.comment
        : typeof meta.recommendation === "string"
          ? meta.recommendation
          : null;

  return {
    id: `audit:${auditRow.id}`,
    source: "domain",
    eventType: auditRow.eventType || null,
    decision: null,
    comment: remarks,
    actorRoleName,
    committeeId: typeof meta.committeeId === "string" ? meta.committeeId : null,
    committeeRole: typeof meta.committeeRole === "string" ? meta.committeeRole : null,
    previousStatus,
    newStatus,
    createdAt: auditRow.createdAt,
    processName: null,
    procurementNumber: ctx.procurementNumber || null,
    departmentId: typeof meta.departmentId === "string" ? meta.departmentId : null,
    departmentName: orgActor?.departmentName || null,
    taskTitle: null,
    stepNumber: null,
    amountLabel,
    actionText: humanizeDomainEvent(auditRow.eventType),
    actor: orgActor
      ? { id: orgActor.id, displayName: orgActor.displayName || "—" }
      : null,
    statusTransition:
      previousStatus || newStatus
        ? {
            from: previousStatus,
            to: newStatus,
            label:
              previousStatus && newStatus
                ? `Status: ${previousStatus} → ${newStatus}`
                : newStatus
                  ? `Status: ${newStatus}`
                  : `Status: ${previousStatus}`,
          }
        : null,
  };
}

/**
 * Merge workflow + domain audit timeline entries (oldest first).
 * @param {any[]} workflowEntries
 * @param {any[]} domainEntries
 */
export function mergeProcurementTimeline(workflowEntries, domainEntries) {
  const all = [...(workflowEntries || []), ...(domainEntries || [])];
  all.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    // Prefer workflow then domain for identical timestamps
    if (a.source !== b.source) return a.source === "workflow" ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
  return all;
}

/**
 * Load domain AuditLog rows for a procurement and serialize as timeline entries.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   procurementNumber?: string | null;
 * }} opts
 */
export async function loadProcurementDomainTimeline(prisma, opts) {
  /** Prefer JSON-path filter when the driver supports it; fall back to bounded scan. */
  let matched = [];
  try {
    matched = await prisma.auditLog.findMany({
      where: {
        eventType: { startsWith: "PROJECT_ORG_" },
        AND: [
          { meta: { path: "$.projectId", equals: opts.projectId } },
          { meta: { path: "$.procurementId", equals: opts.procurementId } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 400,
    });
  } catch {
    const rows = await prisma.auditLog.findMany({
      where: { eventType: { startsWith: "PROJECT_ORG_" } },
      orderBy: { createdAt: "desc" },
      take: 600,
    });
    matched = rows
      .filter((row) => {
        const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
        return (
          String(meta.projectId || "") === opts.projectId &&
          String(meta.procurementId || "") === opts.procurementId
        );
      })
      .reverse();
  }

  const orgUserIds = [
    ...new Set(
      matched
        .map((row) => {
          const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
          return typeof meta.actorOrgUserId === "string" ? meta.actorOrgUserId : null;
        })
        .filter(Boolean),
    ),
  ];

  const orgUsers = orgUserIds.length
    ? await prisma.projectOrgUser.findMany({
        where: { id: { in: orgUserIds }, projectId: opts.projectId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      })
    : [];

  /** @type {Record<string, { id: string; displayName: string; departmentName: string | null }>} */
  const actorById = {};
  for (const u of orgUsers) {
    actorById[u.id] = {
      id: u.id,
      displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "—",
      departmentName: u.department?.name || null,
    };
  }

  return matched.map((row) =>
    serializeDomainAuditTimelineEntry(row, {
      procurementNumber: opts.procurementNumber || null,
      actorById,
    }),
  );
}
