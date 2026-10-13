import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cachedRead } from "@/lib/server-cache";
import { cachedJson } from "@/lib/api/cached-json";
import { AuditEvent, writeAuditLog } from "@/lib/audit-log";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import {
  ORG_SETTINGS_SELECT as SETTINGS_SELECT,
  serializeOrgSettings as serializeSettings,
} from "@/lib/projects/org-settings";
import { buildOrgDisplayName, validateOrgNameBase } from "@/lib/validation/org-display-name";
import { validateVoteCode } from "@/lib/validation/vote-code";

export const runtime = "nodejs";

/** @param {any} context */
async function authorize(context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return { error: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
  const auth = await authorizeProjectApiAccess(prisma, { projectId, requireOrgAdmin: true });
  if (!auth.ok) {
    return {
      error: NextResponse.json(
        { error: auth.status === 403 ? "Forbidden." : "Not found." },
        { status: auth.status === 403 ? 403 : 404 },
      ),
    };
  }
  return { projectId, auth };
}

export async function GET(request, context) {
  const a = await authorize(context);
  if (a.error) return a.error;
  const settings = await cachedRead(`org-settings:${a.projectId}`, ["Project", "User"], async () => {
    const row = await prisma.project.findUnique({ where: { id: a.projectId }, select: SETTINGS_SELECT });
    return row ? serializeSettings(row) : null;
  });
  if (!settings) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return cachedJson(request, { settings });
}

/**
 * Body: { name?: string; resetName?: true; voteCode?: string }
 */
export async function PATCH(request, context) {
  const a = await authorize(context);
  if (a.error) return a.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const row = await prisma.project.findUnique({ where: { id: a.projectId }, select: SETTINGS_SELECT });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const current = serializeSettings(row);

  /** @type {Record<string, string>} */
  const fieldErrors = {};
  /** @type {{ organizationName?: string; voteCode?: string | null }} */
  const data = {};

  const resetName = body?.resetName === true;
  if (resetName || body?.name !== undefined) {
    if (!current.canEditName) {
      fieldErrors.name = "This organisation's name can't be changed.";
    } else if (resetName) {
      data.organizationName = current.defaultName;
    } else {
      const check = validateOrgNameBase(body.name);
      if (check.ok) data.organizationName = buildOrgDisplayName(check.value);
      else fieldErrors.name = check.error;
    }
  }

  if (body?.voteCode !== undefined) {
    const check = validateVoteCode(body.voteCode);
    if (check.ok) data.voteCode = check.value;
    else fieldErrors.voteCode = check.error;
  }

  if (Object.keys(fieldErrors).length) {
    return NextResponse.json(
      { error: Object.values(fieldErrors)[0], fieldErrors },
      { status: 400 },
    );
  }

  const nameChanged =
    data.organizationName !== undefined && data.organizationName !== current.organizationName;
  const voteChanged = data.voteCode !== undefined && (data.voteCode || "") !== current.voteCode;
  if (!nameChanged && !voteChanged) {
    return NextResponse.json({ ok: true, settings: current });
  }

  const updated = await prisma.project.update({
    where: { id: a.projectId },
    data: {
      ...(nameChanged ? { organizationName: data.organizationName } : {}),
      ...(voteChanged ? { voteCode: data.voteCode } : {}),
    },
    select: SETTINGS_SELECT,
  });

  const actorUserId = a.auth.user?.id || null;
  if (nameChanged) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_DISPLAY_NAME_UPDATED,
      actorUserId,
      meta: {
        projectId: a.projectId,
        previous: current.organizationName,
        next: data.organizationName,
        reset: resetName,
        description: resetName
          ? `Organisation name reset to "${data.organizationName}".`
          : `Organisation name changed from "${current.organizationName}" to "${data.organizationName}".`,
      },
    });
  }
  if (voteChanged) {
    await writeAuditLog({
      eventType: AuditEvent.PROJECT_ORG_SETTINGS_UPDATED,
      actorUserId,
      meta: {
        projectId: a.projectId,
        field: "voteCode",
        previous: current.voteCode || null,
        next: data.voteCode || null,
        description: data.voteCode
          ? `Vote number set to ${data.voteCode}.`
          : "Vote number cleared.",
      },
    });
  }

  return NextResponse.json({ ok: true, settings: serializeSettings(updated) });
}
