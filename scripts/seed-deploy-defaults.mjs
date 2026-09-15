/**
 * Production / deploy defaults bootstrap.
 *
 * Creates the first system admin if missing, then refreshes shared catalogue
 * data (organisation roles, process workflows, programme, current academic year).
 *
 * Admin behaviour:
 *   - Email defaults to jlubega@mubs.ac.ug
 *   - If the user already exists → do not recreate (ensure SYSTEM_ADMIN role only)
 *   - Optional password reset: DEPLOY_ADMIN_RESET_PASSWORD=1
 *
 * Catalogue behaviour (always):
 *   - Upsert organisation roles from CORE_ORG_ROLE_DEFINITIONS
 *   - Upsert engine process workflows + steps from BASELINE_PROCESS_TEMPLATES
 *   - Ensure a default Programme (GEN) and current Academic Year
 *
 * Optional flags:
 *   --wipe-runtime   Delete all workflow instances/tasks/actions (destructive)
 *   --reset-flows    Delete process-flow rows then recreate from catalogue
 *                    (adoptions remapped by engine code when possible)
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-deploy-defaults.mjs
 *   npm run db:seed:deploy
 *
 * Env:
 *   DEPLOY_ADMIN_EMAIL / SEED_ADMIN_EMAIL
 *   DEPLOY_ADMIN_PASSWORD / SEED_ADMIN_PASSWORD
 *   DEPLOY_ADMIN_RESET_PASSWORD=1
 */
import bcrypt from "bcryptjs";
import { Role, UserAccountStatus } from "@prisma/client";
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
  migrateLegacyProcessAdoptions,
} from "../src/lib/projects/process-catalogue.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";

const ADMIN_EMAIL = String(
  process.env.DEPLOY_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "jlubega@mubs.ac.ug",
)
  .trim()
  .toLowerCase();

const ADMIN_PASSWORD = String(
  process.env.DEPLOY_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "Admin123!",
);

const RESET_ADMIN_PASSWORD =
  String(process.env.DEPLOY_ADMIN_RESET_PASSWORD || "").trim() === "1" ||
  process.argv.includes("--reset-admin-password");

const WIPE_RUNTIME = process.argv.includes("--wipe-runtime");
const RESET_FLOWS = process.argv.includes("--reset-flows");

const LEGACY_ROLE_ALIAS = {
  Admin: PROJECT_ORG_ENTRY_ROLE_NAME,
  "User Department": "User Department Officer",
  "Head of User Department": "Head User Department",
};

/**
 * @param {import("@prisma/client").ProjectOrgProcessFlow} flow
 */
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
  if (name === "tender process") return PROCESS_FLOW_CODES.TENDER_PROCESS;
  if (name === "evaluation process") return PROCESS_FLOW_CODES.EVALUATION_PROCESS;
  if (name === "post qualification process" || name === "post-qualification process") {
    return PROCESS_FLOW_CODES.POST_QUALIFICATION_PROCESS;
  }
  if (name === "lpo process") return PROCESS_FLOW_CODES.LPO_PROCESS;
  if (name === "invoice process") return PROCESS_FLOW_CODES.INVOICE_PROCESS;
  return null;
}

async function ensureSystemAdmin() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { userRoles: true, settings: true },
  });

  if (existing) {
    const hasAdmin = existing.userRoles.some((r) => r.role === Role.SYSTEM_ADMIN);
    if (!hasAdmin) {
      await prisma.userRole.create({
        data: { userId: existing.id, role: Role.SYSTEM_ADMIN },
      });
      console.log(`Admin exists — added SYSTEM_ADMIN role: ${ADMIN_EMAIL}`);
    } else {
      console.log(`Admin already exists — left in place: ${ADMIN_EMAIL}`);
    }

    if (!existing.settings) {
      await prisma.userSettings.create({
        data: {
          userId: existing.id,
          theme: "light",
          activeRole: Role.SYSTEM_ADMIN,
        },
      });
    } else if (existing.settings.activeRole !== Role.SYSTEM_ADMIN && hasAdmin) {
      // Keep their chosen active role; only set if they had no settings above.
    }

    if (RESET_ADMIN_PASSWORD) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          accountStatus: UserAccountStatus.ACTIVE,
          activatedAt: existing.activatedAt || new Date(),
          mustChangePassword: true,
        },
      });
      console.log("Admin password reset (DEPLOY_ADMIN_RESET_PASSWORD / --reset-admin-password).");
    }

    return { created: false, id: existing.id };
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      firstName: "System",
      middleName: null,
      lastName: "Admin",
      sex: null,
      profilePhotoUrl: null,
      passwordHash,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: now,
      mustChangePassword: true,
      userRoles: { create: [{ role: Role.SYSTEM_ADMIN }] },
      settings: {
        create: { theme: "light", activeRole: Role.SYSTEM_ADMIN },
      },
    },
  });

  console.log(`Created system admin: ${ADMIN_EMAIL} (must change password on first sign-in)`);
  return { created: true, id: user.id };
}

async function ensureDefaultProgramme() {
  const shortName = "GEN";
  const existing = await prisma.programme.findFirst({ where: { shortName } });
  if (existing) {
    await prisma.programme.update({
      where: { id: existing.id },
      data: {
        name: "General",
        shortName,
        isActive: true,
        defaultYearOfStudy: 3,
      },
    });
    console.log(`Programme refreshed: ${shortName}`);
    return existing.id;
  }
  const created = await prisma.programme.create({
    data: {
      name: "General",
      shortName,
      isActive: true,
      defaultYearOfStudy: 3,
    },
  });
  console.log(`Programme created: ${shortName}`);
  return created.id;
}

async function refreshOrganisationRoles() {
  await ensureCoreProjectOrgRoles(prisma);

  for (const def of CORE_ORG_ROLE_DEFINITIONS) {
    await prisma.projectOrgRole.upsert({
      where: { name: def.name },
      create: {
        name: def.name,
        description: def.description,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      update: {
        description: def.description,
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
  }

  const coreRoles = await prisma.projectOrgRole.findMany({
    where: { name: { in: CORE_ORG_ROLE_DEFINITIONS.map((d) => d.name) } },
    select: { id: true, name: true },
  });
  const roleIdByName = Object.fromEntries(coreRoles.map((r) => [r.name, r.id]));

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
    if (moved.count) {
      console.log(`Remapped ${moved.count} org user(s): “${legacyName}” → “${canonicalName}”`);
    }
  }

  const keepRoleIds = new Set(coreRoles.map((r) => r.id));
  const obsolete = await prisma.projectOrgRole.findMany({
    where: { id: { notIn: [...keepRoleIds] } },
    select: {
      id: true,
      name: true,
      _count: { select: { orgUsers: true, processFlowItems: true } },
    },
  });

  let deletedRoles = 0;
  for (const r of obsolete) {
    if (r._count.orgUsers > 0 || r._count.processFlowItems > 0) {
      console.warn(
        `Kept residual org role “${r.name}” (users=${r._count.orgUsers}, steps=${r._count.processFlowItems})`,
      );
      continue;
    }
    await prisma.projectOrgRole.delete({ where: { id: r.id } });
    deletedRoles += 1;
    console.log(`Deleted obsolete org role “${r.name}”`);
  }

  console.log(
    `Organisation roles: ${coreRoles.length} core (expected ${CORE_ORG_ROLE_DEFINITIONS.length}); remapped=${remappedUsers}; deleted=${deletedRoles}`,
  );
}

async function wipeWorkflowRuntime() {
  const deletedActions = await prisma.projectOrgWorkflowAction.deleteMany({});
  const deletedTasks = await prisma.projectOrgWorkflowTask.deleteMany({});
  const deletedInstances = await prisma.projectOrgWorkflowInstance.deleteMany({});
  console.log(
    `Wiped runtime workflows: actions=${deletedActions.count}, tasks=${deletedTasks.count}, instances=${deletedInstances.count}`,
  );
}

async function resetProcessFlowsFromCatalogue() {
  const beforeAdoptions = await prisma.projectOrgProcessFlowAdoption.findMany({
    include: { processFlow: { select: { id: true, code: true, name: true } } },
  });

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

  const deletedFlows = await prisma.projectOrgProcessFlow.deleteMany({});
  console.log(`Deleted process flows: ${deletedFlows.count} (adoptions cascaded)`);

  await ensureBaselineProcessTemplates(prisma);

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

  console.log(
    `Process flows recreated: ${newFlows.length} (expected ${BASELINE_PROCESS_TEMPLATES.length}); adoptions restored=${restoredAdoptions}; skipped unmapped=${skippedAdoptions}`,
  );
}

async function refreshProcessWorkflows() {
  if (WIPE_RUNTIME) {
    await wipeWorkflowRuntime();
  }

  if (RESET_FLOWS) {
    await resetProcessFlowsFromCatalogue();
  } else {
    await ensureBaselineProcessTemplates(prisma);
    await migrateLegacyProcessAdoptions(prisma);
    const flows = await prisma.projectOrgProcessFlow.count({
      where: { code: { in: Object.values(PROCESS_FLOW_CODES) } },
    });
    console.log(
      `Process workflows upserted: ${flows} coded flows (expected ${BASELINE_PROCESS_TEMPLATES.length})`,
    );
  }
}

async function printSummary() {
  const roles = await prisma.projectOrgRole.findMany({
    orderBy: { sortOrder: "asc" },
    select: { name: true, sortOrder: true, isActive: true },
  });
  const flows = await prisma.projectOrgProcessFlow.findMany({
    where: { code: { in: Object.values(PROCESS_FLOW_CODES) } },
    select: { code: true, name: true, triggerKey: true, _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });
  const ay = await ensureCurrentAcademicContext(prisma);

  console.log("\n=== Organisation roles ===");
  for (const r of roles) {
    console.log(`- ${r.name} (sort ${r.sortOrder}, ${r.isActive ? "active" : "inactive"})`);
  }

  console.log("\n=== Engine process workflows ===");
  for (const f of flows) {
    console.log(`- [${f.code}] ${f.name} · trigger=${f.triggerKey} · steps=${f._count.items}`);
  }

  console.log("\n=== Academic context ===");
  console.log(`Year: ${ay.academicYear?.label || "—"} (current)`);

  console.log("\n=== System roles note ===");
  console.log(
    "Platform roles are enum-based (STUDENT | EXAMINER | SYSTEM_ADMIN) — no separate catalogue table.",
  );
  console.log(`Default org entry role for students: ${PROJECT_ORG_ENTRY_ROLE_NAME}`);
}

async function main() {
  console.log("=== Proc Learn deploy defaults ===\n");
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Flags: wipe-runtime=${WIPE_RUNTIME} reset-flows=${RESET_FLOWS} reset-admin-password=${RESET_ADMIN_PASSWORD}\n`);

  await ensureSystemAdmin();
  await ensureDefaultProgramme();
  await ensureCurrentAcademicContext(prisma);
  console.log("Academic year ensured.");

  await refreshOrganisationRoles();
  await refreshProcessWorkflows();
  await printSummary();

  console.log("\n=== Deploy defaults complete ===");
  console.log("Sign in as system admin, then create examiners/students from the app.");
  if (!RESET_ADMIN_PASSWORD) {
    console.log(
      "Tip: to force-reset the admin password on an existing account, set DEPLOY_ADMIN_RESET_PASSWORD=1",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
