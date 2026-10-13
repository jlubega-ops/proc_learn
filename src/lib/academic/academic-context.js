import { prisma } from "@/lib/prisma";
import { runInTx } from "@/lib/db-tx";
import { getAcademicYearDropdownChoices } from "@/lib/academic-years";
import { validateStartEndDateRange } from "@/lib/validation/date-range";
import { parseDateInputValue, toDateInputValue } from "@/lib/financial-year-dates";

/**
 * @param {any} row
 */
export function serializeAcademicYear(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    description: row.description || null,
    startDate: toDateInputValue(row.startDate),
    endDate: toDateInputValue(row.endDate),
    isCurrent: Boolean(row.isCurrent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * @param {any} row
 */
export function serializeCourse(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || null,
    programmeId: row.programmeId || null,
    programme: row.programme
      ? {
          id: row.programme.id,
          name: row.programme.name,
          shortName: row.programme.shortName,
        }
      : null,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Academic years configured by system admin (newest label first).
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function listConfiguredAcademicYears(db = prisma) {
  const rows = await db.academicYear.findMany({
    orderBy: { label: "desc" },
  });
  return rows.map(serializeAcademicYear);
}

/**
 * True when the label exists in AcademicYear (admin-created).
 * @param {unknown} label
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function isRegisteredAcademicYearLabel(label, db = prisma) {
  const t = typeof label === "string" ? label.trim() : "";
  if (!t) return false;
  const row = await db.academicYear.findUnique({
    where: { label: t },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Authoritative current university academic context (Academic Year only).
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function getCurrentAcademicContext(db = prisma) {
  const academicYear = await db.academicYear.findFirst({
    where: { isCurrent: true },
  });
  return {
    academicYear: serializeAcademicYear(academicYear),
  };
}

/**
 * Ensure at least one current academic year (dev seed / bootstrap).
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function ensureCurrentAcademicContext(db = prisma) {
  const existing = await getCurrentAcademicContext(db);
  if (existing.academicYear) return existing;

  const { primary } = getAcademicYearDropdownChoices();
  const label = primary[0] || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  const [startY] = label.split("/").map((x) => Number(x));
  const startDate = new Date(Date.UTC(startY, 7, 1));
  const endDate = new Date(Date.UTC(startY + 1, 6, 31));

  let year = await db.academicYear.findUnique({ where: { label } });
  if (!year) {
    year = await db.academicYear.create({
      data: {
        label,
        startDate,
        endDate,
        isCurrent: true,
        description: "Seeded current academic year",
      },
    });
  } else if (!year.isCurrent) {
    const yearId = year.id;
    year = await runInTx(db, async (tx) => {
      await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.update({
        where: { id: yearId },
        data: { isCurrent: true },
      });
    });
  }

  return {
    academicYear: serializeAcademicYear(year),
  };
}

/**
 * @param {unknown} label
 */
export function normalizeAcademicYearLabel(label) {
  const t = typeof label === "string" ? label.trim() : "";
  if (!/^\d{4}\/\d{4}$/.test(t)) return "";
  const [a, b] = t.split("/").map((x) => Number(x));
  if (b !== a + 1) return "";
  return t;
}

/**
 * @param {{
 *   label: string;
 *   startDate: string;
 *   endDate: string;
 *   description?: string | null;
 *   isCurrent?: boolean;
 * }} input
 */
export function validateAcademicYearInput(input) {
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const label = normalizeAcademicYearLabel(input.label);
  if (!label) fieldErrors.label = "Enter a label like 2025/2026.";
  const range = validateStartEndDateRange(input.startDate, input.endDate, {
    requireBoth: true,
  });
  if (!range.ok) Object.assign(fieldErrors, range.fieldErrors || {});
  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    label,
    startDate: parseDateInputValue(input.startDate),
    endDate: parseDateInputValue(input.endDate),
    description:
      typeof input.description === "string" ? input.description.trim().slice(0, 512) || null : null,
  };
}

/**
 * Set this year current and clear others (transaction).
 * @param {import("@prisma/client").PrismaClient} db
 * @param {string} academicYearId
 */
export async function setCurrentAcademicYear(db, academicYearId) {
  return db.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ data: { isCurrent: false } });
    return tx.academicYear.update({
      where: { id: academicYearId },
      data: { isCurrent: true },
    });
  });
}
