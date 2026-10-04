import { CourierLogo } from "@/design/courier-logo";
import { useStudioStore } from "@/store";
import { GetStartedLink } from "./get-started-link";
import { NavList } from "./nav-list";
import { ProjectCard } from "./project-card";
import { SidebarLinks } from "./sidebar-links";

/**
 * Studio's sidebar: the logo and Studio's version, the project and its
 * attached apps, the setup, the views, and the documentation and Settings.
 *
 * @returns The sidebar
 * @example
 * ```tsx
 * <Sidebar />
 * ```
 */
export function Sidebar(): React.ReactNode {
  const version = useStudioStore((s) => s.studioInfo?.version);
  return (
    <aside
      aria-label="Studio"
      className="row-start-1 flex min-h-0 flex-col border-r border-line bg-bg-subtle max-[820px]:hidden"
    >
      <div className="flex items-center gap-2.5 pt-4 pr-3.5 pb-3.5 pl-4">
        <CourierLogo product="Studio" />
        <span className="flex-1" />
        {version && (
          <span className="rounded-chip border border-line px-1.25 py-0.5 font-mono text-micro text-fg-subtle">
            {version}
          </span>
        )}
      </div>
      <div className="px-2.5 pt-0.5 pb-2.5">
        <ProjectCard />
      </div>
      <nav className="flex flex-1 flex-col gap-3.5 overflow-auto px-2.5 pb-3 [scrollbar-width:none]">
        <GetStartedLink />
        <NavList />
      </nav>
      <SidebarLinks />
    </aside>
  );
}
