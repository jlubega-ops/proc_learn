import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canObserveStudentOrganisation } from "@/lib/academic/examiner-observation-access";
import { loadExplorerSection, resolveObservedStudentOrg } from "@/lib/academic/examiner-org-explorer";

export const runtime = "nodejs";

/**
 * Read-only page of one section of a student's organisation, each item with its own history.
 */
export async function GET(request, context) {
  const actor = await getSessionUser();
  if (!actor || !canObserveStudentOrganisation({ activeRole: sessionActiveRole(actor) })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = await context.params;
  const id = typeof params?.id === "string" ? params.id : "";
  const section = typeof params?.section === "string" ? params.section : "";
  const org = id ? await resolveObservedStudentOrg(prisma, id) : null;
  if (!org) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const data = await loadExplorerSection(prisma, org, section, {
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
      q: (sp.get("q") || "").slice(0, 120),
    });
    return NextResponse.json(data);
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "BAD_SECTION") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not load this section." }, { status: 500 });
  }
}
