import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { actsAsExaminerRole, canManageExaminerProject } from "@/lib/projects/access";
import { buildOfficialResultsWorkbook } from "@/lib/academic/assessment-results";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Official Excel export — STUDENT participation only (server-enforced).
 * Examiners are owner-scoped when projectId is omitted (Phase 10).
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (!actsAsExaminerRole(activeRole) && activeRole !== Role.SYSTEM_ADMIN) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || null;
  const academicYearId = url.searchParams.get("academicYearId")?.trim() || null;
  const campus = url.searchParams.get("campus")?.trim() || null;

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.isPersonalOrg || project.isAttemptOrg) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (
      !canManageExaminerProject({ activeRole, project, userId: user.id }) &&
      activeRole !== Role.SYSTEM_ADMIN
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const { buffer, filename } = await buildOfficialResultsWorkbook({
    projectId,
    academicYearId,
    campus,
    actorUserId: user.id,
    ownerUserId: null,
  });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
