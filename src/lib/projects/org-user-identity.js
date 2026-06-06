import { generateShortAlphanumericCode } from "@/lib/projects/project-identity";

/** Fixed password for simulated organisation users in learning projects. */
export const PROJECT_ORG_LEARN_PASSWORD = "password123";

/**
 * Builds a simulated org username scoped to one project: local_PROJECTCODE@domain
 * @param {unknown} email
 * @param {unknown} projectCode
 */
export function formatOrgUsername(email, projectCode) {
  const e = String(email || "").trim().toLowerCase();
  const code = String(projectCode || "").trim().toUpperCase();
  if (!e || !code) return e || "";
  const at = e.indexOf("@");
  const local = at === -1 ? e : e.slice(0, at);
  const domain = at === -1 ? "" : e.slice(at + 1);
  if (!domain) return `${local}_${code}`;
  return `${local}_${code}@${domain}`;
}

/**
 * @returns {string}
 */
export function generateOrgUnitIdentifier() {
  return generateShortAlphanumericCode(5);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function generateUniqueOrgUnitIdentifier(prisma, projectId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const unitIdentifier = generateOrgUnitIdentifier();
    const clash = await prisma.projectOrgUser.findFirst({
      where: { projectId, unitIdentifier },
      select: { id: true },
    });
    if (!clash) return unitIdentifier;
  }
  throw new Error("Could not generate a unique unit identifier.");
}
