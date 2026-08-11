/**
 * Phase 4 acceptance: LECTURER and ASSIGNMENT removed; EXAMINER + PRACTICE/ASSESSMENT only.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase4-role-purpose-cleanup-acceptance.mjs
 */
import { Role, ProjectPurpose } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { ROLE, ROLE_LABELS, isStaffRole, ROLE_PRECEDENCE } from "../src/lib/roles.js";
import { canViewProjectByRole } from "../src/lib/projects/access.js";
import { validateProjectCreateInput } from "../src/lib/validation/project.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n=== Phase 4 role & purpose cleanup acceptance ===\n");

  assert(!("LECTURER" in Role), "Prisma Role enum has no LECTURER");
  assert(!("ASSIGNMENT" in ProjectPurpose), "Prisma ProjectPurpose has no ASSIGNMENT");
  assert(Role.EXAMINER === "EXAMINER", "EXAMINER role exists");
  assert(ProjectPurpose.PRACTICE === "PRACTICE", "PRACTICE purpose exists");
  assert(ProjectPurpose.ASSESSMENT === "ASSESSMENT", "ASSESSMENT purpose exists");

  assert(!ROLE.LECTURER, "App ROLE constant has no LECTURER");
  assert(ROLE.EXAMINER === "EXAMINER", "App ROLE.EXAMINER present");
  assert(ROLE_LABELS.EXAMINER === "Examiner", "UI label is Examiner");
  assert(!ROLE_LABELS.LECTURER, "No Lecturer UI label");
  assert(isStaffRole(ROLE.EXAMINER), "EXAMINER is staff");
  assert(isStaffRole(ROLE.SYSTEM_ADMIN), "SYSTEM_ADMIN is staff");
  assert(!ROLE_PRECEDENCE.includes("LECTURER"), "ROLE_PRECEDENCE has no LECTURER");

  const lecturerRoles = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM user_role WHERE role = 'LECTURER'",
  );
  const lecturerSettings = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM user_settings WHERE active_role = 'LECTURER'",
  );
  const lecturerProjects = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM project WHERE creator_role = 'LECTURER'",
  );
  const assignmentProjects = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM project WHERE purpose = 'ASSIGNMENT'",
  );
  assert(Number(lecturerRoles?.[0]?.c || 0) === 0, "No LECTURER user_role rows");
  assert(Number(lecturerSettings?.[0]?.c || 0) === 0, "No LECTURER activeRole settings");
  assert(Number(lecturerProjects?.[0]?.c || 0) === 0, "No LECTURER creator projects");
  assert(Number(assignmentProjects?.[0]?.c || 0) === 0, "No ASSIGNMENT purpose projects");

  const examinerCount = await prisma.userRole.count({ where: { role: Role.EXAMINER } });
  assert(examinerCount >= 1, "At least one EXAMINER grant remains", `n=${examinerCount}`);

  const practiceOk = validateProjectCreateInput({
    body: {
      name: "Practice project",
      purpose: "PRACTICE",
      visibility: "PUBLIC",
      isPublished: true,
    },
    activeRole: Role.EXAMINER,
  });
  assert(practiceOk.ok, "Examiner can create PRACTICE");

  const assessmentMissingDuration = validateProjectCreateInput({
    body: {
      name: "Assessment project",
      purpose: "ASSESSMENT",
      visibility: "PUBLIC",
      isPublished: true,
    },
    activeRole: Role.EXAMINER,
  });
  assert(!assessmentMissingDuration.ok, "ASSESSMENT requires duration");
  assert(
    Boolean(assessmentMissingDuration.errors.duration),
    "Duration error present for ASSESSMENT",
  );

  const assessmentOk = validateProjectCreateInput({
    body: {
      name: "Assessment project",
      purpose: "ASSESSMENT",
      visibility: "PUBLIC",
      duration: "90",
      isPublished: true,
    },
    activeRole: Role.EXAMINER,
  });
  assert(assessmentOk.ok, "Examiner can create ASSESSMENT with duration");
  assert(assessmentOk.data.purpose === ProjectPurpose.ASSESSMENT, "Validated purpose is ASSESSMENT");

  const view = canViewProjectByRole({
    userId: "u1",
    activeRole: Role.EXAMINER,
    project: {
      ownerUserId: "u1",
      creatorRole: Role.EXAMINER,
      visibility: "PUBLIC",
      isPublished: true,
    },
  });
  assert(view, "Examiner can view own examiner project");

  const studentSeesExaminer = canViewProjectByRole({
    userId: "s1",
    activeRole: Role.STUDENT,
    project: {
      ownerUserId: "e1",
      creatorRole: Role.EXAMINER,
      visibility: "PUBLIC",
      isPublished: true,
      closeAt: null,
    },
  });
  assert(studentSeesExaminer, "Student can view published examiner public project");

  const dbRoleCol = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM user_role LIKE 'role'");
  const type = String(dbRoleCol?.[0]?.Type || dbRoleCol?.[0]?.type || "");
  assert(!/lecturer/i.test(type), "MySQL user_role enum has no LECTURER", type || "(empty)");
  const purposeCol = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM project LIKE 'purpose'");
  const ptype = String(purposeCol?.[0]?.Type || purposeCol?.[0]?.type || "");
  assert(!/assignment/i.test(ptype), "MySQL project.purpose has no ASSIGNMENT", ptype || "(empty)");
  assert(/assessment/i.test(ptype), "MySQL project.purpose includes ASSESSMENT", ptype || "(empty)");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPassed: ${passed}  Failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
