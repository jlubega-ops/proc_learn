/**
 * Safe-gap reconciliation acceptance (timeline helpers, money, case identity,
 * committee context auth). Does not expand Micro/Quotation/Tender step catalogues.
 *
 * Usage (after requisition seed, optional for DB checks):
 *   node --import ./scripts/register-path-alias.mjs scripts/seed-requisition-acceptance.mjs
 *   node --import ./scripts/register-path-alias.mjs scripts/run-canonical-reconciliation-acceptance.mjs
 */
import {
  PrismaClient,
  OrgCommitteeType,
  OrgCommitteeMemberRole,
} from "@prisma/client";
import { formatMoneyUGX } from "../src/lib/money.js";
import {
  humanizeWorkflowDecision,
  serializeTimelineAction,
  timelineActionText,
} from "../src/lib/projects/procurement-timeline.js";
import {
  listMyCommittees,
  requireCommitteeMembership,
  setActiveCommittee,
} from "../src/lib/projects/committee-context.js";
import { serializeProcurement } from "../src/lib/projects/procurements.js";
import { WORKFLOW_TRIGGERS, ENGINE_PROCESS_BINDINGS } from "../src/lib/projects/process-catalogue.js";

const prisma = new PrismaClient();
const STUDENT_EMAIL = "256700000001@mubs.ac.ug";
const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, name, detail = "") {
  if (cond) pass(name, detail);
  else fail(name, detail || "assertion failed");
  return Boolean(cond);
}

async function main() {
  console.log("\nCanonical reconciliation (safe gaps)\n");

  assert(
    formatMoneyUGX(3500000) === "UGX 3,500,000",
    "Money formatting UGX with commas",
    formatMoneyUGX(3500000),
  );
  assert(
    formatMoneyUGX(null) === "—",
    "Money formatting empty sentinel",
  );

  assert(
    humanizeWorkflowDecision("SUBMIT") === "Submitted for approval",
    "Decision phrase SUBMIT",
  );

  const timelineEntry = serializeTimelineAction(
    {
      id: "a1",
      decision: "APPROVE",
      comment: "Looks good",
      actorRoleName: "Head User Department",
      committeeRole: "CHAIRPERSON",
      previousStatus: "SUBMITTED",
      newStatus: "HOD_APPROVED",
      createdAt: new Date("2026-08-10T10:42:00Z"),
      metadata: {
        taskTitle: "Approved requisition",
        departmentId: "d1",
        stepNumber: 2,
      },
      actor: { id: "u1", firstName: "Mary", lastName: "Namukasa" },
    },
    { processName: "Requisition Process", procurementNumber: "PROC-2026-0001" },
  );

  assert(
    timelineEntry.actor?.displayName === "Mary Namukasa",
    "Timeline actor display name",
  );
  assert(
    timelineEntry.actorRoleName === "Head User Department",
    "Timeline actor organisational role",
  );
  assert(
    timelineEntry.actionText === "Approved requisition",
    "Timeline prefers taskTitle action text",
    timelineEntry.actionText,
  );
  assert(
    timelineEntry.statusTransition?.label === "Status: SUBMITTED → HOD_APPROVED",
    "Timeline status before→after",
    timelineEntry.statusTransition?.label,
  );
  assert(
    timelineEntry.procurementNumber === "PROC-2026-0001",
    "Timeline carries procurement case number",
  );
  assert(
    timelineEntry.committeeRole === "CHAIRPERSON",
    "Timeline includes committee role snapshot",
  );
  assert(
    timelineActionText({ decision: "VERIFY", processName: "Budgeting Process" }).includes(
      "Verified",
    ),
    "Timeline falls back to decision phrase",
  );

  assert(
    WORKFLOW_TRIGGERS.QUOTATION_STARTED === "QUOTATION_STARTED",
    "Engine keeps QUOTATION_STARTED (not QUOTATION_PROCESS_STARTED)",
  );
  assert(
    WORKFLOW_TRIGGERS.MICRO_PROCUREMENT_STARTED === "MICRO_PROCUREMENT_STARTED",
    "Engine keeps MICRO_PROCUREMENT_STARTED",
  );
  assert(
    ENGINE_PROCESS_BINDINGS.some((b) => b.triggerKey === "BUDGET_SUBMITTED"),
    "Budget engine binding present",
  );
  assert(
    ENGINE_PROCESS_BINDINGS.some((b) => b.triggerKey === "PLANNING_SUBMITTED"),
    "Planning engine binding present",
  );
  assert(
    ENGINE_PROCESS_BINDINGS.some((b) => b.triggerKey === "REQUISITION_SUBMITTED"),
    "Requisition engine binding present",
  );
  assert(
    !ENGINE_PROCESS_BINDINGS.some((b) => b.triggerKey === "QUOTATION_PROCESS_STARTED"),
    "Does not rename to canonical QUOTATION_PROCESS_STARTED",
  );

  // Optional DB checks when seed is present.
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  const project = student
    ? await prisma.project.findFirst({
        where: { ownerUserId: student.id, isPersonalOrg: true },
        select: { id: true },
      })
    : null;

  if (!project) {
    pass("DB seed optional skip", "no personal org for Lubega — unit checks only");
  } else {
    const users = await prisma.projectOrgUser.findMany({
      where: { projectId: project.id, isProjectAdmin: false },
      include: { projectOrgRole: true },
    });
    const byFirst = Object.fromEntries(users.map((u) => [u.firstName, u]));
    const peter = byFirst.Peter;
    const john = byFirst.John;

    if (peter) {
      const cleared = await setActiveCommittee(prisma, {
        projectId: project.id,
        orgUserId: peter.id,
        committeeId: null,
      });
      assert(cleared.ok === true, "Clear committee context succeeds");

      const evil = await setActiveCommittee(prisma, {
        projectId: project.id,
        orgUserId: peter.id,
        committeeId: "00000000-0000-4000-8000-000000000099",
      });
      assert(
        evil.ok === false,
        "Unauthorized committee activation rejected",
        evil.error || "",
      );

      const committees = await listMyCommittees(prisma, {
        projectId: project.id,
        orgUserId: peter.id,
      });
      assert(Array.isArray(committees), "listMyCommittees returns array");

      if (committees.length > 0) {
        const setOk = await setActiveCommittee(prisma, {
          projectId: project.id,
          orgUserId: peter.id,
          committeeId: committees[0].id,
        });
        assert(setOk.ok === true, "Set active committee for member", committees[0].name);
        await setActiveCommittee(prisma, {
          projectId: project.id,
          orgUserId: peter.id,
          committeeId: null,
        });
      } else {
        pass("No committee memberships on Peter", "skip activate-member check");
      }
    }

    if (john) {
      const denied = await requireCommitteeMembership(prisma, {
        projectId: project.id,
        orgUserId: john.id,
        committeeType: OrgCommitteeType.EVALUATION,
      });
      // John (User Department Officer) typically is not on eval committee; either ok with membership or educational 403.
      if (denied.ok) {
        assert(
          denied.committeeRole === OrgCommitteeMemberRole.CHAIRPERSON ||
            denied.committeeRole === OrgCommitteeMemberRole.MEMBER ||
            denied.committeeRole === OrgCommitteeMemberRole.SECRETARY,
          "Committee membership returns committee role",
          String(denied.committeeRole),
        );
      } else {
        assert(
          denied.status === 403 && /committee/i.test(String(denied.error || "")),
          "Non-member evaluation action blocked with educational message",
          denied.error || "",
        );
      }
    }

    const procs = await prisma.projectOrgProcurement.findMany({
      where: { projectId: project.id },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        financialYear: { select: { id: true, label: true } },
        department: { select: { id: true, name: true, code: true } },
        officer: { select: { id: true, firstName: true, lastName: true, email: true } },
        requisition: {
          select: {
            id: true,
            title: true,
            status: true,
            requisitionReference: true,
            estimatedTotalValue: true,
            procurementMethod: true,
          },
        },
        procurementPlanItem: true,
        budgetLine: true,
        instances: {
          orderBy: { startedAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            triggerKey: true,
            currentStepNumber: true,
            startedAt: true,
            completedAt: true,
            processFlow: { select: { id: true, name: true, code: true } },
            actions: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                decision: true,
                comment: true,
                actorRoleName: true,
                committeeId: true,
                committeeRole: true,
                previousStatus: true,
                newStatus: true,
                createdAt: true,
                metadata: true,
                actor: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        purchaseInstructions: { include: { supplier: true, issuedBy: true } },
        solicitations: { include: { invites: { include: { supplier: true } }, offers: true } },
        offers: { include: { supplier: true } },
      },
    });

    if (procs.length === 0) {
      pass("No procurements yet", "case-identity DB check skipped — run method suite first");
    } else {
      const numbers = new Set(procs.map((p) => p.procurementNumber));
      assert(
        numbers.size === procs.length,
        "Procurement case numbers are unique in sample",
        [...numbers].join(", "),
      );
      for (const p of procs) {
        assert(
          /^PROC-\d{4}-\d{4}$/.test(String(p.procurementNumber || "")),
          `Case identity format ${p.procurementNumber}`,
        );
      }

      const ser = serializeProcurement(procs[0]);
      assert(Boolean(ser.procurementNumber), "serializeProcurement exposes case number");
      assert(Array.isArray(ser.timeline), "serializeProcurement exposes timeline");
      if (ser.timeline.length > 0) {
        const hit = ser.timeline.find((t) => t.actorRoleName);
        assert(
          Boolean(hit?.actorRoleName),
          "Timeline entries include organisational role",
          hit?.actorRoleName || "",
        );
        assert(
          Boolean(hit?.actionText),
          "Timeline entries include actionText",
          hit?.actionText || "",
        );
      } else {
        pass("Timeline empty on latest procurement", "role display covered by unit fixture");
      }

      const deptIds = new Set(procs.map((p) => p.departmentId).filter(Boolean));
      if (procs.length >= 2 && deptIds.size === 1) {
        assert(
          numbers.size >= 2,
          "Multiple procurements in same department remain distinct cases",
        );
      } else {
        pass(
          "Multiple procurements per department",
          procs.length < 2
            ? "need ≥2 procurements from method/lifecycle suites"
            : "sample spans departments — uniqueness already asserted",
        );
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nRESULT  ${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` · ${failed.length} failed` : ""),
  );
  if (failed.length) {
    for (const f of failed) console.error(`  · ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
