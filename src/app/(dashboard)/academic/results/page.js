import { Suspense } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { AcademicResultsPanel } from "@/components/academic/academic-results-panel";
import { adminCenteredLoadingBoxSx, adminLoadingSpinnerSx } from "@/lib/admin-mui-surfaces";

export const metadata = { title: "Results" };

export default function AcademicResultsPage() {
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
