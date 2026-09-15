"use client";

/**
 * MUI TableRow props to open a detail route when the row is clicked.
 * Action cells should call stopPropagation so icon buttons stay independent.
 *
 * @param {{ href: string; router: { push: (href: string) => void }; disabled?: boolean }} p
 */
export function clickableTableRowProps({ href, router, disabled = false }) {
  const target = String(href || "").trim();
  if (!target || disabled) {
    return { hover: true };
  }
  return {
    hover: true,
    onClick: () => router.push(target),
    onKeyDown: (/** @type {import("react").KeyboardEvent} */ e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push(target);
      }
    },
    role: "link",
    tabIndex: 0,
    sx: {
      cursor: "pointer",
    },
    title: "Open details",
  };
}

/**
 * Stop row navigation when clicking action controls.
 * @param {import("react").SyntheticEvent} e
 */
export function stopRowClick(e) {
  e.stopPropagation();
}
