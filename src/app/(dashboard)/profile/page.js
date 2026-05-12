import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import { AccountProfileTabs } from "@/components/account/account-profile-tabs";

export const metadata = {
  title: "Profile",
};

function ProfileFallback() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress />
    </Box>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileFallback />}>
      <AccountProfileTabs />
    </Suspense>
  );
}
