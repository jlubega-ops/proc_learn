import Link from "next/link";
import InventoryRounded from "@mui/icons-material/InventoryRounded";
import { BRAND_YELLOW_ON_LIGHT, SEMANTIC } from "@/lib/brand-colors";

const TONE_COLOR = {
  primary: "var(--brand-blue)",
  warning: BRAND_YELLOW_ON_LIGHT,
  error: "var(--brand-red)",
  success: SEMANTIC.success,
};

const TONE_BORDER = {
  warning: "border-brand-yellow",
  error: "border-brand-red",
};

/**
 * @typedef {{
 *   key: string;
 *   label: string;
 *   value: number | string;
 *   hint?: string;
 *   href?: string | null;
 *   Icon?: import("@mui/material").SvgIconComponent;
 *   tone?: "primary" | "warning" | "error" | "success";
 *   highlight?: boolean;
 * }} DashboardStatTile
 */

/**
 * Compact number tiles for dashboards. `highlight` adds the tone border (e.g. work waiting).
 * @param {{ items: DashboardStatTile[]; gridClassName?: string }} props
 */
export function DashboardStatTiles({ items, gridClassName = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" }) {
  return (
    <div className={`mt-3 grid gap-3 ${gridClassName}`}>
      {items.map((item) => {
        const Icon = item.Icon || InventoryRounded;
        const tone = item.tone || "primary";
        const border = item.highlight && TONE_BORDER[tone] ? TONE_BORDER[tone] : "border-[color:var(--border-subtle)]";
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {item.label}
              </span>
              <Icon sx={{ fontSize: 20, color: TONE_COLOR[tone] }} aria-hidden />
            </div>
            <div className="mt-1 text-2xl font-bold text-foreground">{item.value}</div>
            {item.hint ? <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{item.hint}</div> : null}
          </>
        );
        const tileClass = `block min-w-0 rounded-xl border p-3 transition ${border}`;
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            title={`Open ${item.label}`}
            className={`${tileClass} cursor-pointer hover:border-primary hover:bg-[color:var(--nav-active-bg)]`}
          >
            {body}
          </Link>
        ) : (
          <div key={item.key} className={tileClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
