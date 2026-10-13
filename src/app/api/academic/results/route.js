import { NextResponse } from "next/server";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canViewExaminerProject, canViewTeaching } from "@/lib/projects/access";
import { getExaminerAssessmentResults } from "@/lib/academic/assessment-results";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Examiner Results — defaults to current academic year.
 * Examiners are owner-scoped when projectId is omitted (Phase 10).
 * Query: ?projectId=&academicYearId=&campus=&participation=all|students|demo
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user);
  if (!canViewTeaching(activeRole)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || null;
  const academicYearId = url.searchParams.get("academicYearId")?.trim() || null;
  const campus = url.searchParams.get("campus")?.trim() || null;
  const participation = url.searchParams.get("participation")?.trim() || "all";

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.isPersonalOrg || project.isAttemptOrg) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (!canViewExaminerProject({ activeRole, project })) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const data = await getExaminerAssessmentResults({
    projectId,
    academicYearId,
    campus,
    ownerUserId: null,
    participation: /** @type {'all'|'students'|'demo'} */ (
      ["all", "students", "demo"].includes(participation) ? participation : "all"
    ),
  });

  return NextResponse.json(data);
}
