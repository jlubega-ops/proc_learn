import { SiteSettingsPanel } from "@/components/admin/site-settings-panel";
import { DashboardPageIntro, BRAND_PAGE_SHELL_CLASS } from "@/components/layout/dashboard-page-intro";

export const metadata = {
  title: "Site settings",
};

export default function AdminSiteSettingsPage() {
  return (
    <div className={BRAND_PAGE_SHELL_CLASS}>
      <DashboardPageIntro title="Site settings" description="Platform-wide switches." />
      <SiteSettingsPanel />
    </div>
  );
}
