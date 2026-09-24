import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  createOrUpdateRequisitionDraft,
  requisitionInclude,
  serializeRequisition,
  submitRequisition,
  getRequesterRequisitionMutationFlags,
} from "@/lib/projects/requisitions";
import {
  orgOpsSlateListWhere,
  resolveCurrentOrgSlateId,
} from "@/lib/academic/org-academic-slate";
import { mapEntityWorkflowContexts } from "@/lib/projects/workflow-status-presentation";

export const runtime = "nodejs";

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_REQUISITIONS,
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  /** @type {Record<string, unknown>} */
  const where = { projectId };
  if (status) where.status = status;

  // UDO: own requisitions primarily; HOD same department.
  if (auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (role === "User Department Officer" || role === "User Department") {
      where.requesterOrgUserId = auth.orgUser.id;
    } else if (
      (role === "Head User Department" || role === "Head of User Department") &&
      auth.orgUser.departmentId
    ) {
      where.departmentId = auth.orgUser.departmentId;
    }
  }
  Object.assign(where, orgOpsSlateListWhere(await resolveCurrentOrgSlateId(prisma, projectId)));

  const rows = await prisma.projectOrgRequisition.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    include: requisitionInclude,
  });

  const ctxMap = await mapEntityWorkflowContexts(prisma, {
    projectId,
    entityField: "requisitionId",
    entityIds: rows.map((r) => r.id),
    viewerOrgUserId: auth.type === "org" ? auth.orgUser.id : null,
  });

  let actorDepartment = null;
  if (auth.type === "org" && auth.orgUser?.departmentId) {
    const dept = await prisma.projectOrgDepartment.findFirst({
      where: { id: auth.orgUser.departmentId, projectId },
      select: { id: true, name: true, code: true },
    });
    actorDepartment = dept;
  }

  const mutationFlags =
    auth.type === "org"
      ? await Promise.all(
          rows.map((row) =>
            getRequesterRequisitionMutationFlags(prisma, {
              projectId,
              requisition: row,
              actorOrgUserId: auth.orgUser.id,
            }),
          ),
        )
      : rows.map(() => ({ canEdit: false, canDelete: false }));

  return NextResponse.json({
    requisitions: rows.map((row, index) => {
      const ctx = ctxMap.get(row.id) || {};
      const flags = mutationFlags[index] || {};
      return {
        ...serializeRequisition({
          ...row,
          workflowStage: ctx.workflowStage || null,
          lastDecision: ctx.lastDecision || null,
          viewerHasPendingAction: Boolean(ctx.viewerHasPendingAction),
        }),
        canEdit: Boolean(flags.canEdit),
        canDelete: Boolean(flags.canDelete),
      };
    }),
    total: rows.length,
    canCreate:
      auth.type === "org" &&
      ["User Department Officer", "User Department"].includes(
        auth.orgUser.projectOrgRole?.name || "",
      ),
    actorDepartment,
    actorDisplayName:
      auth.type === "org"
        ? `${auth.orgUser.firstName || ""} ${auth.orgUser.lastName || ""}`.trim()
        : null,
    actorRoleName: auth.type === "org" ? auth.orgUser.projectOrgRole?.name || null : null,
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.CREATE_REQUISITION,
  });
  if (!auth.ok || auth.type !== "org") {
    return NextResponse.json(
      { error: auth.status === 403 ? "Forbidden." : "Not found." },
      { status: auth?.status || 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const orgUser = auth.orgUser;
  const departmentId = orgUser.departmentId;
  if (!departmentId) {
    return NextResponse.json(
      {
        error: "Your account must be assigned to a department before creating requisitions.",
      },
      { status: 400 },
    );
  }

  const created = await createOrUpdateRequisitionDraft(prisma, {
    projectId,
    requesterOrgUserId: orgUser.id,
    departmentId,
    body,
    requisitionId: typeof body?.requisitionId === "string" ? body.requisitionId : null,
  });
  if (!created.ok) {
    return NextResponse.json(
      { error: created.error, fieldErrors: created.fieldErrors },
      { status: created.status || 400 },
    );
  }

  if (body?.submit === true) {
    const submitted = await submitRequisition(prisma, {
      requisitionId: created.requisition.id,
      projectId,
      actorOrgUserId: orgUser.id,
      actorRoleName: orgUser.projectOrgRole?.name || "User Department Officer",
      actorDepartmentId: departmentId,
    });
    if (!submitted.ok) {
      return NextResponse.json(
        { error: submitted.error, code: submitted.code, requisition: created.requisition },
        { status: submitted.status || 400 },
      );
    }
    return NextResponse.json(submitted, { status: 201 });
  }

  return NextResponse.json({ requisition: created.requisition }, { status: 201 });
}
