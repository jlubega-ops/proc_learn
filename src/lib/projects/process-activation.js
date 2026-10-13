import {
  BASELINE_PROCESS_TEMPLATES,
  TRIGGER_TO_PROCESS_CODE,
  migrateLegacyProcessAdoptions,
  processCodesForMethod,
} from "@/lib/projects/process-catalogue";
import {
  processDisabledForProgrammeMessage,
  resolveEffectiveProcessCodes,
} from "@/lib/academic/programme-processes";

/** @type {Record<string, string>} */
const DEFAULT_PROCESS_NAMES = Object.fromEntries(
  BASELINE_PROCESS_TEMPLATES.map((tpl) => [tpl.code, tpl.name]),
);

/**
 * Engine process codes adopted and active for an organisation, with their display names.
 * Matches `findActiveProcessForTrigger`: a flow counts by `code`, or by its bound `triggerKey`.
 * Adoptions the programme × year list (or the examiner) no longer allows are `frozen`, not active.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @returns {Promise<{ active: Set<string>; frozen: Set<string>; allowed: string[] | null; names: Record<string, string> }>}
 */
export async function loadProcessActivation(prisma, projectId) {
  const [rows, allowed] = await Promise.all([
    prisma.projectOrgProcessFlowAdoption.findMany({
      where: { projectId },
      select: {
        isActive: true,
        processFlow: { select: { code: true, triggerKey: true, name: true } },
      },
    }),
    resolveEffectiveProcessCodes(prisma, projectId),
  ]);
  const allowedSet = allowed ? new Set(allowed) : null;
  const active = new Set();
  const frozen = new Set();
  /** @type {Record<string, string>} */
  const names = { ...DEFAULT_PROCESS_NAMES };
  for (const row of rows) {
    const flow = row.processFlow;
    const code = flow?.code || TRIGGER_TO_PROCESS_CODE[flow?.triggerKey || ""] || null;
    if (!code) continue;
    if (flow?.name) names[code] = flow.name;
    if (!row.isActive) continue;
    if (allowedSet && !allowedSet.has(code)) frozen.add(code);
    else active.add(code);
  }
  return { active, frozen, allowed, names };
}

/**
 * @param {string} processName
 */
export function processInactiveMessage(processName) {
  return `The ${processName} is inactive for this organisation. An Organization Administrator must activate it first.`;
}

/**
 * Blocks a procurement method when its own process or any phase it needs is inactive.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {string} method
 * @returns {Promise<null | { ok: false; error: string; status: number; code: "WORKFLOW_INACTIVE" }>}
 */
export async function assertMethodProcessesActive(prisma, projectId, method) {
  for (const code of processCodesForMethod(method)) {
    const blocked = await assertProcessActive(prisma, projectId, code);
    if (blocked) return blocked;
  }
  return null;
}

/**
 * Returns a blocking result when the process is not active, otherwise null.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string} projectId
 * @param {string} code
 * @returns {Promise<null | { ok: false; error: string; status: number; code: "WORKFLOW_INACTIVE" }>}
 */
export async function assertProcessActive(prisma, projectId, code) {
  let { active, allowed, names } = await loadProcessActivation(prisma, projectId);
  if (active.has(code)) return null;
  if (!allowed || allowed.includes(code)) {
    try {
      // Name-only legacy adoptions only resolve to a code after migration.
      await migrateLegacyProcessAdoptions(prisma, { projectId });
      ({ active, allowed, names } = await loadProcessActivation(prisma, projectId));
      if (active.has(code)) return null;
    } catch {
      // Fall through: treat as inactive.
    }
  }
  const disabledForProgramme = Boolean(allowed && !allowed.includes(code));
  return {
    ok: false,
    error: disabledForProgramme
      ? processDisabledForProgrammeMessage(names[code] || "process")
      : processInactiveMessage(names[code] || "process"),
    status: disabledForProgramme ? 403 : 400,
    code: "WORKFLOW_INACTIVE",
  };
}
