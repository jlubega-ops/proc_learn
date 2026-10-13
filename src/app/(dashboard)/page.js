import { Role } from "@prisma/client";
import { APP_NAME } from "@/lib/appConfig";
import { getReadableAppSession } from "@/lib/auth/session";
import { buildIronSessionOptions } from "@/lib/auth/session-options";
import { buildSessionPayloadForUserId } from "@/lib/auth/session-payload";
import { StudentDashboardHome } from "@/components/academic/student-dashboard-home";
import { StaffDashboardHome } from "@/components/staff/staff-dashboard-home";
import { DashboardPageIntro } from "@/components/layout/dashboard-page-intro";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Dashboard",
  description: `Dashboard home for ${APP_NAME}.`,
};

const USER_SELECT = { id: true, email: true, firstName: true, middleName: true, lastName: true };

export default async function DashboardHomePage() {
  if (buildIronSessionOptions()) {
    const session = await getReadableAppSession();
    if (session?.userId) {
      const payload = await buildSessionPayloadForUserId(session.userId);
      if (payload?.authenticated && payload.activeRole === Role.STUDENT) {
        if (
          payload.orgContext === "PRACTICE" ||
          payload.orgContext === "ASSESSMENT" ||
          payload.assessmentLocked
        ) {
          const { redirect } = await import("next/navigation");
          redirect("/organisation");
        }
        const user = await prisma.user.findUnique({ where: { id: session.userId }, select: USER_SELECT });
        if (user) {
          return (
            <StudentDashboardHome
              user={user}
              personalOrgProjectId={payload.personalOrgProjectId || null}
            />
          );
        }
      }
      if (
        payload?.authenticated &&
        (payload.activeRole === Role.SYSTEM_ADMIN || payload.activeRole === Role.EXAMINER)
      ) {
        const user = await prisma.user.findUnique({ where: { id: session.userId }, select: USER_SELECT });
        if (user) {
          return <StaffDashboardHome user={user} isSystemAdmin={payload.activeRole === Role.SYSTEM_ADMIN} />;
        }
      }
    }
  }

  return (
    <div className="w-full space-y-6">
      <DashboardPageIntro hero title={`Welcome to ${APP_NAME}`} />
    </div>
  );
}
