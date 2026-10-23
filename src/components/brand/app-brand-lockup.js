import { APP_NAME, APP_TAGLINE } from "@/lib/appConfig";

/**
 * Product name + secondary slogan: "Proc Learn | Digital Procurement".
 * Name stays primary; tagline is quieter and must not overpower the brand.
 *
 * @param {{
 *   className?: string;
 *   nameClassName?: string;
 *   taglineClassName?: string;
 *   separatorClassName?: string;
 *   as?: "p" | "div" | "span";
 * }} [p]
 */
export function AppBrandLockup({
  className = "",
  nameClassName = "font-extrabold tracking-tight text-primary",
  taglineClassName = "font-medium tracking-tight text-zinc-500 dark:text-zinc-400",
  separatorClassName = "font-normal text-zinc-400 dark:text-zinc-500",
  as: Tag = "p",
}) {
  return (
    <Tag className={`min-w-0 truncate ${className}`.trim()}>
      <span className={nameClassName}>{APP_NAME}</span>
      <span className={`mx-1.5 ${separatorClassName}`} aria-hidden>
        |
      </span>
      <span className={taglineClassName}>{APP_TAGLINE}</span>
    </Tag>
  );
}
