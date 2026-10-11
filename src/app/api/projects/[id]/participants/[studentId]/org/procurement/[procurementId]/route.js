import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadExplorerProcurement } from "@/lib/academic/examiner-org-explorer";
import {
  authorizeParticipantView,
  resolveParticipantWorkspace,
} from "@/lib/academic/participant-workspace";

export const runtime = "nodejs";

/**
 * Read-only A–Z view of one procurement in a participant's attempt organisation.
 */
export async function GET(_request, context) {
  const gate = await authorizeParticipantView(context);
  if (gate.error) return gate.error;
  const params = await context.params;
  const procurementId = typeof params?.procurementId === "string" ? params.procurementId : "";

  const org = await resolveParticipantWorkspace(prisma, gate.project.id, gate.studentId);
  if (!org || !procurementId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const data = await loadExplorerProcurement(prisma, org, procurementId);
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load this procurement." }, { status: 500 });
  }
}
