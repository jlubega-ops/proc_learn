import { canManageProjectOrgUsers } from "@/lib/projects/org-users";

export { canManageProjectOrgUsers as canManageProjectOrgDepartments };

const deptSelect = {
  id: true,
  name: true,
  code: true,
  unitType: true,
  description: true,
  isActive: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
};

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
    subunits: Array.isArray(row.subunits)
      ? row.subunits.map((s) => serializeProjectOrgDepartment(s))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    orderBy: [{ name: "asc" }],
    select: {
      ...deptSelect,
      subunits: {
        where: { isActive: true },
        orderBy: [{ name: "asc" }],
        select: deptSelect,
      },
    },
  });
  return rows.map((row) => serializeProjectOrgDepartment(row));
}

export { deptSelect };
