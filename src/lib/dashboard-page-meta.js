import { NAV_LABELS } from "@/lib/nav-labels";

/**
 * @param {string} pathname
 * @param {string} [activeRole]
 */
export function getDashboardPageMeta(pathname, activeRole) {
  if (pathname === "/" || pathname === "")
    return {
      title: NAV_LABELS.dashboard,
      subtitle: activeRole === "STUDENT" ? "My Organisation" : "Overview",
    };
  if (pathname.startsWith("/academic/practice/"))
    return { title: "Practice project", subtitle: "My Academic Work" };
  if (pathname.startsWith("/academic/assessments/"))
    return { title: "Assessment project", subtitle: "My Academic Work" };
  if (pathname.startsWith("/academic/practice"))
    return {
      title: "Practice",
      subtitle: "My Academic Work",
    };
  if (pathname.startsWith("/academic/assessments"))
    return {
      title: "Assessments",
      subtitle: "My Academic Work",
    };
  if (pathname.startsWith("/academic/participation"))
    return {
      title: "Student participation",
      subtitle: "Organisations and procurement progress",
    };
  if (pathname.startsWith("/academic/results"))
    return {
      title: "Results",
      subtitle: "Scores and feedback",
    };
  if (pathname.includes("/assessment"))
    return { title: "Assessment scoring", subtitle: "Academic project" };
  if (pathname.includes("/participants"))
    return { title: "Participants", subtitle: "Academic project" };
  if (pathname.startsWith("/projects/") && pathname.includes("/results"))
    return { title: "Results", subtitle: "Academic project" };
  if (pathname.startsWith("/academic"))
    return {
      title: "My Academic Work",
      subtitle: "Projects from your examiner",
    };
  if (pathname.startsWith("/organisation")) {
    if (pathname === "/organisation" || pathname === "/organisation/")
      return { title: NAV_LABELS.dashboard, subtitle: "My Organisation" };
    if (pathname === "/organisation/overview" || pathname.startsWith("/organisation/overview/"))
      return { title: "Project overview", subtitle: "Instructions and question" };
    if (pathname.includes("/org-admin/organisation-structure"))
      return { title: NAV_LABELS.organisationStructure, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/financial-years"))
      return { title: NAV_LABELS.financialYears, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/planning-period"))
      return { title: NAV_LABELS.planningPeriods, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/process-workflow"))
      return { title: NAV_LABELS.processWorkflows, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/users"))
      return { title: NAV_LABELS.users, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/departments"))
      return { title: NAV_LABELS.departments, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/roles"))
      return { title: NAV_LABELS.roles, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/budgets"))
      return { title: NAV_LABELS.budgets, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/committees"))
      return { title: NAV_LABELS.committees, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/providers"))
      return { title: NAV_LABELS.providers, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/audit-logs"))
      return { title: NAV_LABELS.activityLogs, subtitle: "My Organisation" };
    if (pathname.includes("/org-admin/settings"))
      return { title: NAV_LABELS.settings, subtitle: "My Organisation" };
    return { title: "Organisation", subtitle: "My Organisation" };
  }
  if (pathname.includes("/org-admin/organisation-structure"))
    return { title: NAV_LABELS.organisationStructure, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/financial-years"))
    return { title: NAV_LABELS.financialYears, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/planning-period"))
    return { title: NAV_LABELS.planningPeriods, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/process-workflow"))
    return { title: NAV_LABELS.processWorkflows, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/users"))
    return { title: NAV_LABELS.users, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/departments"))
    return { title: NAV_LABELS.departments, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/roles"))
    return { title: NAV_LABELS.roles, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/budgets"))
    return { title: NAV_LABELS.budgets, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/committees"))
    return { title: NAV_LABELS.committees, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/providers"))
    return { title: NAV_LABELS.providers, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/audit-logs"))
    return { title: NAV_LABELS.activityLogs, subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/settings"))
    return { title: NAV_LABELS.settings, subtitle: "Project system administration" };
  if (pathname.includes("/my-account"))
    return { title: "My account", subtitle: "Organisation user account" };
  if (pathname === "/projects" || pathname === "/projects/") {
    return { title: "Projects", subtitle: "Project workspace" };
  }
  if (pathname.startsWith("/projects/") || pathname.startsWith("/cases")) {
    return { title: "Projects", subtitle: "Project workspace" };
  }
  if (pathname.startsWith("/settings"))
    return { title: "Settings", subtitle: "Preferences and account" };
  if (pathname.startsWith("/profile"))
    return { title: "Profile", subtitle: "Your account" };
  if (pathname.startsWith("/project-settings/process-flow"))
    return { title: "Process flow", subtitle: "Organisation process flows for student workspaces" };
  if (pathname.startsWith("/project-settings/roles"))
    return { title: "Project roles", subtitle: "Organisation roles for student workspaces" };
  if (pathname.startsWith("/project-settings"))
    return { title: "Project settings", subtitle: "Configure student project behaviour" };
  if (pathname.startsWith("/admin/academic-setup"))
    return { title: "Academic setup", subtitle: "Academic years and courses" };
  if (pathname.startsWith("/admin/activity"))
    return { title: "Activity logs", subtitle: "Audit trail (system admin)" };
  if (pathname.startsWith("/admin/programmes"))
    return { title: "Programmes", subtitle: "Study programmes" };
  if (pathname.startsWith("/admin/staff"))
    return { title: "Staff users", subtitle: "Admin and examiner accounts" };
  if (pathname.startsWith("/admin"))
    return { title: "Administration", subtitle: "System tools" };
  if (pathname.startsWith("/students/") && pathname.includes("/observe"))
    return { title: "Observe student", subtitle: "Read-only organisation and progress" };
  if (pathname.startsWith("/students/manage"))
    return { title: "Students", subtitle: "Directory and records" };
  if (pathname.startsWith("/notifications"))
    return { title: "Notifications", subtitle: "Updates and alerts" };
  return { title: "Dashboard", subtitle: "Proc Learn" };
}
