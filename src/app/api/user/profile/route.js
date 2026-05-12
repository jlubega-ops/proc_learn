import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/get-session-user";
import { grantedRoles } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      userRoles: true,
      settings: true,
      studentProfile: { include: { programme: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const roles = grantedRoles(user.userRoles);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    sex: user.sex,
    profilePhotoUrl: user.profilePhotoUrl,
    accountStatus: user.accountStatus,
    activatedAt: user.activatedAt?.toISOString() ?? null,
    suspendedReason: user.suspendedReason,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles,
    activeRole: user.settings?.activeRole ?? null,
    theme: user.settings?.theme === "dark" ? "dark" : "light",
    studentProfile: user.studentProfile
      ? {
          studentNumber: user.studentProfile.studentNumber,
          registrationNumber: user.studentProfile.registrationNumber,
          programmeId: user.studentProfile.programmeId,
          programmeName: user.studentProfile.programme.name,
          programmeShortName: user.studentProfile.programme.shortName,
          yearOfStudy: user.studentProfile.yearOfStudy,
          academicYearLabel: user.studentProfile.academicYearLabel,
        }
      : null,
  });
}
