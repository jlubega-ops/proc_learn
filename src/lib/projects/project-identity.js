export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Current organisation codes: ORG-XXXXXX (6 chars from CODE_CHARS). */
export const ORG_PROJECT_CODE_RE = new RegExp(`^ORG-[${CODE_CHARS}]{6}$`);

/** Legacy short codes used before ORG-XXXXXX. */
const LEGACY_PROJECT_CODE_RE = new RegExp(`^[${CODE_CHARS}]{5}$`);

/**
 * @param {unknown} raw
 */
export function isOrganisationProjectCode(raw) {
  const code = String(raw || "").trim().toUpperCase();
  return ORG_PROJECT_CODE_RE.test(code) || LEGACY_PROJECT_CODE_RE.test(code);
}

/**
 * @param {number} [length]
 * @returns {string}
 */
export function generateShortAlphanumericCode(length = 5) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

/**
 * Organisation codes: ORG-XXXXXX (unique).
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function generateUniqueProjectCode(prisma) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const projectCode = `ORG-${generateShortAlphanumericCode(6)}`;
    const clash = await prisma.project.findFirst({
      where: { projectCode },
      select: { id: true },
    });
    if (!clash) return projectCode;
  }
  throw new Error("Could not generate a unique organisation code.");
}

/**
 * Ensures every project has a short immutable code (backfills legacy rows).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 */
export async function ensureProjectCode(prisma, projectId) {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, projectCode: true },
  });
  if (!row) return null;
  if (row.projectCode) return row.projectCode;

  const projectCode = await generateUniqueProjectCode(prisma);
  await prisma.project.update({
    where: { id: projectId },
    data: { projectCode },
  });
  return projectCode;
}
