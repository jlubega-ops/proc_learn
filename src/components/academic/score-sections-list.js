"use client";

import { useState } from "react";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";
import { SCORING_GROUP_LABELS, formatMarks } from "@/lib/academic/assessment-sections";

/**
 * Grouped scoring sections, each expandable to its items.
 * @param {{ sections: any[] }} props
 */
export function ScoreSectionsList({ sections }) {
  const [open, setOpen] = useState(/** @type {Record<string, boolean>} */ ({}));

  if (!sections.length) {
    return <div className={`${BRAND_CARD_CLASS} p-6 text-center text-sm text-zinc-500`}>No scored sections.</div>;
  }

  return Object.keys(SCORING_GROUP_LABELS).map((groupKey) => {
    const list = sections.filter((s) => (s.group || "CORE") === groupKey);
    if (!list.length) return null;
    return (
      <section key={groupKey} className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{SCORING_GROUP_LABELS[groupKey]}</h3>
        <ul className="mt-2 divide-y divide-[color:var(--border-subtle)]">
          {list.map((s) => {
            const isOpen = Boolean(open[s.sectionKey]);
            const full = s.marks > 0 && s.awarded >= s.marks;
            return (
              <li key={s.sectionKey} className="py-2">
                <div className="flex items-center gap-2">
                  <Tooltip title={isOpen ? "Hide items" : "Show items"}>
                    <IconButton
                      size="small"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} items for ${s.label}`}
                      onClick={() => setOpen((p) => ({ ...p, [s.sectionKey]: !isOpen }))}
                    >
                      <ExpandMoreRounded fontSize="small" className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </IconButton>
                  </Tooltip>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{s.label}</span>
                  <span className="hidden text-xs text-zinc-500 sm:inline">
                    {s.completedItems}/{s.totalItems} items
                  </span>
                  <Chip
                    size="small"
                    color={full ? "success" : s.awarded > 0 ? "info" : "warning"}
                    label={`${formatMarks(s.awarded)}/${formatMarks(s.marks)}`}
                  />
                </div>
                <Collapse in={isOpen} unmountOnExit>
                  <ul className="mt-2 space-y-1 border-l-2 border-[color:var(--border-subtle)] pl-3 sm:ml-10">
                    {(s.items || []).map((item) => (
                      <li key={item.key} className="flex items-center gap-2 text-sm">
                        {item.satisfied ? (
                          <CheckCircleRounded sx={{ fontSize: 18, color: "#16a34a" }} aria-label="Done" />
                        ) : (
                          <RadioButtonUncheckedRounded sx={{ fontSize: 18, color: "var(--brand-red)" }} aria-label="Not done" />
                        )}
                        <span className="min-w-0 flex-1 break-words text-foreground">{item.label}</span>
                        {item.count > 1 ? <span className="text-xs text-zinc-500">×{item.count}</span> : null}
                        <span className="tabular-nums text-xs font-semibold text-foreground">
                          {formatMarks(item.awarded)}/{formatMarks(item.marks)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Collapse>
              </li>
            );
          })}
        </ul>
      </section>
    );
  });
}
