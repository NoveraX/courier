import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Settings } from "lucide-react";

import { insideEditor } from "@/features/editor/editor-host";
import { cn } from "@/lib/utils";
import { DOCS_URL, SETTINGS_PAGE } from "../nav";
import { openOutside } from "../open-outside";
import { NAV_ROW } from "./nav-row";

const ROW = cn(NAV_ROW, "text-fg-muted");

/**
 * The sidebar's foot: Courier's documentation, in a new tab — or, inside an
 * editor's own tab, in the browser the editor opens it in — and Settings.
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
      <a href={DOCS_URL} target="_blank" rel="noreferrer" onClick={openFromEditor} className={ROW}>
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

/* In a browser tab the link opens the page itself; inside an editor the editor is asked to. */
function openFromEditor(event: React.MouseEvent<HTMLAnchorElement>): void {
  if (!insideEditor()) return;
  event.preventDefault();
  openOutside(event.currentTarget.href);
}
