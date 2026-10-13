import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { writeAuditLog } from "@/lib/audit-log";
import { AuditEvent } from "@/lib/audit-events";
import { getRequestIp, getRequestUserAgent } from "@/lib/request-meta";
import { listConfiguredAcademicYears } from "@/lib/academic/academic-context";
import {
  ASSESSMENT_PROCESS_CATALOGUE,
  assessmentProcessMeta,
} from "@/lib/academic/assessment-process-catalogue";
import { SCORING_GROUP_LABELS } from "@/lib/academic/assessment-sections";
import {
  PROGRAMME_PROCESS_CODES,
  disabledCodesByProgramme,
  writeProgrammeDisabledCodes,
} from "@/lib/academic/programme-processes";
import { disableCascadeCodes, enableCascadeCodes } from "@/lib/projects/process-dependencies";

export const runtime = "nodejs";

/** @param {string | null | undefined} role */
function canUse(role) {
  return role === Role.SYSTEM_ADMIN || role === Role.EXAMINER;
}

/** @param {unknown} v */
function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * @param {string} programmeId
 * @param {string} academicYearId
 */
async function loadPair(programmeId, academicYearId) {
  if (!programmeId || !academicYearId) return null;
  const [programme, year] = await Promise.all([
    prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true, name: true } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, label: true } }),
  ]);
  return programme && year ? { programme, year } : null;
}

/** @param {string} programmeId @param {string} academicYearId */
async function currentDisabled(programmeId, academicYearId) {
  const map = await disabledCodesByProgramme(prisma, academicYearId, [programmeId]);
  return map.get(programmeId) || new Set();
}

/** Fire-and-forget: cached attempt progress follows the new process list. */
function refreshProgressLater(programmeId, academicYearId) {
  void import("@/lib/academic/project-attempts")
    .then(({ refreshProgressForProgrammeYear }) =>
      refreshProgressForProgrammeYear(prisma, { programmeId, academicYearId }),
    )
    .catch(() => 0);
}

/** @param {string[]} codes */
function namesOf(codes) {
  return codes.map((c) => assessmentProcessMeta(c)?.name || c);
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canUse(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize")) || 10;
  const pageSize = Math.min(50, Math.max(1, pageSizeRaw));
  const q = clean(searchParams.get("q")).slice(0, 100);
  const includeInactive = searchParams.get("includeInactive") === "1";

  const requestedYear = clean(searchParams.get("academicYearId"));

  const payload = await cachedRead(
    `programme-processes:${requestedYear}:${includeInactive ? 1 : 0}:${page}:${pageSize}:${q}`,
    ["AcademicYear", "Programme", "ProgrammeYearProcess"],
    async () => {
      const academicYears = await listConfiguredAcademicYears();
      const year =
        academicYears.find((y) => y.id === requestedYear) ||
        academicYears.find((y) => y.isCurrent) ||
        academicYears[0] ||
        null;

      /** @type {import("@prisma/client").Prisma.ProgrammeWhereInput} */
      const where = {
        ...(includeInactive ? {} : { isActive: true }),
        ...(q ? { OR: [{ name: { contains: q } }, { shortName: { contains: q } }] } : {}),
      };
      const [total, programmes] = await Promise.all([
        prisma.programme.count({ where }),
        prisma.programme.findMany({
          where,
          orderBy: [{ name: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: { id: true, name: true, shortName: true, isActive: true },
        }),
      ]);
      const disabled = year
        ? await disabledCodesByProgramme(
            prisma,
            year.id,
            programmes.map((p) => p.id),
          )
        : new Map();

      return {
        academicYears: academicYears.map((y) => ({ id: y.id, label: y.label, isCurrent: y.isCurrent })),
        academicYear: year ? { id: year.id, label: year.label, isCurrent: year.isCurrent } : null,
        catalogue: ASSESSMENT_PROCESS_CATALOGUE.map((p) => ({
          code: p.code,
          name: p.name,
          summary: p.summary,
          group: p.group,
        })),
        groups: SCORING_GROUP_LABELS,
        programmes: programmes.map((p) => ({
          ...p,
          disabledCodes: PROGRAMME_PROCESS_CODES.filter((c) => disabled.get(p.id)?.has(c)),
        })),
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  return cachedJson(request, payload, { revalidate: true });
}

/** Toggle one process; dependents (off) or prerequisites (on) follow. */
export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canUse(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const programmeId = clean(body?.programmeId);
  const academicYearId = clean(body?.academicYearId);
  const code = clean(body?.code).toUpperCase();
  const enabled = body?.enabled === true;
  if (!PROGRAMME_PROCESS_CODES.includes(code)) {
    return NextResponse.json({ error: "Choose a process." }, { status: 400 });
  }
  const pair = await loadPair(programmeId, academicYearId);
  if (!pair) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const disabled = await currentDisabled(programmeId, academicYearId);
  const enabledNow = PROGRAMME_PROCESS_CODES.filter((c) => !disabled.has(c));
  const changed = enabled
    ? enableCascadeCodes(code, enabledNow)
    : disableCascadeCodes(code, enabledNow);
  if (!changed.length) {
    return NextResponse.json({ disabledCodes: [...disabled], changed: [] });
  }
  for (const c of changed) {
    if (enabled) disabled.delete(c);
    else disabled.add(c);
  }
  const disabledCodes = await writeProgrammeDisabledCodes(prisma, {
    programmeId,
    academicYearId,
    disabledCodes: disabled,
    actorUserId: user.id,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROGRAMME_PROCESSES_UPDATED,
    actorUserId: user.id,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: {
      action: enabled ? "ENABLE" : "DISABLE",
      programmeId,
      programmeName: pair.programme.name,
      academicYearId,
      academicYearLabel: pair.year.label,
      codes: changed,
      description: `${enabled ? "Enabled" : "Disabled"} ${namesOf(changed).join(", ")} for ${pair.programme.name} (${pair.year.label}).`,
    },
  });
  refreshProgressLater(programmeId, academicYearId);

  return NextResponse.json({ disabledCodes, changed });
}

/**
 * Bulk actions for one programme × year:
 * - `enable_all`
 * - `copy_from` { fromAcademicYearId } — same programme, another year
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canUse(sessionActiveRole(user))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const action = clean(body?.action);
  const programmeId = clean(body?.programmeId);
  const academicYearId = clean(body?.academicYearId);
  const pair = await loadPair(programmeId, academicYearId);
  if (!pair) return NextResponse.json({ error: "Not found." }, { status: 404 });

  /** @type {Set<string>} */
  let nextDisabled;
  /** @type {string | null} */
  let fromLabel = null;
  if (action === "enable_all") {
    nextDisabled = new Set();
  } else if (action === "copy_from") {
    const fromAcademicYearId = clean(body?.fromAcademicYearId);
    if (!fromAcademicYearId || fromAcademicYearId === academicYearId) {
      return NextResponse.json({ error: "Choose another academic year." }, { status: 400 });
    }
    const from = await prisma.academicYear.findUnique({
      where: { id: fromAcademicYearId },
      select: { label: true },
    });
    if (!from) return NextResponse.json({ error: "Choose another academic year." }, { status: 400 });
    fromLabel = from.label;
    nextDisabled = await currentDisabled(programmeId, fromAcademicYearId);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const disabledCodes = await writeProgrammeDisabledCodes(prisma, {
    programmeId,
    academicYearId,
    disabledCodes: nextDisabled,
    actorUserId: user.id,
  });

  await writeAuditLog({
    eventType: AuditEvent.PROGRAMME_PROCESSES_UPDATED,
    actorUserId: user.id,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: {
      action: action === "enable_all" ? "ENABLE_ALL" : "COPY_FROM",
      programmeId,
      programmeName: pair.programme.name,
      academicYearId,
      academicYearLabel: pair.year.label,
      fromAcademicYearLabel: fromLabel,
      disabledCodes,
      description:
        action === "enable_all"
          ? `Enabled all processes for ${pair.programme.name} (${pair.year.label}).`
          : `Copied process settings for ${pair.programme.name} from ${fromLabel} to ${pair.year.label}.`,
    },
  });
  refreshProgressLater(programmeId, academicYearId);

  return NextResponse.json({ disabledCodes });
}
