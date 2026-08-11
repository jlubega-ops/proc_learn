import bcrypt from "bcryptjs";
import { Role, UserAccountStatus } from "@prisma/client";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";
import { ensureEnrollmentFromProfileLabel } from "@/lib/academic/student-enrollment";

/**
 * Create a student user with default password = student number (must change on first sign-in).
 * Also creates an ACTIVE StudentAcademicEnrollment for the given academic year label
 * (source of truth going forward; profile label kept for compatibility).
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   email: string;
 *   firstName: string;
 *   lastName: string;
 *   middleName: string | null;
 *   studentNumber: string;
 *   registrationNumber: string;
 *   programmeId: string;
 *   academicYearLabel: string;
 *   yearOfStudy: number;
 *   sex: import("@prisma/client").Sex | null;
 *   profilePhotoUrl?: string | null;
 * }} normalized
 * @returns {Promise<import("@prisma/client").User | null>}
 */
export async function insertPendingStudentUser(db, normalized) {
  const passwordHash = await bcrypt.hash(normalized.studentNumber, 12);
  const profilePhotoUrl = normalizeProfilePhotoInput(normalized.profilePhotoUrl);
  const now = new Date();
  try {
    const run = async (/** @type {import("@prisma/client").Prisma.TransactionClient} */ tx) => {
      const user = await tx.user.create({
        data: {
          email: normalized.email,
          firstName: normalized.firstName.slice(0, 100),
          middleName: normalized.middleName ? normalized.middleName.slice(0, 100) : null,
          lastName: normalized.lastName.slice(0, 100),
          sex: normalized.sex ?? null,
          profilePhotoUrl,
          passwordHash,
          accountStatus: UserAccountStatus.ACTIVE,
          activatedAt: now,
          mustChangePassword: true,
          userRoles: {
            create: [{ role: Role.STUDENT }],
          },
          settings: {
            create: {
              theme: "light",
              activeRole: Role.STUDENT,
            },
          },
          studentProfile: {
            create: {
              studentNumber: normalized.studentNumber.slice(0, 32),
              registrationNumber: normalized.registrationNumber.slice(0, 128),
              programmeId: normalized.programmeId,
              yearOfStudy: normalized.yearOfStudy,
              academicYearLabel: normalized.academicYearLabel,
            },
          },
        },
      });

      await ensureEnrollmentFromProfileLabel(tx, {
        userId: user.id,
        academicYearLabel: normalized.academicYearLabel,
      });

      return user;
    };

    if (typeof db.$transaction === "function") {
      return await db.$transaction(run);
    }
    return await run(/** @type {import("@prisma/client").Prisma.TransactionClient} */ (db));
  } catch {
    return null;
  }
}
