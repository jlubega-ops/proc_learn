import { ProcurementStagePage } from "@/components/projects/procurement-stage-page";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = { title: NAV_LABELS.purchaseInstructions };

/** @param {{ params: Promise<{ id: string }> }} props */
export default function Page({ params }) {
  return <ProcurementStagePage params={params} stage="purchase-instructions" />;
}
