import { AcademicProjectsListPanel } from "@/components/academic/academic-projects-list-panel";

export const metadata = { title: "Assessments" };

export default function AcademicAssessmentsPage() {
  return (
    <AcademicProjectsListPanel
      purpose="ASSESSMENT"
      title="Assessments"
      description="Assessment projects from your examiner. Timed attempts use a server timer and run on your My Organisation."
    />
  );
}
