import { generateShortAlphanumericCode } from "@/lib/projects/project-identity";

/** Fixed password for simulated organisation users in learning projects. */
export const PROJECT_ORG_LEARN_PASSWORD = "password123";

/** Synthetic domain for auto-generated organisation learning emails. */
export const ORG_LEARN_EMAIL_DOMAIN = "org.learn";

/** Public consumer domains — never used for organisation learning logins. */
const BLOCKED_PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "mail.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
]);

/**
 * @param {unknown} email
 */
export function isBlockedPublicEmailDomain(email) {
  const v = String(email || "")
    .trim()
    .toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return false;
  const domain = v.slice(at + 1);
  return BLOCKED_PUBLIC_EMAIL_DOMAINS.has(domain);
}

/**
 * True when the address uses the organisation learning domain (not Gmail etc.).
 * @param {unknown} email
 */
export function isOrgLearnEmail(email) {
  const v = String(email || "")
    .trim()
    .toLowerCase();
  if (!v || isBlockedPublicEmailDomain(v)) return false;
  return v.endsWith(`@${ORG_LEARN_EMAIL_DOMAIN}`);
}

/**
 * Normalise full name parts for duplicate-display-name checks.
 * @param {{ firstName?: string | null; middleName?: string | null; lastName?: string | null }} p
 */
export function orgUserDisplayNameKey(p) {
  const parts = [p?.firstName, p?.middleName, p?.lastName]
    .map((x) =>
      String(x || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
    )
    .filter(Boolean);
  return parts.join("|");
}

/**
 * @param {unknown} value
 */
export function slugifyOrgNamePart(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const cleaned = raw.replace(/[^a-z0-9]+/g, "").slice(0, 32);
  return cleaned || "user";
}

/**
 * Builds a unique synthetic email for a learning org user (stored base email).
 * Login uses {@link formatOrgUsername} which scopes it with the project code.
 *
 * @param {{ firstName: string; lastName: string; unitIdentifier: string }} p
 */
export function buildOrgLearnEmail(p) {
  const first = slugifyOrgNamePart(p.firstName);
  const last = slugifyOrgNamePart(p.lastName);
  const unit = String(p.unitIdentifier || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const local = unit ? `${first}.${last}.${unit}` : `${first}.${last}`;
  return `${local}@${ORG_LEARN_EMAIL_DOMAIN}`;
}

/**
 * Builds a simulated org login email scoped to one project (always lowercase):
 * local_org-xxxxxx@domain
 * @param {unknown} email
 * @param {unknown} projectCode
 */
export function formatOrgUsername(email, projectCode) {
  const e = String(email || "").trim().toLowerCase();
  const code = String(projectCode || "").trim().toLowerCase();
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

/**
 * Allocate unit id + unique learn email for a new org user.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; firstName: string; lastName: string }} p
 */
export async function allocateOrgUserIdentity(prisma, p) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const unitIdentifier = await generateUniqueOrgUnitIdentifier(prisma, p.projectId);
    const email = buildOrgLearnEmail({
      firstName: p.firstName,
      lastName: p.lastName,
      unitIdentifier,
    });
    const clash = await prisma.projectOrgUser.findFirst({
      where: { projectId: p.projectId, email },
      select: { id: true },
    });
    if (!clash) return { unitIdentifier, email };
  }
  throw new Error("Could not generate a unique organisation login email.");
}

/**
 * Exact full-name clash in a project (case-insensitive). Used to keep accounts distinguishable.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   firstName: string;
 *   middleName?: string | null;
 *   lastName: string;
 *   excludeOrgUserId?: string | null;
 * }} p
 */
export async function findDuplicateOrgDisplayName(prisma, p) {
  const key = orgUserDisplayNameKey(p);
  if (!key) return null;
  const candidates = await prisma.projectOrgUser.findMany({
    where: {
      projectId: p.projectId,
      ...(p.excludeOrgUserId ? { id: { not: p.excludeOrgUserId } } : {}),
    },
    select: { id: true, firstName: true, middleName: true, lastName: true },
    take: 500,
  });
  return candidates.find((row) => orgUserDisplayNameKey(row) === key) || null;
}
