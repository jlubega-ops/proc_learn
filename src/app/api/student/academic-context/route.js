import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionUser, sessionActiveRole, sessionUserGrantedRoles } from "@/lib/api/get-session-user";
import { getStudentAcademicContext } from "@/lib/academic/student-enrollment";
import { isStudentMode } from "@/lib/academic/student-mode";

export const runtime = "nodejs";

/**
 * Student academic context: university year/semester + enrollment + join prompt.
 * Authenticated effective STUDENT only (real students or Student Mode demos).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (sessionActiveRole(user) !== Role.STUDENT) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const granted = sessionUserGrantedRoles(user);
  const studentMode = isStudentMode({
    grantedRoles: granted,
    activeRole: Role.STUDENT,
  });

  if (!user.studentProfile && !studentMode) {
    return NextResponse.json({ error: "Student profile required." }, { status: 403 });
  }

  const context = await getStudentAcademicContext(user.id);
  return NextResponse.json(context);
}
