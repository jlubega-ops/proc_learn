import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { validateProjectCreateInput } from "@/lib/validation/project";
import { generateUniqueProjectCode } from "@/lib/projects/project-identity";

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
  if (filter === "assessments" || filter === "assignments") {
    return { purpose: "ASSESSMENT", isPublished: true };
  }
  if (filter === "examiner" || filter === "lecturer") {
    return { creatorRole: Role.EXAMINER, isPublished: true };
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

/**
 * @param {string} purpose
 */
function purposeWhere(purpose) {
  if (purpose === "practice") return { purpose: "PRACTICE" };
  if (purpose === "assessments" || purpose === "assignments") {
    return { purpose: "ASSESSMENT" };
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
  const academicYearId = String(searchParams.get("academicYearId") || "").trim();
  const programmeId = String(searchParams.get("programmeId") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSizeRaw = Number(searchParams.get("pageSize") || 10);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;

  /** @type {import("@prisma/client").Prisma.ProjectWhereInput} */
  let where = {};

  /** @type {import("@prisma/client").Prisma.ProjectWhereInput} */
  const academicFilter =
    activeRole === Role.EXAMINER || activeRole === Role.SYSTEM_ADMIN
      ? {
          ...(academicYearId ? { academicYearId } : {}),
          ...(programmeId ? { programmeId } : {}),
        }
      : {};

  if (activeRole === Role.STUDENT) {
    const studentSpecific = studentFilterWhere(activeRole, filter);
    where = {
      AND: [
        {
          OR: [
            {
              ownerUserId: user.id,
              creatorRole: Role.STUDENT,
              isPersonalOrg: false,
              isAttemptOrg: false,
            },
            {
              visibility: "PUBLIC",
              isPublished: true,
              creatorRole: Role.EXAMINER,
              OR: [{ closeAt: null }, { closeAt: { gte: new Date() } }],
            },
          ],
        },
        studentSpecific,
        openStatusWhere(openStatus),
      ],
    };
  } else if (activeRole === Role.EXAMINER) {
    // Practice / Assessment projects only — student My Organisation shells live under Participation.
    where = {
      AND: [
        {
          ownerUserId: user.id,
          creatorRole: Role.EXAMINER,
          isPersonalOrg: false,
          isAttemptOrg: false,
        },
        purposeWhere(purpose),
        status === "not_started"
          ? { status: "NOT_STARTED" }
          : status === "in_progress"
            ? { status: "IN_PROGRESS" }
            : status === "completed"
              ? { status: "COMPLETED" }
              : {},
        openStatusWhere(openStatus),
        filter === "assessments" || filter === "assignments"
          ? { purpose: "ASSESSMENT" }
          : filter === "practice"
            ? { purpose: "PRACTICE" }
            : filter === "private"
              ? { visibility: "PRIVATE" }
              : filter === "public"
                ? { visibility: "PUBLIC" }
                : {},
        academicFilter,
      ],
    };
  } else if (activeRole === Role.SYSTEM_ADMIN) {
    where = {
      AND: [
        { isPersonalOrg: false, isAttemptOrg: false },
        purposeWhere(purpose),
        status === "not_started"
          ? { status: "NOT_STARTED" }
          : status === "in_progress"
            ? { status: "IN_PROGRESS" }
            : status === "completed"
              ? { status: "COMPLETED" }
              : {},
        // Default: examiner Practice / Assessment projects. Student orgs → Participation.
        scope === "student" || scope === "student_public"
          ? {
              creatorRole: Role.STUDENT,
              isPersonalOrg: false,
              isAttemptOrg: false,
            }
          : { creatorRole: Role.EXAMINER },
        openStatusWhere(openStatus),
        academicFilter,
      ],
    };
  } else {
    where = { ownerUserId: user.id };
  }

  const include =
    activeRole === Role.STUDENT
      ? { owner: { select: { id: true, firstName: true, lastName: true, email: true } }, enrollments: { where: { studentUserId: user.id }, take: 1 } }
      : activeRole === Role.EXAMINER || activeRole === Role.SYSTEM_ADMIN
        ? {
            owner: { select: { id: true, firstName: true, lastName: true, email: true } },
            enrollments: true,
            academicYear: { select: { id: true, label: true, isCurrent: true } },
            programme: { select: { id: true, name: true, shortName: true } },
          }
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
    serverNow: new Date().toISOString(),
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
  if (![Role.STUDENT, Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const creatorRole = activeRole === Role.SYSTEM_ADMIN ? Role.EXAMINER : activeRole;

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

  if ([Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)) {
    const [year, programme] = await Promise.all([
      data.academicYearId
        ? prisma.academicYear.findUnique({ where: { id: data.academicYearId } })
        : null,
      data.programmeId ? prisma.programme.findUnique({ where: { id: data.programmeId } }) : null,
    ]);
    /** @type {Record<string, string>} */
    const fieldErrors = {};
    if (!year) fieldErrors.academicYearId = "Choose a valid academic year.";
    if (!programme || !programme.isActive) fieldErrors.programmeId = "Choose an active programme.";
    if (Object.keys(fieldErrors).length) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fieldErrors },
        { status: 400 },
      );
    }
  }

  const projectCode = await generateUniqueProjectCode(prisma);

  const row = await prisma.project.create({
    data: {
      ownerUserId: user.id,
      creatorRole,
      projectCode,
      name: data.name,
      description: data.description,
      organizationName: data.organizationName,
      purpose: data.purpose,
      status: "NOT_STARTED",
      visibility: activeRole === Role.STUDENT ? data.visibility : "PUBLIC",
      instructions: data.instructions,
      questionText: data.questionText,
      questionFileUrl: data.questionFileUrl,
      enrollmentKey: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
        ? data.enrollmentAccessKey
        : null,
      isPublished: activeRole === Role.STUDENT ? true : data.isPublished,
      openAt: data.openAt,
      closeAt: data.closeAt,
      durationSeconds: data.durationSeconds,
      maxAttempts: data.maxAttempts,
      allowEditAfterSubmit: Boolean(data.allowEditAfterSubmit),
      requiresEnrollment: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole),
      isPersonalOrg: false,
      isAttemptOrg: false,
      academicYearId: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
        ? data.academicYearId
        : null,
      programmeId: [Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)
        ? data.programmeId
        : null,
    },
  });

  if ([Role.EXAMINER, Role.SYSTEM_ADMIN].includes(activeRole)) {
    try {
      const { getOrCreateProjectAssessment } = await import("@/lib/academic/assessment-evaluate");
      await getOrCreateProjectAssessment(prisma, {
        projectId: row.id,
        createIfMissing: true,
        scoringEnabled: row.purpose === "ASSESSMENT",
      });
    } catch {
      /* scoring seed is non-blocking */
    }
  }

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_CREATED,
    actorUserId: user.id,
    meta: {
      projectId: row.id,
      projectCode: row.projectCode,
      creatorRole,
      purpose: row.purpose,
      visibility: row.visibility,
      isPublished: row.isPublished,
    },
  });

  return NextResponse.json({ project: row }, { status: 201 });
}
