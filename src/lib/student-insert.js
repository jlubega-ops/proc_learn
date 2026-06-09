import bcrypt from "bcryptjs";
import { Role, UserAccountStatus } from "@prisma/client";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";

/**
 * Create a student user with default password = student number (must change on first sign-in).
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
    return await db.user.create({
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
  } catch {
    return null;
  }
}
