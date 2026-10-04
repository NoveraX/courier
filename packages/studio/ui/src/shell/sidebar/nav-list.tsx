import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { ShellNavItem } from "../nav";
import { SHELL_NAV } from "../nav";
import { NavBadge } from "./nav-badge";

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavLink({ item, active }: { item: ShellNavItem; active: boolean }): React.ReactNode {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-control px-2.5 transition-colors hover:bg-raised hover:text-fg",
        active ? "bg-raised font-strong text-fg" : "text-fg-muted",
      )}
    >
      <Icon aria-hidden="true" className={cn("size-3.75 shrink-0", active && "text-brand")} />
      <span>{item.label}</span>
      <span className="flex-1" />
      {item.badge && <NavBadge kind={item.badge} />}
    </Link>
  );
}

/**
 * The sidebar's views, under their group headings, the current one marked.
 *
 * @returns The groups of links
 * @example
 * ```tsx
 * <NavList />
 * ```
 */
export function NavList(): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return SHELL_NAV.map((group) => (
    <div key={group.label} className="flex flex-col gap-px">
      <div className="px-2.5 pt-1 pb-1.5 text-label font-medium text-fg-subtle">{group.label}</div>
      {group.items.map((item) => (
        <NavLink key={item.label} item={item} active={isActive(pathname, item.to)} />
      ))}
    </div>
  ));
}
