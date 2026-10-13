import { ExaminerProjectProcessesPanel } from "@/components/examiner/examiner-project-processes-panel";

export const metadata = { title: "Project processes" };

export default async function ProjectProcessesPage({ params }) {
  const resolved = await params;
  const projectId = String(resolved?.id || "").trim();
  return <ExaminerProjectProcessesPanel projectId={projectId} />;
}
