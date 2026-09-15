import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const programme = await prisma.programme.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const short = programme?.shortName?.trim() || "SHORT";
  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    orderBy: { label: "desc" },
  });
  const fallbackYear = await prisma.academicYear.findFirst({
    orderBy: { label: "desc" },
  });
  const academicYear = currentYear?.label || fallbackYear?.label || "";

  const headers = [
    "Email",
    "First name",
    "Last name",
    "Middle name",
    "Student number",
    "Registration number",
    "Programme short name",
    "Academic year",
    "Year of study",
    "Campus",
    "Sex",
  ];
  const sample = [
    "0000001@mubs.ac.ug",
    "Student",
    "Sample",
    "",
    "0000001",
    "REG/BULK/EX1",
    short,
    academicYear,
    "3",
    "Main",
    "Female",
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Students");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="students-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
