import { isStudentMubsEmail, isValidStudentNumberDigits } from "@/lib/mubs-email";
import { parseOptionalMaleFemaleSex } from "@/lib/validation/sex-male-female";
import { parseCampus } from "@/lib/campuses";

/** @type {Record<string, string>} */
const HEADER_TO_KEY = {
  email: "email",
  "e-mail": "email",
  "school email": "email",
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  "middle name": "middleName",
  middlename: "middleName",
  "student number": "studentNumber",
  studentnumber: "studentNumber",
  "student no": "studentNumber",
  "registration number": "registrationNumber",
  registrationnumber: "registrationNumber",
  "reg no": "registrationNumber",
  "reg number": "registrationNumber",
  "programme short name": "programmeShortName",
  "programme short": "programmeShortName",
  "program short": "programmeShortName",
  "short name": "programmeShortName",
  programme: "programmeShortName",
  "academic year": "academicYearLabel",
  academic_year: "academicYearLabel",
  "year of study": "yearOfStudy",
  yearofstudy: "yearOfStudy",
  campus: "campus",
  "campus name": "campus",
  location: "campus",
  sex: "sex",
  gender: "sex",
};

export const STUDENT_IMPORT_REQUIRED_KEYS = [
  "email",
  "firstName",
  "lastName",
  "studentNumber",
  "registrationNumber",
  "programmeShortName",
  "academicYearLabel",
  "yearOfStudy",
  "campus",
];

/**
 * @param {unknown} v
 */
function cellStr(v) {
  return String(v ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
}

/**
 * @param {string} h
 */
export function normalizeImportHeader(h) {
  return cellStr(h).toLowerCase().replace(/\s+/g, " ");
}

/**
 * @param {string[][]} aoa
 * @returns {{ keys: (string | null)[]; dataRows: string[][]; headerErrors: string[] }}
 */
export function mapStudentImportSheet(aoa) {
  const headerErrors = [];
  if (!aoa.length) {
    headerErrors.push("The sheet is empty.");
    return { keys: [], dataRows: [], headerErrors };
  }
  const headerRow = aoa[0].map((c) => normalizeImportHeader(c));
  const keys = headerRow.map((h) => HEADER_TO_KEY[h] || null);
  const unknown = headerRow
    .map((h, i) => (h && !HEADER_TO_KEY[h] ? `Column ${i + 1} (“${cellStr(aoa[0][i])}”) is not a recognized header.` : null))
    .filter(Boolean);
  for (const u of unknown) headerErrors.push(u);

  for (const req of STUDENT_IMPORT_REQUIRED_KEYS) {
    if (!keys.includes(req)) {
      headerErrors.push(`Missing required column: ${req} (check the template headers).`);
    }
  }

  const dataRows = aoa.slice(1);
  return { keys, dataRows, headerErrors };
}

/**
 * @param {string[]} keys
 * @param {unknown[]} row
 */
export function rowObjectFromKeys(keys, row) {
  /** @type {Record<string, string>} */
  const o = {};
  keys.forEach((key, i) => {
    if (!key) return;
    o[key] = cellStr(row[i]);
  });
  return o;
}

/**
 * @param {Record<string, string>} raw
 */
export function isRowEmpty(raw) {
  return !Object.values(raw).some((v) => cellStr(v));
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function loadStudentBulkImportContext(prisma) {
  const programmes = await prisma.programme.findMany({
    where: { isActive: true },
    select: { id: true, shortName: true, name: true },
  });
  /** @type {Map<string, { id: string; shortName: string; name: string }>} */
  const programmeByShortNorm = new Map();
  for (const p of programmes) {
    programmeByShortNorm.set(String(p.shortName).trim().toLowerCase(), p);
  }

  const existing = await prisma.user.findMany({
    where: { studentProfile: { isNot: null } },
    select: { email: true, studentProfile: { select: { studentNumber: true } } },
  });
  const dbEmails = new Set(existing.map((u) => u.email.trim().toLowerCase()));
  const dbStudentNumbers = new Set(
    existing
      .map((u) => u.studentProfile?.studentNumber)
      .filter(Boolean)
      .map((s) => String(s).replace(/\D/g, "")),
  );

  const years = await prisma.academicYear.findMany({
    select: { label: true, isCurrent: true },
    orderBy: { label: "desc" },
  });
  const academicYearLabels = new Set(years.map((y) => y.label));

  return { programmeByShortNorm, dbEmails, dbStudentNumbers, academicYearLabels };
}

/**
 * @param {Record<string, string>} raw
 * @param {number} excelRowNumber 1-based sheet row (for messages)
 * @param {{
 *   programmeByShortNorm: Map<string, { id: string; shortName: string; name: string }>;
 *   dbEmails: Set<string>;
 *   dbStudentNumbers: Set<string>;
 *   fileEmails: Set<string>;
 *   fileStudentNumbers: Set<string>;
 * }} ctx
 * @returns {{ errors: string[]; normalized?: object }}
 */
export function validateStudentImportDataRow(raw, excelRowNumber, ctx) {
  const errors = [];
  const email = String(raw.email ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(raw.firstName ?? "").trim();
  const lastName = String(raw.lastName ?? "").trim();
  const middleName = String(raw.middleName ?? "").trim() || null;
  const studentNumber = String(raw.studentNumber ?? "").replace(/\D/g, "");
  const registrationNumber = String(raw.registrationNumber ?? "").trim();
  const programmeShort = String(raw.programmeShortName ?? "").trim();
  const academicYearLabel = String(raw.academicYearLabel ?? "").trim();
  const yearRaw = Number(String(raw.yearOfStudy ?? "").trim());
  const yearOfStudy = [1, 2, 3].includes(yearRaw) ? yearRaw : NaN;
  const campus = parseCampus(raw.campus);
  const sexRaw = String(raw.sex ?? "").trim();
  const sex = parseOptionalMaleFemaleSex(sexRaw || null);
  if (sex === undefined && sexRaw) {
    errors.push("Sex must be Male, Female, or empty.");
  }

  if (!email) errors.push("Email is required.");
  else if (!isStudentMubsEmail(email)) errors.push("Email must be digits@mubs.ac.ug.");
  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!studentNumber) errors.push("Student number is required.");
  else if (!isValidStudentNumberDigits(studentNumber)) errors.push("Student number must be 1–32 digits.");
  if (!registrationNumber) errors.push("Registration number is required.");
  if (!programmeShort) errors.push("Programme short name is required.");
  if (!academicYearLabel) errors.push("Academic year is required.");
  else if (!ctx.academicYearLabels?.has(academicYearLabel))
    errors.push("Academic year must match one created in Academic setup.");
  if (!Number.isFinite(yearRaw) || ![1, 2, 3].includes(yearOfStudy)) {
    errors.push("Year of study must be 1, 2, or 3.");
  }
  if (!campus) {
    errors.push("Campus is required (Main, Arua, Mbarara, Jinja, or Mbale).");
  }

  let programmeId = "";
  if (programmeShort) {
    const p = ctx.programmeByShortNorm.get(programmeShort.toLowerCase());
    if (!p) {
      errors.push(`No active programme matches short name “${programmeShort}”.`);
    } else {
      programmeId = p.id;
    }
  }

  if (email && ctx.fileEmails.has(email)) {
    errors.push("Duplicate email in this file.");
  }
  if (studentNumber && ctx.fileStudentNumbers.has(studentNumber)) {
    errors.push("Duplicate student number in this file.");
  }
  if (email && ctx.dbEmails.has(email)) {
    errors.push("This email is already registered.");
  }
  if (studentNumber && ctx.dbStudentNumbers.has(studentNumber)) {
    errors.push("This student number is already in use.");
  }

  if (errors.length > 0) {
    return { errors };
  }

  ctx.fileEmails.add(email);
  ctx.fileStudentNumbers.add(studentNumber);

  return {
    errors: [],
    normalized: {
      email,
      firstName,
      lastName,
      middleName,
      studentNumber,
      registrationNumber,
      programmeId,
      academicYearLabel,
      yearOfStudy,
      campus,
      sex: sex ?? null,
      profilePhotoUrl: null,
    },
  };
}

export const STUDENT_IMPORT_MAX_ROWS = 200;

/**
 * Re-validate server-side payloads before commit (no programme short name — uses programmeId).
 * @param {object} normalized
 * @param {number} excelRowNumber
 * @param {Awaited<ReturnType<typeof loadStudentBulkImportContext>>} ctx
 * @param {Set<string>} activeProgrammeIds
 */
export function validateNormalizedStudentBulkRow(normalized, excelRowNumber, ctx, activeProgrammeIds) {
  const errors = [];
  const email = String(normalized.email ?? "")
    .trim()
    .toLowerCase();
  const firstName = String(normalized.firstName ?? "").trim();
  const lastName = String(normalized.lastName ?? "").trim();
  const middleName = normalized.middleName ? String(normalized.middleName).trim() : null;
  const studentNumber = String(normalized.studentNumber ?? "").replace(/\D/g, "");
  const registrationNumber = String(normalized.registrationNumber ?? "").trim();
  const programmeId = String(normalized.programmeId ?? "").trim();
  const academicYearLabel = String(normalized.academicYearLabel ?? "").trim();
  const yearRaw = Number(normalized.yearOfStudy);
  const yearOfStudy = [1, 2, 3].includes(yearRaw) ? yearRaw : NaN;
  const campus = parseCampus(normalized.campus);
  const sex = parseOptionalMaleFemaleSex(normalized.sex ?? null);
  if (sex === undefined && normalized.sex != null && String(normalized.sex).trim()) {
    errors.push("Sex must be Male, Female, or empty.");
  }

  if (!email) errors.push("Email is required.");
  else if (!isStudentMubsEmail(email)) errors.push("Email must be digits@mubs.ac.ug.");
  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!studentNumber) errors.push("Student number is required.");
  else if (!isValidStudentNumberDigits(studentNumber)) errors.push("Student number must be 1–32 digits.");
  if (!registrationNumber) errors.push("Registration number is required.");
  if (!programmeId) errors.push("Programme is missing.");
  else if (!activeProgrammeIds.has(programmeId)) errors.push("Programme is invalid or inactive.");
  if (!academicYearLabel) errors.push("Academic year is required.");
  else if (!ctx.academicYearLabels?.has(academicYearLabel))
    errors.push("Academic year must match one created in Academic setup.");
  if (![1, 2, 3].includes(yearOfStudy)) errors.push("Year of study must be 1, 2, or 3.");
  if (!campus) errors.push("Campus is required (Main, Arua, Mbarara, Jinja, or Mbale).");

  if (email && ctx.fileEmails.has(email)) errors.push("Duplicate email in this import.");
  if (studentNumber && ctx.fileStudentNumbers.has(studentNumber)) {
    errors.push("Duplicate student number in this import.");
  }
  if (email && ctx.dbEmails.has(email)) errors.push("This email is already registered.");
  if (studentNumber && ctx.dbStudentNumbers.has(studentNumber)) {
    errors.push("This student number is already in use.");
  }

  if (errors.length) return { errors };

  ctx.fileEmails.add(email);
  ctx.fileStudentNumbers.add(studentNumber);
  return {
    errors: [],
    normalized: {
      email,
      firstName,
      lastName,
      middleName,
      registrationNumber,
      studentNumber,
      programmeId,
      academicYearLabel,
      yearOfStudy,
      campus,
      sex: sex ?? null,
      profilePhotoUrl: null,
    },
  };
}
