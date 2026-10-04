import { PortalAssignmentDetail } from "@/components/provider-portal/portal-assignment-detail";

export const metadata = { title: "Assignment" };

export default async function ProviderPortalAssignmentPage({ params }) {
  const { procurementId } = await params;
  return <PortalAssignmentDetail procurementId={procurementId} />;
}
