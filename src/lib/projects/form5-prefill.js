/**
 * Auto-fill Form 5 teaching fields from organisation roles and committee seats.
 */

/**
 * @param {{ firstName?: string | null; lastName?: string | null }} user
 */
export function orgUserDisplayName(user) {
  if (!user) return "";
  return `${user.firstName || ""} ${user.lastName || ""}`.trim();
}

/**
 * @param {any[]} members
 * @param {string} committeeRole
 */
function committeeMemberName(members, committeeRole) {
  const role = String(committeeRole || "").trim().toUpperCase();
  const match = (members || []).find(
    (m) => String(m.committeeRole || "").trim().toUpperCase() === role,
  );
  return orgUserDisplayName(match?.orgUser);
}

/**
 * @param {any[]} members
 */
function committeeMemberList(members) {
  return (members || [])
    .map((m) => {
      const name = orgUserDisplayName(m.orgUser);
      if (!name) return "";
      const seat = String(m.committeeRole || "").trim();
      return seat ? `${name} (${seat.replace(/_/g, " ")})` : name;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Load organisation defaults for Form 5 Part I / II prefill.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} projectId
 * @param {{ departmentId?: string | null; requester?: { firstName?: string; lastName?: string } | null }} [requisition]
 */
export async function fetchForm5OrgDefaults(prisma, projectId, requisition = {}) {
  const departmentId = requisition.departmentId || null;

  const [orgUsers, committees] = await Promise.all([
    prisma.projectOrgUser.findMany({
      where: { projectId, isProjectAdmin: false },
      select: {
        firstName: true,
        lastName: true,
        projectOrgRole: { select: { name: true } },
        departmentId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectOrgCommittee.findMany({
      where: { projectId, isActive: true },
      include: {
        members: {
          where: { status: "ACTIVE" },
          include: {
            orgUser: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  const byRole = (roleName) =>
    orgUsers.find((u) => u.projectOrgRole?.name === roleName) || null;

  const hod =
    (departmentId
      ? orgUsers.find(
          (u) =>
            u.projectOrgRole?.name === "Head User Department" &&
            u.departmentId === departmentId,
        )
      : null) || byRole("Head User Department");

  const pduOfficer = byRole("Procurement Officer");
  const contractsOfficer = byRole("Contracts Officer");

  const contractsCommittee =
    committees.find((c) => c.committeeType === "CONTRACTS") || null;
  const evaluationCommittee =
    committees.find((c) => c.committeeType === "EVALUATION") || null;

  const ccMembers = contractsCommittee?.members || [];
  const evalMembers = evaluationCommittee?.members || [];

  const requesterName = orgUserDisplayName(requisition.requester);

  return {
    partI: {
      memberName: requesterName,
      memberTitle: "User Department Officer",
      hodName: orgUserDisplayName(hod),
      hodTitle: hod ? "Head User Department" : "",
      aoName: orgUserDisplayName(byRole("Accounting Officer")),
      aoTitle: "Accounting Officer",
    },
    partII: {
      pduOfficerName: orgUserDisplayName(pduOfficer),
      pduOfficerPosition: pduOfficer ? "Procurement Officer" : "Procurement Officer",
      ccChairName: committeeMemberName(ccMembers, "CHAIRPERSON"),
      ccSecretaryName: committeeMemberName(ccMembers, "SECRETARY"),
      evaluationCommitteeNominees: committeeMemberList(evalMembers),
      biddingDocumentPreparers: [pduOfficer, contractsOfficer]
        .map((u) => orgUserDisplayName(u))
        .filter(Boolean)
        .join(", "),
    },
  };
}
