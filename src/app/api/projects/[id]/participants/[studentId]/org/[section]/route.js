import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadExplorerSection } from "@/lib/academic/examiner-org-explorer";
import {
  authorizeParticipantView,
  resolveParticipantWorkspace,
} from "@/lib/academic/participant-workspace";

export const runtime = "nodejs";

/**
 * Read-only page of one section of a participant's attempt organisation.
 */
export async function GET(request, context) {
  const gate = await authorizeParticipantView(context);
  if (gate.error) return gate.error;
  const params = await context.params;
  const section = typeof params?.section === "string" ? params.section : "";

  const org = await resolveParticipantWorkspace(prisma, gate.project.id, gate.studentId);
  if (!org) return NextResponse.json({ error: "Not found." }, { status: 404 });

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
