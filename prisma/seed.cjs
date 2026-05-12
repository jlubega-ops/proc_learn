const { PrismaClient, Role, UserAccountStatus } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const studentEmail = String(
    process.env.SEED_STUDENT_EMAIL || "2300123456@mubs.ac.ug",
  )
    .trim()
    .toLowerCase();
  const studentPass = String(process.env.SEED_USER_PASSWORD || "changeme123");
  const studentNumber = String(process.env.SEED_STUDENT_NUMBER || "2300123456");

  const staffEmail = String(process.env.SEED_STAFF_EMAIL || "staff@mubs.ac.ug")
    .trim()
    .toLowerCase();
  const staffPass = String(process.env.SEED_STAFF_PASSWORD || "changeme123");

  const adminEmail = String(process.env.SEED_ADMIN_EMAIL || "jlubega@mubs.ac.ug")
    .trim()
    .toLowerCase();
  const adminPass = String(process.env.SEED_ADMIN_PASSWORD || "Admin123!");

  let programme = await prisma.programme.findFirst({
    where: { shortName: "GEN" },
  });
  if (!programme) {
    programme = await prisma.programme.create({
      data: {
        name: "General (seed)",
        shortName: "GEN",
        isActive: true,
      },
    });
  }

  const emails = [studentEmail, staffEmail, adminEmail];
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  const now = new Date();

  const passwordHashStudent = await bcrypt.hash(studentPass, 12);
  await prisma.user.create({
    data: {
      email: studentEmail,
      firstName: "Seed",
      middleName: null,
      lastName: "Student",
      sex: null,
      profilePhotoUrl: null,
      passwordHash: passwordHashStudent,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: now,
      lastLoginAt: null,
      userRoles: { create: [{ role: Role.STUDENT }] },
      settings: {
        create: { theme: "light", activeRole: Role.STUDENT },
      },
      studentProfile: {
        create: {
          studentNumber,
          registrationNumber: "REG-SEED-1",
          programmeId: programme.id,
          yearOfStudy: 3,
          academicYearLabel: "2025/2026",
        },
      },
    },
  });

  const passwordHashStaff = await bcrypt.hash(staffPass, 12);
  await prisma.user.create({
    data: {
      email: staffEmail,
      firstName: "Seed",
      middleName: null,
      lastName: "Staff",
      sex: null,
      profilePhotoUrl: null,
      passwordHash: passwordHashStaff,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: now,
      userRoles: {
        create: [{ role: Role.LECTURER }, { role: Role.EXAMINER }],
      },
      settings: {
        create: { theme: "light", activeRole: Role.LECTURER },
      },
    },
  });

  const passwordHashAdmin = await bcrypt.hash(adminPass, 12);
  await prisma.user.create({
    data: {
      email: adminEmail,
      firstName: "System",
      middleName: null,
      lastName: "Admin",
      sex: null,
      profilePhotoUrl: null,
      passwordHash: passwordHashAdmin,
      accountStatus: UserAccountStatus.ACTIVE,
      activatedAt: now,
      userRoles: { create: [{ role: Role.SYSTEM_ADMIN }] },
      settings: {
        create: { theme: "light", activeRole: Role.SYSTEM_ADMIN },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seed OK:", { studentEmail, staffEmail, adminEmail, programme: programme.shortName });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
