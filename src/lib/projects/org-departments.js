import { canManageProjectOrgUsers } from "@/lib/projects/org-users";
import { buildDepartmentTree } from "@/lib/projects/org-department-tree";

export { canManageProjectOrgUsers as canManageProjectOrgDepartments };
export { buildDepartmentTree };

const deptSelect = {
  id: true,
  name: true,
  code: true,
  unitType: true,
  description: true,
  isActive: true,
  parentId: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
};

const siblingOrder = [{ sortOrder: "asc" }, { name: "asc" }];

/**
 * @param {any} row
 */
export function serializeProjectOrgDepartment(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || null,
    unitType: row.unitType || "DEPARTMENT",
    description: row.description,
    isActive: row.isActive,
    parentId: row.parentId,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
    subunits: Array.isArray(row.subunits)
      ? row.subunits.map((s) => serializeProjectOrgDepartment(s))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Flat list of all units for organisation-structure editor.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function listProjectOrgDepartmentUnits(prisma, projectId) {
  const rows = await prisma.projectOrgDepartment.findMany({
    where: { projectId },
    orderBy: siblingOrder,
    select: deptSelect,
  });
  return rows.map((row) => serializeProjectOrgDepartment(row));
}

/**
 * Validate and persist organisation structure (parent + sibling order).
 * Max depth 2: roots (`parentId` null) and children of roots only.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   nodes: unknown;
 * }} opts
 * @returns {Promise<{ ok: true; units: any[] } | { ok: false; error: string; status?: number }>}
 */
export async function saveProjectOrgDepartmentStructure(prisma, opts) {
  const projectId = String(opts.projectId || "").trim();
  if (!projectId) return { ok: false, error: "Invalid project id.", status: 400 };

  if (!Array.isArray(opts.nodes)) {
    return { ok: false, error: "nodes must be an array.", status: 400 };
  }

  const existing = await prisma.projectOrgDepartment.findMany({
    where: { projectId },
    select: { id: true, name: true, parentId: true },
  });
  const existingIds = new Set(existing.map((r) => r.id));
  if (opts.nodes.length !== existing.length) {
    return {
      ok: false,
      error: "Include every department/subunit in the structure payload.",
      status: 400,
    };
  }

  /** @type {{ id: string; parentId: string | null; sortOrder: number }[]} */
  const parsed = [];
  const seen = new Set();

  for (const raw of opts.nodes) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Each node must be an object.", status: 400 };
    }
    const id = String(/** @type {any} */ (raw).id || "").trim();
    if (!id || !existingIds.has(id)) {
      return { ok: false, error: "Unknown department in structure.", status: 400 };
    }
    if (seen.has(id)) {
      return { ok: false, error: "Duplicate department in structure.", status: 400 };
    }
    seen.add(id);

    const parentRaw = /** @type {any} */ (raw).parentId;
    const parentId =
      parentRaw == null || parentRaw === ""
        ? null
        : String(parentRaw).trim() || null;

    if (parentId === id) {
      return { ok: false, error: "A unit cannot be its own parent.", status: 400 };
    }
    if (parentId && !existingIds.has(parentId)) {
      return { ok: false, error: "Parent department not found.", status: 400 };
    }

    const sortOrderRaw = Number(/** @type {any} */ (raw).sortOrder);
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;
    if (sortOrder < 0 || sortOrder > 10000) {
      return { ok: false, error: "sortOrder must be between 0 and 10000.", status: 400 };
    }

    parsed.push({ id, parentId, sortOrder });
  }

  if (seen.size !== existingIds.size) {
    return {
      ok: false,
      error: "Include every department/subunit in the structure payload.",
      status: 400,
    };
  }

  const byId = new Map(parsed.map((n) => [n.id, n]));

  for (const node of parsed) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) {
      return { ok: false, error: "Parent department not found.", status: 400 };
    }
    if (parent.parentId) {
      return {
        ok: false,
        error:
          "Only two levels are allowed. Nest subunits under a top-level department only.",
        status: 400,
      };
    }
  }

  // A unit that still has children cannot become a child (would create depth 3).
  for (const node of parsed) {
    if (!node.parentId) continue;
    const hasChildren = parsed.some((c) => c.parentId === node.id);
    if (hasChildren) {
      const name = existing.find((e) => e.id === node.id)?.name || "This unit";
      return {
        ok: false,
        error: `${name} still has subunits. Move those subunits first, then nest it.`,
        status: 400,
      };
    }
  }

  // Roots that become children cannot keep org-user department assignments.
  const demotedIds = parsed
    .filter((n) => n.parentId)
    .map((n) => n.id)
    .filter((id) => {
      const was = existing.find((e) => e.id === id);
      return was && was.parentId == null;
    });

  if (demotedIds.length) {
    const assigned = await prisma.projectOrgUser.count({
      where: { projectId, departmentId: { in: demotedIds } },
    });
    if (assigned > 0) {
      return {
        ok: false,
        error:
          "Cannot nest a department that still has organisation users assigned. Reassign those users first.",
        status: 400,
      };
    }
  }

  await prisma.$transaction(
    parsed.map((node) =>
      prisma.projectOrgDepartment.update({
        where: { id: node.id },
        data: {
          parentId: node.parentId,
          sortOrder: node.sortOrder,
        },
      }),
    ),
  );

  const units = await listProjectOrgDepartmentUnits(prisma, projectId);
  return { ok: true, units };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} departmentId
 * @param {string | null | undefined} subunitId
 */
export async function resolveOrgUserDepartmentAssignment(prisma, projectId, departmentId, subunitId) {
  const department = await prisma.projectOrgDepartment.findFirst({
    where: {
      id: departmentId,
      projectId,
      parentId: null,
      isActive: true,
    },
  });
  if (!department) return { ok: false, errors: { departmentId: "Choose an active department." } };

  if (!subunitId) {
    return { ok: true, data: { departmentId: department.id, subunitId: null } };
  }

  const subunit = await prisma.projectOrgDepartment.findFirst({
    where: {
      id: subunitId,
      projectId,
      parentId: department.id,
      isActive: true,
    },
  });
  if (!subunit) {
    return { ok: false, errors: { subunitId: "Choose an active subunit in the selected department." } };
  }

  return { ok: true, data: { departmentId: department.id, subunitId: subunit.id } };
}

/**
 * Active top-level departments with active subunits for user forms.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function listAssignableProjectOrgDepartments(prisma, projectId) {
  const rows = await prisma.projectOrgDepartment.findMany({
    where: { projectId, parentId: null, isActive: true },
    orderBy: siblingOrder,
    select: {
      ...deptSelect,
      subunits: {
        where: { isActive: true },
        orderBy: siblingOrder,
        select: deptSelect,
      },
    },
  });
  return rows.map((row) => serializeProjectOrgDepartment(row));
}

export { deptSelect };
