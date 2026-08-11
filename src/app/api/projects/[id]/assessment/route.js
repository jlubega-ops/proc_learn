import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { canManageExaminerProject, actsAsExaminerRole } from "@/lib/projects/access";
import {
  assessmentCheckpointCatalogue,
  getOrCreateProjectAssessment,
  serializeAssessmentConfig,
  upsertProjectAssessmentConfig,
  setAssessmentResultsReleased,
} from "@/lib/academic/assessment-config";

export const runtime = "nodejs";

async function loadManagedProject(user, activeRole, projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.isPersonalOrg) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  if (
    !canManageExaminerProject({ activeRole, project, userId: user.id }) &&
    activeRole !== Role.SYSTEM_ADMIN
  ) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { project };
}

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!actsAsExaminerRole(activeRole) && activeRole !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = String(params?.id || "").trim();
  const gate = await loadManagedProject(user, activeRole, id);
  if (gate.error) return gate.error;

  const assessment = await getOrCreateProjectAssessment(prisma, {
    projectId: id,
    createIfMissing: false,
  });

  return NextResponse.json({
    project: {
      id: gate.project.id,
      name: gate.project.name,
      purpose: gate.project.purpose,
    },
    assessment: serializeAssessmentConfig(assessment),
    catalogue: assessmentCheckpointCatalogue(),
  });
}

export async function PUT(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const params = await context.params;
  const id = String(params?.id || "").trim();
  const gate = await loadManagedProject(user, activeRole, id);
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));

  if (body?.action === "release" || body?.action === "unrelease") {
    try {
      const assessment = await setAssessmentResultsReleased({
        projectId: id,
        actorUserId: user.id,
        resultsReleased: body.action === "release",
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
