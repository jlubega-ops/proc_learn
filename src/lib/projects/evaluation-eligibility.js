import { OrgCommitteeType, OrgEvaluationReportStatus, OrgPostQualificationStatus, Prisma } from "@prisma/client";
import { writeAuditLog, AuditEvent } from "@/lib/audit-log";
import { notifyOrgUsers, OrgNotificationType } from "@/lib/projects/org-notifications";
import { requireCommitteeMembership } from "@/lib/projects/committee-context";
import {
  evaluateProviderQualification,
  normalizeProviderCompliance,
} from "@/lib/projects/provider-compliance";
import { normalizeProviderCategory } from "@/lib/projects/provider-terms";
import {
  createEvaluationReport,
  evaluationReportInclude,
  serializeEvaluationReport,
  submitEvaluationReport,
} from "@/lib/projects/evaluation";
import {
  createPostQualificationChecklist,
  decidePostQualificationReport,
  postQualificationRequired,
  serializePostQualificationReport,
  verifyPostQualificationChecklist,
} from "@/lib/projects/post-qualification";

const REGISTRATION_CHECKS = ["REGISTER_STATUS", "URSB_REGISTRATION", "PPDA_REGISTRATION", "TRADING_LICENCE", "PPDA_NOT_SUSPENDED"];
const TAX_CHECKS = ["TIN", "TAX_CLEARANCE", "NSSF_CLEARANCE"];

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {string} procurementId
 */
async function loadProcurement(prisma, projectId, procurementId) {
  return prisma.projectOrgProcurement.findFirst({
    where: { id: procurementId, projectId },
    select: {
      id: true,
      procurementNumber: true,
      procurementMethod: true,
      requiresPostQualification: true,
      officer: { select: { id: true, linkedUserId: true } },
      requisition: { select: { category: true } },
      offers: {
        where: { status: { notIn: ["WITHDRAWN", "LATE"] } },
        orderBy: { amount: "asc" },
        include: { supplier: true },
      },
    },
  });
}

/**
 * @param {any} provider
 * @param {{ method: string; category: string | null }} ctx
 */
function qualify(provider, ctx) {
  return evaluateProviderQualification(
    { ...provider, compliance: normalizeProviderCompliance(provider.compliance) },
    { method: ctx.method, category: ctx.category },
  );
}

/**
 * System-run eligibility of every bidder (one entry per provider, lowest offer kept).
 * @param {any} procurement
 */
function bidderQualifications(procurement) {
  const ctx = {
    method: procurement.procurementMethod,
    category: normalizeProviderCategory(procurement.requisition?.category),
  };
  /** @type {Map<string, any>} */
  const bySupplier = new Map();
  for (const offer of procurement.offers || []) {
    if (!offer.supplier || bySupplier.has(offer.supplierId)) continue;
    bySupplier.set(offer.supplierId, {
      id: offer.supplierId,
      name: offer.supplier.name,
      offerId: offer.id,
      amount: offer.amount?.toString?.() ?? String(offer.amount ?? ""),
      source: offer.source || "OFFICER",
      qualification: qualify(offer.supplier, ctx),
    });
  }
  return [...bySupplier.values()];
}

/**
 * @param {any[]} bidders
 */
function eligibilitySnapshot(bidders) {
  return bidders.map((b) => ({
    supplierId: b.id,
    name: b.name,
    amount: b.amount,
    qualifies: Boolean(b.qualification?.qualifies),
    failedReasons: b.qualification?.failedReasons || [],
    warningCount: b.qualification?.warningCount || 0,
  }));
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; orgUserId: string }} opts
 */
async function isEvaluationMember(prisma, opts) {
  if (!opts.orgUserId) return false;
  const m = await requireCommitteeMembership(prisma, {
    projectId: opts.projectId,
    orgUserId: opts.orgUserId,
    committeeType: OrgCommitteeType.EVALUATION,
  });
  return m.ok;
}

/**
 * Everything the evaluation panel needs: bidders with system-run eligibility,
 * the latest evaluation report and (for tenders) post-qualification.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; orgUserId: string | null; roleName: string; actingCommitteeType?: string | null }} opts
 */
export async function getEvaluationContext(prisma, opts) {
  const procurement = await loadProcurement(prisma, opts.projectId, opts.procurementId);
  if (!procurement) return { ok: false, error: "Procurement not found.", status: 404 };

  const bidders = bidderQualifications(procurement);
  const report = await prisma.projectOrgEvaluationReport.findFirst({
    where: { projectId: opts.projectId, procurementId: procurement.id },
    orderBy: { createdAt: "desc" },
    include: evaluationReportInclude,
  });
  const pqRequired = postQualificationRequired(procurement);
  const pq = pqRequired
    ? await prisma.projectOrgPostQualificationReport.findFirst({
        where: {
          projectId: opts.projectId,
          procurementId: procurement.id,
          status: { not: OrgPostQualificationStatus.REJECTED },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  let recommended = null;
  const recommendedId =
    pq?.supplierId ||
    (report?.status === OrgEvaluationReportStatus.SUBMITTED || report?.status === OrgEvaluationReportStatus.APPROVED
      ? report.recommendedSupplierId
      : null);
  if (pqRequired && recommendedId) {
    const provider = await prisma.projectOrgProvider.findFirst({
      where: { id: recommendedId, projectId: opts.projectId },
    });
    if (provider) {
      recommended = {
        id: provider.id,
        name: provider.name,
        qualification: qualify(provider, {
          method: procurement.procurementMethod,
          category: normalizeProviderCategory(procurement.requisition?.category),
        }),
      };
    }
  }

  const actingType = String(opts.actingCommitteeType || "").toUpperCase();
  const isMember =
    actingType === OrgCommitteeType.EVALUATION &&
    (await isEvaluationMember(prisma, { projectId: opts.projectId, orgUserId: opts.orgUserId || "" }));
  return {
    ok: true,
    bidders,
    evaluationReport: serializeEvaluationReport(report),
    postQualificationRequired: pqRequired,
    postQualification: serializePostQualificationReport(pq),
    recommended,
    permissions: {
      canEvaluate: isMember,
      canDecidePostQualification: actingType === OrgCommitteeType.CONTRACTS,
    },
  };
}

/**
 * Evaluation Committee saves (and optionally submits) its report. Eligibility is
 * re-run by the system and stored with the report; failed checks become warnings.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   actorOrgUserId: string;
 *   actorRoleName: string;
 *   recommendedSupplierId: unknown;
 *   recommendation?: unknown;
 *   comments?: unknown;
 *   submit?: boolean;
 * }} opts
 */
export async function saveEvaluationWithEligibility(prisma, opts) {
  const procurement = await loadProcurement(prisma, opts.projectId, opts.procurementId);
  if (!procurement) return { ok: false, error: "Procurement not found.", status: 404 };

  const membership = await requireCommitteeMembership(prisma, {
    projectId: opts.projectId,
    orgUserId: opts.actorOrgUserId,
    committeeType: OrgCommitteeType.EVALUATION,
  });
  if (!membership.ok) return membership;

  const bidders = bidderQualifications(procurement);
  if (!bidders.length) {
    return { ok: false, error: "There are no quotations or bids to evaluate.", status: 400, code: "NO_OFFERS" };
  }

  const supplierId = typeof opts.recommendedSupplierId === "string" ? opts.recommendedSupplierId.trim() : "";
  const chosen = bidders.find((b) => b.id === supplierId);
  if (!chosen) {
    return {
      ok: false,
      error: "Choose the recommended bidder from the offers received.",
      status: 400,
      fieldErrors: { recommendedSupplierId: "Choose a bidder." },
    };
  }

  const recommendation = typeof opts.recommendation === "string" ? opts.recommendation.trim().slice(0, 4000) : "";
  const comments = typeof opts.comments === "string" ? opts.comments.trim().slice(0, 4000) : "";
  if (opts.submit && !recommendation) {
    return {
      ok: false,
      error: "Write the committee's recommendation before submitting.",
      status: 400,
      fieldErrors: { recommendation: "Enter the recommendation." },
    };
  }

  const eligible = bidders.filter((b) => b.qualification?.qualifies);
  const lowestEligible = eligible.reduce(
    (min, b) => (min === null || Number(b.amount) < Number(min.amount) ? b : min),
    /** @type {any} */ (null),
  );
  /** @type {string[]} */
  const warnings = [];
  if (!chosen.qualification?.qualifies) {
    warnings.push(`${chosen.name} did not pass eligibility: ${(chosen.qualification?.failedReasons || []).join("; ")}`);
  }
  if (lowestEligible && lowestEligible.id !== chosen.id) {
    warnings.push(`${chosen.name} is not the lowest-priced eligible bidder (${lowestEligible.name} is lower).`);
  }
  if (!eligible.length) warnings.push("No bidder passed eligibility.");

  const eligibilityJson = {
    ranAt: new Date().toISOString(),
    method: procurement.procurementMethod,
    category: normalizeProviderCategory(procurement.requisition?.category),
    bidders: eligibilitySnapshot(bidders),
    recommendedSupplierId: chosen.id,
    lowestEligibleSupplierId: lowestEligible?.id || null,
    warnings,
  };

  let report = await prisma.projectOrgEvaluationReport.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      status: { in: [OrgEvaluationReportStatus.DRAFT, OrgEvaluationReportStatus.RETURNED] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!report) {
    const pending = await prisma.projectOrgEvaluationReport.findFirst({
      where: {
        projectId: opts.projectId,
        procurementId: procurement.id,
        status: { in: [OrgEvaluationReportStatus.SUBMITTED, OrgEvaluationReportStatus.APPROVED] },
      },
      select: { id: true, status: true },
    });
    if (pending) {
      return {
        ok: false,
        error:
          pending.status === "APPROVED"
            ? "The evaluation report has already been approved."
            : "The evaluation report is awaiting approval.",
        status: 400,
      };
    }
    const created = await createEvaluationReport(prisma, {
      projectId: opts.projectId,
      procurementId: procurement.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      activeCommitteeId: membership.committee.id,
      recommendedSupplierId: chosen.id,
      evaluatedAmount: chosen.amount,
      recommendation: recommendation || null,
      comments: comments || null,
    });
    if (!created.ok) return created;
    report = await prisma.projectOrgEvaluationReport.findUnique({ where: { id: created.evaluationReport.id } });
  }
  if (!report) return { ok: false, error: "Could not save the evaluation report.", status: 500 };

  await prisma.projectOrgEvaluationReport.update({
    where: { id: report.id },
    data: {
      recommendedSupplierId: chosen.id,
      evaluatedAmount: new Prisma.Decimal(Number(chosen.amount).toFixed(2)),
      recommendation: recommendation || null,
      comments: comments || null,
      eligibilityJson,
    },
  });

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_EVALUATION_ELIGIBILITY_RUN,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      evaluationReportId: report.id,
      bidderCount: bidders.length,
      eligibleCount: eligible.length,
      recommendedSupplierId: chosen.id,
      warnings,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  if (opts.submit) {
    const submitted = await submitEvaluationReport(prisma, {
      projectId: opts.projectId,
      evaluationReportId: report.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
      activeCommitteeId: membership.committee.id,
    });
    if (!submitted.ok) return submitted;
    return { ok: true, evaluationReport: submitted.evaluationReport, warnings };
  }

  const saved = await prisma.projectOrgEvaluationReport.findUnique({
    where: { id: report.id },
    include: evaluationReportInclude,
  });
  return { ok: true, evaluationReport: serializeEvaluationReport(saved), warnings };
}

/**
 * Tender post-qualification: the Evaluation Committee runs validation on the
 * recommended bidder; the system maps the checks onto the checklist and submits it.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; actorOrgUserId: string; actorRoleName: string; comments?: unknown }} opts
 */
export async function runPostQualification(prisma, opts) {
  const procurement = await loadProcurement(prisma, opts.projectId, opts.procurementId);
  if (!procurement) return { ok: false, error: "Procurement not found.", status: 404 };

  const membership = await requireCommitteeMembership(prisma, {
    projectId: opts.projectId,
    orgUserId: opts.actorOrgUserId,
    committeeType: OrgCommitteeType.EVALUATION,
  });
  if (!membership.ok) return membership;

  let pq = await prisma.projectOrgPostQualificationReport.findFirst({
    where: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      status: { in: [OrgPostQualificationStatus.DRAFT, OrgPostQualificationStatus.SUBMITTED] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pq) {
    const created = await createPostQualificationChecklist(prisma, {
      projectId: opts.projectId,
      procurementId: procurement.id,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    });
    if (!created.ok) return created;
    pq = await prisma.projectOrgPostQualificationReport.findUnique({
      where: { id: created.postQualificationReport.id },
    });
  }
  if (!pq?.supplierId) return { ok: false, error: "No recommended bidder to post-qualify.", status: 400 };

  const provider = await prisma.projectOrgProvider.findFirst({
    where: { id: pq.supplierId, projectId: opts.projectId },
  });
  if (!provider) return { ok: false, error: "The recommended bidder is no longer in the register.", status: 400 };

  const qualification = qualify(provider, {
    method: procurement.procurementMethod,
    category: normalizeProviderCategory(procurement.requisition?.category),
  });
  const checks = qualification.checks || [];
  const allPassed = (keys) => checks.filter((c) => keys.includes(c.key)).every((c) => c.passed);
  const categoryCheck = checks.find((c) => c.key === "CATEGORY_MATCH");

  await prisma.projectOrgPostQualificationReport.update({
    where: { id: pq.id },
    data: {
      validationJson: {
        ranAt: new Date().toISOString(),
        supplierId: provider.id,
        name: provider.name,
        qualifies: qualification.qualifies,
        failedReasons: qualification.failedReasons || [],
        checks: checks.map((c) => ({ key: c.key, label: c.label, passed: c.passed, warning: c.warning, reason: c.reason })),
      },
    },
  });

  const verified = await verifyPostQualificationChecklist(prisma, {
    projectId: opts.projectId,
    postQualificationReportId: pq.id,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    registrationVerified: allPassed(REGISTRATION_CHECKS),
    taxComplianceVerified: allPassed(TAX_CHECKS),
    experienceVerified: categoryCheck ? categoryCheck.passed : true,
    comments: typeof opts.comments === "string" ? opts.comments : null,
  });
  if (!verified.ok) return verified;

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_POST_QUALIFICATION_VERIFIED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: procurement.id,
      postQualificationReportId: pq.id,
      supplierId: provider.id,
      qualifies: qualification.qualifies,
      failedReasons: qualification.failedReasons || [],
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const fresh = await prisma.projectOrgPostQualificationReport.findUnique({ where: { id: pq.id } });
  return { ok: true, postQualificationReport: serializePostQualificationReport(fresh) };
}

/**
 * Approve / reject post-qualification. Learning mode: approval is allowed with warnings.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ projectId: string; procurementId: string; actorOrgUserId: string; actorRoleName: string; decision: unknown; comment?: unknown }} opts
 */
export async function decidePostQualification(prisma, opts) {
  const pq = await prisma.projectOrgPostQualificationReport.findFirst({
    where: { projectId: opts.projectId, procurementId: opts.procurementId, status: OrgPostQualificationStatus.SUBMITTED },
    orderBy: { createdAt: "desc" },
  });
  if (!pq) return { ok: false, error: "There is no submitted post-qualification to decide on.", status: 400 };

  const decision = String(opts.decision || "").toUpperCase() === "REJECT" ? "REJECT" : "APPROVE";
  const decided = await decidePostQualificationReport(prisma, {
    projectId: opts.projectId,
    postQualificationReportId: pq.id,
    actorOrgUserId: opts.actorOrgUserId,
    actorRoleName: opts.actorRoleName,
    decision,
    comment: typeof opts.comment === "string" ? opts.comment : null,
  });
  if (!decided.ok) return decided;

  await writeAuditLog({
    eventType: AuditEvent.PROJECT_ORG_POST_QUALIFICATION_DECIDED,
    actorUserId: null,
    meta: {
      projectId: opts.projectId,
      procurementId: opts.procurementId,
      postQualificationReportId: pq.id,
      decision,
      actorOrgUserId: opts.actorOrgUserId,
      actorRoleName: opts.actorRoleName,
    },
  });

  const procurement = await loadProcurement(prisma, opts.projectId, opts.procurementId);
  if (procurement?.officer) {
    await notifyOrgUsers(prisma, {
      projectId: opts.projectId,
      recipients: [procurement.officer],
      type: decision === "APPROVE" ? OrgNotificationType.WORKFLOW_APPROVED : OrgNotificationType.WORKFLOW_REJECTED,
      title: `Post-qualification ${decision === "APPROVE" ? "approved" : "rejected"}`,
      body: `${opts.actorRoleName} ${decision === "APPROVE" ? "approved" : "rejected"} post-qualification for ${procurement.procurementNumber}.`,
      linkUrl: `/projects/${opts.projectId}/procurements/${opts.procurementId}`,
      relatedEntityType: "post_qualification_report",
      relatedEntityId: pq.id,
    });
  }

  return decided;
}
