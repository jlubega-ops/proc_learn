import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { createSupplier, listSuppliers } from "@/lib/projects/suppliers";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  let auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_SUPPLIERS,
  });
  if (!auth.ok) {
    // Platform Organization Administrator may view suppliers read-only.
    const adminAuth = await authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
    if (!adminAuth.ok) {
      return NextResponse.json(
        { error: auth.status === 403 ? "Forbidden." : "Not found." },
        { status: auth.status },
      );
    }
    auth = adminAuth;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const search = searchParams.get("search") || "";

  const suppliers = await listSuppliers(prisma, { projectId, status, search });

  return NextResponse.json({ suppliers, total: suppliers.length });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.MANAGE_SUPPLIERS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      {
        error:
          "Only the Procurement Officer, Head PDU, or Contracts Officer can register suppliers.",
      },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await createSupplier(prisma, {
    projectId,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: auth.orgUser.projectOrgRole?.name || "",
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
