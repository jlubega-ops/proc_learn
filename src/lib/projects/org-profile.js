import { format } from "date-fns";
import { NAV_LABELS } from "@/lib/nav-labels";
import { formatUserDisplayName } from "@/lib/user-display";

/** @param {Date | string | null | undefined} d */
function fmtDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : format(date, "MMM d, yyyy");
}

/** @param {{ purpose?: string | null } | null | undefined} academic @param {boolean} isPersonal */
function orgTypeLabel(academic, isPersonal) {
  if (academic?.purpose === "ASSESSMENT") return "Assessment organisation";
  if (academic?.purpose === "PRACTICE") return "Practice organisation";
  return isPersonal ? "Personal organisation" : "Organisation";
}

const CLOSED_PROCUREMENT = ["DRAFT", "CLOSED", "CANCELLED", "REJECTED"];

/**
 * Everything the dashboard shows about one organisation — identity, current year, structure and activity.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function loadOrgProfile(prisma, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      organizationName: true,
      projectCode: true,
      voteCode: true,
      isPersonalOrg: true,
      isAttemptOrg: true,
      status: true,
      createdAt: true,
      owner: { select: { firstName: true, middleName: true, lastName: true, email: true } },
      sourceAcademicProject: { select: { name: true, purpose: true } },
    },
  });
  if (!project) return null;

  const where = { projectId };
  const now = new Date();
  const [
    currentFy,
    planningPeriod,
    topUnits,
    allUnits,
    users,
    committees,
    providers,
    budgets,
    budgetsApproved,
    plans,
    plansApproved,
    requisitions,
    requisitionsApproved,
    procurements,
    procurementsOpen,
  ] = await Promise.all([
    prisma.projectOrgFinancialYear.findFirst({
      where: { projectId, isActive: true },
      orderBy: { startDate: "desc" },
      select: { label: true, startDate: true, endDate: true },
    }),
    prisma.projectOrgPlanningPeriod.findFirst({
      where: { projectId, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { startDate: "desc" },
      select: { label: true, startDate: true, endDate: true },
    }),
    prisma.projectOrgDepartment.count({ where: { projectId, parentId: null, isActive: true } }),
    prisma.projectOrgDepartment.count({ where: { projectId, isActive: true } }),
    prisma.projectOrgUser.count({ where }),
    prisma.projectOrgCommittee.count({ where: { projectId, isActive: true } }),
    prisma.projectOrgProvider.count({ where }),
    prisma.projectOrgBudget.count({ where }),
    prisma.projectOrgBudget.count({ where: { projectId, status: "APPROVED" } }),
    prisma.projectOrgProcurementPlan.count({ where }),
    prisma.projectOrgProcurementPlan.count({ where: { projectId, status: "APPROVED" } }),
    prisma.projectOrgRequisition.count({ where }),
    prisma.projectOrgRequisition.count({ where: { projectId, status: "APPROVED" } }),
    prisma.projectOrgProcurement.count({ where }),
    prisma.projectOrgProcurement.count({ where: { projectId, status: { notIn: CLOSED_PROCUREMENT } } }),
  ]);

  const academic = project.isAttemptOrg ? project.sourceAcademicProject : null;
  const ownerName = formatUserDisplayName(project.owner);

  /** @type {{ label: string; value?: string | null; wide?: boolean; full?: boolean }[]} */
  const identity = [
    { label: "Organisation name", value: project.organizationName || project.name, wide: true },
    { label: "Organisation code", value: project.projectCode },
    { label: "Vote number", value: project.voteCode || "Not set" },
    { label: "Type", value: orgTypeLabel(academic, project.isPersonalOrg) },
    ...(academic ? [{ label: "Project", value: academic.name, wide: true }] : []),
    ...(academic ? [{ label: "Status", value: project.status }] : []),
    {
      label: "Admin",
      value: [ownerName, project.owner?.email].filter(Boolean).join(" · ") || null,
      wide: true,
    },
    { label: "Created on", value: fmtDate(project.createdAt) },
  ];

  const calendar = [
    { label: "Financial year", value: currentFy?.label || "Not set" },
    {
      label: "Year runs",
      value: currentFy ? `${fmtDate(currentFy.startDate)} – ${fmtDate(currentFy.endDate)}` : null,
    },
    { label: "Planning period", value: planningPeriod?.label || (planningPeriod ? "Open" : "None open") },
    {
      label: "Planning window",
      value: planningPeriod
        ? `${fmtDate(planningPeriod.startDate)} – ${fmtDate(planningPeriod.endDate)}`
        : null,
    },
  ];

  return {
    projectId: project.id,
    title: project.organizationName || project.name,
    projectCode: project.projectCode,
    typeLabel: orgTypeLabel(academic, project.isPersonalOrg),
    identity,
    calendar,
    structure: [
      { key: "departments", label: NAV_LABELS.departments, value: topUnits, hint: `${allUnits} incl. sub-units` },
      { key: "users", label: NAV_LABELS.users, value: users },
      { key: "committees", label: NAV_LABELS.committees, value: committees },
      { key: "providers", label: NAV_LABELS.providers, value: providers },
    ],
    activity: [
      { key: "budgets", label: NAV_LABELS.budgets, value: budgets, hint: `${budgetsApproved} approved` },
      { key: "procurementPlans", label: NAV_LABELS.procurementPlans, value: plans, hint: `${plansApproved} approved` },
      { key: "requisitions", label: NAV_LABELS.requisitions, value: requisitions, hint: `${requisitionsApproved} approved` },
      { key: "procurements", label: NAV_LABELS.procurements, value: procurements, hint: `${procurementsOpen} in progress` },
    ],
  };
}
