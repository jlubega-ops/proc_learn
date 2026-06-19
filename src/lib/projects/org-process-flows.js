export const processFlowSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true } },
};

export const processFlowItemSelect = {
  id: true,
  stepNumber: true,
  taskDescription: true,
  projectOrgRoleId: true,
  createdAt: true,
  updatedAt: true,
  projectOrgRole: {
    select: { id: true, name: true },
  },
};

/**
 * @param {any} row
 */
export function serializeProjectOrgProcessFlow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    itemCount: row._count?.items ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {any} row
 */
export function serializeProjectOrgProcessFlowItem(row) {
  return {
    id: row.id,
    stepNumber: row.stepNumber,
    taskDescription: row.taskDescription,
    projectOrgRoleId: row.projectOrgRoleId,
    requiredRole: row.projectOrgRole
      ? { id: row.projectOrgRole.id, name: row.projectOrgRole.name }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
