import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import {
  procurementInclude,
  serializeProcurement,
} from "@/lib/projects/procurements";
import { loadProcurementDomainTimeline } from "@/lib/projects/procurement-timeline";
import { evaluateClosureReadiness } from "@/lib/projects/procurement-closure";
import { healMissingStepTasks } from "@/lib/projects/workflow-engine";

export const runtime = "nodejs";

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

  try {
    await healMissingStepTasks(prisma, projectId);
  } catch {
    // non-fatal
  }

  const row = await prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    include: procurementInclude,
  });
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (auth.type === "org") {
    const role = auth.orgUser.projectOrgRole?.name || "";
    if (
      (role === "User Department Officer" ||
        role === "User Department" ||
        role === "Head User Department" ||
        role === "Head of User Department") &&
      auth.orgUser.departmentId &&
      row.departmentId !== auth.orgUser.departmentId
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  /** @type {any} */
  let pendingTask = null;
  if (auth.type === "org") {
    pendingTask = await prisma.projectOrgWorkflowTask.findFirst({
      where: {
        projectId,
        assigneeOrgUserId: auth.orgUser.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { procurementId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        requiredRoleName: true,
        status: true,
        stepNumber: true,
        processFlowItem: { select: { actionKey: true } },
      },
    });
  }

  const domainTimeline = await loadProcurementDomainTimeline(prisma, {
    projectId,
    procurementId,
    procurementNumber: row.procurementNumber,
  });

  const procurement = serializeProcurement(row, { domainTimeline });

  let closure = null;
  try {
    const readiness = await evaluateClosureReadiness(prisma, projectId, procurementId);
    closure = {
      ready: Boolean(readiness.ok),
      blockers: readiness.blockers || [],
    };
  } catch {
    closure = { ready: false, blockers: ["Could not evaluate closure readiness."] };
  }

  return NextResponse.json({
    procurement,
    pendingTask: pendingTask
      ? {
          ...pendingTask,
          actionKey: pendingTask.processFlowItem?.actionKey || null,
        }
      : null,
    closure,
  });
}
