import { campusLabel, parseCampus } from "@/lib/campuses";

/**
 * Staff Student Mode: programme + campus a staff account follows while viewing as a student.
 * Stored on UserSettings (staff have no StudentProfile). Campus null = all campuses.
 */

/**
 * @param {any} settings UserSettings row with optional `studentViewProgramme` include
 */
export function serializeStudentView(settings) {
  if (!settings?.studentViewProgrammeId) return null;
  const programme = settings.studentViewProgramme || null;
  return {
    programmeId: settings.studentViewProgrammeId,
    programmeName: programme?.name || null,
    programmeShortName: programme?.shortName || null,
    campus: settings.studentViewCampus || null,
    campusLabel: campusLabel(settings.studentViewCampus) || "All campuses",
  };
}

/** Prisma `select` for user.settings when listing participants. */
export const STUDENT_VIEW_SETTINGS_SELECT = {
  select: {
    studentViewProgrammeId: true,
    studentViewCampus: true,
    studentViewProgramme: { select: { name: true, shortName: true } },
  },
};

/**
 * Programme + campus for a participant row: StudentProfile, else staff Student Mode settings.
 * @param {any} user with `studentProfile.programme` and optional `settings` (STUDENT_VIEW_SETTINGS_SELECT)
 */
export function participantProgrammeCampus(user) {
  const profile = user?.studentProfile || null;
  const view = profile ? null : user?.settings || null;
  const programme = profile?.programme || view?.studentViewProgramme || null;
  const campus = (profile ? profile.campus : view?.studentViewCampus) || null;
  return {
    programmeName: programme?.name || null,
    programmeShortName: programme?.shortName || null,
    campus,
    campusLabel: campusLabel(campus) || (view?.studentViewProgrammeId ? "All campuses" : null),
  };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} userId
 */
export async function getStudentView(db, userId) {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: {
      studentViewProgrammeId: true,
      studentViewCampus: true,
      studentViewProgramme: { select: { name: true, shortName: true } },
    },
  });
  return serializeStudentView(settings);
}

/**
 * Validate client input. Programme must exist and be active; campus empty = all campuses.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{ programmeId?: unknown; campus?: unknown }} input
 * @returns {Promise<
 *   | { ok: true; programmeId: string; campus: string | null }
 *   | { ok: false; error: string }
 * >}
 */
export async function parseStudentViewInput(db, input) {
  const programmeId = typeof input?.programmeId === "string" ? input.programmeId.trim() : "";
  if (!programmeId) return { ok: false, error: "Choose a programme." };
  const programme = await db.programme.findUnique({
    where: { id: programmeId },
    select: { id: true, isActive: true },
  });
  if (!programme?.isActive) return { ok: false, error: "Choose an active programme." };

  const rawCampus = typeof input?.campus === "string" ? input.campus.trim() : "";
  const campus = rawCampus ? parseCampus(rawCampus) : null;
  if (rawCampus && !campus) return { ok: false, error: "Choose a valid campus." };

  return { ok: true, programmeId: programme.id, campus };
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string} userId
 * @param {{ programmeId: string; campus: string | null }} view
 */
export async function saveStudentView(db, userId, view) {
  await db.userSettings.update({
    where: { userId },
    data: {
      studentViewProgrammeId: view.programmeId,
      studentViewCampus: /** @type {any} */ (view.campus),
    },
  });
  return getStudentView(db, userId);
}
