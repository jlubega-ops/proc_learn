import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import {
  STUDENT_IMPORT_MAX_ROWS,
  loadStudentBulkImportContext,
  mapStudentImportSheet,
  rowObjectFromKeys,
  isRowEmpty,
  validateStudentImportDataRow,
} from "@/lib/student-import-validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Attach an Excel file (.xlsx)." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 3 * 1024 * 1024) {
    return NextResponse.json({ error: "File is too large (max 3 MB)." }, { status: 400 });
  }

  let aoa;
  try {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const name = wb.SheetNames[0];
    if (!name) {
      return NextResponse.json({ error: "Workbook has no sheets." }, { status: 400 });
    }
    const sheet = wb.Sheets[name];
    aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  } catch {
    return NextResponse.json({ error: "Could not read the Excel file." }, { status: 400 });
  }

  const { keys, dataRows, headerErrors } = mapStudentImportSheet(
    /** @type {string[][]} */ (aoa),
  );
  if (headerErrors.length > 0) {
    return NextResponse.json({
      ok: false,
      valid: false,
      headerErrors,
      rows: [],
    });
  }

  const ctxBase = await loadStudentBulkImportContext(prisma);
  const ctx = {
    ...ctxBase,
    fileEmails: new Set(),
    fileStudentNumbers: new Set(),
  };

  /** @type {any[]} */
  const rowsOut = [];
  let dataRowCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const excelRow = i + 2;
    const rowArr = /** @type {unknown[]} */ (dataRows[i]);
    const raw = rowObjectFromKeys(keys, rowArr.map((c) => String(c ?? "")));
    if (isRowEmpty(raw)) continue;
    dataRowCount++;
    if (dataRowCount > STUDENT_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many data rows (max ${STUDENT_IMPORT_MAX_ROWS}).` },
        { status: 400 },
      );
    }

    const result = validateStudentImportDataRow(raw, excelRow, ctx);
    rowsOut.push({
      rowNumber: excelRow,
      preview: {
        email: raw.email,
        firstName: raw.firstName,
        lastName: raw.lastName,
        middleName: raw.middleName,
        studentNumber: raw.studentNumber,
        registrationNumber: raw.registrationNumber,
        programmeShortName: raw.programmeShortName,
        academicYearLabel: raw.academicYearLabel,
        yearOfStudy: raw.yearOfStudy,
        campus: raw.campus,
        sex: raw.sex,
      },
      errors: result.errors,
      payload: result.normalized ?? null,
    });
  }

  if (dataRowCount === 0) {
    return NextResponse.json({
      ok: true,
      valid: false,
      rows: [],
      sheetError: "No data rows found below the header.",
    });
  }

  const allValid = rowsOut.every((r) => r.errors.length === 0 && r.payload);
  return NextResponse.json({
    ok: true,
    valid: allValid,
    rows: rowsOut,
  });
}
