import { writeAuditLog, AuditEvent } from "@/lib/audit-log";

export * from "@/lib/projects/committee-context-shared";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} orgUserId
 */
export async function getActiveCommittee(prisma, orgUserId) {
  const user = await prisma.projectOrgUser.findUnique({
    where: { id: orgUserId },
    select: {
      projectId: true,
      activeCommitteeId: true,
      activeCommittee: {
        select: { id: true, name: true, committeeType: true, projectId: true, isActive: true },
      },
    },
  });
  const committee = user?.activeCommittee;
  if (!committee) return null;
  const seat =
    committee.isActive && committee.projectId === user.projectId
      ? await prisma.projectOrgCommitteeMember.findFirst({
          where: { committeeId: committee.id, orgUserId, status: "ACTIVE" },
          select: { committeeRole: true },
        })
      : null;
  if (!seat) {
    await prisma.projectOrgUser.update({
      where: { id: orgUserId },
      data: { activeCommitteeId: null },
    });
    return null;
  }
  return {
    id: committee.id,
    name: committee.name,
    committeeType: committee.committeeType,
    committeeRole: seat.committeeRole,
  };
}

/**
 * List committees an org user is an ACTIVE member of (candidates for activation).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgUserId: string }} opts
 */
export async function listMyCommittees(prisma, opts) {
  const memberships = await prisma.projectOrgCommitteeMember.findMany({
    where: { orgUserId: opts.orgUserId, status: "ACTIVE", committee: { projectId: opts.projectId } },
    include: { committee: { select: { id: true, name: true, committeeType: true, isActive: true } } },
  });
  return memberships
    .filter((m) => m.committee?.isActive)
    .map((m) => ({
      id: m.committee.id,
      name: m.committee.name,
      committeeType: m.committee.committeeType,
      committeeRole: m.committeeRole,
    }));
}

/**
 * Set (or clear) the active committee context for the acting org user.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   orgUserId: string;
 *   committeeId: string | null;
 * }} opts
 */
export async function setActiveCommittee(prisma, opts) {
  if (!opts.committeeId) {
    await prisma.projectOrgUser.update({
      where: { id: opts.orgUserId },
      data: { activeCommitteeId: null },
    });
    return { ok: true, activeCommittee: null };
  }

  const membership = await prisma.projectOrgCommitteeMember.findFirst({
    where: {
      orgUserId: opts.orgUserId,
      status: "ACTIVE",
      committee: { id: opts.committeeId, projectId: opts.projectId, isActive: true },
    },
    include: { committee: { select: { id: true, name: true, committeeType: true } } },
  });
  if (!membership) {
    return {
      ok: false,
      error: "You are not an active member of that committee.",
      status: 403,
    };
  }

  await prisma.projectOrgUser.update({
    where: { id: opts.orgUserId },
    data: { activeCommitteeId: membership.committee.id },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_USER_UPDATED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      orgUserId: opts.orgUserId,
      activeCommitteeId: membership.committee.id,
      kind: "active_committee_context",
    },
  });

  return {
    ok: true,
    activeCommittee: {
      id: membership.committee.id,
      name: membership.committee.name,
      committeeType: membership.committee.committeeType,
      committeeRole: membership.committeeRole,
    },
  };
}

/**
 * Resolve the effective committee context for an action: explicit opts win,
 * otherwise fall back to the org user's stored active committee.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ orgUserId: string; activeCommitteeId?: string | null; committeeRole?: string | null }} opts
 */
export async function resolveCommitteeContext(prisma, opts) {
  if (opts.activeCommitteeId) {
    return { committeeId: opts.activeCommitteeId, committeeRole: opts.committeeRole || null };
  }
  const active = await getActiveCommittee(prisma, opts.orgUserId);
  return { committeeId: active?.id || null, committeeRole: opts.committeeRole || null };
}

/**
 * Require that the actor is an ACTIVE member of the given committee (or of *a*
 * committee of the required type when committeeId is not specified).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   orgUserId: string;
 *   committeeId?: string | null;
 *   committeeType: import("@prisma/client").OrgCommitteeType;
 * }} opts
 */
export async function requireCommitteeMembership(prisma, opts) {
  const where = {
    orgUserId: opts.orgUserId,
    status: "ACTIVE",
    committee: {
      projectId: opts.projectId,
      isActive: true,
      committeeType: opts.committeeType,
      ...(opts.committeeId ? { id: opts.committeeId } : {}),
    },
  };
  const membership = await prisma.projectOrgCommitteeMember.findFirst({
    where,
    include: { committee: { select: { id: true, name: true, committeeType: true } } },
  });
  if (!membership) {
    const typeLabel = String(opts.committeeType || "").replace(/_/g, " ").toLowerCase();
    return {
      ok: false,
      error: `You must be an active member of a ${typeLabel} committee to do this.`,
      status: 403,
    };
  }
  return {
    ok: true,
    committee: membership.committee,
    committeeRole: membership.committeeRole,
  };
}
