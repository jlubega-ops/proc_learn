/**
 * Phase 5 acceptance: Switch Role / Student Mode (EXAMINER & SYSTEM_ADMIN → Student).
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase5-student-mode-acceptance.mjs
 */
import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
  OrgAcademicSlateStatus,
  Role,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import {
  activateSemester,
  ensureCurrentAcademicContext,
  setCurrentAcademicYear,
} from "../src/lib/academic/academic-context.js";
import {
  ensureDemoStudentModeContext,
  isStudentMode,
  resolveParticipationType,
  resolvePermanentRole,
  returnRoleLabel,
} from "../src/lib/academic/student-mode.js";
import { switchActiveRole } from "../src/lib/academic/switch-active-role.js";
import { getStudentAcademicContext } from "../src/lib/academic/student-enrollment.js";
import { canActivateRole, ROLE, switchableRoles } from "../src/lib/roles.js";
import {
  canManageProgrammes,
  canManageStaffUsers,
  canManageStudents,
} from "../src/lib/api/student-scope.js";
import { actsAsExaminerRole, canManageExaminerProject } from "../src/lib/projects/access.js";
import { sidebarNavForContext, flattenNavHrefs, flattenNavLabels } from "../src/lib/nav-config.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = [];

function assert(ok, name, detail = "") {
  results.push({ ok: Boolean(ok), name, detail: detail || undefined });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * @param {string} email
 */
async function purgeUserByEmail(email) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: u.id }, { targetUserId: u.id }] },
  });
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  console.log("\n=== Phase 5 Student Mode / switch-role acceptance ===\n");

  const stamp = Date.now();
  const labelA = "2088/2089";
  const labelB = "2089/2090";
  const examinerEmail = `phase5.examiner.${stamp}@mubs.ac.ug`;
  const adminEmail = `phase5.admin.${stamp}@mubs.ac.ug`;
  const studentEmail = `2088${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2088${String(stamp).slice(-6)}`;

  await purgeUserByEmail(examinerEmail);
  await purgeUserByEmail(adminEmail);
  await purgeUserByEmail(studentEmail);

  // --- Unit: participation / mode helpers ---
  assert(
    resolveParticipationType({
      grantedRoles: [ROLE.EXAMINER],
      activeRole: ROLE.STUDENT,
    }) === AcademicParticipationType.EXAMINER_DEMO,
    "Examiner Student Mode → EXAMINER_DEMO",
  );
  assert(
    resolveParticipationType({
      grantedRoles: [ROLE.SYSTEM_ADMIN],
      activeRole: ROLE.STUDENT,
    }) === AcademicParticipationType.SYSTEM_ADMIN_DEMO,
    "System Admin Student Mode → SYSTEM_ADMIN_DEMO",
  );
  assert(
    resolveParticipationType({
      grantedRoles: [ROLE.STUDENT],
      activeRole: ROLE.STUDENT,
    }) === AcademicParticipationType.STUDENT,
    "Real student → STUDENT participation",
  );
  assert(
    resolveParticipationType({
      grantedRoles: [ROLE.EXAMINER],
      activeRole: ROLE.EXAMINER,
    }) === null,
    "Participation null when not in Student effective role",
  );
  assert(
    isStudentMode({ grantedRoles: [ROLE.EXAMINER], activeRole: ROLE.STUDENT }),
    "isStudentMode true for Examiner→Student",
  );
  assert(
    isStudentMode({ grantedRoles: [ROLE.SYSTEM_ADMIN], activeRole: ROLE.STUDENT }),
    "isStudentMode true for Admin→Student",
  );
  assert(
    !isStudentMode({ grantedRoles: [ROLE.STUDENT], activeRole: ROLE.STUDENT }),
    "isStudentMode false for real student",
  );
  assert(
    returnRoleLabel([ROLE.EXAMINER]) === "Return to Examiner",
    "Return label Examiner",
  );
  assert(
    returnRoleLabel([ROLE.SYSTEM_ADMIN]) === "Return to Admin",
    "Return label Admin",
  );
  assert(AuditEvent.ACTIVE_ROLE_SWITCHED === "ACTIVE_ROLE_SWITCHED", "ACTIVE_ROLE_SWITCHED event key");

  // --- Permissions when effective role is STUDENT (no privilege leak) ---
  assert(!canManageStudents(ROLE.STUDENT), "Student Mode cannot manage students");
  assert(!canManageStaffUsers(ROLE.STUDENT), "Student Mode cannot manage staff");
  assert(!canManageProgrammes(ROLE.STUDENT), "Student Mode cannot manage programmes");
  assert(!actsAsExaminerRole(ROLE.STUDENT), "Student Mode does not act as examiner");
  assert(
    !canManageExaminerProject({
      activeRole: ROLE.STUDENT,
      userId: "e1",
      project: { creatorRole: Role.EXAMINER, ownerUserId: "e1" },
    }),
    "Examiner project manage blocked in Student Mode",
  );
  assert(canManageStudents(ROLE.EXAMINER), "Examiner permanent active can manage students");
  assert(canManageStaffUsers(ROLE.SYSTEM_ADMIN), "Admin permanent active can manage staff");

  // --- Nav exclusivity ---
  const studentNav = sidebarNavForContext(ROLE.STUDENT, "/organisation");
  const studentHrefs = flattenNavHrefs(studentNav);
  const studentLabels = flattenNavLabels(studentNav);
  assert(
    studentHrefs.every(
      (h) =>
        h === "/" ||
        String(h).startsWith("/organisation") ||
        String(h).startsWith("/academic"),
    ),
    "Student Mode nav is Student-only destinations",
  );
  assert(
    !studentHrefs.some((h) => String(h).startsWith("/admin")),
    "Student Mode nav has no /admin routes",
  );
  assert(studentLabels.includes("Dashboard"), "Student nav includes Dashboard");
  assert(studentLabels.includes("Settings"), "Student nav includes organisation Settings");
  assert(studentLabels.includes("Practice"), "Student nav includes Practice");
  assert(studentLabels.includes("Assessments"), "Student nav includes Assessments");
  const examNav = sidebarNavForContext(ROLE.EXAMINER, "/");
  const examHrefs = flattenNavHrefs(examNav);
  assert(
    examHrefs.some((h) => String(h).includes("student") || String(h).includes("project")),
    "Examiner nav includes staff destinations",
  );

  // --- Students cannot switch upward ---
  assert(
    !canActivateRole([ROLE.STUDENT], ROLE.EXAMINER),
    "Student cannot activate EXAMINER",
  );
  assert(
    !canActivateRole([ROLE.STUDENT], ROLE.SYSTEM_ADMIN),
    "Student cannot activate SYSTEM_ADMIN",
  );
  assert(
    switchableRoles([ROLE.STUDENT]).length === 1 &&
      switchableRoles([ROLE.STUDENT])[0] === ROLE.STUDENT,
    "Student switchable roles is only STUDENT",
  );
  assert(
    canActivateRole([ROLE.EXAMINER], ROLE.STUDENT),
    "Examiner can activate STUDENT (Student Mode)",
  );
  assert(
    canActivateRole([ROLE.SYSTEM_ADMIN], ROLE.STUDENT),
    "System Admin can activate STUDENT (Student Mode)",
  );

  // Academic years for demo roll-forward
  await ensureCurrentAcademicContext();
  let yearA = await prisma.academicYear.findUnique({ where: { label: labelA } });
  if (!yearA) {
    yearA = await prisma.academicYear.create({
      data: {
        label: labelA,
        startDate: new Date("2088-08-01"),
        endDate: new Date("2089-07-31"),
        isCurrent: false,
      },
    });
  }
  let yearB = await prisma.academicYear.findUnique({ where: { label: labelB } });
  if (!yearB) {
    yearB = await prisma.academicYear.create({
      data: {
        label: labelB,
        startDate: new Date("2089-08-01"),
        endDate: new Date("2090-07-31"),
        isCurrent: false,
      },
    });
  }
  await setCurrentAcademicYear(prisma, yearA.id);
  let semA = await prisma.semester.findFirst({
    where: { academicYearId: yearA.id, name: "Semester 1" },
  });
  if (!semA) {
    semA = await prisma.semester.create({
      data: {
        academicYearId: yearA.id,
        name: "Semester 1",
        startDate: new Date("2088-08-01"),
        endDate: new Date("2089-01-15"),
        isActive: false,
      },
    });
  }
  await activateSemester(prisma, semA.id);

  // Ephemeral staff
  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examinerEmail,
    firstName: "Phase5",
    lastName: "Examiner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `Phase5!${stamp}`,
  });
  assert(Boolean(examiner?.id), "Ephemeral Examiner created");

  const admin = await insertStaffUserWithPassword(prisma, {
    email: adminEmail,
    firstName: "Phase5",
    lastName: "Admin",
    middleName: null,
    sex: null,
    roles: [Role.SYSTEM_ADMIN],
    activeRole: Role.SYSTEM_ADMIN,
    plainPassword: `Phase5!${stamp}`,
  });
  assert(Boolean(admin?.id), "Ephemeral System Admin created");

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase5 Test Programme", shortName: "P5TP", isActive: true },
    });
  }
  const realStudent = await insertPendingStudentUser(prisma, {
    email: studentEmail,
    firstName: "Phase5",
    lastName: "Student",
    middleName: null,
    studentNumber,
    registrationNumber: `REG5-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: labelA,
    yearOfStudy: 1,
    sex: null,
  });
  assert(Boolean(realStudent?.id), "Ephemeral real student created");

  if (examiner?.id) {
    // 1) Examiner → Student Mode
    const sw = await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.STUDENT,
      buildPayload: true,
    });
    assert(sw.ok === true, "Examiner → Student switch succeeds");
    assert(sw.permanentRole === ROLE.EXAMINER, "Permanent role remains EXAMINER");
    assert(sw.effectiveRole === ROLE.STUDENT, "Effective role becomes STUDENT");
    assert(
      sw.participationType === AcademicParticipationType.EXAMINER_DEMO,
      "Participation EXAMINER_DEMO",
    );
    assert(Boolean(sw.demoContext?.academicYear?.id), "Current AY resolved");
    assert(sw.demoContext?.academicYear?.id === yearA.id, "Demo uses current AY A");
    assert(Boolean(sw.demoContext?.semester?.id), "Current semester resolved");
    assert(Boolean(sw.demoContext?.enrollment?.id), "Demo enrollment ensured");
    assert(
      sw.demoContext?.enrollment?.participationType ===
        AcademicParticipationType.EXAMINER_DEMO,
      "Enrollment participation EXAMINER_DEMO",
    );
    assert(Boolean(sw.demoContext?.orgAcademicSlate?.id), "Demo slate ensured");
    assert(Boolean(sw.demoContext?.projectId), "My Organisation present");

    const grants = await prisma.userRole.findMany({ where: { userId: examiner.id } });
    assert(
      grants.every((r) => r.role === Role.EXAMINER) && grants.length === 1,
      "No second Student grant created for Examiner",
    );
    assert(
      !(await prisma.studentProfile.findUnique({ where: { userId: examiner.id } })),
      "No StudentProfile for Examiner demo",
    );

    const settings = await prisma.userSettings.findUnique({ where: { userId: examiner.id } });
    assert(settings?.activeRole === Role.STUDENT, "DB activeRole is STUDENT");

    const ctx = await getStudentAcademicContext(examiner.id);
    assert(ctx.isStudentMode === true, "Context reports Student Mode");
    assert(ctx.joinPrompt === null, "No join prompt in Student Mode");
    assert(ctx.enrolledInCurrentYear === true, "Enrolled in current year automatically");
    assert(
      ctx.participationType === AcademicParticipationType.EXAMINER_DEMO,
      "Context participation EXAMINER_DEMO",
    );

    const orgId1 = sw.demoContext.projectId;
    const enrollA = sw.demoContext.enrollment.id;
    const slateA = sw.demoContext.orgAcademicSlate.id;

    // 14–15) New AY → new demo enrollment + slate; history preserved
    await setCurrentAcademicYear(prisma, yearB.id);
    let semB = await prisma.semester.findFirst({
      where: { academicYearId: yearB.id, name: "Semester 1" },
    });
    if (!semB) {
      semB = await prisma.semester.create({
        data: {
          academicYearId: yearB.id,
          name: "Semester 1",
          startDate: new Date("2089-08-01"),
          endDate: new Date("2090-01-15"),
          isActive: false,
        },
      });
    }
    await activateSemester(prisma, semB.id);

    const demoB = await ensureDemoStudentModeContext(
      examiner.id,
      AcademicParticipationType.EXAMINER_DEMO,
    );
    assert(demoB.academicYear.id === yearB.id, "New AY used for next Student Mode session");
    assert(demoB.enrollment.academicYearId === yearB.id, "New demo enrollment on year B");
    assert(demoB.enrollment.id !== enrollA, "New enrollment id for new year");
    assert(demoB.orgAcademicSlate?.id !== slateA, "New slate for new year");
    assert(demoB.projectId === orgId1, "Same My Organisation across years");

    const hist = await prisma.studentAcademicEnrollment.findUnique({ where: { id: enrollA } });
    assert(
      hist?.status === AcademicEnrollmentStatus.HISTORICAL,
      "Previous demo enrollment preserved as HISTORICAL",
    );
    const histSlate = await prisma.orgAcademicSlate.findUnique({ where: { id: slateA } });
    assert(
      histSlate?.status === OrgAcademicSlateStatus.HISTORICAL,
      "Previous demo slate preserved as HISTORICAL",
    );

    // 16) Return to Examiner
    const back = await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.EXAMINER,
      buildPayload: true,
    });
    assert(back.ok === true, "Return to Examiner succeeds");
    assert(back.effectiveRole === ROLE.EXAMINER, "Effective role restored to EXAMINER");
    const after = await prisma.userSettings.findUnique({ where: { userId: examiner.id } });
    assert(after?.activeRole === Role.EXAMINER, "DB activeRole restored to EXAMINER");
    assert(
      resolvePermanentRole([ROLE.EXAMINER]) === ROLE.EXAMINER,
      "Permanent role still EXAMINER after return",
    );
    assert(
      (await prisma.studentAcademicEnrollment.count({ where: { userId: examiner.id } })) >= 2,
      "Demo history rows remain after return",
    );

    // 17) Audit
    const audits = await prisma.auditLog.findMany({
      where: {
        actorUserId: examiner.id,
        eventType: AuditEvent.ACTIVE_ROLE_SWITCHED,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    assert(audits.length >= 2, "ACTIVE_ROLE_SWITCHED audits written", `n=${audits.length}`);
    const meta = /** @type {any} */ (audits.find((a) => {
      const m = /** @type {any} */ (a.meta);
      return m?.action === "EXAMINER→STUDENT";
    })?.meta);
    assert(Boolean(meta), "Audit has EXAMINER→STUDENT action");
    assert(meta?.permanentRole === ROLE.EXAMINER, "Audit permanentRole");
    assert(meta?.effectiveRole === ROLE.STUDENT, "Audit effectiveRole");
    assert(
      meta?.participationType === AcademicParticipationType.EXAMINER_DEMO,
      "Audit participationType",
    );
    assert(Boolean(meta?.academicYearId), "Audit academicYearId");
    assert(Boolean(meta?.enrollmentId), "Audit enrollmentId");
    assert(Boolean(meta?.orgAcademicSlateId), "Audit slate id");
  }

  if (admin?.id) {
    // Restore current year for admin path clarity
    await setCurrentAcademicYear(prisma, yearB.id);
    let semB2 = await prisma.semester.findFirst({
      where: { academicYearId: yearB.id, isActive: true },
    });
    if (!semB2) {
      semB2 = await prisma.semester.findFirst({ where: { academicYearId: yearB.id } });
      if (semB2) await activateSemester(prisma, semB2.id);
    }

    // 2) System Admin → Student Mode
    const swA = await switchActiveRole({
      userId: admin.id,
      nextRole: ROLE.STUDENT,
      buildPayload: true,
    });
    assert(swA.ok === true, "System Admin → Student switch succeeds");
    assert(swA.permanentRole === ROLE.SYSTEM_ADMIN, "Permanent role remains SYSTEM_ADMIN");
    assert(swA.effectiveRole === ROLE.STUDENT, "Admin effective role STUDENT");
    assert(
      swA.participationType === AcademicParticipationType.SYSTEM_ADMIN_DEMO,
      "Participation SYSTEM_ADMIN_DEMO",
    );
    assert(
      swA.demoContext?.enrollment?.participationType ===
        AcademicParticipationType.SYSTEM_ADMIN_DEMO,
      "Admin demo enrollment type",
    );
    assert(
      !(await prisma.studentProfile.findUnique({ where: { userId: admin.id } })),
      "No StudentProfile for Admin demo",
    );

    const ctxA = await getStudentAcademicContext(admin.id);
    assert(ctxA.joinPrompt === null, "Admin Student Mode has no join prompt");
    assert(ctxA.isStudentMode === true, "Admin context is Student Mode");

    const backA = await switchActiveRole({
      userId: admin.id,
      nextRole: ROLE.SYSTEM_ADMIN,
      buildPayload: false,
    });
    assert(backA.ok === true, "Return to Admin succeeds");
    assert(backA.effectiveRole === ROLE.SYSTEM_ADMIN, "Effective role restored to SYSTEM_ADMIN");
  }

  if (realStudent?.id) {
    // 3) Student cannot switch upward (service level)
    const denied = await switchActiveRole({
      userId: realStudent.id,
      nextRole: ROLE.EXAMINER,
      buildPayload: false,
    });
    assert(denied.ok === false && denied.status === 403, "Student upward switch rejected");
    const st = await prisma.userSettings.findUnique({ where: { userId: realStudent.id } });
    assert(st?.activeRole === Role.STUDENT, "Student activeRole unchanged after rejected switch");
  }

  // Session payload fields for Student Mode
  if (examiner?.id) {
    await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.STUDENT,
      buildPayload: true,
    }).then((r) => {
      assert(r.ok === true && r.payload?.isStudentMode === true, "Payload isStudentMode");
      assert(r.payload?.effectiveRole === ROLE.STUDENT, "Payload effectiveRole STUDENT");
      assert(r.payload?.permanentRole === ROLE.EXAMINER, "Payload permanentRole EXAMINER");
      assert(
        r.payload?.returnRoleLabel === "Return to Examiner",
        "Payload returnRoleLabel",
      );
      assert(r.payload?.returnRole === ROLE.EXAMINER, "Payload returnRole");
    });
  }

  // Cleanup ephemeral users (preserve academic years for other suites)
  await purgeUserByEmail(examinerEmail);
  await purgeUserByEmail(adminEmail);
  await purgeUserByEmail(studentEmail);

  // Restore a sensible current context
  const realYear = await prisma.academicYear.findFirst({
    where: {
      NOT: { label: { in: [labelA, labelB] } },
      isCurrent: true,
    },
  });
  if (!realYear) {
    const fallback = await prisma.academicYear.findFirst({
      where: { NOT: { label: { in: [labelA, labelB] } } },
      orderBy: { label: "desc" },
    });
    if (fallback) await setCurrentAcademicYear(prisma, fallback.id);
    else await ensureCurrentAcademicContext();
  }

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
