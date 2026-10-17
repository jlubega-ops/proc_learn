import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import {
  deleteFormDraft,
  formDraftActorScope,
  getFormDraft,
  listFormDrafts,
  normalizeFormDraftKey,
  upsertFormDraft,
} from "@/lib/projects/org-form-drafts";

export const runtime = "nodejs";

/**
 * Resolve actor for drafts: prefer org session, else platform user with workspace access.
 * @param {string} projectId
 */
async function authorizeDraftActor(projectId) {
  const auth = await authorizeProjectApiAccess(prisma, { projectId });
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      error: auth.status === 403 ? "Forbidden." : "Not found.",
    };
  }
  if (auth.type === "org") {
    const scope = formDraftActorScope({ orgUserId: auth.orgUser.id });
    if (!scope) return { ok: false, status: 403, error: "Forbidden." };
    return { ok: true, ...scope };
  }
  const scope = formDraftActorScope({ platformUserId: auth.user?.id || null });
  if (!scope) return { ok: false, status: 403, error: "Forbidden." };
  return { ok: true, ...scope };
}

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const url = new URL(request.url);
  const formKeyParam = url.searchParams.get("formKey");
  const keysParam = url.searchParams.get("keys");

  const actor = await authorizeDraftActor(projectId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  // List own autosave drafts (no full payload) — used by list pages.
  if (!formKeyParam) {
    const formKeys = keysParam
      ? keysParam
          .split(",")
          .map((k) => normalizeFormDraftKey(k))
          .filter(Boolean)
      : null;
    const drafts = await listFormDrafts(prisma, {
      projectId,
      actorScope: actor.actorScope,
      formKeys,
    });
    return NextResponse.json({ drafts });
  }

  const formKey = normalizeFormDraftKey(formKeyParam);
  if (!formKey) {
    return NextResponse.json({ error: "A valid formKey is required." }, { status: 400 });
  }

  const draft = await getFormDraft(prisma, {
    projectId,
    actorScope: actor.actorScope,
    formKey,
  });

  return NextResponse.json({
    draft: draft
      ? {
          formKey: draft.formKey,
          payload: draft.payload,
          updatedAt: draft.updatedAt,
          payloadBytes: draft.payloadBytes,
        }
      : null,
  });
}

export async function PUT(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const actor = await authorizeDraftActor(projectId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const formKey = normalizeFormDraftKey(body?.formKey);
  if (!formKey) {
    return NextResponse.json({ error: "A valid formKey is required." }, { status: 400 });
  }
  if (body?.payload === undefined) {
    return NextResponse.json({ error: "payload is required." }, { status: 400 });
  }

  const result = await upsertFormDraft(prisma, {
    projectId,
    actorScope: actor.actorScope,
    orgUserId: actor.orgUserId,
    platformUserId: actor.platformUserId,
    formKey,
    payload: body.payload,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  return NextResponse.json({
    ok: true,
    draft: {
      formKey: result.draft.formKey,
      updatedAt: result.draft.updatedAt,
      payloadBytes: result.draft.payloadBytes,
    },
  });
}

export async function DELETE(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  if (!projectId) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });

  const formKey = normalizeFormDraftKey(new URL(request.url).searchParams.get("formKey"));
  if (!formKey) {
    return NextResponse.json({ error: "A valid formKey is required." }, { status: 400 });
  }

  const actor = await authorizeDraftActor(projectId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  await deleteFormDraft(prisma, {
    projectId,
    actorScope: actor.actorScope,
    formKey,
  });

  return NextResponse.json({ ok: true });
}
