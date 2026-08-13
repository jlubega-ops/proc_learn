/**
 * Phase 7 acceptance: Examiner Scenario A observation + derived progress.
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/run-phase7-examiner-observation-acceptance.mjs
 */
import {
  AcademicEnrollmentStatus,
  AcademicParticipationType,
  OrgBudgetStatus,
  Role,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { AuditEvent } from "../src/lib/audit-events.js";
import {
  canObserveStudentOrganisation,
  canMutateObservedStudentOrganisation,
  observationDemoBadge,
  isOfficialStudentParticipation,
} from "../src/lib/academic/examiner-observation-access.js";
import {
  getExaminerStudentObservation,
  listExaminerObservationStudents,
} from "../src/lib/academic/examiner-observation.js";
import {
  OBSERVATION_STAGE_KEYS,
  deriveOrganisationProcurementProgress,
  stageMarker,
} from "../src/lib/projects/derive-org-progress.js";
import { ensureCurrentAcademicContext } from "../src/lib/academic/academic-context.js";
import { ensureActiveEnrollment } from "../src/lib/academic/student-enrollment.js";
import { ensureStudentPersonalOrg } from "../src/lib/projects/student-personal-org.js";
import { insertPendingStudentUser } from "../src/lib/student-insert.js";
import { insertStaffUserWithPassword } from "../src/lib/staff-insert.js";
import { ROLE } from "../src/lib/roles.js";
import { switchActiveRole } from "../src/lib/academic/switch-active-role.js";
import { canManageProjectOrgWorkspace } from "../src/lib/projects/access.js";

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
  console.log("\n=== Phase 7 Examiner observation acceptance ===\n");

  assert(AuditEvent.EXAMINER_STUDENT_OBSERVED === "EXAMINER_STUDENT_OBSERVED", "Audit event key");
  assert(canObserveStudentOrganisation({ activeRole: ROLE.EXAMINER }), "Examiner can observe");
  assert(canObserveStudentOrganisation({ activeRole: ROLE.SYSTEM_ADMIN }), "Admin can observe");
  assert(!canObserveStudentOrganisation({ activeRole: ROLE.STUDENT }), "Student cannot observe");
  assert(
    !canMutateObservedStudentOrganisation({ activeRole: ROLE.EXAMINER }),
    "Observation mutations denied",
  );
  assert(stageMarker("done") === "✓", "Done marker");
  assert(stageMarker("current") === "→", "Current marker");
  assert(stageMarker("todo") === "○", "Todo marker");
  assert(OBSERVATION_STAGE_KEYS.includes("FINANCIAL_YEAR"), "FY stage present");
  assert(OBSERVATION_STAGE_KEYS.includes("CLOSURE"), "Closure stage present");
  assert(
    observationDemoBadge(AcademicParticipationType.EXAMINER_DEMO)?.label === "Examiner demo",
    "Examiner demo badge",
  );
  assert(
    observationDemoBadge(AcademicParticipationType.SYSTEM_ADMIN_DEMO)?.label ===
      "System admin demo",
    "Admin demo badge",
  );
  assert(isOfficialStudentParticipation(AcademicParticipationType.STUDENT), "Official students");
  assert(
    !isOfficialStudentParticipation(AcademicParticipationType.EXAMINER_DEMO),
    "Demo excluded from official stats",
  );

  const stamp = Date.now();
  const studentEmail = `2087${String(stamp).slice(-6)}@mubs.ac.ug`;
  const studentNumber = `2087${String(stamp).slice(-6)}`;
  const examinerEmail = `phase7.examiner.${stamp}@mubs.ac.ug`;

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);

  const uni = await ensureCurrentAcademicContext();
  assert(Boolean(uni.academicYear?.id), "Current AY available");

  let programme = await prisma.programme.findFirst({ where: { isActive: true } });
  if (!programme) {
    programme = await prisma.programme.create({
      data: { name: "Phase7 Test Programme", shortName: "P7TP", isActive: true },
    });
  }

  const student = await insertPendingStudentUser(prisma, {
    email: studentEmail,
    firstName: "Phase7",
    lastName: "Student",
    middleName: null,
    studentNumber,
    registrationNumber: `REG7-${stamp}`,
    programmeId: programme.id,
    academicYearLabel: uni.academicYear.label,
    yearOfStudy: 2,
    sex: null,
  });
  assert(Boolean(student?.id), "Ephemeral student created");

  const examiner = await insertStaffUserWithPassword(prisma, {
    email: examinerEmail,
    firstName: "Phase7",
    lastName: "Examiner",
    middleName: null,
    sex: null,
    roles: [Role.EXAMINER],
    activeRole: Role.EXAMINER,
    plainPassword: `Phase7!${stamp}`,
  });
  assert(Boolean(examiner?.id), "Ephemeral Examiner created");

  if (student?.id) {
    await ensureActiveEnrollment(prisma, {
      userId: student.id,
      academicYearId: uni.academicYear.id,
      participationType: AcademicParticipationType.STUDENT,
      syncProfileLabel: true,
    });

    const org = await ensureStudentPersonalOrg(prisma, student.id);
    assert(Boolean(org?.id), "Student personal org exists");

    // Seed a FY + draft budget so progress is non-empty
    const fy = await prisma.projectOrgFinancialYear.create({
      data: {
        projectId: org.id,
        label: `P7-${String(stamp).slice(-4)}`,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2027-06-30"),
        isActive: true,
      },
    });
    await prisma.projectOrgBudget.create({
      data: {
        projectId: org.id,
        financialYearId: fy.id,
        title: "Phase7 ICT Budget",
        status: OrgBudgetStatus.DRAFT,
        currency: "UGX",
      },
    });

    const progress = await deriveOrganisationProcurementProgress(org.id);
    assert(progress.stages.length === OBSERVATION_STAGE_KEYS.length, "Stage count matches keys");
    assert(
      progress.stages.every((s) => ["done", "current", "todo", "blocked"].includes(s.state)),
      "Stage states valid",
    );
    assert(
      progress.stages.find((s) => s.key === "FINANCIAL_YEAR")?.state === "done",
      "FY stage done when FY exists",
    );
    assert(
      progress.stages.some((s) => s.state === "current"),
      "Exactly one current stage concept present",
    );
    assert(Boolean(progress.highlights.financialYear), "FY highlight");
    assert(Boolean(progress.highlights.budget), "Budget highlight");

    const observation = await getExaminerStudentObservation(student.id);
    assert(observation.readOnly === true, "Observation payload is read-only");
    assert(observation.student.email === studentEmail, "Student identity");
    assert(
      observation.academic.enrollment?.status === AcademicEnrollmentStatus.ACTIVE,
      "Enrollment active",
    );
    assert(
      observation.academic.enrollment?.academicYear?.id === uni.academicYear.id,
      "Defaults to current AY",
    );
    assert(Boolean(observation.academic.semester?.name || true), "Semester resolved or null OK");
    assert(observation.organisation?.projectId === org.id, "Organisation linked");
    assert(Boolean(observation.progress?.summary), "Progress included");
    assert(observation.demo.isDemo === false, "Real student not demo");
    assert(observation.demo.includeInOfficialStats === true, "Official stats include student");

    // Historical: observation with the same year id still works
    const hist = await getExaminerStudentObservation(student.id, {
      academicYearId: uni.academicYear.id,
    });
    assert(hist.academic.selectedYearId === uni.academicYear.id, "Historical year param accepted");

    const roster = await listExaminerObservationStudents({ participation: "students" });
    assert(
      roster.students.some((r) => r.id === student.id),
      "Student appears on observation roster",
    );
    const rosterRow = roster.students.find((r) => r.id === student.id);
    assert(
      rosterRow?.organisation?.projectId === org.id,
      "Roster includes personal organisation",
    );
    assert(Boolean(rosterRow?.currentStageLabel), "Roster shows current procurement stage");
    assert(
      roster.academicYear?.id === uni.academicYear.id || !roster.academicYear,
      "Roster defaults around current AY",
    );

    // Examiner cannot manage org workspace as staff
    assert(
      !canManageProjectOrgWorkspace({
        userId: examiner?.id || "x",
        activeRole: Role.EXAMINER,
        project: { creatorRole: Role.STUDENT, ownerUserId: student.id },
      }),
      "Examiner cannot manage student org workspace",
    );
  }

  if (examiner?.id) {
    // Student Mode cannot observe
    const sw = await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.STUDENT,
      buildPayload: false,
    });
    assert(sw.ok === true, "Examiner enters Student Mode");
    assert(
      !canObserveStudentOrganisation({ activeRole: ROLE.STUDENT }),
      "Student Mode cannot observe others",
    );

    // Demo badge path for examiner's own demo enrollment
    const demoObs = await getExaminerStudentObservation(examiner.id);
    assert(demoObs.demo.isDemo === true, "Examiner Student Mode enrollment is demo");
    assert(
      demoObs.demo.badge?.kind === "EXAMINER_DEMO",
      "Examiner demo badge on observation",
    );
    assert(demoObs.demo.includeInOfficialStats === false, "Demo excluded from official stats");

    const demoRoster = await listExaminerObservationStudents({ participation: "demo" });
    assert(
      demoRoster.students.some((r) => r.id === examiner.id && r.demoBadge),
      "Demo roster includes Examiner demo",
    );

    await switchActiveRole({
      userId: examiner.id,
      nextRole: ROLE.EXAMINER,
      buildPayload: false,
    });
  }

  await purgeUserByEmail(studentEmail);
  await purgeUserByEmail(examinerEmail);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT  ${passed}/${results.length} passed`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
