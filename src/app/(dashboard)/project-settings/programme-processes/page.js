import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";
import { ProgrammeProcessesPanel } from "@/components/academic/programme-processes-panel";

export const metadata = {
  title: "Programme processes",
};

export default function ProgrammeProcessesPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title="Programme processes"
        description="Processes each programme can use per academic year."
      />
      <ProgrammeProcessesPanel />
    </div>
  );
}
