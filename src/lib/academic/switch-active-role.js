import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canActivateRole, grantedRoles } from "@/lib/roles";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { getCurrentAcademicContext } from "@/lib/academic/academic-context";
import {
  ensureDemoStudentModeContext,
  isStudentMode,
  resolveParticipationType,
  resolvePermanentRole,
} from "@/lib/academic/student-mode";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { parseStudentViewInput, saveStudentView } from "@/lib/academic/student-view";

/**
 * Switch effective (active) role. Permanent grants are unchanged.
 * Entering Student Mode auto-ensures current AY / demo enrollment / slate.
 *
 * @param {{
 *   userId: string;
 *   nextRole: string;
 *   studentView?: { programmeId?: unknown; campus?: unknown } | null;
 *   db?: import("@prisma/client").PrismaClient;
 *   buildPayload?: boolean;
 * }} opts
 * @returns {Promise<
 *   | { ok: true; previousRole: string; permanentRole: string; effectiveRole: string; participationType: string | null; demoContext: any; payload?: any }
 *   | { ok: false; status: number; error: string }
 * >}
 */
export async function switchActiveRole(opts) {
  const db = opts.db || prisma;
  const nextRole = String(opts.nextRole || "").trim();
  if (!nextRole) {
    return { ok: false, status: 400, error: "Role is required." };
  }

  const user = await db.user.findUnique({
    where: { id: opts.userId },
    include: { userRoles: true, settings: true },
  });

  if (!user?.settings) {
    return { ok: false, status: 400, error: "Account is not ready." };
  }

  const g = grantedRoles(user.userRoles);
  if (!canActivateRole(g, nextRole)) {
    return { ok: false, status: 403, error: "Forbidden role." };
  }

  const previousRole = user.settings.activeRole;
  const permanentRole = resolvePermanentRole(g);
  const enteringStudentMode =
    nextRole === Role.STUDENT && isStudentMode({ grantedRoles: g, activeRole: nextRole });

  /** @type {null | { programmeId: string; campus: string | null }} */
  let studentView = null;
  if (enteringStudentMode && opts.studentView) {
    const parsed = await parseStudentViewInput(db, opts.studentView);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    studentView = { programmeId: parsed.programmeId, campus: parsed.campus };
    await saveStudentView(db, user.id, studentView);
  }

  await db.userSettings.update({
    where: { userId: user.id },
    data: { activeRole: /** @type {import("@prisma/client").Role} */ (nextRole) },
  });

  /** @type {any} */
  let demoContext = null;
  if (enteringStudentMode) {
    const participationType = resolveParticipationType({
      grantedRoles: g,
      activeRole: nextRole,
    });
    try {
      demoContext = await ensureDemoStudentModeContext(
        user.id,
        /** @type {import("@prisma/client").AcademicParticipationType} */ (participationType),
        db,
      );
    } catch (e) {
      await db.userSettings.update({
        where: { userId: user.id },
        data: { activeRole: previousRole },
      });
      const code = e && typeof e === "object" && "code" in e ? e.code : "";
      if (code === "NO_CURRENT_YEAR") {
        return {
          ok: false,
          status: 409,
          error:
            "No current academic year is configured. Ask a system admin to set Academic setup first.",
        };
      }
      console.error(e);
      return {
        ok: false,
        status: 500,
        error: "Could not open Student Mode academic context.",
      };
    }
  }

  const university = await getCurrentAcademicContext(db);
  const participationType = resolveParticipationType({
    grantedRoles: g,
    activeRole: nextRole,
  });

  await writeAuditLog({
    eventType: AuditEvent.ACTIVE_ROLE_SWITCHED,
    actorUserId: user.id,
    targetUserId: user.id,
    meta: {
      permanentRole,
      previousEffectiveRole: previousRole,
      effectiveRole: nextRole,
      participationType,
      academicYearId: demoContext?.academicYear?.id || university.academicYear?.id || null,
      academicYearLabel:
        demoContext?.academicYear?.label || university.academicYear?.label || null,
      enrollmentId: demoContext?.enrollment?.id || null,
      orgAcademicSlateId: demoContext?.orgAcademicSlate?.id || null,
      projectId: demoContext?.projectId || null,
      ...(enteringStudentMode
        ? {
            studentViewProgrammeId:
              studentView?.programmeId || user.settings.studentViewProgrammeId || null,
            studentViewCampus: studentView
              ? studentView.campus
              : user.settings.studentViewCampus || null,
          }
        : {}),
      action: previousRole === nextRole ? "noop" : `${previousRole}→${nextRole}`,
    },
  });

  /** @type {any} */
  const result = {
    ok: true,
    previousRole,
    permanentRole,
    effectiveRole: nextRole,
    participationType,
    demoContext,
  };

  if (opts.buildPayload !== false) {
    result.payload = await buildSessionPayloadForUserId(user.id);
  }

  return result;
}
