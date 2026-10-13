import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { prisma } from "@/lib/prisma";
import { assessmentProcessMeta } from "@/lib/academic/assessment-process-catalogue";
import {
  PROGRAMME_PROCESS_CODES,
  disabledCodesByProgramme,
  programmeProcessImpact,
} from "@/lib/academic/programme-processes";
import { disableCascadeCodes, enableCascadeCodes } from "@/lib/projects/process-dependencies";

export const runtime = "nodejs";

/** Preview of a toggle: which processes change and who it reaches. */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const role = sessionActiveRole(user);
  if (role !== Role.SYSTEM_ADMIN && role !== Role.EXAMINER) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const programmeId = String(searchParams.get("programmeId") || "").trim();
  const academicYearId = String(searchParams.get("academicYearId") || "").trim();
  const code = String(searchParams.get("code") || "").trim().toUpperCase();
  const enabled = searchParams.get("enabled") === "1";
  if (!programmeId || !academicYearId || !PROGRAMME_PROCESS_CODES.includes(code)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const [programme, year] = await Promise.all([
    prisma.programme.findUnique({ where: { id: programmeId }, select: { id: true } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } }),
  ]);
  if (!programme || !year) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const map = await disabledCodesByProgramme(prisma, academicYearId, [programmeId]);
  const disabled = map.get(programmeId) || new Set();
  const enabledNow = PROGRAMME_PROCESS_CODES.filter((c) => !disabled.has(c));
  const codes = enabled ? enableCascadeCodes(code, enabledNow) : disableCascadeCodes(code, enabledNow);
  const impact = await programmeProcessImpact(prisma, {
    programmeId,
    academicYearId,
    codes: enabled ? [] : codes,
  });

  return NextResponse.json({
    codes,
    names: codes.map((c) => assessmentProcessMeta(c)?.name || c),
    ...impact,
  });
}
