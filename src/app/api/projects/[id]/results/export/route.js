import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { buildProjectGradesWorkbook } from "@/lib/academic/project-grades-export";
import { prisma } from "@/lib/prisma";
import { canManageExaminerProject } from "@/lib/projects/access";

export const runtime = "nodejs";

/**
 * Excel of enrolled students: identity, times, live/stored score over total marks.
 */
export async function GET(_request, context) {
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

  if (
    !canManageExaminerProject({ activeRole, project, userId: user.id }) &&
    activeRole !== Role.SYSTEM_ADMIN
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const exported = await buildProjectGradesWorkbook({
    projectId: id,
    actorUserId: user.id,
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
