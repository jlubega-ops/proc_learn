import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProviderManage, authorizeProviderRead } from "@/lib/projects/provider-api-auth";
import {
  deleteProvider,
  getProvider,
  setProviderStatus,
  updateProvider,
} from "@/lib/projects/providers";

export const runtime = "nodejs";

/**
 * @param {any} context
 */
async function readIds(context) {
  const params = await context.params;
  return {
    projectId: String(params?.id || "").trim(),
    providerId: String(params?.providerId || "").trim(),
  };
}

/**
 * @param {any} result
 */
function failure(result) {
  return NextResponse.json(
    { error: result.error, fieldErrors: result.fieldErrors, code: result.code },
    { status: result.status || 400 },
  );
}

export async function GET(request, context) {
  const { projectId, providerId } = await readIds(context);
  if (!projectId || !providerId) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const auth = await authorizeProviderRead(prisma, projectId);
  if (!auth.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sp = new URL(request.url).searchParams;
  const provider = await getProvider(prisma, projectId, providerId, {
    includeCredentials: auth.canSeeCredentials,
    method: sp.get("method") || null,
    category: sp.get("category") || null,
  });
  if (!provider) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    provider,
    canManage: auth.canManage,
    canSeeCredentials: auth.canSeeCredentials,
  });
}

export async function PATCH(request, context) {
  const { projectId, providerId } = await readIds(context);
  if (!projectId || !providerId) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const auth = await authorizeProviderManage(prisma, projectId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body?.action || "update");
  const base = {
    projectId,
    providerId,
    actorOrgUserId: auth.orgUserId,
    actorRoleName: auth.roleName,
  };

  const result =
    action === "status"
      ? await setProviderStatus(prisma, { ...base, status: body?.status, reason: body?.reason })
      : await updateProvider(prisma, { ...base, body });

  if (!result.ok) return failure(result);
  return NextResponse.json(result);
}

export async function DELETE(_request, context) {
  const { projectId, providerId } = await readIds(context);
  if (!projectId || !providerId) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const auth = await authorizeProviderManage(prisma, projectId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await deleteProvider(prisma, {
    projectId,
    providerId,
    actorOrgUserId: auth.orgUserId,
    actorRoleName: auth.roleName,
  });
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true });
}
