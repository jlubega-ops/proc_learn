import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { actOnProcurementLifecycle } from "@/lib/projects/procurement-lifecycle-actions";
import {
  checkActingModeForLifecycleAction,
  getActiveCommittee,
} from "@/lib/projects/committee-context";

export const runtime = "nodejs";

/**
 * Thin lifecycle actions for Award → Closure (domain libs + role/department gates).
 * Body: { action, ...fields }
 */
export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const procurementId = String(params?.procurementId || "").trim();
  if (!projectId || !procurementId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      {
        error:
          "Only organisation users acting in an operational role can perform lifecycle actions. Organization Administrator configures processes but does not approve operational procurements.",
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

  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!action) {
    return NextResponse.json({ error: "Specify a lifecycle action." }, { status: 400 });
  }

  const exists = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const activeCommittee = await getActiveCommittee(prisma, auth.orgUser.id);
  const actingMode = checkActingModeForLifecycleAction(action, activeCommittee);
  if (!actingMode.ok) {
    return NextResponse.json(
      { error: actingMode.error, code: actingMode.code },
      { status: actingMode.status },
    );
  }

  const result = await actOnProcurementLifecycle(prisma, {
    projectId,
    procurementId,
    action,
    actorOrgUserId: auth.orgUser.id,
    actorRoleName: auth.orgUser.projectOrgRole?.name || "",
    actorDepartmentId: auth.orgUser.departmentId || null,
    actingCommitteeType: activeCommittee?.committeeType || null,
    body:
      activeCommittee && action === "record_inspection"
        ? { ...body, committeeId: activeCommittee.id }
        : body,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "Could not complete lifecycle action.",
        code: result.code,
        blockers: result.blockers,
        fieldErrors: result.fieldErrors,
      },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json(result);
}

export async function GET(_request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const procurementId = String(params?.procurementId || "").trim();
  if (!projectId || !procurementId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const readiness = await actOnProcurementLifecycle(prisma, {
    projectId,
    procurementId,
    action: "evaluate_closure",
    actorOrgUserId: auth.type === "org" ? auth.orgUser.id : "platform",
    actorRoleName:
      auth.type === "org" ? auth.orgUser.projectOrgRole?.name || "Organization Administrator" : "Organization Administrator",
    actorDepartmentId: auth.type === "org" ? auth.orgUser.departmentId : null,
  });

  if (!readiness.procurement && readiness.status === 404) {
    return NextResponse.json({ error: readiness.error || "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: readiness.ok,
    blockers: readiness.blockers || [],
    status: readiness.procurement?.status || null,
  });
}
