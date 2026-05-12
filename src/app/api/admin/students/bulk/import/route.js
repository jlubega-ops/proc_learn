import { NextResponse } from "next/server";
import { AuthTokenType } from "@prisma/client";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";
import { canManageStudents } from "@/lib/api/student-scope";
import { buildActivationUrl } from "@/lib/auth-links";
import { createAuthTokenRecord } from "@/lib/auth-token";
import {
  STUDENT_IMPORT_MAX_ROWS,
  loadStudentBulkImportContext,
  validateNormalizedStudentBulkRow,
} from "@/lib/student-import-validation";
import { insertPendingStudentUser } from "@/lib/student-insert";
import { sendAccountActivationEmail } from "@/lib/invite-mail";
import { formatUserDisplayName } from "@/lib/user-display";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyAllSystemAdmins } from "@/lib/notify-system-admins";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ACTIVATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request) {
  const actor = await getSessionUser();
  const active = sessionActiveRole(actor);
  if (!actor || !canManageStudents(active)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No student rows to import." }, { status: 400 });
  }
  if (rows.length > STUDENT_IMPORT_MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${STUDENT_IMPORT_MAX_ROWS}).` },
      { status: 400 },
    );
  }

  const ctxBase = await loadStudentBulkImportContext(prisma);
  const ctx = {
    ...ctxBase,
    fileEmails: new Set(),
    fileStudentNumbers: new Set(),
  };
  const activeProgrammes = await prisma.programme.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const activeProgrammeIds = new Set(activeProgrammes.map((p) => p.id));

  /** @type {string[][]} */
  const rowErrors = [];
  /** @type {any[]} */
  const validated = [];
  for (let i = 0; i < rows.length; i++) {
    const res = validateNormalizedStudentBulkRow(rows[i], i + 2, ctx, activeProgrammeIds);
    if (res.errors.length > 0) {
      rowErrors.push([`Row ${i + 2}`, ...res.errors]);
    } else if (res.normalized) {
      validated.push(res.normalized);
    }
  }
  if (rowErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Validation failed. Refresh the preview and fix the sheet.",
        rowErrors,
      },
      { status: 400 },
    );
  }

  let createdUsers;
  try {
    createdUsers = await prisma.$transaction(async (tx) => {
      /** @type {import("@prisma/client").User[]} */
      const out = [];
      for (const row of validated) {
        const u = await insertPendingStudentUser(tx, row);
        if (!u) {
          throw new Error("insert_failed");
        }
        out.push(u);
      }
      return out;
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not create all students (duplicate email or student number, or database error).",
      },
      { status: 400 },
    );
  }

  const activationFailures = [];
  for (const created of createdUsers) {
    try {
      const { rawToken } = await createAuthTokenRecord(
        created.id,
        AuthTokenType.ACCOUNT_ACTIVATION,
        ACTIVATION_MS,
      );
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[student-bulk] Activation URL (non-production only):",
          buildActivationUrl(rawToken),
          created.email,
        );
      }
      await sendAccountActivationEmail({
        email: created.email,
        rawToken,
        displayName: formatUserDisplayName(created),
      });
      await writeAuditLog({
        eventType: AuditEvent.STUDENT_CREATED,
        actorUserId: actor.id,
        targetUserId: created.id,
        meta: { email: created.email, summary: formatUserDisplayName(created), bulk: true },
      });
    } catch {
      activationFailures.push(created.email);
    }
  }

  const actorLabel = formatUserDisplayName(actor);
  await notifyAllSystemAdmins({
    type: "ADMIN_STUDENT",
    title: "Bulk student import",
    body: `${actorLabel} imported ${createdUsers.length} student account(s).`,
  });

  return NextResponse.json({
    ok: true,
    created: createdUsers.length,
    activationFailures,
  });
}
