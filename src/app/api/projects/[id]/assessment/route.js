import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import {
  canManageExaminerProject,
  canTeach,
  canViewExaminerProject,
} from "@/lib/projects/access";
import {
  assessmentScoringCatalogue,
  getOrCreateProjectAssessment,
  serializeAssessmentConfig,
  upsertProjectAssessmentConfig,
  setAssessmentResultsReleased,
  setProjectEnabledProcesses,
  parseResultsView,
} from "@/lib/academic/assessment-config";
import { projectProgrammeCodes } from "@/lib/academic/programme-processes";

export const runtime = "nodejs";

/**
 * @param {{ write: boolean }} opts write = teaching action (examiner only); read = examiner or system admin
 */
async function loadProject(activeRole, projectId, opts) {
  const notFound = { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) return notFound;
  const allowed = opts.write
    ? canManageExaminerProject({ activeRole, project })
    : canViewExaminerProject({ activeRole, project });
  return allowed ? { project } : notFound;
}

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user);

  const params = await context.params;
  const id = String(params?.id || "").trim();
  const gate = await loadProject(activeRole, id, { write: false });
  if (gate.error) return gate.error;

  const assessment = await getOrCreateProjectAssessment(prisma, {
    projectId: id,
    createIfMissing: canTeach(activeRole),
    scoringEnabled: gate.project.purpose === "ASSESSMENT",
  });

  return NextResponse.json({
    project: {
      id: gate.project.id,
      name: gate.project.name,
      purpose: gate.project.purpose,
    },
    assessment: serializeAssessmentConfig(assessment, await projectProgrammeCodes(prisma, gate.project)),
    catalogue: assessmentScoringCatalogue(),
  });
}

export async function PUT(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user);
  if (!canTeach(activeRole)) {
    return NextResponse.json({ error: "Only examiners can change assessments." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  const gate = await loadProject(activeRole, id, { write: true });
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));

  if (body?.action === "release" || body?.action === "unrelease") {
    const resultsView = body.action === "release" ? parseResultsView(body.view) : null;
    if (body.action === "release" && !resultsView) {
      return NextResponse.json({ error: "Choose overview or full details." }, { status: 400 });
    }
    try {
      const assessment = await setAssessmentResultsReleased({
        projectId: id,
        actorUserId: user.id,
        resultsReleased: body.action === "release",
        resultsView,
      });
      return NextResponse.json({ assessment });
    } catch (e) {
      // @ts-ignore
      if (e?.code === "NO_ASSESSMENT") {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  if (body?.action === "set_processes") {
    try {
      const assessment = await setProjectEnabledProcesses({
        projectId: id,
        actorUserId: user.id,
        enabledProcessCodes: body.enabledProcessCodes,
      });
      return NextResponse.json({ assessment });
    } catch (e) {
      // @ts-ignore
      if (e?.code === "VALIDATION") {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  if (
    body?.action === "regrade" ||
    body?.action === "regrade_all" ||
    body?.action === "force_submit"
  ) {
    try {
      const { regradeProjectAttempts } = await import("@/lib/academic/assessment-evaluate");
      /** @type {string[] | null} */
      let attemptIds = null;
      if (Array.isArray(body?.attemptIds)) {
        attemptIds = body.attemptIds.map((id) => String(id || "").trim()).filter(Boolean);
      } else if (body?.action === "regrade" && body?.attemptId) {
        attemptIds = [String(body.attemptId).trim()].filter(Boolean);
      }
      const result = await regradeProjectAttempts({
        projectId: id,
        actorUserId: user.id,
        attemptIds,
        forceSubmitOnly: body?.action === "force_submit",
      });
      return NextResponse.json(result);
    } catch (e) {
      // @ts-ignore
      if (e?.code === "NO_ASSESSMENT" || e?.code === "SCORING_DISABLED") {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  try {
    const assessment = await upsertProjectAssessmentConfig({
      projectId: id,
      actorUserId: user.id,
      body,
    });
    return NextResponse.json({ assessment });
  } catch (e) {
    // @ts-ignore
    if (e?.code === "VALIDATION") {
      return NextResponse.json(
        { error: e.message, errors: e.errors || {} },
        { status: 400 },
      );
    }
    throw e;
  }
}
