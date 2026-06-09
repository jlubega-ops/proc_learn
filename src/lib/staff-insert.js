import bcrypt from "bcryptjs";
import { Role, UserAccountStatus } from "@prisma/client";
import { normalizeProfilePhotoInput } from "@/lib/profile-photo-url";

/**
 * Create an active staff user with a known initial password (must change on first sign-in).
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} db
 * @param {{
 *   email: string;
 *   firstName: string;
 *   lastName: string;
 *   middleName: string | null;
 *   sex: import("@prisma/client").Sex | null;
 *   profilePhotoUrl?: string | null;
 *   roles: import("@prisma/client").Role[];
 *   activeRole: import("@prisma/client").Role;
 *   plainPassword: string;
 * }} input
 */
export async function insertStaffUserWithPassword(db, input) {
  const passwordHash = await bcrypt.hash(input.plainPassword, 12);
  const profilePhotoUrl = normalizeProfilePhotoInput(input.profilePhotoUrl);
  const now = new Date();

  try {
    return await db.user.create({
      data: {
        email: input.email,
        firstName: input.firstName.slice(0, 100),
        middleName: input.middleName ? input.middleName.slice(0, 100) : null,
        lastName: input.lastName.slice(0, 100),
        sex: input.sex ?? null,
        profilePhotoUrl,
        passwordHash,
        accountStatus: UserAccountStatus.ACTIVE,
        activatedAt: now,
        mustChangePassword: true,
        userRoles: {
          create: input.roles.map((role) => ({ role })),
        },
        settings: {
          create: {
            theme: "light",
            activeRole: input.activeRole,
          },
        },
      },
    });
  } catch {
    return null;
  }
}
