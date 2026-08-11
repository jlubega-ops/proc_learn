import { AcademicProjectsListPanel } from "@/components/academic/academic-projects-list-panel";

export const metadata = { title: "Practice" };

export default function AcademicPracticePage() {
  return (
    <AcademicProjectsListPanel
      purpose="PRACTICE"
      title="Practice"
      description="Practice projects from your examiner. Rehearse procurement in My Organisation without formal assessment pressure."
    />
  );
}
