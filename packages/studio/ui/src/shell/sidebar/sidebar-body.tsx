import { CourierLogo } from "@/design/courier-logo";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { GetStartedLink } from "./get-started-link";
import { NavList } from "./nav-list";
import { ProjectCard } from "./project-card";
import { SidebarLinks } from "./sidebar-links";

interface SidebarBodyProps {
  /** The sidebar scrolls its views alone, keeping the rest in place; the drawer scrolls as a whole. */
  viewsScroll: boolean;
  /** What follows Studio's version on the top row: the drawer's close button. */
  closer?: React.ReactNode;
}

/**
 * What the sidebar holds, and the navigation drawer in its place on a
 * narrow or short screen: the logo and Studio's version, the project and
 * its attached apps, the setup, the views, and the documentation and
 * Settings.
 *
 * @param props - Whether the views scroll on their own, and what closes the drawer
 * @returns The sidebar's parts, for a column to lay out
 * @example
 * ```tsx
 * <aside className="flex flex-col"><SidebarBody viewsScroll /></aside>
 * ```
 */
export function SidebarBody({ viewsScroll, closer }: SidebarBodyProps): React.ReactNode {
  const version = useStudioStore((s) => s.studioInfo?.version);
  return (
    <>
      <div className="flex items-center gap-2.5 pt-4 pr-3.5 pb-3.5 pl-4">
        <CourierLogo product="Studio" />
        <span className="flex-1" />
        {version && (
          <span className="rounded-chip border border-line px-1.25 py-0.5 font-mono text-micro text-fg-subtle">
            {version}
          </span>
        )}
        {closer}
      </div>
      <div className="px-2.5 pt-0.5 pb-2.5">
        <ProjectCard />
      </div>
      <nav
        className={cn(
          "flex flex-col gap-3.5 px-2.5 pb-3",
          viewsScroll && "flex-1 overflow-auto [scrollbar-width:none]",
        )}
      >
        <GetStartedLink />
        <NavList />
      </nav>
      <SidebarLinks />
    </>
  );
}
