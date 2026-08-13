/**
 * OrgAcademicSlate — academic-year context over one organisation Project
 * (personal My Organisation, or a per-attempt Practice/Assessment shell).
 *
 * See `org-academic-slate.design.js` for Phase 3 touchpoints and safety boundaries.
 */
import { OrgAcademicSlateStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCurrentAcademicContext,
  serializeAcademicYear,
  serializeSemester,
} from "@/lib/academic/academic-context";
import { getActiveEnrollment } from "@/lib/academic/student-enrollment";
import { findStudentPersonalOrg } from "@/lib/projects/student-personal-org";

/**
 * @param {any} row
 */
export function serializeOrgAcademicSlate(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    enrollmentId: row.enrollmentId,
    academicYearId: row.academicYearId,
    semesterId: row.semesterId || null,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt || null,
    academicYear: row.academicYear ? serializeAcademicYear(row.academicYear) : undefined,
    semester: row.semester ? serializeSemester(row.semester) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List filter: current slate rows + legacy null (never other years’ stamped rows).
 * When no current slate resolves, return {} so behaviour stays unchanged.
 * @param {string | null | undefined} currentSlateId
 */
export function orgOpsSlateListWhere(currentSlateId) {
  if (!currentSlateId) return {};
  return {
    OR: [{ orgAcademicSlateId: currentSlateId }, { orgAcademicSlateId: null }],
  };
}

/**
 * Enrich audit meta with academic context when a slate is known.
 * @param {Record<string, unknown>} meta
 * @param {any} slate
 */
export function withAcademicAuditMeta(meta, slate) {
  if (!slate) return meta;
  return {
    ...meta,
    orgAcademicSlateId: slate.id,
    academicEnrollmentId: slate.enrollmentId,
    academicYearId: slate.academicYearId,
    academicYearLabel: slate.academicYear?.label || null,
    semesterId: slate.semesterId || null,
    semesterName: slate.semester?.name || null,
    projectId: meta.projectId ?? slate.projectId,
  };
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [attempts]
 */
async function withDeadlockRetry(fn, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      if (code !== "P2034" || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Mark other CURRENT slates on this project HISTORICAL.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} projectId
 * @param {string} [exceptSlateId]
 */
async function markOtherSlatesHistorical(tx, projectId, exceptSlateId) {
  const now = new Date();
  await tx.orgAcademicSlate.updateMany({
    where: {
      projectId,
      status: OrgAcademicSlateStatus.CURRENT,
      ...(exceptSlateId ? { id: { not: exceptSlateId } } : {}),
    },
    data: {
      status: OrgAcademicSlateStatus.HISTORICAL,
      closedAt: now,
    },
  });
}

/**
 * Ensure CURRENT OrgAcademicSlate for an enrollment on one organisation Project
 * (personal org or an attempt workspace). Never moves a slate between organisations.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   projectId: string;
 *   enrollmentId: string;
 *   academicYearId: string;
 *   semesterId?: string | null;
 * }} opts
 */
export async function ensureOrgAcademicSlate(db, opts) {
  const university = await getCurrentAcademicContext(prisma);
  const semesterId =
    opts.semesterId !== undefined
      ? opts.semesterId
      : university.semester?.id || null;

  const run = async (/** @type {import("@prisma/client").Prisma.TransactionClient} */ tx) => {
    const existing = await tx.orgAcademicSlate.findFirst({
      where: { projectId: opts.projectId, enrollmentId: opts.enrollmentId },
      include: { academicYear: true, semester: true },
    });

    await markOtherSlatesHistorical(tx, opts.projectId, existing?.id);

    if (existing) {
      const updated = await tx.orgAcademicSlate.update({
        where: { id: existing.id },
        data: {
          status: OrgAcademicSlateStatus.CURRENT,
          closedAt: null,
          academicYearId: opts.academicYearId,
          semesterId,
          openedAt:
            existing.status === OrgAcademicSlateStatus.CURRENT
              ? existing.openedAt
              : new Date(),
        },
        include: { academicYear: true, semester: true },
      });
      return {
        slate: updated,
        created: false,
        alreadyCurrent: existing.status === OrgAcademicSlateStatus.CURRENT,
      };
    }

    try {
      const created = await tx.orgAcademicSlate.create({
        data: {
          projectId: opts.projectId,
          enrollmentId: opts.enrollmentId,
          academicYearId: opts.academicYearId,
          semesterId,
          status: OrgAcademicSlateStatus.CURRENT,
        },
        include: { academicYear: true, semester: true },
      });
      return { slate: created, created: true, alreadyCurrent: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await tx.orgAcademicSlate.findFirst({
          where: { projectId: opts.projectId, enrollmentId: opts.enrollmentId },
          include: { academicYear: true, semester: true },
        });
        if (!again) throw e;
        await markOtherSlatesHistorical(tx, opts.projectId, again.id);
        const updated = await tx.orgAcademicSlate.update({
          where: { id: again.id },
          data: {
            status: OrgAcademicSlateStatus.CURRENT,
            closedAt: null,
            semesterId,
          },
          include: { academicYear: true, semester: true },
        });
        return { slate: updated, created: false, alreadyCurrent: true };
      }
      throw e;
    }
  };

  if (typeof db.$transaction === "function") {
    return withDeadlockRetry(() => db.$transaction(run));
  }
  return run(/** @type {import("@prisma/client").Prisma.TransactionClient} */ (db));
}

/**
 * Ensure CURRENT slate for a specific organisation project + the owner's active enrollment.
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} projectId
 * @param {string} userId
 */
export async function ensureCurrentOrgSlateForProject(db = prisma, projectId, userId) {
  if (!projectId || !userId) return null;
  const enrollment = await getActiveEnrollment(db, userId);
  if (!enrollment) return null;

  const result = await ensureOrgAcademicSlate(db, {
    projectId,
    enrollmentId: enrollment.id,
    academicYearId: enrollment.academicYearId,
  });
  return {
    projectId,
    ...result,
    slate: serializeOrgAcademicSlate(result.slate),
  };
}

/**
 * Ensure CURRENT slate for the owner's personal org + active enrollment (lazy).
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} userId
 */
export async function ensureCurrentOrgSlateForOwner(db = prisma, userId) {
  const org = await findStudentPersonalOrg(db, userId);
  if (!org?.id) return null;
  return ensureCurrentOrgSlateForProject(db, org.id, userId);
}

/**
 * Resolve CURRENT slate id for a project (personal org). Null if none.
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} projectId
 */
export async function resolveCurrentOrgSlateId(db = prisma, projectId) {
  const row = await db.orgAcademicSlate.findFirst({
    where: { projectId, status: OrgAcademicSlateStatus.CURRENT },
    select: { id: true },
  });
  return row?.id || null;
}

/**
 * Resolve current slate with relations for stamp/audit.
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} projectId
 */
export async function resolveCurrentOrgSlate(db = prisma, projectId) {
  return db.orgAcademicSlate.findFirst({
    where: { projectId, status: OrgAcademicSlateStatus.CURRENT },
    include: { academicYear: true, semester: true },
  });
}

/**
 * For creates: return slate id when available (never blocks create).
 * Also lazy-ensures for personal org owner when enrollment exists.
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} projectId
 */
export async function resolveSlateIdForOrgCreate(db, projectId) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, isPersonalOrg: true, isAttemptOrg: true, ownerUserId: true },
  });
  if (!project) return null;

  let slateId = await resolveCurrentOrgSlateId(db, projectId);
  if (slateId) return slateId;

  if ((project.isPersonalOrg || project.isAttemptOrg) && project.ownerUserId) {
    const ensured = await ensureCurrentOrgSlateForProject(db, project.id, project.ownerUserId);
    return ensured?.slate?.id || null;
  }
  return null;
}

export { OrgAcademicSlateStatus };
