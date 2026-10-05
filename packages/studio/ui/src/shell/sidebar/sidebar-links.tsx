import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Settings } from "lucide-react";

import { DOCS_URL, SETTINGS_PAGE } from "../nav";

const ROW =
  "flex h-8 items-center gap-2.5 rounded-control px-2.5 text-fg-muted transition-colors hover:bg-raised hover:text-fg";

/**
 * The sidebar's foot: Courier's documentation, in a new tab, and Settings.
 *
 * @returns The two links
 * @example
 * ```tsx
 * <SidebarLinks />
 * ```
 */
export function SidebarLinks(): React.ReactNode {
  return (
    <div className="flex flex-col gap-px border-t border-line px-2.5 pt-2 pb-2.5">
      <a href={DOCS_URL} target="_blank" rel="noreferrer" className={ROW}>
        <BookOpen aria-hidden="true" className="size-3.75 shrink-0 opacity-85" />
        <span>Docs</span>
        <span className="flex-1" />
        <ArrowUpRight aria-hidden="true" className="size-3 text-fg-subtle" />
      </a>
      <Link to={SETTINGS_PAGE.to} className={ROW} activeProps={{ className: "bg-raised text-fg" }}>
        <Settings aria-hidden="true" className="size-3.75 shrink-0 opacity-85" />
        <span>Settings</span>
      </Link>
    </div>
  );
}
