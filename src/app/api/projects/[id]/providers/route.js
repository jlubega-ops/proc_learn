import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProviderManage, authorizeProviderRead } from "@/lib/projects/provider-api-auth";
import { createProvider, listProviders } from "@/lib/projects/providers";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProviderRead(prisma, projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: "Not found." }, { status: auth.status });
  }

  const sp = new URL(request.url).searchParams;
  const result = await listProviders(prisma, {
    projectId,
    status: sp.get("status") || "",
    search: sp.get("search") || "",
    category: sp.get("category") || "",
    checkCategory: sp.get("checkCategory") || "",
    ids: (sp.get("ids") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    qualification: sp.get("qualification") || "",
    method: sp.get("method") || "",
    page: Number(sp.get("page") || 1),
    pageSize: Number(sp.get("pageSize") || 10),
    includeCredentials: auth.canSeeCredentials,
  });

  return NextResponse.json({
    ...result,
    canManage: auth.canManage,
    canSeeCredentials: auth.canSeeCredentials,
  });
}

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

  const result = await createProvider(prisma, {
    projectId,
    actorOrgUserId: auth.orgUserId,
    actorRoleName: auth.roleName,
    body,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors, code: result.code },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
