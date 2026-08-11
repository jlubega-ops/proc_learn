/**
 * Student academic enrollment — Phase 2 authoritative academic-year participation.
 *
 * Transition note:
 * - `StudentProfile.academicYearLabel` remains for admin create/edit/filter compatibility.
 * - `StudentAcademicEnrollment` is the source of truth for which Academic Year a student
 *   participates in (ACTIVE) and history (HISTORICAL). The profile label is kept in sync.
 *
 * Uniqueness:
 * - DB: @@unique([userId, academicYearId]) — one enrollment row per user per year.
 * - Service: at most one ACTIVE enrollment per user (others become HISTORICAL on join).
 *
 * Bootstrap / seeding:
 * - Phase 1 `GET /api/meta/academic-context` may seed a current year+semester in empty DBs
 *   (dev/bootstrap only). Phase 2 does not expand that. Production should create Academic Years
 *   via System Admin Academic setup — do not auto-create university years in student joins beyond
 *   finding existing current year or provisioning years that match an admin-set profile label.
 */
import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCurrentAcademicContext,
  normalizeAcademicYearLabel,
  serializeAcademicYear,
} from "@/lib/academic/academic-context";

/**
 * @param {any} row
 */
export function serializeEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    academicYearId: row.academicYearId,
    status: row.status,
    participationType: row.participationType,
    classCohortId: row.classCohortId || null,
    joinedAt: row.joinedAt,
    endedAt: row.endedAt || null,
    academicYear: row.academicYear ? serializeAcademicYear(row.academicYear) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Find AcademicYear by label, or create a non-current year for admin-provisioned labels.
 * Does NOT mark the year current (avoids production auto-current seeding).
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} labelRaw
 */
export async function findOrCreateAcademicYearByLabel(db, labelRaw) {
  const label = normalizeAcademicYearLabel(labelRaw);
  if (!label) {
    throw new Error("Invalid academic year label.");
  }
  const existing = await db.academicYear.findUnique({ where: { label } });
  if (existing) return existing;

  const [startY] = label.split("/").map((x) => Number(x));
  const startDate = new Date(Date.UTC(startY, 7, 1));
  const endDate = new Date(Date.UTC(startY + 1, 6, 31));
  return db.academicYear.create({
    data: {
      label,
      startDate,
      endDate,
      isCurrent: false,
      description: "Created from student academic year assignment",
    },
  });
}

/**
 * Mark all ACTIVE enrollments for the user as HISTORICAL (preserve rows).
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} userId
 * @param {string} [exceptEnrollmentId]
 */
async function markActiveEnrollmentsHistorical(tx, userId, exceptEnrollmentId) {
  const now = new Date();
  await tx.studentAcademicEnrollment.updateMany({
    where: {
      userId,
      status: AcademicEnrollmentStatus.ACTIVE,
      ...(exceptEnrollmentId ? { id: { not: exceptEnrollmentId } } : {}),
    },
    data: {
      status: AcademicEnrollmentStatus.HISTORICAL,
      endedAt: now,
    },
  });
}

/**
 * Retry interactive transactions that hit MySQL write conflicts / deadlocks (P2034).
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [attempts]
 * @returns {Promise<T>}
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
 * Ensure an ACTIVE enrollment exists for (user, year). Never deletes history.
 * Reactivates an existing HISTORICAL row for the same year if present.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   userId: string;
 *   academicYearId: string;
 *   participationType?: import("@prisma/client").AcademicParticipationType;
 *   classCohortId?: string | null;
 *   syncProfileLabel?: boolean;
 * }} opts
 */
export async function ensureActiveEnrollment(db, opts) {
  const requestedType = opts.participationType || AcademicParticipationType.STUDENT;
  const syncProfileLabel = opts.syncProfileLabel !== false;

  const run = async (/** @type {import("@prisma/client").Prisma.TransactionClient} */ tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: opts.academicYearId } });
    if (!year) throw new Error("Academic year not found.");

    const existing = await tx.studentAcademicEnrollment.findUnique({
      where: {
        userId_academicYearId: {
          userId: opts.userId,
          academicYearId: opts.academicYearId,
        },
      },
      include: { academicYear: true },
    });

    await markActiveEnrollmentsHistorical(tx, opts.userId, existing?.id);

    // Hard rule: never demote a DEMO participation row to STUDENT via join/backfill.
    const demoTypes = new Set([
      AcademicParticipationType.EXAMINER_DEMO,
      AcademicParticipationType.SYSTEM_ADMIN_DEMO,
    ]);
    let participationType = requestedType;
    if (
      existing &&
      demoTypes.has(existing.participationType) &&
      requestedType === AcademicParticipationType.STUDENT
    ) {
      participationType = existing.participationType;
    }

    let enrollment;
    let created = false;
    let reactivated = false;
    if (existing) {
      reactivated = existing.status !== AcademicEnrollmentStatus.ACTIVE;
      enrollment = await tx.studentAcademicEnrollment.update({
        where: { id: existing.id },
        data: {
          status: AcademicEnrollmentStatus.ACTIVE,
          participationType,
          endedAt: null,
          joinedAt: existing.status === AcademicEnrollmentStatus.ACTIVE ? existing.joinedAt : new Date(),
          ...(opts.classCohortId !== undefined ? { classCohortId: opts.classCohortId } : {}),
        },
        include: { academicYear: true },
      });
    } else {
      created = true;
      enrollment = await tx.studentAcademicEnrollment.create({
        data: {
          userId: opts.userId,
          academicYearId: opts.academicYearId,
          status: AcademicEnrollmentStatus.ACTIVE,
          participationType,
          classCohortId: opts.classCohortId ?? null,
        },
        include: { academicYear: true },
      });
    }

    if (syncProfileLabel) {
      const profile = await tx.studentProfile.findUnique({ where: { userId: opts.userId } });
      if (profile && profile.academicYearLabel !== year.label) {
        await tx.studentProfile.update({
          where: { userId: opts.userId },
          data: { academicYearLabel: year.label },
        });
      }
    }

    return { enrollment, created, reactivated, alreadyActive: Boolean(existing && !reactivated) };
  };

  if (typeof db.$transaction === "function") {
    return withDeadlockRetry(() => db.$transaction(run));
  }
  return run(/** @type {import("@prisma/client").Prisma.TransactionClient} */ (db));
}

/**
 * Provision enrollment from profile label (student create / backfill).
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ userId: string; academicYearLabel: string }} opts
 */
export async function ensureEnrollmentFromProfileLabel(db, opts) {
  const year = await findOrCreateAcademicYearByLabel(db, opts.academicYearLabel);
  const result = await ensureActiveEnrollment(db, {
    userId: opts.userId,
    academicYearId: year.id,
    participationType: AcademicParticipationType.STUDENT,
    syncProfileLabel: true,
  });
  return result.enrollment;
}

/**
 * Backfill enrollment if the student has a profile label but no enrollment rows.
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} userId
 */
export async function backfillEnrollmentFromProfileIfNeeded(db = prisma, userId) {
  const count = await db.studentAcademicEnrollment.count({ where: { userId } });
  if (count > 0) return null;
  const profile = await db.studentProfile.findUnique({ where: { userId } });
  if (!profile?.academicYearLabel) return null;
  const label = normalizeAcademicYearLabel(profile.academicYearLabel);
  if (!label) return null;
  return ensureEnrollmentFromProfileLabel(db, {
    userId,
    academicYearLabel: label,
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} userId
 */
export async function listEnrollmentsForUser(db = prisma, userId) {
  const rows = await db.studentAcademicEnrollment.findMany({
    where: { userId },
    include: { academicYear: true },
    orderBy: [{ status: "asc" }, { academicYear: { label: "desc" } }],
  });
  return rows.map(serializeEnrollment);
}

/**
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {string} userId
 */
export async function getActiveEnrollment(db = prisma, userId) {
  return db.studentAcademicEnrollment.findFirst({
    where: { userId, status: AcademicEnrollmentStatus.ACTIVE },
    include: { academicYear: true },
  });
}

/**
 * Student-facing academic context: university current AY/semester + enrollment + join prompt.
 * Demo Student Mode auto-ensures current year context (no join prompt).
 *
 * @param {string} userId
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function getStudentAcademicContext(userId, db = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { userRoles: true, settings: true, studentProfile: { select: { userId: true } } },
  });
  const granted = (user?.userRoles || []).map((r) => r.role);
  const activeRole = user?.settings?.activeRole || null;

  const { resolveParticipationType, isStudentMode, ensureDemoStudentModeContext } = await import(
    "@/lib/academic/student-mode"
  );
  const participationType = resolveParticipationType({ grantedRoles: granted, activeRole });
  const studentMode = isStudentMode({ grantedRoles: granted, activeRole });

  if (
    studentMode &&
    (participationType === AcademicParticipationType.EXAMINER_DEMO ||
      participationType === AcademicParticipationType.SYSTEM_ADMIN_DEMO)
  ) {
    const demo = await ensureDemoStudentModeContext(userId, participationType, db);
    const enrollments = await listEnrollmentsForUser(db, userId);
    return {
      academicYear: demo.academicYear,
      semester: demo.semester,
      enrollment: serializeEnrollment(demo.enrollment),
      enrollments,
      enrolledInCurrentYear: true,
      joinPrompt: null,
      orgAcademicSlate: demo.orgAcademicSlate,
      participationType,
      isStudentMode: true,
    };
  }

  await backfillEnrollmentFromProfileIfNeeded(db, userId);

  const university = await getCurrentAcademicContext(db);
  const active = await getActiveEnrollment(db, userId);
  const enrollments = await listEnrollmentsForUser(db, userId);

  let slate = null;
  try {
    const { ensureCurrentOrgSlateForOwner } = await import("@/lib/academic/org-academic-slate");
    if (active) {
      const ensured = await ensureCurrentOrgSlateForOwner(db, userId);
      slate = ensured?.slate || null;
    }
  } catch {
    slate = null;
  }

  const currentYearId = university.academicYear?.id || null;
  const enrolledInCurrentYear = Boolean(
    currentYearId &&
      active?.academicYearId === currentYearId &&
      active?.status === AcademicEnrollmentStatus.ACTIVE,
  );

  /** @type {null | {
   *   reason: "previous_year" | "no_enrollment";
   *   previousLabel: string | null;
   *   currentLabel: string;
   *   currentAcademicYearId: string;
   * }} */
  let joinPrompt = null;

  if (university.academicYear && !enrolledInCurrentYear && user?.studentProfile) {
    const previousLabel = active?.academicYear?.label || null;
    joinPrompt = {
      reason: previousLabel ? "previous_year" : "no_enrollment",
      previousLabel,
      currentLabel: university.academicYear.label,
      currentAcademicYearId: university.academicYear.id,
    };
  }

  return {
    academicYear: university.academicYear,
    semester: university.semester,
    enrollment: serializeEnrollment(active),
    enrollments,
    enrolledInCurrentYear,
    joinPrompt,
    orgAcademicSlate: slate,
    participationType: participationType || AcademicParticipationType.STUDENT,
    isStudentMode: false,
  };
}

/**
 * Join the university current Academic Year (preserves historical enrollments).
 * @param {string} userId
 * @param {{ actorUserId?: string | null }} [meta]
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function joinCurrentAcademicYear(userId, meta = {}, db = prisma) {
  const university = await getCurrentAcademicContext(db);
  if (!university.academicYear?.id) {
    const err = new Error("No current academic year is configured.");
    // @ts-ignore
    err.code = "NO_CURRENT_YEAR";
    throw err;
  }

  const profile = await db.studentProfile.findUnique({ where: { userId } });
  if (!profile) {
    const err = new Error("Only students can join an academic year.");
    // @ts-ignore
    err.code = "NOT_STUDENT";
    throw err;
  }

  const previousActive = await getActiveEnrollment(db, userId);

  try {
    const result = await ensureActiveEnrollment(db, {
      userId,
      academicYearId: university.academicYear.id,
      participationType: AcademicParticipationType.STUDENT,
      syncProfileLabel: true,
    });

    // Open a clean CURRENT OrgAcademicSlate on My Organisation for the new enrollment.
    let slateResult = null;
    try {
      const { ensureCurrentOrgSlateForOwner } = await import("@/lib/academic/org-academic-slate");
      slateResult = await ensureCurrentOrgSlateForOwner(db, userId);
    } catch {
      slateResult = null;
    }

    return {
      enrollment: serializeEnrollment(result.enrollment),
      academicYear: university.academicYear,
      semester: university.semester,
      created: result.created,
      reactivated: result.reactivated,
      alreadyActive: result.alreadyActive,
      previousActive: serializeEnrollment(previousActive),
      orgAcademicSlate: slateResult?.slate || null,
      slateCreated: Boolean(slateResult?.created),
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const result = await ensureActiveEnrollment(db, {
        userId,
        academicYearId: university.academicYear.id,
        participationType: AcademicParticipationType.STUDENT,
        syncProfileLabel: true,
      });
      let slateResult = null;
      try {
        const { ensureCurrentOrgSlateForOwner } = await import("@/lib/academic/org-academic-slate");
        slateResult = await ensureCurrentOrgSlateForOwner(db, userId);
      } catch {
        slateResult = null;
      }
      return {
        enrollment: serializeEnrollment(result.enrollment),
        academicYear: university.academicYear,
        semester: university.semester,
        created: result.created,
        reactivated: result.reactivated,
        alreadyActive: result.alreadyActive,
        previousActive: serializeEnrollment(previousActive),
        orgAcademicSlate: slateResult?.slate || null,
        slateCreated: Boolean(slateResult?.created),
      };
    }
    throw e;
  }
}

export { AcademicEnrollmentStatus, AcademicParticipationType };
