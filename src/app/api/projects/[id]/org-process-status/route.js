import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { loadProcessActivation } from "@/lib/projects/process-activation";

export const runtime = "nodejs";

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, { projectId });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status === 403 ? 403 : auth.status === 401 ? 401 : 404 },
    );
  }

  const { active, names } = await loadProcessActivation(prisma, projectId);
  return NextResponse.json(
    { active: [...active], names },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
