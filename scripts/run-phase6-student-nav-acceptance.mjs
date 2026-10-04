/**
 * Phase 6 acceptance: Student academic navigation foundation.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase6-student-nav-acceptance.mjs
 */
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import {
  sidebarNavForContext,
  sidebarNavForActiveRole,
  flattenNavHrefs,
  flattenNavLabels,
} from "../src/lib/nav-config.js";
import { ROLE } from "../src/lib/roles.js";
import { getDashboardPageMeta } from "../src/lib/dashboard-page-meta.js";
import { resolveStudentDefaultPath } from "../src/lib/projects/student-personal-org.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { getStudentAcademicContext } from "../src/lib/academic/student-enrollment.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { switchActiveRole } from "../src/lib/academic/switch-active-role.js";
import { canManageStudents, canManageStaffUsers } from "../src/lib/api/student-scope.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function purgeUserByEmail(email) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: u.id }, { targetUserId: u.id }] },
  });
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  console.log("\n=== Phase 6 student academic navigation acceptance ===\n");

  const stamp = Date.now();
  const studentEmail = `2086${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2086${String(stamp).slice(-6)}`;
  const examinerEmail = `phase6.examiner.${stamp}@mubs.ac.ug`;
  const adminEmail = `phase6.admin.${stamp}@mubs.ac.ug`;

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);
  await purgeUserByEmail(adminEmail);

  const studentNav = sidebarNavForContext(ROLE.STUDENT, "/");
  const labels = flattenNavLabels(studentNav);
  const hrefs = flattenNavHrefs(studentNav);
  const sectionIds = studentNav.map((s) => s.id);

  assert(sectionIds.includes("student-main"), "Dashboard section present");
  assert(sectionIds.includes("system-administration"), "System Administration section present");
  assert(sectionIds.includes("manage-organisation"), "Manage Organisation section present");
  assert(sectionIds.includes("my-academic-work"), "My Academic Work section present");
  assert(labels.includes("Dashboard"), "Dashboard label");
  assert(!labels.includes("Overview"), "Personal org has no separate Overview");
  assert(labels.includes("Settings"), "Manage Organisation settings link");
  assert(
    studentNav.some((s) => s.label === "System Administration"),
    "System Administration section label",
  );
  assert(
    studentNav.some((s) => s.label === "Manage Organisation"),
    "Manage Organisation section label",
  );
  assert(labels.includes("Departments/Units"), "System Admin departments link");
  assert(labels.includes("Users"), "System Admin users link");
  assert(labels.includes("Roles & Permissions"), "System Admin roles link");
  assert(labels.includes("Activity Logs"), "System Admin activity logs link");
  assert(labels.includes("Organisation Structure"), "Manage Organisation structure link");
  assert(labels.includes("Financial Years"), "Manage Organisation financial years");
  assert(labels.includes("Practice"), "Practice label");
  assert(labels.includes("Assessments"), "Assessments label");
  assert(labels.includes("Results"), "Results in Student My Academic Work nav");
  assert(
    !labels.some((l) => /OrgAcademicSlate|ProjectEnrollment|ProjectAttempt/i.test(l)),
    "No technical model names in Student nav",
  );
  assert(!sectionIds.includes("my-organisation"), "Legacy My Organisation section removed");
  assert(hrefs.includes("/"), "Dashboard href /");
  assert(hrefs.includes("/organisation/org-admin/settings"), "Settings href");
  assert(hrefs.includes("/academic/practice"), "Practice href");
  assert(hrefs.includes("/academic/assessments"), "Assessments href");
  assert(
    !hrefs.some((h) => String(h).startsWith("/admin")),
    "Student nav excludes /admin",
  );
  assert(
    !hrefs.some((h) => String(h) === "/projects" || String(h).startsWith("/projects/")),
    "Student platform nav excludes Examiner /projects catalog",
  );

  const examNav = sidebarNavForActiveRole(ROLE.EXAMINER);
  const examLabels = flattenNavLabels(examNav);
  assert(examLabels.includes("Projects"), "Examiner still has Projects");
  assert(examLabels.includes("Students"), "Examiner still has Students");
  assert(!examLabels.includes("My Academic Work"), "Examiner nav has no My Academic Work");
  assert(!examLabels.includes("Overview") || examLabels.includes("Home"), "Examiner nav remains staff-oriented");

  const adminNav = sidebarNavForActiveRole(ROLE.SYSTEM_ADMIN);
  const adminLabels = flattenNavLabels(adminNav);
  assert(adminLabels.includes("Academic setup"), "System Admin keeps Academic setup");
  assert(adminLabels.includes("Staff"), "System Admin keeps Staff");
  assert(!adminLabels.includes("My Academic Work"), "System Admin nav has no My Academic Work");

  assert(getDashboardPageMeta("/").title === "Dashboard", "Dashboard page meta");
  assert(getDashboardPageMeta("/organisation").subtitle === "My Organisation", "Org meta subtitle");
  assert(getDashboardPageMeta("/academic/practice").title === "Practice", "Practice page meta");
  assert(
    getDashboardPageMeta("/academic/assessments").subtitle === "My Academic Work",
    "Assessments page meta",
  );

  // Permissions unchanged
  assert(!canManageStudents(ROLE.STUDENT), "Student permissions still locked");
  assert(!canManageStaffUsers(ROLE.STUDENT), "Student cannot manage staff");

  await ensureCurrentAcademicContext();

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase6 Test Programme", shortName: "P6TP", isActive: true },
    });
  }

  const student = await insertPendingStudentUser(prisma, {
    email: studentEmail,
    firstName: "Phase6",
    lastName: "Student",
    middleName: null,
    studentNumber,
    registrationNumber: `REG6-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: (await ensureCurrentAcademicContext()).academicYear.label,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(student?.id), "Ephemeral student created");

  if (student?.id) {
    const defaultPath = await resolveStudentDefaultPath(prisma, student.id, Role.STUDENT);
    assert(defaultPath === "/", "Student default path is Dashboard /");

    const ctx = await getStudentAcademicContext(student.id);
    assert(Boolean(ctx.academicYear?.label || ctx.enrollment), "Student has academic year context");
    assert(
      ctx.semester == null || Boolean(ctx.semester?.name || ctx.semester?.id),
      "Semester context readable when present",
    );

    // My Organisation still provisions
    const orgCount = await prisma.project.count({
      where: { ownerUserId: student.id, isPersonalOrg: true },
    });
    assert(orgCount === 1, "My Organisation still exists for student", `n=${orgCount}`);
  }

  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examinerEmail,
    firstName: "Phase6",
    lastName: "Examiner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `Phase6!${stamp}`,
  });
  assert(Boolean(examiner?.id), "Ephemeral Examiner created");

  if (examiner?.id) {
    const sw = await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.STUDENT,
      buildPayload: true,
    });
    assert(sw.ok === true, "Student Mode switch still works");
    assert(sw.payload?.defaultPath === "/", "Student Mode defaultPath is Dashboard");
    assert(sw.payload?.isStudentMode === true, "Student Mode flag set");

    const modeNav = sidebarNavForContext(ROLE.STUDENT, "/");
    const modeLabels = flattenNavLabels(modeNav);
    const modeSections = modeNav.map((s) => s.label).filter(Boolean);
    assert(modeSections.includes("System Administration"), "Student Mode sees System Administration");
    assert(modeSections.includes("Manage Organisation"), "Student Mode sees Manage Organisation");
    assert(modeSections.includes("My Academic Work"), "Student Mode sees My Academic Work");
    assert(!modeSections.includes("My Organisation"), "Student Mode has no My Organisation section");
    assert(!modeLabels.includes("Staff"), "Student Mode does not see Staff");
    assert(!modeLabels.includes("Academic setup"), "Student Mode does not see Academic setup");
  }

  const admin = await insertStaffUserWithPassword(prisma, {
    email: adminEmail,
    firstName: "Phase6",
    lastName: "Admin",
    middleName: null,
    sex: null,
    roles: [Role.SYSTEM_ADMIN],
    activeRole: Role.SYSTEM_ADMIN,
    plainPassword: `Phase6!${stamp}`,
  });
  if (admin?.id) {
    const sw = await switchActiveRole({
      userId: admin.id,
      nextRole: ROLE.STUDENT,
      buildPayload: true,
    });
    assert(sw.ok === true, "Admin Student Mode switch works with new nav");
    assert(sw.payload?.defaultPath === "/", "Admin Student Mode lands on Dashboard");
  }

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);
  await purgeUserByEmail(adminEmail);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT  ${passed}/${results.length} passed`);
  if (failed) {
    console.log("Failed:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
