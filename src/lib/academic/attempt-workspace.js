/**
 * State of an attempt organisation (the isolated org a student works in for one academic project).
 * Shared by the request proxy (write lock) and the org-member / provider attempt bar.
 */
import { ProjectAttemptStatus } from "@prisma/client";
import { computeAttemptTimer } from "@/lib/academic/attempt-timer";

const IN_FLIGHT = new Set([ProjectAttemptStatus.IN_PROGRESS, ProjectAttemptStatus.RETURNED]);

const attemptSelect = {
  id: true,
  attemptNumber: true,
  status: true,
  startedAt: true,
  submittedAt: true,
  durationSecondsUsed: true,
  enrollment: { select: { studentUserId: true } },
};

/**
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} workspaceProjectId
 * @returns {Promise<null | {
 *   workspace: any;
 *   academicProject: any;
 *   attempt: any;
 *   studentUserId: string | null;
 *   timer: ReturnType<typeof computeAttemptTimer> | null;
 *   inFlight: boolean;
 *   locked: boolean;
 *   lockReason: null | "SUBMITTED" | "TIME_UP";
 * }>} null when the project is not an attempt organisation
 */
export async function loadAttemptWorkspaceState(db, workspaceProjectId) {
  if (!workspaceProjectId) return null;
  const workspace = await db.project.findUnique({
    where: { id: workspaceProjectId },
    select: {
      id: true,
      name: true,
      organizationName: true,
      isAttemptOrg: true,
      ownerUserId: true,
      sourceAcademicProject: {
        select: {
          id: true,
          name: true,
          purpose: true,
          durationSeconds: true,
          openAt: true,
          closeAt: true,
          allowEditAfterSubmit: true,
        },
      },
    },
  });
  if (!workspace?.isAttemptOrg || !workspace.sourceAcademicProject) return null;
  const academicProject = workspace.sourceAcademicProject;

  let attempt = await db.projectAttempt.findFirst({
    where: { workspaceProjectId },
    orderBy: { attemptNumber: "desc" },
    select: attemptSelect,
  });
  if (!attempt && workspace.ownerUserId) {
    attempt = await db.projectAttempt.findFirst({
      where: {
        enrollment: { projectId: academicProject.id, studentUserId: workspace.ownerUserId },
      },
      orderBy: { attemptNumber: "desc" },
      select: attemptSelect,
    });
  }

  if (!attempt) {
    return {
      workspace,
      academicProject,
      attempt: null,
      studentUserId: workspace.ownerUserId || null,
      timer: null,
      inFlight: false,
      locked: false,
      lockReason: null,
    };
  }

  const timer = computeAttemptTimer({ attempt, project: academicProject });
  const inFlight = IN_FLIGHT.has(attempt.status);
  const lockReason = !inFlight ? "SUBMITTED" : timer.expired ? "TIME_UP" : null;
  return {
    workspace,
    academicProject,
    attempt,
    studentUserId: attempt.enrollment?.studentUserId || workspace.ownerUserId || null,
    timer,
    inFlight,
    locked: Boolean(lockReason),
    lockReason,
  };
}

/** @param {null | "SUBMITTED" | "TIME_UP"} reason */
export function attemptLockedMessage(reason) {
  return reason === "TIME_UP"
    ? "Time is up. This project can no longer be changed."
    : "This project has been submitted. It can no longer be changed.";
}
