import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Activity, Database, Globe, LayoutDashboard, Network, Sparkles, Zap } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";
import { openMockWizard } from "@/mocks/wizard/open-mock-wizard";
import { useAddMockBlocked } from "@/mocks/wizard/use-add-mock-blocked";
import type { MockServerInfo } from "@/store/mock-slice";
import { ServerPill } from "./server-pill";
import { useCurrentInView } from "./use-current-in-view";

/** The Mocks tabs; a tab not yet on the new shell opens its current page. */
const TABS = [
  { to: "/mocks", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mocks/routes", label: "Routes", icon: Globe },
  { to: "/mocks/store", label: "Store", icon: Database },
  { to: "/mocks/scenarios", label: "Scenarios", icon: Network },
  { to: "/mocks/network", label: "Network", icon: Zap },
  { to: "/mocks/logs", label: "Logs", icon: Activity },
] as const satisfies readonly { to: string; label: string; icon: LucideIcon }[];

interface MocksBarProps {
  server: MockServerInfo | undefined;
  servers: readonly MockServerInfo[];
}

/**
 * The Mocks bar: its tabs, the mock server in use with its controls, and
 * the way to generate mocks for a source. Between a phone's width and a
 * wide window a tab not open shows only its icon, so the bar keeps to one
 * line; on a phone the tabs take a line of their own, every one named, and
 * scroll sideways with the open one kept in view, over the server and
 * Generate mocks.
 *
 * @param props - The server shown, and every server
 * @returns The bar
 * @example
 * ```tsx
 * <MocksBar server={server} servers={servers} />
 * ```
 */
export function MocksBar({ server, servers }: MocksBarProps): React.ReactNode {
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") });
  const blocked = useAddMockBlocked();
  const tabsRef = useRef<HTMLElement>(null);
  /* The tabs are drawn once there is a server, which may come after the page. */
  useCurrentInView(tabsRef, server ? pathname : undefined);
  return (
    <div className="flex min-h-13.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5 max-sm:px-4 max-sm:py-2 short-screen:py-1">
      {server && (
        <nav
          ref={tabsRef}
          aria-label="Mocks views"
          className="flex gap-0.5 rounded-card border border-line bg-inset p-0.5 max-sm:scroll-row max-sm:w-full"
        >
          {TABS.map(({ to, label, icon: Icon }) => {
            const on = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                title={label}
                aria-current={on ? "page" : undefined}
                activeOptions={{ exact: true }}
                search={true}
                className={cn(
                  "flex h-6.5 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-small font-strong whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-brand max-sm:focus-visible:-outline-offset-2 pointer-coarse:h-10 pointer-coarse:px-3",
                  on ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-3", on && "text-brand")} />
                <span className={cn(!on && "sm:max-[1236px]:hidden")}>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <div className="flex-1 max-sm:hidden" />
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
        {server && <ServerPill server={server} servers={servers} />}
        <button
          type="button"
          onClick={openMockWizard}
          disabled={blocked !== null}
          title={blocked ?? undefined}
          className="ml-auto flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.75 rounded-card bg-fg px-3 text-control font-semibold whitespace-nowrap text-bg hover:bg-fg/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:min-w-10"
        >
          <Sparkles aria-hidden="true" className="size-3.25" />
          <span className="max-md:sr-only">Generate mocks</span>
        </button>
      </div>
    </div>
  );
}
