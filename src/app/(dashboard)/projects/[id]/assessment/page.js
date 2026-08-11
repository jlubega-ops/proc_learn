import { ExaminerAssessmentConfigPanel } from "@/components/examiner/examiner-assessment-config-panel";

export const metadata = { title: "Assessment scoring" };

export default async function ProjectAssessmentConfigPage({ params }) {
  const resolved = await params;
  const projectId = String(resolved?.id || "").trim();
  return <ExaminerAssessmentConfigPanel projectId={projectId} />;
}
