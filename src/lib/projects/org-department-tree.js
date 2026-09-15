/**
 * Build nested tree from flat units (max depth 2).
 * Pure helper — safe for client and server.
 * @param {{ id: string; parentId?: string | null; sortOrder?: number; name?: string; [k: string]: any }[]} units
 */
export function buildDepartmentTree(units) {
  const byParent = new Map();
  for (const u of units) {
    const key = u.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(u);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );
  }
  return (byParent.get("") || []).map((root) => ({
    ...root,
    subunits: (byParent.get(root.id) || []).map((child) => ({
      ...child,
      subunits: [],
    })),
  }));
}
