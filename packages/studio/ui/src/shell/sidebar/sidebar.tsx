import { SidebarBody } from "./sidebar-body";

/**
 * Studio's sidebar: the logo and Studio's version, the project and its
 * attached apps, the setup, the views, and the documentation and Settings.
 * A narrow window, or a phone held sideways, has no room for it: the
 * navigation drawer holds the same instead.
 *
 * @returns The sidebar
 * @example
 * ```tsx
 * <Sidebar />
 * ```
 */
export function Sidebar(): React.ReactNode {
  return (
    <aside
      aria-label="Studio"
      className="row-start-1 flex min-h-0 flex-col border-r border-line bg-bg-subtle shell-compact:hidden"
    >
      <SidebarBody viewsScroll />
    </aside>
  );
}
