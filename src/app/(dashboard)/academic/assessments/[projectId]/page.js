import { AcademicProjectAttemptPanel } from "@/components/academic/academic-project-attempt-panel";
import { requireEffectiveStudent } from "@/lib/academic/require-effective-student";

export const metadata = { title: "Assessment project" };

/**
 * @param {{ params: Promise<{ projectId: string }> }} props
 */
export default async function AssessmentProjectPage({ params }) {
  const { projectId } = await params;
  await requireEffectiveStudent(`/academic/assessments/${projectId}`);
  return <AcademicProjectAttemptPanel projectId={projectId} purpose="ASSESSMENT" />;
}
