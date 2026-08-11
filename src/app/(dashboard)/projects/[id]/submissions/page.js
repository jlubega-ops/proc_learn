import { redirect } from "next/navigation";

export const metadata = {
  title: "Participants",
};

/**
 * Legacy submissions URL — redirect to Participants (Phase 10 UI cleanup).
 */
export default async function ProjectSubmissionsPage({ params }) {
  const p = await params;
  const id = String(p?.id || "").trim();
  redirect(id ? `/projects/${id}/participants` : "/projects");
}
