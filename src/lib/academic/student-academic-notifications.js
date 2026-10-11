import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eligibleStudentIdsForProject } from "@/lib/academic/student-project-eligibility";

const PURPOSE_LABEL = { PRACTICE: "Practice", ASSESSMENT: "Assessment" };

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {string[]} userIds
 * @param {{ type: string; title: string; body: string }} n
 */
async function notifyStudents(db, userIds, n) {
  if (!userIds.length) return 0;
  const result = await db.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 255),
      body: n.body,
      audienceRole: Role.STUDENT,
    })),
  });
  return result.count;
}

/**
 * Tell matching students (AY + programme + campus) a published project is available.
 * @param {string} projectId
 * @param {import("@prisma/client").PrismaClient} [db]
 */
export async function notifyStudentsProjectAvailable(projectId, db = prisma) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, purpose: true, isPublished: true, closeAt: true },
  });
  if (!project?.isPublished) return 0;
  const userIds = await eligibleStudentIdsForProject(db, projectId);
  const kind = PURPOSE_LABEL[project.purpose] || "Project";
  return notifyStudents(db, userIds, {
    type: "ACADEMIC_PROJECT_AVAILABLE",
    title: `New ${kind.toLowerCase()} project: ${project.name}`,
    body: `“${project.name}” is now available under My Academic Work → ${
      project.purpose === "ASSESSMENT" ? "Assessments" : "Practice"
    }.`,
  });
}

/**
 * Tell enrolled students that results are out (or that full details were added).
 * @param {string} projectId
 * @param {import("@prisma/client").PrismaClient} [db]
 * @param {{ detailed?: boolean }} [opts]
 */
export async function notifyStudentsResultsReleased(projectId, db = prisma, opts = {}) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, purpose: true, enrollments: { select: { studentUserId: true } } },
  });
  if (!project) return 0;
  const userIds = [...new Set(project.enrollments.map((e) => e.studentUserId))];
  const area = project.purpose === "ASSESSMENT" ? "Assessments" : "Practice";
  return notifyStudents(db, userIds, {
    type: "ACADEMIC_RESULTS_RELEASED",
    title: `Results released: ${project.name}`,
    body: `Your ${opts.detailed ? "detailed results" : "score"} for “${project.name}” ${
      opts.detailed ? "are" : "is"
    } available. Open My Academic Work → ${area} → “${project.name}”.`,
  });
}
