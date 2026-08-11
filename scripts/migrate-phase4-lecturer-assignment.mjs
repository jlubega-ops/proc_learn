/**
 * Phase 4 DEV wipe (run BEFORE removing LECTURER / ASSIGNMENT from Prisma enums).
 *
 * Deletes:
 * - user_role rows with LECTURER
 * - resets user_settings.activeRole LECTURER → EXAMINER when user still has EXAMINER,
 *   else → SYSTEM_ADMIN if present, else STUDENT fallback
 * - projects with creatorRole LECTURER
 * - projects with purpose ASSIGNMENT
 *
 * Usage:
 *   node --import ./scripts/register-path-alias.mjs scripts/migrate-phase4-lecturer-assignment.mjs
 */
import { Role, ProjectPurpose } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const lecturerRoleRows = await prisma.userRole.findMany({
    where: { role: Role.LECTURER },
    select: { id: true, userId: true },
  });
  const lecturerUserIds = [...new Set(lecturerRoleRows.map((r) => r.userId))];

  const deletedRoles = await prisma.userRole.deleteMany({ where: { role: Role.LECTURER } });

  let settingsReset = 0;
  for (const userId of lecturerUserIds) {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings || settings.activeRole !== Role.LECTURER) continue;
    const roles = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    const set = new Set(roles.map((r) => r.role));
    let next = Role.STUDENT;
    if (set.has(Role.SYSTEM_ADMIN)) next = Role.SYSTEM_ADMIN;
    else if (set.has(Role.EXAMINER)) next = Role.EXAMINER;
    else if (set.has(Role.STUDENT)) next = Role.STUDENT;
    await prisma.userSettings.update({
      where: { userId },
      data: { activeRole: next },
    });
    settingsReset += 1;
  }

  // Also catch any leftover LECTURER activeRole without a LECTURER grant
  const leftoverSettings = await prisma.userSettings.updateMany({
    where: { activeRole: Role.LECTURER },
    data: { activeRole: Role.EXAMINER },
  });

  const deletedLecturerProjects = await prisma.project.deleteMany({
    where: { creatorRole: Role.LECTURER },
  });
  const deletedAssignmentProjects = await prisma.project.deleteMany({
    where: { purpose: ProjectPurpose.ASSIGNMENT },
  });

  console.log(
    JSON.stringify(
      {
        deletedLecturerRoles: deletedRoles.count,
        settingsResetFromLecturerUsers: settingsReset,
        leftoverLecturerActiveRoleForced: leftoverSettings.count,
        deletedLecturerProjects: deletedLecturerProjects.count,
        deletedAssignmentProjects: deletedAssignmentProjects.count,
        remainingLecturerRoles: await prisma.userRole.count({ where: { role: Role.LECTURER } }),
        remainingLecturerSettings: await prisma.userSettings.count({
          where: { activeRole: Role.LECTURER },
        }),
        remainingAssignmentProjects: await prisma.project.count({
          where: { purpose: ProjectPurpose.ASSIGNMENT },
        }),
        remainingLecturerProjects: await prisma.project.count({
          where: { creatorRole: Role.LECTURER },
        }),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
