import { PortalOpportunityDetail } from "@/components/provider-portal/portal-opportunity-detail";

export const metadata = { title: "Opportunity" };

export default async function ProviderPortalOpportunityPage({ params }) {
  const { solicitationId } = await params;
  return <PortalOpportunityDetail solicitationId={solicitationId} />;
}
