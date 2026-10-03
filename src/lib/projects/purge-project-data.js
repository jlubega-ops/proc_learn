/**
 * Ordered wipe of organisation / project rows so Restrict FKs (financial year,
 * requester, supplier, invoice, etc.) do not block Project or User deletes.
 */

/**
 * @param {import("@prisma/client").Prisma.TransactionClient | import("@prisma/client").PrismaClient} tx
 * @param {string} projectId
 */
export async function purgeProjectData(tx, projectId) {
  const id = String(projectId || "").trim();
  if (!id) return;

  await tx.userSettings.updateMany({
    where: { activeOrgProjectId: id },
    data: { activeOrgProjectId: null },
  });
  await tx.projectAttempt.updateMany({
    where: { workspaceProjectId: id },
    data: { workspaceProjectId: null },
  });

  // Workflow trail
  await tx.projectOrgWorkflowAction.deleteMany({ where: { projectId: id } });
  await tx.projectOrgWorkflowTask.deleteMany({ where: { projectId: id } });
  await tx.projectOrgWorkflowInstance.deleteMany({ where: { projectId: id } });

  // Procurement lifecycle (Restrict: payment→invoice, many→supplier)
  await tx.projectOrgPayment.deleteMany({ where: { projectId: id } });
  await tx.projectOrgInvoice.deleteMany({ where: { projectId: id } });
  await tx.projectOrgInspection.deleteMany({ where: { projectId: id } });
  await tx.projectOrgDelivery.deleteMany({ where: { projectId: id } });
  await tx.projectOrgLpo.deleteMany({ where: { projectId: id } });
  await tx.projectOrgContract.deleteMany({ where: { projectId: id } });
  await tx.projectOrgAward.deleteMany({ where: { projectId: id } });
  await tx.projectOrgPostQualificationReport.deleteMany({ where: { projectId: id } });
  await tx.projectOrgEvaluationReport.deleteMany({ where: { projectId: id } });
  await tx.projectOrgOffer.deleteMany({ where: { projectId: id } });
  await tx.projectOrgSolicitationInvite.deleteMany({
    where: { solicitation: { projectId: id } },
  });
  await tx.projectOrgSolicitation.deleteMany({ where: { projectId: id } });
  await tx.projectOrgPurchaseInstruction.deleteMany({ where: { projectId: id } });

  // Core ops (Restrict: financialYear, department, requisition, requester)
  await tx.projectOrgProcurement.deleteMany({ where: { projectId: id } });
  await tx.projectOrgRequisition.deleteMany({ where: { projectId: id } });
  await tx.projectOrgProcurementPlan.deleteMany({ where: { projectId: id } });
  await tx.projectOrgBudgetLine.deleteMany({ where: { projectId: id } });
  await tx.projectOrgBudget.deleteMany({ where: { projectId: id } });

  await tx.projectOrgPlanningPeriod.deleteMany({ where: { projectId: id } });
  await tx.projectOrgFinancialYear.deleteMany({ where: { projectId: id } });

  await tx.projectOrgNotification.deleteMany({ where: { projectId: id } });

  await tx.projectOrgUser.updateMany({
    where: { projectId: id },
    data: { activeCommitteeId: null },
  });
  await tx.projectOrgCommitteeMember.deleteMany({
    where: { committee: { projectId: id } },
  });
  await tx.projectOrgCommittee.deleteMany({ where: { projectId: id } });

  await tx.projectOrgProcessFlowAdoption.deleteMany({ where: { projectId: id } });

  await tx.projectOrgUser.deleteMany({ where: { projectId: id } });
  await tx.projectOrgProvider.deleteMany({ where: { projectId: id } });

  await tx.projectOrgDepartment.deleteMany({
    where: { projectId: id, parentId: { not: null } },
  });
  await tx.projectOrgDepartment.deleteMany({ where: { projectId: id } });

  await tx.orgAcademicSlate.deleteMany({ where: { projectId: id } });
}

/**
 * Purge org/ops data then delete the project row (remaining cascades apply).
 * @param {import("@prisma/client").Prisma.TransactionClient | import("@prisma/client").PrismaClient} tx
 * @param {string} projectId
 */
export async function deleteProjectFully(tx, projectId) {
  const id = String(projectId || "").trim();
  if (!id) return;
  await purgeProjectData(tx, id);
  await tx.project.delete({ where: { id } });
}

/**
 * Delete every project owned by the user (personal org, attempt orgs, etc.).
 * @param {import("@prisma/client").Prisma.TransactionClient | import("@prisma/client").PrismaClient} tx
 * @param {string} ownerUserId
 */
export async function deleteProjectsOwnedByUser(tx, ownerUserId) {
  const uid = String(ownerUserId || "").trim();
  if (!uid) return;
  const owned = await tx.project.findMany({
    where: { ownerUserId: uid },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  for (const row of owned) {
    await deleteProjectFully(tx, row.id);
  }
}
