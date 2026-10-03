import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProviderManage } from "@/lib/projects/provider-api-auth";
import { generateProviders } from "@/lib/projects/providers";

export const runtime = "nodejs";

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProviderManage(prisma, projectId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await generateProviders(prisma, {
    projectId,
    count: body?.count,
    mix: body?.mix,
    category: body?.category,
    actorOrgUserId: auth.orgUserId,
    actorRoleName: auth.roleName,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
