import {
  BRAND_PAGE_SHELL_CLASS,
  DashboardPageIntro,
} from "@/components/layout/dashboard-page-intro";
import { ProgrammeProcessesPanel } from "@/components/academic/programme-processes-panel";
import { NAV_LABELS } from "@/lib/nav-labels";

export const metadata = {
  title: NAV_LABELS.programmeProcesses,
};

export default function ProgrammeProcessesPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro
        title={NAV_LABELS.programmeProcesses}
        description="Processes each programme can use per academic year."
      />
      <ProgrammeProcessesPanel />
    </div>
  );
}
