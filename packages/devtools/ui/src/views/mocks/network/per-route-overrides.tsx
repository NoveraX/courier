import { useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import { motion } from "motion/react";
import { STAGGER_ITEM_VARIANTS } from "@/components/shared/stagger-list";
import { getSocket } from "@/socket";
import { useMockStore } from "@/store/mock-slice";
import { RouteOverrideRow } from "./route-override-row";

import type { MockServerInfo, RouteOverride } from "@/store/mock-slice";

interface PerRouteOverridesProps {
  server: MockServerInfo;
}

export function PerRouteOverrides({ server }: PerRouteOverridesProps): React.ReactElement {
  const [expanded, setExpanded] = useState<string | null>(null);
  const overrides = server.routeOverrides ?? [];

  const getOverride = (routeId: string): RouteOverride =>
    overrides.find((r) => r.routeId === routeId) ?? {
      routeId,
      enabled: false,
      latency: { min: 0, max: 0, jitter: 0 },
      errorRate: 0,
    };

  const sendOverridesToServer = (nextOverrides: RouteOverride[]) => {
    getSocket().emit("mock:command", {
      action: "mock:network:set",
      serverId: server.serverId,
      config: { routeOverrides: nextOverrides.filter((r) => r.enabled) },
    });
  };

  const setOverride = (override: RouteOverride) => {
    useMockStore.getState().setRouteOverride(server.serverId, override);
    const current = (server.routeOverrides ?? []).filter((r) => r.routeId !== override.routeId);
    sendOverridesToServer([...current, override]);
  };

  const clearOverride = (routeId: string) => {
    const cleared: RouteOverride = {
      routeId, enabled: false,
      latency: { min: 0, max: 0, jitter: 0 },
      errorRate: 0,
    };
    useMockStore.getState().setRouteOverride(server.serverId, cleared);
    const current = (server.routeOverrides ?? []).filter((r) => r.routeId !== routeId);
    sendOverridesToServer([...current, cleared]);
  };

  const activeCount = overrides.filter((r) => r.enabled).length;

  const groupedRoutes = useMemo(() => {
    const groups = new Map<string, typeof server.routes>();
    for (const route of server.routes) {
      const key = route.group || "";
      const list = groups.get(key) ?? [];
      list.push(route);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
      .map(([group, routes]) => ({ group, routes }));
  }, [server.routes]);

  if (server.routes.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <p className="text-center text-body-xs text-muted-foreground/40">No routes available</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border-subtle">
          <GitMerge className="size-3.5 text-muted-foreground/50" />
        </div>
        <div>
          <h3 className="text-body-sm font-semibold text-foreground">Per-Route Overrides</h3>
          <p className="text-body-xs text-muted-foreground/60">Override latency and errors per endpoint</p>
        </div>
        {activeCount > 0 && (
          <span className="ml-auto rounded-md bg-accent-brand/10 px-1.5 py-0.5 text-caption text-accent-brand ring-1 ring-accent-brand/20">
            {activeCount} active
          </span>
        )}
      </div>

      <motion.div
        className="divide-y divide-border-subtle"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
      >
        {groupedRoutes.map(({ group, routes }) => (
          <motion.div key={group} variants={STAGGER_ITEM_VARIANTS}>
            {group && (
              <div className="flex h-8 items-center bg-muted/20 px-4">
                <span className="text-caption text-muted-foreground/50">{group}</span>
              </div>
            )}
            {routes.map((route) => {
              const routeId = `${route.group}:${route.endpoint}`;
              return (
                <RouteOverrideRow
                  key={routeId}
                  route={route}
                  override={getOverride(routeId)}
                  expanded={expanded === routeId}
                  onToggleExpand={() => setExpanded(expanded === routeId ? null : routeId)}
                  onOverrideChange={setOverride}
                  onClear={() => clearOverride(routeId)}
                />
              );
            })}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
