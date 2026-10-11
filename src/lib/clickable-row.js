const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="menuitem"], [data-row-click="ignore"]';

/**
 * Props for a table row that opens `href` when clicked anywhere outside its own controls.
 * @param {{ push: (href: string) => void }} router
 * @param {string} href
 */
export function clickableRowProps(router, href) {
  return {
    hover: true,
    className: "cursor-pointer",
    /** @param {import("react").MouseEvent<HTMLElement>} e */
    onClick: (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      if (window.getSelection()?.toString()) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      router.push(href);
    },
  };
}
