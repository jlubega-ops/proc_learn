/**
 * Phase 3 design (additive only) — OrgAcademicSlate over existing My Organisation.
 *
 * Touchpoints (documented before coding):
 * - Schema: OrgAcademicSlate; nullable orgAcademicSlateId on Budget / Plan / Requisition / Procurement
 * - Create: stamp slate when resolveable (budgets.js, procurement-plans.js, requisitions.js, procurements.js)
 * - List: filter current slate OR null (legacy visible); hide other years’ stamped rows
 * - Context: extend getStudentAcademicContext; ensure slate on personal-org ensure + join-year
 * - Audit: ORG_ACADEMIC_SLATE_* events + enrich meta with year/enrollment/slate/project
 *
 * MUST NOT change: workflow-engine.js, process-catalogue bindings, approval/method/payment/closure rules.
 *
 * My Organisation = one personal Project for life. New AY → new CURRENT slate; prior → HISTORICAL.
 * Lists policy: current slate OR null. Backfill: lazy ensure slate; leave legacy ops null.
 */
export const PHASE3_ORG_ACADEMIC_SLATE_DESIGN = true;
