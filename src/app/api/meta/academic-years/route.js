import { NextResponse } from "next/server";
import { getAcademicYearDropdownChoices } from "@/lib/academic-years";

export const runtime = "nodejs";

export async function GET() {
  const { primary, extended } = getAcademicYearDropdownChoices();
  return NextResponse.json({ primary, extended });
}
