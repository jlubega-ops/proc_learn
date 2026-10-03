import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProjectApiAccess } from "@/lib/projects/project-api-auth";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";
import { getActiveCommittee } from "@/lib/projects/committee-context";
import { procurementSectionAccess } from "@/lib/projects/procurement-section-access";
import {
  PROCUREMENT_STAGE_PAGES,
  canViewProcurementStage,
} from "@/lib/projects/procurement-stage-pages";
import { listProcurementStage } from "@/lib/projects/procurement-stage-lists";

export const runtime = "nodejs";

const FILTERS = new Set(["all", "recorded", "pending", "mine"]);

export async function GET(request, context) {
  const params = await context.params;
  const projectId = String(params?.id || "").trim();
  const stage = String(params?.stage || "").trim();
  if (!projectId || !stage) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const auth = await authorizeProjectApiAccess(prisma, {
    projectId,
    orgPermission: ORG_PERMISSION.VIEW_PROCUREMENTS,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const orgUser = auth.type === "org" ? auth.orgUser : null;
  const activeCommittee = orgUser ? await getActiveCommittee(prisma, orgUser.id) : null;
  const sections = orgUser
    ? procurementSectionAccess({
        roleName: orgUser.projectOrgRole?.name || null,
        committeeType: activeCommittee?.committeeType || null,
      })
    : null;
  if (!canViewProcurementStage(stage, sections)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(5, Number.parseInt(sp.get("pageSize") || "10", 10) || 10));
  const rawFilter = String(sp.get("filter") || "all");
  const filter = /** @type {"all" | "recorded" | "pending" | "mine"} */ (
    FILTERS.has(rawFilter) ? rawFilter : "all"
  );
  const search = String(sp.get("search") || "").trim().slice(0, 100);

  const result = await listProcurementStage(prisma, {
    projectId,
    stage,
    orgUser,
    activeCommittee,
    page,
    pageSize,
    filter,
    search,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const sectionKey = PROCUREMENT_STAGE_PAGES[stage]?.section;
  return NextResponse.json({
    rows: result.rows,
    total: result.total,
    page,
    pageSize,
    access: sections && sectionKey ? sections[sectionKey] || null : null,
    viewer: orgUser
      ? {
          roleName: orgUser.projectOrgRole?.name || null,
          committeeName: activeCommittee?.name || null,
        }
      : null,
  });
}