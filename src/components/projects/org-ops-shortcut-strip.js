"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Tooltip from "@mui/material/Tooltip";
import { orgOpsShortcutLinks, navItemIsActive } from "@/lib/nav-config";
import { usePendingTaskCounts } from "@/hooks/use-pending-task-counts";
import { ORG_PERMISSION } from "@/lib/projects/org-role-permissions";

const EMPTY_SEARCH = { get: () => null };

/**
 * @param {{ count?: number }} p
 */
function ShortcutBadge({ count }) {
  if (!count) return null;
  const label = `${count} pending task${count === 1 ? "" : "s"}`;
  return (
    <span
      title={label}
      aria-label={label}
      className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-yellow px-1 text-[10px] font-bold leading-none text-zinc-900"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Wrapping ops shortcuts for organisation members (md+ only).
 * Same destinations the role sees in the sidebar (ops + procurement stages).
 * Hidden on dashboard and org-admin pages.
 *
 * @param {{
 *   projectId: string;
 *   permissions?: string[];
 *   roleName?: string | null;
 *   activeCommittee?: { id?: string; name?: string; committeeType?: string } | null;
 * }} p
 */
export function OrgOpsShortcutStrip({
  projectId,
  permissions = [],
  roleName = null,
  activeCommittee = null,
}) {
  const pathname = usePathname() || "";
  const base = `/projects/${projectId}`;
  const onDashboard = pathname === base || pathname === `${base}/`;
  const onOrgAdmin = pathname.includes("/org-admin");

  const taskCounts = usePendingTaskCounts(
    projectId,
    Boolean(projectId) && permissions.includes(ORG_PERMISSION.VIEW_TASKS),
    `${roleName || ""}|${activeCommittee?.id || ""}`,
  );

  if (!projectId || onDashboard || onOrgAdmin) return null;

  const items = orgOpsShortcutLinks(projectId, permissions, {
    roleName,
    activeCommittee,
  });
  if (!items.length) return null;

  return (
    <nav aria-label="Organisation shortcuts" className="mb-4 hidden md:block">
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => {
          const Icon = item.Icon;
          const active = navItemIsActive(pathname, EMPTY_SEARCH, item.href);
          const count = Number(taskCounts[item.href] || 0);
          return (
            <li key={item.href} className="min-w-0">
              <Tooltip title={item.title || item.label}>
                <Link
                  href={item.href}
                  title={item.title || item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary/35 bg-[color:var(--nav-active-bg)] text-[color:var(--nav-active-text)] shadow-[inset_0_-3px_0_0_var(--brand-yellow)]"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] text-zinc-700 hover:border-primary/25 hover:bg-[color:var(--nav-active-bg)] dark:text-zinc-200"
                  }`}
                >
                  {Icon ? (
                    <Icon
                      aria-hidden
                      sx={{ fontSize: 20, color: "var(--brand-blue)", flexShrink: 0 }}
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{item.label}</span>
                  <ShortcutBadge count={count} />
                </Link>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
