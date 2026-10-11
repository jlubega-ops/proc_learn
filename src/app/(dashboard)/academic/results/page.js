import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { AcademicResultsPanel } from "@/components/academic/academic-results-panel";
import { adminCenteredLoadingBoxSx, adminLoadingSpinnerSx } from "@/lib/admin-mui-surfaces";
import { getSessionUser, sessionActiveRole } from "@/lib/api/get-session-user";

export const metadata = { title: "Results" };

export default async function AcademicResultsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/academic/results");
  if ((sessionActiveRole(user) || Role.STUDENT) === Role.STUDENT) redirect("/academic/assessments");
  return (
    <Suspense
      fallback={
        <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
          <CircularProgress sx={adminLoadingSpinnerSx} />
        </Box>
      }
    >
      <AcademicResultsPanel />
    </Suspense>
  );
}
