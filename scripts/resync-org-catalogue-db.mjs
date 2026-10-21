/**
 * DB-only resync of organisation roles + process catalogue from the app
 * definitions (CORE_ORG_ROLE_DEFINITIONS / BASELINE_PROCESS_TEMPLATES).
 *
 * Does NOT change application source structure — only database rows.
 *
 * - Wipes all workflow instances / tasks / actions (clean slate)
 * - Snapshots process-flow adoptions by engine code, then rebuilds flows
 * - Remaps legacy role assignments (e.g. "User Department" → "User Department Officer")
 * - Recreates core roles + coded process templates with correct names, descriptions,
 *   triggers, steps, action keys, and allowed roles
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/resync-org-catalogue-db.mjs
 */
import { prisma } from "../src/lib/prisma.js";
import {
  CORE_ORG_ROLE_DEFINITIONS,
  PROJECT_ORG_ENTRY_ROLE_NAME,
  ensureCoreProjectOrgRoles,
} from "../src/lib/project-org-role.js";
import {
  BASELINE_PROCESS_TEMPLATES,
  LEGACY_PROCESS_ALIASES,
  PROCESS_FLOW_CODES,
  ensureBaselineProcessTemplates,
} from "../src/lib/projects/process-catalogue.js";

const LEGACY_ROLE_ALIAS = {
  Admin: PROJECT_ORG_ENTRY_ROLE_NAME,
  "User Department": "User Department Officer",
  "Head of User Department": "Head User Department",
};

function resolveAdoptionCode(flow) {
  if (flow.code && Object.values(PROCESS_FLOW_CODES).includes(flow.code)) {
    return flow.code;
  }
  const name = String(flow.name || "")
    .trim()
    .toLowerCase();
  for (const alias of LEGACY_PROCESS_ALIASES) {
    if (alias.legacyNames.includes(name)) return alias.code;
  }
  // Heuristic for near-matches that were educational duplicates
  if (name === "planning process") return PROCESS_FLOW_CODES.PROCUREMENT_PLANNING;
  if (name === "emergency planning process" || name === "emergency planning") {
    return PROCESS_FLOW_CODES.EMERGENCY_PLANNING;
  }
  if (name === "budgeting process") return PROCESS_FLOW_CODES.BUDGETING;
  if (name === "requisition process") return PROCESS_FLOW_CODES.PROCUREMENT_REQUISITION;
  if (name === "micro procurement process") return PROCESS_FLOW_CODES.MICRO_PROCUREMENT;
  if (name === "quotations process" || name === "quotation process") {
    return PROCESS_FLOW_CODES.QUOTATION_PROCESS;
  }
  if (name === "tender process" || name === "open domestic bidding process") {
    return PROCESS_FLOW_CODES.OPEN_DOMESTIC_BIDDING;
  }
  if (name === "evaluation process") return PROCESS_FLOW_CODES.EVALUATION_PROCESS;
  if (name === "post qualification process" || name === "post-qualification process") {
    return PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS;
  }
  if (name === "lpo process") return PROCESS_FLOW_CODES.LPO_PROCESS;
  if (name === "invoice process") return PROCESS_FLOW_CODES.INVOICE_PROCESS;
  return null;
}

async function main() {
  console.log("=== Resync org catalogue (DB data only) ===\n");

  const beforeRoles = await prisma.projectOrgRole.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const beforeFlows = await prisma.projectOrgProcessFlow.findMany({
    select: { id: true, code: true, name: true, triggerKey: true },
  });
  const beforeInstances = await prisma.projectOrgWorkflowInstance.count();
  const beforePending = await prisma.projectOrgWorkflowTask.count({
    where: { status: "PENDING" },
  });
  const beforeAdoptions = await prisma.projectOrgProcessFlowAdoption.findMany({
    include: { processFlow: { select: { id: true, code: true, name: true } } },
  });

  console.log(
    `Before: ${beforeRoles.length} roles, ${beforeFlows.length} flows, ${beforeAdoptions.length} adoptions, ${beforeInstances} instances, ${beforePending} pending tasks`,
  );

  /** @type {Map<string, { projectId: string; code: string; isActive: boolean; activatedAt: Date | null; deactivatedAt: Date | null }>} */
  const adoptionSnap = new Map();
  let skippedAdoptions = 0;
  for (const a of beforeAdoptions) {
    const code = resolveAdoptionCode(a.processFlow);
    if (!code) {
      skippedAdoptions += 1;
      continue;
    }
    const key = `${a.projectId}::${code}`;
    const prev = adoptionSnap.get(key);
    // Prefer keeping an active adoption if duplicates collapse onto one code
    if (!prev || (!prev.isActive && a.isActive)) {
      adoptionSnap.set(key, {
        projectId: a.projectId,
        code,
        isActive: a.isActive,
        activatedAt: a.activatedAt,
        deactivatedAt: a.deactivatedAt,
      });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      // 1) Wipe workflow runtime (tasks/actions cascade from instance)
      const deletedActions = await tx.projectOrgWorkflowAction.deleteMany({});
      const deletedTasks = await tx.projectOrgWorkflowTask.deleteMany({});
      const deletedInstances = await tx.projectOrgWorkflowInstance.deleteMany({});
      console.log(
        `Wiped workflows: actions=${deletedActions.count}, tasks=${deletedTasks.count}, instances=${deletedInstances.count}`,
      );

      // 2) Ensure core roles exist with canonical names/descriptions first
      // (transaction-safe path — call helpers against tx)
    },
    { timeout: 120000 },
  );

  // Helpers use the shared client; run outside the big destroy tx after wipe.
  await ensureCoreProjectOrgRoles(prisma);

  const coreRoles = await prisma.projectOrgRole.findMany({
    where: { name: { in: CORE_ORG_ROLE_DEFINITIONS.map((d) => d.name) } },
  });
  const roleIdByName = Object.fromEntries(coreRoles.map((r) => [r.name, r.id]));

  // Force-refresh every core role row to catalogue copy (even if already upserted)
  for (const def of CORE_ORG_ROLE_DEFINITIONS) {
    await prisma.projectOrgRole.update({
      where: { name: def.name },
      data: {
        description: def.description,
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
  }

  // 3) Remap legacy role assignments onto canonical roles
  let remappedUsers = 0;
  for (const [legacyName, canonicalName] of Object.entries(LEGACY_ROLE_ALIAS)) {
    const legacy = await prisma.projectOrgRole.findUnique({ where: { name: legacyName } });
    const targetId = roleIdByName[canonicalName];
    if (!legacy || !targetId || legacy.id === targetId) continue;
    const moved = await prisma.projectOrgUser.updateMany({
      where: { projectOrgRoleId: legacy.id },
      data: { projectOrgRoleId: targetId },
    });
    remappedUsers += moved.count;
    console.log(`Remapped ${moved.count} user(s): “${legacyName}” → “${canonicalName}”`);
  }

  // Also refresh roleIdByName after ensure
  const allCore = await prisma.projectOrgRole.findMany({
    where: { name: { in: CORE_ORG_ROLE_DEFINITIONS.map((d) => d.name) } },
    select: { id: true, name: true },
  });
  const keepRoleIds = new Set(allCore.map((r) => r.id));

  // 4) Delete all process flows (adoptions cascade; items cascade). Instances already wiped.
  const deletedFlows = await prisma.projectOrgProcessFlow.deleteMany({});
  console.log(`Deleted process flows: ${deletedFlows.count} (adoptions cascaded)`);

  // 5) Recreate coded templates + steps from BASELINE_PROCESS_TEMPLATES
  await ensureBaselineProcessTemplates(prisma);

  // 6) Delete non-core roles (legacy educational names) now that flow items point at core roles
  const obsolete = await prisma.projectOrgRole.findMany({
    where: { id: { notIn: [...keepRoleIds] } },
    select: { id: true, name: true, _count: { select: { orgUsers: true, processFlowItems: true } } },
  });
  let deletedRoles = 0;
  for (const r of obsolete) {
    if (r._count.orgUsers > 0 || r._count.processFlowItems > 0) {
      console.warn(
        `Skipped deleting residual role “${r.name}” (users=${r._count.orgUsers}, steps=${r._count.processFlowItems})`,
      );
      continue;
    }
    await prisma.projectOrgRole.delete({ where: { id: r.id } });
    deletedRoles += 1;
    console.log(`Deleted obsolete role “${r.name}”`);
  }

  // 7) Restore adoptions onto new flow ids by code
  const newFlows = await prisma.projectOrgProcessFlow.findMany({
    where: { code: { in: Object.values(PROCESS_FLOW_CODES) } },
    select: { id: true, code: true },
  });
  const flowIdByCode = Object.fromEntries(newFlows.map((f) => [f.code, f.id]));

  let restoredAdoptions = 0;
  for (const snap of adoptionSnap.values()) {
    const processFlowId = flowIdByCode[snap.code];
    if (!processFlowId) continue;
    await prisma.projectOrgProcessFlowAdoption.upsert({
      where: {
        projectId_processFlowId: {
          projectId: snap.projectId,
          processFlowId,
        },
      },
      create: {
        projectId: snap.projectId,
        processFlowId,
        isActive: snap.isActive,
        activatedAt: snap.isActive ? snap.activatedAt || new Date() : null,
        deactivatedAt: snap.isActive ? null : snap.deactivatedAt || new Date(),
      },
      update: {
        isActive: snap.isActive,
        activatedAt: snap.isActive ? snap.activatedAt || new Date() : null,
        deactivatedAt: snap.isActive ? null : snap.deactivatedAt || new Date(),
      },
    });
    restoredAdoptions += 1;
  }

  // 8) Report
  const roles = await prisma.projectOrgRole.findMany({ orderBy: { sortOrder: "asc" } });
  const flows = await prisma.projectOrgProcessFlow.findMany({
    include: {
      items: {
        orderBy: { stepNumber: "asc" },
        include: { projectOrgRole: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  const adoptions = await prisma.projectOrgProcessFlowAdoption.count();
  const instances = await prisma.projectOrgWorkflowInstance.count();

  console.log("\n=== Organisation roles (canonical) ===");
  for (const r of roles) {
    console.log(
      `- ${r.name} (sort ${r.sortOrder}, ${r.isActive ? "active" : "inactive"})${r.description ? `\n    ${r.description}` : ""}`,
    );
  }

  console.log("\n=== Process workflows (engine catalogue) ===");
  for (const f of flows) {
    console.log(`\n[${f.code}] ${f.name}`);
    console.log(`  trigger: ${f.triggerKey}`);
    console.log(`  ${f.description || "(no description)"}`);
    for (const s of f.items) {
      console.log(
        `  ${String(s.stepNumber).padStart(2, " ")}. [${s.actionKey || "—"}] ${s.taskDescription} → ${s.projectOrgRole?.name || "?"}`,
      );
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Roles now:              ${roles.length} (expected ${CORE_ORG_ROLE_DEFINITIONS.length})`);
  console.log(
    `Flows now:              ${flows.length} (expected ${BASELINE_PROCESS_TEMPLATES.length})`,
  );
  console.log(`Users remapped:         ${remappedUsers}`);
  console.log(`Obsolete roles deleted: ${deletedRoles}`);
  console.log(`Adoptions restored:     ${restoredAdoptions} (skipped unmapped legacy: ${skippedAdoptions})`);
  console.log(`Adoptions now:          ${adoptions}`);
  console.log(`Workflow instances now: ${instances} (should be 0)`);
  console.log(`Student default role:   ${PROJECT_ORG_ENTRY_ROLE_NAME}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
