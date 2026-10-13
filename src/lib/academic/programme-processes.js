/**
 * Programme × academic year process switches — the master list of engine processes students
 * on a programme may use in a given academic year. No row = enabled, so new programmes, new
 * years and new processes are on by default. Read live on every request (changes apply at once).
 */
import { Role } from "@prisma/client";
import { ASSESSMENT_PROCESS_CATALOGUE } from "@/lib/academic/assessment-process-catalogue";
import { runInTx } from "@/lib/db-tx";

/** Engine process codes in procurement-path order. */
export const PROGRAMME_PROCESS_CODES = ASSESSMENT_PROCESS_CATALOGUE.map((p) => p.code);
const KNOWN = new Set(PROGRAMME_PROCESS_CODES);

/**
 * @typedef {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} Db
 */

/**
 * Enabled codes for one programme × year. Null when either is missing (no programme gate).
 * @param {Db} db
 * @param {string | null | undefined} programmeId
 * @param {string | null | undefined} academicYearId
 * @returns {Promise<string[] | null>}
 */
export async function programmeYearEnabledCodes(db, programmeId, academicYearId) {
  if (!programmeId || !academicYearId) return null;
  const off = await db.programmeYearProcess.findMany({
    where: { programmeId, academicYearId, isEnabled: false },
    select: { processCode: true },
  });
  const disabled = new Set(off.map((r) => r.processCode));
  return PROGRAMME_PROCESS_CODES.filter((c) => !disabled.has(c));
}

/**
 * Disabled codes for many programmes in one year: programmeId → Set(code).
 * @param {Db} db
 * @param {string} academicYearId
 * @param {string[]} programmeIds
 */
export async function disabledCodesByProgramme(db, academicYearId, programmeIds) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map(programmeIds.map((id) => [id, new Set()]));
  if (!programmeIds.length) return out;
  const rows = await db.programmeYearProcess.findMany({
    where: { academicYearId, programmeId: { in: programmeIds }, isEnabled: false },
    select: { programmeId: true, processCode: true },
  });
  for (const r of rows) {
    if (KNOWN.has(r.processCode)) out.get(r.programmeId)?.add(r.processCode);
  }
  return out;
}

/**
 * Academic year a student works in: active enrollment, else the current year.
 * @param {Db} db
 * @param {string} userId
 */
async function studentAcademicYearId(db, userId) {
  const enrollment = await db.studentAcademicEnrollment.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { joinedAt: "desc" },
    select: { academicYearId: true },
  });
  if (enrollment) return enrollment.academicYearId;
  const current = await db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
  return current?.id || null;
}

/**
 * Programme × year that governs an organisation workspace.
 * - Attempt org: the academic project's programme and year.
 * - Personal / student-owned org: the owner's programme (or Student Mode programme) and year.
 * - Examiner project: its own programme and year.
 * @param {Db} db
 * @param {string} orgProjectId
 * @returns {Promise<{ programmeId: string | null; academicYearId: string | null; sourceAcademicProjectId: string | null } | null>}
 */
export async function resolveOrgProgrammeContext(db, orgProjectId) {
  const project = await db.project.findUnique({
    where: { id: orgProjectId },
    select: {
      isPersonalOrg: true,
      isAttemptOrg: true,
      creatorRole: true,
      ownerUserId: true,
      programmeId: true,
      academicYearId: true,
      sourceAcademicProjectId: true,
      sourceAcademicProject: { select: { programmeId: true, academicYearId: true } },
    },
  });
  if (!project) return null;
  if (project.isAttemptOrg && project.sourceAcademicProjectId) {
    return {
      programmeId: project.sourceAcademicProject?.programmeId || null,
      academicYearId: project.sourceAcademicProject?.academicYearId || null,
      sourceAcademicProjectId: project.sourceAcademicProjectId,
    };
  }
  if (project.isPersonalOrg || project.creatorRole === Role.STUDENT) {
    if (!project.ownerUserId) return { programmeId: null, academicYearId: null, sourceAcademicProjectId: null };
    const owner = await db.user.findUnique({
      where: { id: project.ownerUserId },
      select: {
        studentProfile: { select: { programmeId: true } },
        settings: { select: { studentViewProgrammeId: true } },
      },
    });
    const programmeId =
      owner?.studentProfile?.programmeId || owner?.settings?.studentViewProgrammeId || null;
    return {
      programmeId,
      academicYearId: programmeId ? await studentAcademicYearId(db, project.ownerUserId) : null,
      sourceAcademicProjectId: null,
    };
  }
  return {
    programmeId: project.programmeId || null,
    academicYearId: project.academicYearId || null,
    sourceAcademicProjectId: null,
  };
}

/**
 * Processes an organisation may use right now: programme × year list, intersected with the
 * examiner's per-project list for attempt orgs. Null = unrestricted (no programme/year known).
 * @param {Db} db
 * @param {string} orgProjectId
 * @returns {Promise<string[] | null>}
 */
export async function resolveEffectiveProcessCodes(db, orgProjectId) {
  const ctx = await resolveOrgProgrammeContext(db, orgProjectId);
  if (!ctx) return null;
  const programmeCodes = await programmeYearEnabledCodes(db, ctx.programmeId, ctx.academicYearId);
  let examinerCodes = null;
  if (ctx.sourceAcademicProjectId) {
    const { resolveAllowedProcessCodes } = await import("@/lib/academic/assessment-config");
    examinerCodes = await resolveAllowedProcessCodes(/** @type {any} */ (db), ctx.sourceAcademicProjectId);
  }
  return intersectCodes(programmeCodes, examinerCodes);
}

/**
 * Programme × year list for an academic (examiner) project. Null when it has no programme/year.
 * @param {Db} db
 * @param {{ programmeId?: string | null; academicYearId?: string | null }} project
 */
export function projectProgrammeCodes(db, project) {
  return programmeYearEnabledCodes(db, project?.programmeId, project?.academicYearId);
}

/**
 * @param {string[] | null} a
 * @param {string[] | null} b
 * @returns {string[] | null}
 */
export function intersectCodes(a, b) {
  if (!a && !b) return null;
  if (!a) return b ? [...b] : null;
  if (!b) return [...a];
  const set = new Set(b);
  return a.filter((c) => set.has(c));
}

/** @param {string} processName */
export function processDisabledForProgrammeMessage(processName) {
  return `The ${processName} is disabled for your programme this academic year.`;
}

/**
 * Replace the disabled set for one programme × year (sparse: only disabled rows are stored).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ programmeId: string; academicYearId: string; disabledCodes: Iterable<string>; actorUserId: string }} opts
 */
export async function writeProgrammeDisabledCodes(db, opts) {
  const disabled = [...new Set(opts.disabledCodes)].filter((c) => KNOWN.has(c));
  await runInTx(db, async (tx) => {
    await tx.programmeYearProcess.deleteMany({
      where: { programmeId: opts.programmeId, academicYearId: opts.academicYearId },
    });
    await tx.programmeYearProcess.createMany({
      data: disabled.map((processCode) => ({
        programmeId: opts.programmeId,
        academicYearId: opts.academicYearId,
        processCode,
        isEnabled: false,
        updatedByUserId: opts.actorUserId,
      })),
    });
  });
  return PROGRAMME_PROCESS_CODES.filter((c) => disabled.includes(c));
}

/**
 * Who a change to one programme × year reaches (for the confirm dialog).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {{ programmeId: string; academicYearId: string; codes: string[] }} opts
 */
export async function programmeProcessImpact(db, opts) {
  const { programmeId, academicYearId } = opts;
  const codes = opts.codes.filter((c) => KNOWN.has(c));
  const { TRIGGER_TO_PROCESS_CODE } = await import("@/lib/projects/process-catalogue");
  const triggers = Object.entries(TRIGGER_TO_PROCESS_CODE)
    .filter(([, code]) => codes.includes(code))
    .map(([trigger]) => trigger);
  const [students, projects, inFlight] = await Promise.all([
    db.studentProfile.count({
      where: { programmeId, user: { academicEnrollments: { some: { academicYearId } } } },
    }),
    db.project.count({
      where: { programmeId, academicYearId, isAttemptOrg: false, isPersonalOrg: false },
    }),
    codes.length
      ? db.projectOrgWorkflowInstance.count({
          where: {
            status: "ACTIVE",
            processFlow: { OR: [{ code: { in: codes } }, { triggerKey: { in: triggers } }] },
            project: {
              OR: [
                { isAttemptOrg: true, sourceAcademicProject: { programmeId, academicYearId } },
                {
                  isPersonalOrg: true,
                  owner: {
                    studentProfile: { programmeId },
                    academicEnrollments: { some: { academicYearId, status: "ACTIVE" } },
                  },
                },
              ],
            },
          },
        })
      : 0,
  ]);
  return { students, projects, inFlight };
}
