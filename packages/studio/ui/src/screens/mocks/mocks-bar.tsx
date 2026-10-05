import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Activity, Database, Globe, LayoutDashboard, Network, Sparkles, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MockServerInfo } from "@/store/mock-slice";
import { openMockWizard, useAddMockBlocked } from "@/views/mocks/wizard";
import { ServerPill } from "./server-pill";

/** The Mocks tabs; a tab not yet on the new shell opens its current page. */
const TABS = [
  { to: "/next/mocks", label: "Dashboard", icon: LayoutDashboard },
  { to: "/next/mocks/routes", label: "Routes", icon: Globe },
  { to: "/next/mocks/store", label: "Store", icon: Database },
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
 * the way to generate mocks for a source.
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
  return (
    <div className="flex min-h-13.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5">
      {server && (
        <nav
          aria-label="Mocks views"
          className="flex gap-0.5 rounded-card border border-line bg-inset p-0.5"
        >
          {TABS.map(({ to, label, icon: Icon }) => {
            const on = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                title={label}
                aria-current={on ? "page" : undefined}
                search={true}
                className={cn(
                  "flex h-6.5 items-center gap-1.5 rounded-[6px] px-2.5 text-small font-strong whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                  on ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-3", on && "text-brand")} />
                <span className={cn(!on && "max-[1236px]:hidden")}>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <div className="flex-1" />
      {server && <ServerPill server={server} servers={servers} />}
      <button
        type="button"
        onClick={openMockWizard}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3 text-control font-semibold whitespace-nowrap text-bg hover:bg-fg/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50"
      >
        <Sparkles aria-hidden="true" className="size-3.25" />
        <span className="max-md:hidden">Generate mocks</span>
      </button>
    </div>
  );
}
