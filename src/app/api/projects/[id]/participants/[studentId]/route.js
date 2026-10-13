import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getExaminerAcademicProjectStudentReport } from "@/lib/academic/examiner-project-student-report";
import { authorizeParticipantView } from "@/lib/academic/participant-workspace";
import { countExplorerSections } from "@/lib/academic/examiner-org-explorer";
import { resolveEffectiveProcessCodes } from "@/lib/academic/programme-processes";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { formatRoleLabel } from "@/lib/roles";

export const runtime = "nodejs";

/**
 * Read-only report for one enrolled student on this academic project.
 */
export async function GET(request, context) {
  const gate = await authorizeParticipantView(context);
  if (gate.error) return gate.error;
  const { actor, activeRole, project, studentId } = gate;

  const academicYearId = request.nextUrl.searchParams.get("academicYearId") || null;

  try {
    const data = await getExaminerAcademicProjectStudentReport({
      academicProjectId: project.id,
      studentUserId: studentId,
      academicYearId,
    });

    const orgId = data.organisation?.projectId || null;
    if (orgId) {
      const [counts, org, availableProcessCodes] = await Promise.all([
        countExplorerSections(prisma, orgId),
        prisma.project.findUnique({ where: { id: orgId }, select: { createdAt: true, projectCode: true } }),
        resolveEffectiveProcessCodes(prisma, orgId).catch(() => null),
      ]);
      data.counts = counts;
      data.availableProcessCodes = availableProcessCodes;
      data.organisation.createdAt = org?.createdAt || null;
      data.organisation.projectCode = data.organisation.projectCode || org?.projectCode || null;
    }
    data.printedBy = {
      name: `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.email,
      role: formatRoleLabel(activeRole),
    };

    await writeAuditLog({
      eventType: AuditEvent.EXAMINER_STUDENT_OBSERVED,
      actorUserId: actor.id,
      targetUserId: studentId,
      meta: {
        mode: "ACADEMIC_PROJECT_STUDENT_REPORT",
        readOnly: true,
        projectId: project.id,
        workspaceProjectId: orgId,
      },
    });

    return NextResponse.json(data);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not load student report." }, { status: 500 });
  }
}
