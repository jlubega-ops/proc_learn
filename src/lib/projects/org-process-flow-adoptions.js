export const processFlowAdoptionSelect = {
  id: true,
  processFlowId: true,
  createdAt: true,
  processFlow: {
    select: {
      id: true,
      name: true,
      description: true,
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
    name: flow?.name || "",
    description: flow?.description || null,
    itemCount: flow?._count?.items ?? 0,
    createdAt: row.createdAt,
  };
}

/**
 * @param {any} row
 * @param {Set<string>} adoptedIds
 */
export function serializeCatalogueProcessFlow(row, adoptedIds) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    itemCount: row._count?.items ?? 0,
    isAdopted: adoptedIds.has(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
