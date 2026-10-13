import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { buildProjectGradesWorkbook } from "@/lib/academic/project-grades-export";
import { parseResultsView } from "@/lib/academic/assessment-config";
import { prisma } from "@/lib/prisma";
import { canViewExaminerProject } from "@/lib/projects/access";

export const runtime = "nodejs";

/**
 * Excel of enrolled students. ?view=summary → scores only; ?view=details (default) → full breakdown.
 */
export async function GET(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.isPersonalOrg || project.isAttemptOrg) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!canViewExaminerProject({ activeRole, project })) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const view = parseResultsView(new URL(request.url).searchParams.get("view")) || "DETAILS";
  const exported = await buildProjectGradesWorkbook({
    projectId: id,
    actorUserId: user.id,
    view,
  });
  if (!exported) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(exported.buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
