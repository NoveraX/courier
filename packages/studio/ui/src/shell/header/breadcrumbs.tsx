import { useRouterState } from "@tanstack/react-router";

import { SETTINGS_PAGE, SHELL_NAV } from "../nav";

/**
 * Where the page sits: its group and its name — `Inspect / Timeline`,
 * `System / Settings`, `Studio / Welcome` for the setup, or
 * `Studio / Not found` for an address that is no page.
 *
 * @param pathname - The page's path
 * @returns The two parts
 * @example
 * ```ts
 * crumbsOf("/"); // ["Studio", "Welcome"]
 * crumbsOf("/no-such-page"); // ["Studio", "Not found"]
 * ```
 */
export function crumbsOf(pathname: string): [string, string] {
  if (pathname === SETTINGS_PAGE.to || pathname.startsWith(`${SETTINGS_PAGE.to}/`)) {
    return [SETTINGS_PAGE.group, SETTINGS_PAGE.label];
  }
  for (const group of SHELL_NAV) {
    const item = group.items.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
    if (item) return [group.label, item.label];
  }
  return pathname === "/" ? ["Studio", "Welcome"] : ["Studio", "Not found"];
}

/**
 * The header's trail to the page shown — on a phone, the page's name alone.
 *
 * @returns The trail
 * @example
 * ```tsx
 * <Breadcrumbs />
 * ```
 */
export function Breadcrumbs(): React.ReactNode {
  const [group, page] = crumbsOf(useRouterState({ select: (s) => s.location.pathname }));
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-control">
      <span className="text-fg-subtle max-sm:hidden">{group}</span>
      <span aria-hidden="true" className="text-fg-subtle opacity-60 max-sm:hidden">
        /
      </span>
      <span aria-current="page" className="truncate font-strong text-fg">
        {page}
      </span>
    </nav>
  );
}
