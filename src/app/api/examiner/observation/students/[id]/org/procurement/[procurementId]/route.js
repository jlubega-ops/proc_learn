import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { loadExplorerProcurement, resolveObservedStudentOrg } from "@/lib/academic/examiner-org-explorer";

export const runtime = "nodejs";

/**
 * Read-only A–Z view of one procurement in a student's organisation.
 */
export async function GET(_request, context) {
  const actor = await getSessionUser();
  if (!actor || !canObserveStudentOrganisation({ activeRole: sessionActiveRole(actor) })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = typeof params?.id === "string" ? params.id : "";
  const procurementId = typeof params?.procurementId === "string" ? params.procurementId : "";
  const org = id ? await resolveObservedStudentOrg(prisma, id) : null;
  if (!org || !procurementId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const data = await loadExplorerProcurement(prisma, org, procurementId);
    if (!data) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load this procurement." }, { status: 500 });
  }
}
