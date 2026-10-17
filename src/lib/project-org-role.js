import { throttleSync } from "@/lib/sync-throttle";

/** Default organisation role for student Organization Administrator entry. */
export const PROJECT_ORG_ENTRY_ROLE_NAME = "Organization Administrator";

/** Legacy name used before Organization Administrator rename. */
export const PROJECT_ORG_ENTRY_ROLE_LEGACY_NAME = "Admin";

/**
 * Core organisation roles exposed in the simulation (configurable catalogue).
 * Future roles may be seeded inactive / omitted from create-user UI until needed.
 */
export const CORE_ORG_ROLE_DEFINITIONS = [
  {
    name: PROJECT_ORG_ENTRY_ROLE_NAME,
    description:
      "ICT/system administrator. Configures organisation structure, users, and workflows — no procurement approval authority by default.",
    sortOrder: 0,
  },
  {
    name: "User Department Officer",
    description: "Prepares departmental procurement plans and requisitions.",
    sortOrder: 10,
  },
  {
    name: "Head User Department",
    description: "Reviews and endorses departmental plans and requisitions.",
    sortOrder: 20,
  },
  {
    name: "Procurement Officer",
    description: "Manages procurement processes and verifies plan availability.",
    sortOrder: 30,
  },
  {
    name: "Head PDU",
    description: "Heads the Procurement and Disposal Unit; verifies funding and consolidates plans.",
    sortOrder: 40,
  },
  {
    name: "Contracts Officer",
    description: "Reviews consolidated procurement plans and contract documentation.",
    sortOrder: 50,
  },
  {
    name: "Finance/Budget Officer",
    description:
      "Reviews and consolidates department budget requirements before Accounting Officer approval.",
    sortOrder: 55,
  },
  {
    name: "Accounting Officer",
    description: "Final organisational approval authority for budgets, plans and requisitions.",
    sortOrder: 60,
  },
  {
    name: "Contracts Committee",
    description:
      "Workflow routing role for Contracts Committee decisions (method approval, solicitation documents, evaluation committee, evaluation report and award). Do not assign as a login role — seat members on the Contracts Committee instead.",
    sortOrder: 200,
  },
  {
    name: "Evaluation Committee",
    description:
      "Workflow routing role for Evaluation Committee work (technical/financial evaluation, evaluation report, post-qualification). Do not assign as a login role — seat members on the Evaluation Committee instead.",
    sortOrder: 210,
  },
  {
    name: "Inspection/Acceptance Committee",
    description:
      "Workflow routing role for inspection and acceptance of tender deliveries. Do not assign as a login role — seat members on the Inspection/Acceptance Committee instead.",
    sortOrder: 220,
  },
];

/** Roles used only for workflow routing / committee hats — not org user logins. */
export const WORKFLOW_ONLY_ORG_ROLE_NAMES = new Set([
  "Contracts Committee",
  "Evaluation Committee",
  "Inspection/Acceptance Committee",
]);

/**
 * @param {unknown} name
 */
export function isWorkflowOnlyOrgRole(name) {
  return WORKFLOW_ONLY_ORG_ROLE_NAMES.has(String(name || "").trim());
}

/** Names for Prisma `notIn` filters (assignable / catalogue UI). */
export const WORKFLOW_ONLY_ORG_ROLE_NAME_LIST = [...WORKFLOW_ONLY_ORG_ROLE_NAMES];

/**
 * Block create / edit / delete of committee routing roles in the project-roles UI.
 * @param {{ name: string; isActive?: boolean; fieldErrors?: Record<string, string> }}
 */
export function workflowOnlyOrgRoleGuardError({ name, isActive, fieldErrors = {} }) {
  if (!isWorkflowOnlyOrgRole(name)) return null;
  if (isActive === false) {
    return {
      error: "Committee routing roles must stay active for procurement workflows.",
      fieldErrors: {
        ...fieldErrors,
        isActive: "This role is used by workflow steps and cannot be deactivated.",
      },
    };
  }
  return {
    error:
      "Contracts, Evaluation and Inspection committees are seating groups, not login roles. Manage them under Committees.",
    fieldErrors,
  };
}

/**
 * @param {unknown} name
 */
export function isProjectOrgAdminRole(name) {
  const n = String(name || "").trim().toLowerCase();
  return (
    n === PROJECT_ORG_ENTRY_ROLE_NAME.toLowerCase() ||
    n === PROJECT_ORG_ENTRY_ROLE_LEGACY_NAME.toLowerCase()
  );
}

/**
 * Guarantees the Organization Administrator role exists (migrates legacy "Admin" if needed).
 * The repair writes run at most every 10 minutes per server process.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function ensureProjectOrgAdminRole(prisma) {
  await adminRoleSync(prisma);
  return prisma.projectOrgRole.findUnique({ where: { name: PROJECT_ORG_ENTRY_ROLE_NAME } });
}

const adminRoleSync = throttleSync(10 * 60_000, syncProjectOrgAdminRole);

/** @param {import("@prisma/client").PrismaClient} prisma */
async function syncProjectOrgAdminRole(prisma) {
  const legacy = await prisma.projectOrgRole.findUnique({
    where: { name: PROJECT_ORG_ENTRY_ROLE_LEGACY_NAME },
  });
  if (legacy) {
    const clash = await prisma.projectOrgRole.findUnique({
      where: { name: PROJECT_ORG_ENTRY_ROLE_NAME },
    });
    if (!clash) {
      return prisma.projectOrgRole.update({
        where: { id: legacy.id },
        data: {
          name: PROJECT_ORG_ENTRY_ROLE_NAME,
          description:
            "ICT/system administrator. Configures organisation structure, users, and workflows — no procurement approval authority by default.",
          sortOrder: 0,
          isActive: true,
        },
      });
    }
    // Both exist — keep new name, retire legacy by renaming user FKs would break; leave legacy inactive.
    await prisma.projectOrgRole.update({
      where: { id: legacy.id },
      data: { isActive: false },
    });
  }

  return prisma.projectOrgRole.upsert({
    where: { name: PROJECT_ORG_ENTRY_ROLE_NAME },
    create: {
      name: PROJECT_ORG_ENTRY_ROLE_NAME,
      description:
        "ICT/system administrator. Configures organisation structure, users, and workflows — no procurement approval authority by default.",
      sortOrder: 0,
      isActive: true,
    },
    update: {
      isActive: true,
      sortOrder: 0,
    },
  });
}

/**
 * Seeds/updates the core organisation role catalogue. Runs at most every 10 minutes per server process.
 * @type {(prisma: import("@prisma/client").PrismaClient) => Promise<void>}
 */
export const ensureCoreProjectOrgRoles = throttleSync(10 * 60_000, syncCoreProjectOrgRoles);

/** @param {import("@prisma/client").PrismaClient} prisma */
async function syncCoreProjectOrgRoles(prisma) {
  await ensureProjectOrgAdminRole(prisma);
  for (const def of CORE_ORG_ROLE_DEFINITIONS) {
    if (isProjectOrgAdminRole(def.name)) continue;
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
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getProjectOrgAdminRole(prisma) {
  await ensureProjectOrgAdminRole(prisma);
  return prisma.projectOrgRole.findUnique({
    where: { name: PROJECT_ORG_ENTRY_ROLE_NAME },
  });
}

/**
 * @param {{ name: string; isActive?: boolean; fieldErrors?: Record<string, string> }}
 */
export function projectOrgAdminRoleGuardError({ name, isActive, fieldErrors = {} }) {
  if (!isProjectOrgAdminRole(name)) return null;

  if (isActive === false) {
    return {
      error:
        "The Organization Administrator role is required. Students enter every organisation with this role, so it cannot be deactivated.",
      fieldErrors: {
        ...fieldErrors,
        isActive: "Organization Administrator must stay active.",
      },
    };
  }

  return {
    error: "The Organization Administrator role is required and cannot be removed or renamed.",
    fieldErrors,
  };
}
