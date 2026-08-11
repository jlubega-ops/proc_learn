import { AcademicProjectAttemptPanel } from "@/components/academic/academic-project-attempt-panel";
import { requireEffectiveStudent } from "@/lib/academic/require-effective-student";

export const metadata = { title: "Practice project" };

/**
 * @param {{ params: Promise<{ projectId: string }> }} props
 */
export default async function PracticeProjectPage({ params }) {
  const { projectId } = await params;
  await requireEffectiveStudent(`/academic/practice/${projectId}`);
  return <AcademicProjectAttemptPanel projectId={projectId} purpose="PRACTICE" />;
}
