import { NextResponse } from "next/server";
import { UserAccountStatus } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { formatUserDisplayName } from "@/lib/user-display";
import { prisma } from "@/lib/prisma";
import { campusLabel } from "@/lib/campuses";

export const runtime = "nodejs";

/**
 * @param {import("@prisma/client").User & { studentProfile: import("@prisma/client").StudentProfile & { programme: import("@prisma/client").Programme } | null; userRoles: import("@prisma/client").UserRole[] }} u
 */
function serializeStudent(u) {
  const sp = u.studentProfile;
  return {
    id: u.id,
    email: u.email,
    displayName: formatUserDisplayName(u),
    firstName: u.firstName,
    middleName: u.middleName,
    lastName: u.lastName,
    sex: u.sex,
    accountStatus: u.accountStatus,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    studentNumber: sp?.studentNumber ?? null,
    registrationNumber: sp?.registrationNumber ?? null,
    programmeId: sp?.programmeId ?? null,
    programmeName: sp?.programme?.name ?? null,
    programmeShortName: sp?.programme?.shortName ?? null,
    academicYearLabel: sp?.academicYearLabel ?? null,
    yearOfStudy: sp?.yearOfStudy ?? null,
    campus: sp?.campus ?? null,
    campusLabel: campusLabel(sp?.campus) ?? null,
    suspendedReason: u.suspendedReason,
    activatedAt: u.activatedAt?.toISOString() ?? null,
    canResendActivation:
      !u.activatedAt && u.accountStatus !== UserAccountStatus.SUSPENDED,
  };
}

export async function GET(request) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") || "").trim();
  const programmeId = (searchParams.get("programmeId") || "").trim();
  const academicYear = (searchParams.get("academicYear") || "").trim();
  const campus = (searchParams.get("campus") || "").trim().toUpperCase();

  /** @type {import("@prisma/client").Prisma.UserWhereInput[]} */
  const andParts = [{ studentProfile: { isNot: null } }];
  if (programmeId) {
    andParts.push({ studentProfile: { programmeId } });
  }
  if (academicYear) {
    andParts.push({ studentProfile: { academicYearLabel: academicYear } });
  }
  if (campus && ["MAIN", "ARUA", "MBARARA", "JINJA", "MBALE"].includes(campus)) {
    andParts.push({ studentProfile: { campus } });
  }
  if (q) {
    andParts.push({
      OR: [
        { email: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { middleName: { contains: q } },
        { studentProfile: { studentNumber: { contains: q } } },
        { studentProfile: { registrationNumber: { contains: q } } },
      ],
    });
  }

  const where = { AND: andParts };

  const rows = await prisma.user.findMany({
    where,
    include: {
      studentProfile: { include: { programme: true } },
      userRoles: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ students: rows.map(serializeStudent) });
}
