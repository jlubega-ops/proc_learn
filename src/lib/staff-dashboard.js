import { Role, UserAccountStatus } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { readSiteSettings } from "@/lib/site-settings";
import { auditEventTypeLabel } from "@/lib/audit-log-display";
import { formatUserDisplayName } from "@/lib/user-display";
import { computeWindowOpenState } from "@/lib/server-clock";

/** Examiner Practice / Assessment projects (never student org shells). */
const ACADEMIC_PROJECT_WHERE = { creatorRole: Role.EXAMINER, isPersonalOrg: false, isAttemptOrg: false };

const SUBMITTED_ATTEMPT = new Set(["SUBMITTED", "UNDER_REVIEW", "COMPLETED"]);
const AWAITING_MARK_ATTEMPT = new Set(["SUBMITTED", "UNDER_REVIEW"]);
const CLOSING_SOON_DAYS = 7;
const RECENT_PROJECTS = 5;
const ATTENTION_LIMIT = 6;

/**
 * Per-project and overall teaching figures shared by the examiner and system admin home.
 * @param {Date} now
 */
async function loadTeaching(now) {
  const [projects, attempts, currentYear] = await Promise.all([
    prisma.project.findMany({
      where: ACADEMIC_PROJECT_WHERE,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        purpose: true,
        isPublished: true,
        openAt: true,
        closeAt: true,
        assessment: { select: { scoringEnabled: true, resultsReleased: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.projectAttempt.findMany({
      where: { enrollment: { project: ACADEMIC_PROJECT_WHERE } },
      select: {
        status: true,
        enrollment: { select: { projectId: true } },
        grade: { select: { status: true } },
      },
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { label: true } }),
  ]);

  /** @type {Map<string, { inProgress: number; submitted: number; toMark: number; graded: number }>} */
  const perProject = new Map();
  const scoringById = new Map(projects.map((p) => [p.id, p.assessment?.scoringEnabled !== false]));
  for (const a of attempts) {
    const id = a.enrollment.projectId;
    const row = perProject.get(id) || { inProgress: 0, submitted: 0, toMark: 0, graded: 0 };
    if (a.status === "IN_PROGRESS") row.inProgress += 1;
    if (SUBMITTED_ATTEMPT.has(a.status)) row.submitted += 1;
    if (a.grade?.status === "GRADED") row.graded += 1;
    else if (AWAITING_MARK_ATTEMPT.has(a.status) && scoringById.get(id)) row.toMark += 1;
    perProject.set(id, row);
  }

  const nowMs = now.getTime();
  const soon = addDays(now, CLOSING_SOON_DAYS).getTime();
  const rows = projects.map((p) => {
    const s = perProject.get(p.id) || { inProgress: 0, submitted: 0, toMark: 0, graded: 0 };
    return {
      id: p.id,
      name: p.name,
      purpose: p.purpose,
      isPublished: p.isPublished,
      closeAt: p.closeAt,
      window: p.isPublished ? computeWindowOpenState(p, nowMs) : "DRAFT",
      enrolled: p._count.enrollments,
      ...s,
      readyToRelease: Boolean(p.assessment?.scoringEnabled && !p.assessment.resultsReleased && s.graded > 0),
      closingSoon: Boolean(
        p.isPublished && p.closeAt && p.closeAt.getTime() > nowMs && p.closeAt.getTime() <= soon,
      ),
    };
  });

  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const count = (fn) => rows.filter(fn).length;

  /** @type {{ key: string; tone: "warning" | "info" | "error"; text: string; href: string; action: string }[]} */
  const attention = [];
  for (const r of rows) {
    if (r.toMark > 0) {
      attention.push({
        key: `mark-${r.id}`,
        tone: "warning",
        text: `${r.toMark} to mark — ${r.name}`,
        href: `/projects/${r.id}/results`,
        action: "Mark",
      });
    }
  }
  for (const r of rows) {
    if (r.readyToRelease) {
      attention.push({
        key: `release-${r.id}`,
        tone: "info",
        text: `Results not released — ${r.name}`,
        href: `/projects/${r.id}/results`,
        action: "Release",
      });
    }
  }
  for (const r of rows.filter((x) => x.closingSoon).sort((a, b) => a.closeAt - b.closeAt)) {
    attention.push({
      key: `close-${r.id}`,
      tone: "error",
      text: `Closes soon — ${r.name}`,
      href: `/projects/${r.id}/participants`,
      action: "Participants",
      closeAt: r.closeAt,
    });
  }

  return {
    currentYearLabel: currentYear?.label || null,
    projects: {
      open: count((r) => r.window === "OPEN"),
      upcoming: count((r) => r.window === "NOT_YET"),
      drafts: count((r) => r.window === "DRAFT"),
      assessments: count((r) => r.purpose === "ASSESSMENT"),
      practice: count((r) => r.purpose !== "ASSESSMENT"),
    },
    work: {
      enrolled: sum("enrolled"),
      inProgress: sum("inProgress"),
      submitted: sum("submitted"),
      toMark: sum("toMark"),
      graded: sum("graded"),
    },
    attention: attention.slice(0, ATTENTION_LIMIT),
    attentionTotal: attention.length,
    recentProjects: rows.slice(0, RECENT_PROJECTS),
  };
}

/**
 * Users, sign-ins and system state for the system admin home.
 * @param {Date} now
 */
async function loadSystem(now) {
  const studentWhere = { userRoles: { some: { role: Role.STUDENT } } };
  const staffWhere = { userRoles: { some: { role: { in: [Role.EXAMINER, Role.SYSTEM_ADMIN] } } } };
  const [students, staff, neverSignedIn, pending, suspended, activeWeek, programmes, settings, events] =
    await Promise.all([
      prisma.user.count({ where: studentWhere }),
      prisma.user.count({ where: staffWhere }),
      prisma.user.count({ where: { ...studentWhere, lastLoginAt: null } }),
      prisma.user.count({ where: { accountStatus: UserAccountStatus.PENDING_ACTIVATION } }),
      prisma.user.count({ where: { accountStatus: UserAccountStatus.SUSPENDED } }),
      prisma.user.count({ where: { lastLoginAt: { gte: subDays(now, 7) } } }),
      prisma.programme.count({ where: { isActive: true } }),
      readSiteSettings(),
      prisma.auditLog.findMany({
        where: { NOT: { eventType: { startsWith: "PROJECT_ORG_" } } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, eventType: true, actorUserId: true, createdAt: true },
      }),
    ]);

  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, middleName: true, lastName: true, email: true },
      })
    : [];
  const actorName = new Map(actors.map((u) => [u.id, formatUserDisplayName(u) || u.email]));

  return {
    users: { students, staff, neverSignedIn, pending, suspended, activeWeek },
    activeProgrammes: programmes,
    maintenanceEnabled: Boolean(settings.maintenanceEnabled),
    recentActivity: events.map((e) => ({
      id: e.id,
      label: auditEventTypeLabel(e.eventType),
      actor: (e.actorUserId && actorName.get(e.actorUserId)) || "System",
      createdAt: e.createdAt,
    })),
  };
}

/**
 * @param {{ isSystemAdmin: boolean; now?: Date }} opts
 */
export async function loadStaffDashboard({ isSystemAdmin, now = new Date() }) {
  const [teaching, system] = await Promise.all([
    loadTeaching(now),
    isSystemAdmin ? loadSystem(now) : Promise.resolve(null),
  ]);
  return { teaching, system };
}
