import { NextResponse } from "next/server";
import { ProjectPurpose, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { validateProjectCreateInput } from "@/lib/validation/project";

export const runtime = "nodejs";

/**
 * @param {import("@prisma/client").Role} role
 * @param {string} filter
 */
function studentFilterWhere(role, filter) {
  if (role !== Role.STUDENT) return {};

  if (filter === "private") {
    return { visibility: "PRIVATE" };
  }
  if (filter === "public") {
    return { visibility: "PUBLIC" };
  }
  if (filter === "assignments") {
    return { purpose: "ASSIGNMENT", isPublished: true };
  }
  if (filter === "lecturer") {
    return { creatorRole: Role.LECTURER, isPublished: true };
  }
  return {};
}

/**
 * @param {string} openStatus
 */
function openStatusWhere(openStatus) {
  const now = new Date();
  if (openStatus === "not_yet") {
    return { openAt: { gt: now } };
  }
  if (openStatus === "closed") {
    return { closeAt: { lt: now } };
  }
  if (openStatus === "open") {
    return {
      AND: [
        { OR: [{ openAt: null }, { openAt: { lte: now } }] },
        { OR: [{ closeAt: null }, { closeAt: { gte: now } }] },
      ],
    };
  }
  return {};
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  const { searchParams } = new URL(request.url);
  const filter = String(searchParams.get("filter") || "all").toLowerCase();
  const scope = String(searchParams.get("scope") || "all").toLowerCase();
  const purpose = String(searchParams.get("purpose") || "all").toLowerCase();
  const status = String(searchParams.get("status") || "all").toLowerCase();
  const openStatus = String(searchParams.get("openStatus") || "all").toLowerCase();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  /** @type {import("@prisma/client").Prisma.ProjectWhereInput} */
  let where = {};

  if (activeRole === Role.STUDENT) {
    const studentSpecific = studentFilterWhere(activeRole, filter);
    where = {
      AND: [
        {
          OR: [
            { ownerUserId: user.id, creatorRole: Role.STUDENT },
            {
              visibility: "PUBLIC",
              isPublished: true,
              creatorRole: { in: [Role.LECTURER, Role.EXAMINER] },
              OR: [{ closeAt: null }, { closeAt: { gte: new Date() } }],
            },
          ],
        },
        studentSpecific,
        openStatusWhere(openStatus),
      ],
    };
  } else if (activeRole === Role.EXAMINER) {
    where = {
      AND: [
        {
          OR: [
            { ownerUserId: user.id, creatorRole: Role.EXAMINER },
            { creatorRole: Role.STUDENT, visibility: "PUBLIC" },
          ],
        },
        purpose === "practice"
          ? { purpose: "PRACTICE" }
          : purpose === "assignments"
            ? { purpose: "ASSIGNMENT" }
            : {},
        status === "not_started"
          ? { status: "NOT_STARTED" }
          : status === "in_progress"
            ? { status: "IN_PROGRESS" }
            : status === "completed"
              ? { status: "COMPLETED" }
              : {},
        scope === "student" || scope === "student_public"
          ? { creatorRole: Role.STUDENT, visibility: "PUBLIC" }
          : scope === "lecturer"
            ? { creatorRole: { in: [Role.LECTURER, Role.EXAMINER] } }
          : {},
        openStatusWhere(openStatus),
        filter === "mine"
          ? { ownerUserId: user.id, creatorRole: Role.EXAMINER }
          : filter === "public-student"
            ? { creatorRole: Role.STUDENT, visibility: "PUBLIC" }
            : filter === "assignments"
              ? { ownerUserId: user.id, purpose: "ASSIGNMENT" }
              : filter === "private"
                ? { ownerUserId: user.id, visibility: "PRIVATE" }
                : filter === "public"
                  ? { visibility: "PUBLIC" }
                  : {},
      ],
    };
  } else if (activeRole === Role.LECTURER) {
    where = {
      AND: [
        {
          OR: [
            { ownerUserId: user.id, creatorRole: Role.LECTURER },
            { creatorRole: Role.STUDENT, visibility: "PUBLIC" },
            { creatorRole: Role.EXAMINER },
          ],
        },
        { purpose: "PRACTICE" },
        status === "not_started"
          ? { status: "NOT_STARTED" }
          : status === "in_progress"
            ? { status: "IN_PROGRESS" }
            : status === "completed"
              ? { status: "COMPLETED" }
              : {},
        scope === "student" || scope === "student_public"
          ? { creatorRole: Role.STUDENT, visibility: "PUBLIC" }
          : scope === "lecturer"
            ? { creatorRole: { in: [Role.LECTURER, Role.EXAMINER] } }
          : {},
        openStatusWhere(openStatus),
        filter === "mine"
          ? { ownerUserId: user.id, creatorRole: Role.LECTURER }
          : filter === "public-student"
            ? { creatorRole: Role.STUDENT, visibility: "PUBLIC" }
            : filter === "private"
              ? { ownerUserId: user.id, creatorRole: Role.LECTURER, visibility: "PRIVATE" }
              : filter === "public"
                ? { visibility: "PUBLIC" }
                : {},
      ],
    };
  } else {
    where = { ownerUserId: user.id };
  }

  const include =
    activeRole === Role.STUDENT
      ? { owner: { select: { id: true, firstName: true, lastName: true, email: true } }, enrollments: { where: { studentUserId: user.id }, take: 1 } }
      : activeRole === Role.EXAMINER
        ? { owner: { select: { id: true, firstName: true, lastName: true, email: true } }, enrollments: true }
        : { owner: { select: { id: true, firstName: true, lastName: true, email: true } } };

  const [total, rows] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include,
    }),
  ]);

  const projects =
    activeRole === Role.STUDENT
      ? rows.map((row) => ({
          ...row,
          hasEnrollmentKey: Boolean(row.enrollmentKey),
          enrollmentKey: null,
        }))
      : rows;

  return NextResponse.json({
    projects,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const activeRole = sessionActiveRole(user) || Role.STUDENT;
  if (![Role.STUDENT, Role.LECTURER, Role.EXAMINER].includes(activeRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateProjectCreateInput({ body, activeRole });
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validated.errors },
      { status: 400 },
    );
  }

  const data = validated.data;
  if (activeRole === Role.LECTURER && data.purpose !== ProjectPurpose.PRACTICE) {
    return NextResponse.json(
      { error: "Lecturer projects can only be practice projects." },
      { status: 400 },
    );
  }

  const row = await prisma.project.create({
    data: {
      ownerUserId: user.id,
      creatorRole: activeRole,
      name: data.name,
      description: data.description,
      organizationName: activeRole === Role.STUDENT ? data.organizationName : null,
      purpose: data.purpose,
      status: "NOT_STARTED",
      visibility: activeRole === Role.STUDENT ? data.visibility : "PUBLIC",
      instructions: data.instructions,
      questionText: data.questionText,
      questionFileUrl: data.questionFileUrl,
      enrollmentKey: [Role.LECTURER, Role.EXAMINER].includes(activeRole)
        ? data.enrollmentAccessKey
        : null,
      isPublished: activeRole === Role.STUDENT ? true : data.isPublished,
      openAt: data.openAt,
      closeAt: data.closeAt,
      durationSeconds: data.durationSeconds,
      requiresEnrollment: [Role.EXAMINER, Role.LECTURER].includes(activeRole),
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_CREATED,
    actorUserId: user.id,
    meta: {
      projectId: row.id,
      creatorRole: activeRole,
      purpose: row.purpose,
      visibility: row.visibility,
      isPublished: row.isPublished,
    },
  });

  return NextResponse.json({ project: row }, { status: 201 });
}

