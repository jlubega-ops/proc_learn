import { ROLE } from "@/lib/roles";

/**
 * @param {string} pathname
 * @param {string} [activeRole]
 */
export function getDashboardPageMeta(pathname, activeRole) {
  if (pathname.includes("/org-admin/users"))
    return { title: "Organization users", subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/departments"))
    return { title: "Departments", subtitle: "Project system administration" };
  if (pathname.includes("/org-admin/roles"))
    return { title: "Organization roles", subtitle: "Project system administration" };
  if (pathname.includes("/workflow"))
    return { title: "Workflow", subtitle: "Project operations workspace" };
  if (pathname === "/" || pathname === "")
    return { title: "Home", subtitle: "Dashboard overview" };
  if (pathname.startsWith("/projects") || pathname.startsWith("/cases")) {
    const isStudent = (activeRole || ROLE.STUDENT) === ROLE.STUDENT;
    return isStudent
      ? { title: "My Projects", subtitle: "Your learning projects" }
      : { title: "Projects", subtitle: "Project workspace" };
  }
  if (pathname.startsWith("/settings"))
    return { title: "Settings", subtitle: "Preferences and account" };
  if (pathname.startsWith("/profile"))
    return { title: "Profile", subtitle: "Your account" };
  if (pathname.startsWith("/admin/activity"))
    return { title: "Activity logs", subtitle: "Audit trail (system admin)" };
  if (pathname.startsWith("/admin"))
    return { title: "Administration", subtitle: "System tools" };
  if (pathname.startsWith("/admin/staff"))
    return { title: "Staff users", subtitle: "Admin, lecturer, examiner accounts" };
  if (pathname.startsWith("/students/manage"))
    return { title: "Students", subtitle: "Directory and records" };
  if (pathname.startsWith("/notifications"))
    return { title: "Notifications", subtitle: "Updates and alerts" };
  return { title: "Dashboard", subtitle: "Proc Learn" };
}
