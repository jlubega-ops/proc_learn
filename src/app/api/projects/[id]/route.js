import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { mutateActiveAppSession } from "@/lib/auth/session";
import { validateProjectCreateInput } from "@/lib/validation/project";
import {
  canManageExaminerProject,
  canManageStudentProjectSettings,
} from "@/lib/projects/access";
import { fetchAuthorizedProjectWorkspace } from "@/lib/projects/workspace-access";
import { authorizeProjectOrgMember } from "@/lib/projects/workspace-access";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { deleteProjectFully } from "@/lib/projects/purge-project-data";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const session = await mutateActiveAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (session.orgUserId) {
    const auth = await authorizeProjectOrgMember(prisma, {
      projectId: id,
      orgUserId: session.orgUserId,
      requiredPermission: ORG_PERMISSION.VIEW_OVERVIEW,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: "Not found." }, { status: auth.status });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        organizationName: true,
        purpose: true,
        status: true,
        visibility: true,
        isPublished: true,
        projectCode: true,
      },
    });
    if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({
      project: {
        ...project,
        canManageOrgAdmin: false,
        sessionType: "org",
        orgRoleName: auth.orgUser.projectOrgRole?.name,
      },
    });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const access = await fetchAuthorizedProjectWorkspace(prisma, {
    projectId: id,
    userId: user.id,
    activeRole,
  });
  if (!access) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const include =
    activeRole === Role.STUDENT
      ? {
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
          enrollments: { where: { studentUserId: user.id } },
        }
      : { owner: { select: { id: true, firstName: true, lastName: true, email: true } } };
  const project = await prisma.project.findUnique({ where: { id }, include });
  if (!project) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (activeRole === Role.STUDENT) {
    return NextResponse.json({
      project: {
        ...project,
        hasEnrollmentKey: Boolean(project?.enrollmentKey),
        enrollmentKey: null,
        canManageOrgAdmin: access.canManageOrgAdmin,
      },
    });
  }
  return NextResponse.json({ project });
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const staffManagesStudent = canManageStudentProjectSettings({ activeRole, project: existing });
  const isStudentOwnerEdit =
    activeRole === Role.STUDENT && existing.creatorRole === Role.STUDENT;
  const managesExaminerProject = canManageExaminerProject({
    activeRole,
    project: existing,
    userId: user.id,
  });

  if (!staffManagesStudent && !managesExaminerProject && existing.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isStudentOwnerEdit && !staffManagesStudent && !managesExaminerProject) {
    return NextResponse.json(
      { error: "You do not have permission to edit this project in the current role." },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectCreateInput({ body: { ...existing, ...body }, activeRole });
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const d = validated.data;

  if (managesExaminerProject || staffManagesStudent) {
    if (d.academicYearId || d.programmeId) {
      const [year, programme] = await Promise.all([
        d.academicYearId
          ? prisma.academicYear.findUnique({ where: { id: d.academicYearId } })
          : null,
        d.programmeId ? prisma.programme.findUnique({ where: { id: d.programmeId } }) : null,
      ]);
      /** @type {Record<string, string>} */
      const fieldErrors = {};
      if (d.academicYearId && !year) fieldErrors.academicYearId = "Choose a valid academic year.";
      if (d.programmeId && !programme) fieldErrors.programmeId = "Choose a valid programme.";
      if (Object.keys(fieldErrors).length) {
        return NextResponse.json(
          { error: "Please fix the highlighted fields.", fieldErrors },
          { status: 400 },
        );
      }
    }
  }

  const row = await prisma.project.update({
    where: { id },
    data: staffManagesStudent
      ? {
          name: d.name,
          description: d.description,
          instructions: d.instructions,
          questionText: d.questionText,
          questionFileUrl: d.questionFileUrl,
          isPublished: d.isPublished,
          openAt: d.openAt,
          closeAt: d.closeAt,
          durationSeconds: d.durationSeconds,
          academicYearId: d.academicYearId,
          programmeId: d.programmeId,
        }
      : {
          name: d.name,
          description: d.description,
          organizationName: d.organizationName,
          purpose: d.purpose,
          visibility: d.visibility,
          instructions: d.instructions,
          questionText: d.questionText,
          questionFileUrl: d.questionFileUrl,
          enrollmentKey: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
            ? d.enrollmentAccessKey
            : null,
          isPublished: activeRole === Role.STUDENT ? true : d.isPublished,
          openAt: d.openAt,
          closeAt: d.closeAt,
          durationSeconds: d.durationSeconds,
          maxAttempts: d.maxAttempts,
          allowEditAfterSubmit: Boolean(d.allowEditAfterSubmit),
          requiresEnrollment: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole),
          academicYearId: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
            ? d.academicYearId
            : undefined,
          programmeId: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
            ? d.programmeId
            : undefined,
        },
  });

  if (
    !staffManagesStudent &&
    existing.creatorRole === Role.EXAMINER &&
    d.organizationName
  ) {
    await prisma.project.updateMany({
      where: { sourceAcademicProjectId: row.id, isAttemptOrg: true },
      data: { name: d.organizationName, organizationName: d.organizationName },
    });
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_UPDATED,
    actorUserId: user.id,
    meta: { projectId: row.id, managedStudentProject: staffManagesStudent },
  });

  return NextResponse.json({ project: row });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const isStudentOwnerDelete =
    activeRole === Role.STUDENT &&
    existing.creatorRole === Role.STUDENT &&
    existing.ownerUserId === user.id;
  const managesExaminerProject = canManageExaminerProject({
    activeRole,
    project: existing,
    userId: user.id,
  });
  if (!isStudentOwnerDelete && !managesExaminerProject) {
    return NextResponse.json(
      { error: "You do not have permission to delete this project in the current role." },
      { status: 403 },
    );
  }

  let body = {};
  try {
    body = await _request.json();
  } catch {
    body = {};
  }
  if (String(body?.confirmText || "").trim() !== "DELETE") {
    return NextResponse.json(
      { error: 'Deletion not confirmed. Type "DELETE" in all caps to continue.' },
      { status: 400 },
    );
  }

  const [startedCount, submittedCount] = await Promise.all([
    prisma.projectEnrollment.count({
      where: { projectId: id, status: "IN_PROGRESS" },
    }),
    prisma.projectEnrollment.count({
      where: { projectId: id, status: "SUBMITTED" },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    // Attempt workspaces linked to this academic project
    const attemptOrgs = await tx.project.findMany({
      where: { sourceAcademicProjectId: id },
      select: { id: true },
    });
    for (const row of attemptOrgs) {
      await deleteProjectFully(tx, row.id);
    }
    await deleteProjectFully(tx, id);
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_DELETED,
    actorUserId: user.id,
    meta: { projectId: id, startedCount, submittedCount },
  });
  return NextResponse.json({ ok: true });
}

