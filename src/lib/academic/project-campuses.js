import { CAMPUS_VALUES, campusLabel, parseCampus } from "@/lib/campuses";

/**
 * Normalise a list of campus values (deduped, enum order). Invalid entries are dropped.
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseCampusList(value) {
  const list = Array.isArray(value) ? value : [];
  const picked = new Set(list.map((v) => parseCampus(v)).filter(Boolean));
  return CAMPUS_VALUES.filter((c) => picked.has(c));
}

/**
 * @param {{ campus: string }[] | null | undefined} rows
 * @returns {string[]}
 */
export function projectCampusValues(rows) {
  return parseCampusList((rows || []).map((r) => r.campus));
}

/**
 * @param {{ campus: string }[] | null | undefined} rows
 * @returns {string}
 */
export function projectCampusesLabel(rows) {
  const values = projectCampusValues(rows);
  if (!values.length || values.length === CAMPUS_VALUES.length) return "All campuses";
  return values.map((c) => campusLabel(c)).join(", ");
}

/**
 * Prisma where: project open to a student's campus (no campus rows = all campuses).
 * @param {string | null | undefined} studentCampus
 * @returns {import("@prisma/client").Prisma.ProjectWhereInput}
 */
export function projectCampusWhere(studentCampus) {
  const campus = parseCampus(studentCampus);
  if (!campus) return { campuses: { none: {} } };
  return { OR: [{ campuses: { none: {} } }, { campuses: { some: { campus } } }] };
}
