export const processFlowAdoptionSelect = {
  id: true,
  processFlowId: true,
  isActive: true,
  activatedAt: true,
  deactivatedAt: true,
  createdAt: true,
  processFlow: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      triggerKey: true,
      _count: { select: { items: true } },
    },
  },
};

/**
 * @param {any} row
 */
export function serializeProjectOrgProcessFlowAdoption(row) {
  const flow = row.processFlow;
  return {
    id: row.id,
    processFlowId: row.processFlowId,
    code: flow?.code || null,
    name: flow?.name || "",
    description: flow?.description || null,
    triggerKey: flow?.triggerKey || null,
    itemCount: flow?._count?.items ?? 0,
    isActive: row.isActive !== false,
    activatedAt: row.activatedAt || null,
    deactivatedAt: row.deactivatedAt || null,
    createdAt: row.createdAt,
  };
}

/**
 * @param {any} row
 * @param {Map<string, any>} adoptionByFlowId
 */
export function serializeCatalogueProcessFlow(row, adoptionByFlowId) {
  const adoption = adoptionByFlowId.get(row.id) || null;
  return {
    id: row.id,
    code: row.code || null,
    name: row.name,
    description: row.description || null,
    triggerKey: row.triggerKey || null,
    itemCount: row._count?.items ?? 0,
    isAdopted: Boolean(adoption),
    isActive: adoption ? adoption.isActive !== false : false,
    adoptionId: adoption?.id || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
