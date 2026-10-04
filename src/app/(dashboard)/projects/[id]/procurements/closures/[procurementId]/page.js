import { ProcurementSectionRecordPage } from "@/components/projects/procurement-stage-page";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = { title: NAV_LABELS.closures };

/** @param {{ params: Promise<{ id: string; procurementId: string }> }} props */
export default function Page({ params }) {
  return <ProcurementSectionRecordPage params={params} stage="closures" />;
}
