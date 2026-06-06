import { NextResponse } from "next/server";
import { ProjectPurpose, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { validateProjectCreateInput } from "@/lib/validation/project";
import { canManageStudentProjectSettings } from "@/lib/projects/access";
import { fetchAuthorizedProjectWorkspace } from "@/lib/projects/workspace-access";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const activeRole = sessionActiveRole(user) || Role.STUDENT;

  const params = await context.params;
  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

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
  const isLecturerOwnerEdit =
    activeRole === Role.LECTURER &&
    existing.ownerUserId === user.id &&
    (existing.creatorRole === Role.LECTURER ||
      (existing.creatorRole === Role.EXAMINER && existing.purpose === ProjectPurpose.PRACTICE));
  const isExaminerOwnerEdit =
    activeRole === Role.EXAMINER &&
    existing.ownerUserId === user.id &&
    existing.creatorRole === Role.EXAMINER;

  if (!staffManagesStudent && existing.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isStudentOwnerEdit && !isLecturerOwnerEdit && !isExaminerOwnerEdit && !staffManagesStudent) {
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
  if (activeRole === Role.LECTURER && d.purpose !== ProjectPurpose.PRACTICE) {
    return NextResponse.json(
      { error: "Lecturer projects can only be practice projects." },
      { status: 400 },
    );
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
        }
      : {
          name: d.name,
          description: d.description,
          organizationName: activeRole === Role.STUDENT ? d.organizationName : null,
          purpose: d.purpose,
          visibility: d.visibility,
          instructions: d.instructions,
          questionText: d.questionText,
          questionFileUrl: d.questionFileUrl,
          enrollmentKey: [Role.LECTURER, Role.EXAMINER].includes(activeRole)
            ? d.enrollmentAccessKey
            : null,
          isPublished: activeRole === Role.STUDENT ? true : d.isPublished,
          openAt: d.openAt,
          closeAt: d.closeAt,
          durationSeconds: d.durationSeconds,
          requiresEnrollment: [Role.EXAMINER, Role.LECTURER].includes(activeRole),
        },
  });

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
  if (existing.ownerUserId !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const isStudentOwnerDelete =
    activeRole === Role.STUDENT && existing.creatorRole === Role.STUDENT;
  const isLecturerOwnerDelete =
    activeRole === Role.LECTURER &&
    (existing.creatorRole === Role.LECTURER ||
      (existing.creatorRole === Role.EXAMINER && existing.purpose === ProjectPurpose.PRACTICE));
  const isExaminerOwnerDelete =
    activeRole === Role.EXAMINER && existing.creatorRole === Role.EXAMINER;
  if (!isStudentOwnerDelete && !isLecturerOwnerDelete && !isExaminerOwnerDelete) {
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
    await tx.projectOrgUser.deleteMany({ where: { projectId: id } });
    await tx.projectOrgPlanningPeriod.deleteMany({ where: { projectId: id } });
    await tx.projectOrgFinancialYear.deleteMany({ where: { projectId: id } });
    await tx.projectOrgDepartment.deleteMany({
      where: { projectId: id, parentId: { not: null } },
    });
    await tx.projectOrgDepartment.deleteMany({ where: { projectId: id } });
    await tx.project.delete({ where: { id } });
  });
  await writeAuditLog({
    eventType: AuditEvent.PROJECT_DELETED,
    actorUserId: user.id,
    meta: { projectId: id, startedCount, submittedCount },
  });
  return NextResponse.json({ ok: true });
}

