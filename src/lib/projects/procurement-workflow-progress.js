const INSTANCE_SELECT = {
  id: true,
  status: true,
  currentStepNumber: true,
  processFlow: {
    select: {
      name: true,
      items: {
        orderBy: { stepNumber: "asc" },
        select: {
          stepNumber: true,
          taskDescription: true,
          projectOrgRole: { select: { name: true } },
        },
      },
    },
  },
  tasks: {
    where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
    select: {
      stepNumber: true,
      requiredRoleName: true,
      assignee: { select: { firstName: true, lastName: true } },
    },
  },
  actions: {
    where: { taskId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      decision: true,
      actorRoleName: true,
      committeeId: true,
      createdAt: true,
      task: { select: { stepNumber: true } },
      actor: { select: { firstName: true, lastName: true } },
    },
  },
};

/**
 * @param {{ firstName?: string | null; lastName?: string | null } | null | undefined} p
 */
function personName(p) {
  return [p?.firstName, p?.lastName].filter(Boolean).join(" ");
}

/**
 * @param {any} instance
 */
function summarizeInstance(instance) {
  const current =
    instance.status === "ACTIVE" || instance.status === "IN_PROGRESS"
      ? instance.currentStepNumber
      : null;

  /** @type {Map<number, any>} */
  const lastActionByStep = new Map();
  for (const a of instance.actions || []) {
    if (a.task?.stepNumber != null) lastActionByStep.set(a.task.stepNumber, a);
  }

  const steps = (instance.processFlow?.items || []).map((/** @type {any} */ item) => {
    let state = "upcoming";
    if (instance.status === "COMPLETED") state = "done";
    else if (current != null && item.stepNumber < current) state = "done";
    else if (current != null && item.stepNumber === current) state = "current";
    const action = state === "done" ? lastActionByStep.get(item.stepNumber) : null;
    return {
      stepNumber: item.stepNumber,
      label: item.taskDescription,
      roleName: item.projectOrgRole?.name || "",
      state,
      actedBy: action
        ? {
            name: personName(action.actor),
            roleName: action.actorRoleName || null,
            asCommittee: Boolean(action.committeeId),
            decision: action.decision,
            at: action.createdAt,
          }
        : null,
    };
  });

  const waiting = (instance.tasks || []).filter((/** @type {any} */ t) => t.stepNumber === current);
  const currentStep = steps.find((/** @type {any} */ s) => s.state === "current") || null;

  return {
    processName: instance.processFlow?.name || "Workflow",
    status: instance.status,
    currentStepNumber: current,
    totalSteps: steps.length,
    currentStep,
    waitingOnRole: waiting[0]?.requiredRoleName || currentStep?.roleName || null,
    waitingOnPeople: waiting.map((/** @type {any} */ t) => personName(t.assignee)).filter(Boolean),
    steps,
  };
}

/**
 * Read-only stage tracker for a procurement: every viewer can see where the
 * workflow is, whom it is waiting on, and who acted on the earlier steps
 * (including the requisition workflow that chose the method).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
export async function loadProcurementWorkflowProgress(prisma, projectId, procurementId) {
  const [instance, procurement] = await Promise.all([
    prisma.projectOrgWorkflowInstance.findFirst({
      where: { projectId, procurementId },
      orderBy: { startedAt: "desc" },
      select: INSTANCE_SELECT,
    }),
    prisma.projectOrgProcurement.findFirst({
      where: { id: procurementId, projectId },
      select: { requisitionId: true },
    }),
  ]);

  const requisitionInstance = procurement?.requisitionId
    ? await prisma.projectOrgWorkflowInstance.findFirst({
        where: { projectId, requisitionId: procurement.requisitionId, procurementId: null },
        orderBy: { startedAt: "desc" },
        select: INSTANCE_SELECT,
      })
    : null;

  if (!instance && !requisitionInstance) return null;

  const main = instance ? summarizeInstance(instance) : null;
  const earlierPhases = requisitionInstance
    ? [{ phase: "Requisition", ...summarizeInstance(requisitionInstance) }]
    : [];

  return {
    processName: main?.processName || "Procurement workflow",
    status: main?.status || null,
    currentStepNumber: main?.currentStepNumber ?? null,
    totalSteps: main?.totalSteps || 0,
    currentStep: main?.currentStep || null,
    waitingOnRole: main?.waitingOnRole || null,
    waitingOnPeople: main?.waitingOnPeople || [],
    steps: main?.steps || [],
    earlierPhases,
  };
}
