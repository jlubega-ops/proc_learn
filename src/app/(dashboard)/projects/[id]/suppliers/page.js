import { redirect } from "next/navigation";

/**
 * @param {{ params: Promise<{ id: string }> }} props
 */
export default async function LegacySuppliersPage({ params }) {
  const p = await params;
  redirect(`/projects/${String(p?.id || "").trim()}/providers`);
}
