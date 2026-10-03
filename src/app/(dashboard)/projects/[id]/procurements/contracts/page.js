import { ProcurementStagePage } from "@/components/projects/procurement-stage-page";

export const metadata = { title: "Contracts / LPO" };

/** @param {{ params: Promise<{ id: string }> }} props */
export default function Page({ params }) {
  return <ProcurementStagePage params={params} stage="contracts" />;
}
