"use client";

import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

/**
 * Compact one-row section header for project tabs: icon + title + stats on the left,
 * actions on the right. Wraps on small screens; keeps the data close to the top.
 * @param {{
 *   icon: import("react").ElementType;
 *   title: string;
 *   stats?: import("react").ReactNode;
 *   actions?: import("react").ReactNode;
 *   children?: import("react").ReactNode;
 * }} props
 */
export function ProjectSectionBar({ icon: Icon, title, stats = null, actions = null, children = null }) {
  return (
    <div className={`${BRAND_CARD_CLASS} px-4 py-3`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Icon sx={{ fontSize: 22, color: "var(--brand-blue)" }} aria-hidden />
            {title}
          </h2>
          {stats ? <div className="flex flex-wrap items-center gap-1.5">{stats}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
